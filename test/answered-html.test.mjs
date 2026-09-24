// SPDX-License-Identifier: Apache-2.0
// #78 — an answered feedback.html is read as data: two lines of JSON, never the page's script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFeedback, partLabel } from '../lib/build-feedback.mjs';

const root = new URL('..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'answered-html-'));
const run = (bin, ...args) => spawnSync(process.execPath, [join(root, bin), ...args], { encoding: 'utf8' });
const raw = (name, text) => { const p = join(tmp, name); writeFileSync(p, text); return p; };
const AT = '2026-09-24T10:00:00.000Z';
// What "Export feedback.html" does to the page (the browser test does the real click).
const exported = (html, store) => html.replace(/^const SEED = .*$/m, () => 'const SEED = '
  + JSON.stringify({ ...store, exportedAt: AT }).replace(/[<\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + ';');
const page = (reviewFile) => {
  const out = join(tmp, `${reviewFile}.html`);
  assert.equal(run('bin/render.mjs', join(root, 'examples', reviewFile), out).status, 0);
  return readFileSync(out, 'utf8');
};
const importPage = (reviewFile, html, name) => {
  const out = join(tmp, `${name}.feedback.json`);
  return { out, w: run('bin/answer.mjs', join(root, 'examples', reviewFile), raw(`${name}.html`, html), out) };
};

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const uat = JSON.parse(readFileSync(join(root, 'examples/review.example.json'), 'utf8'));
const label = partLabel(uat.diagrams[0], { node: 'guest' });

test('#78: every kind of answer in an exported page comes back as the same checked feedback', () => {
  const store = {
    verdicts: { 'guest-checkout': 'fails', 'saved-card': 'works' },
    notes: { 'guest-checkout': '</script><script>globalThis.ran=1</script> & “quoted”\u2028next line', 'back-button': 'A note on an unanswered item' },
    added: [{ id: 'added-1', title: 'Receipt email', body: 'Never arrived.', verdict: 'fails', note: null }],
    requests: { 'declined-card': { example: true, note: 'Show one' } },
    comments: [{ id: 'comment-1', diagram: uat.diagrams[0].id, node: 'guest', label, note: 'Call it guest checkout.' }],
    proposals: [{ id: 'proposal-1', diagram: uat.diagrams[0].id, op: 'rename', node: 'guest', label, text: 'Guest checkout', comment: 'comment-1' }],
    pictures: [{ id: 'picture-1', on: 'guest-checkout', type: 'image/png', width: 1, height: 1, data: PNG }],
    respondent: { name: 'Sam', role: 'QA' },
  };
  const { out, w } = importPage('review.example.json', exported(page('review.example.json'), store), 'rich');
  assert.equal(w.status, 0, w.stderr + w.stdout);
  const got = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(got, { ...buildFeedback(uat, store, AT), via: 'page' });
  for (const key of ['addedItems', 'requests', 'comments', 'proposals', 'pictures', 'respondent']) assert.ok(got[key], key);
  assert.equal(globalThis.ran, undefined);
});

test('#78: choices come back too', () => {
  const store = { choices: { storage: 'opt-db' }, verdicts: { 'autosave-local': 'agree' } };
  const { out, w } = importPage('decision-review.example.json', exported(page('decision-review.example.json'), store), 'choices');
  assert.equal(w.status, 0, w.stderr + w.stdout);
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).choices.find((c) => c.sectionId === 'storage').itemId, 'opt-db');
});

test('#78: a page for another review, with no answers, or not one clean export is refused and writes nothing', () => {
  const html = page('review.example.json');
  const changed = { ...uat, items: uat.items.map((i, n) => (n ? i : { ...i, summary: 'Changed after sending' })) };
  const cases = {
    'changed review': [exported(html, {}).replace(/^const REVIEW = .*$/m, () => `const REVIEW = ${JSON.stringify(changed)};`), /different version/],
    'no answers': [html, /no answers/],
    'two answer lines': [exported(html, {}).replace(/^(const SEED = .*)$/m, '$1\n$1'), /2 "SEED" lines/],
    'not JSON': [html.replace(/^const SEED = .*$/m, 'const SEED = {verdicts: fetch("x")};'), /not JSON/],
    'not a page': ['<html><body>hello</body></html>', /0 "REVIEW" lines/],
  };
  for (const [why, [text, message]] of Object.entries(cases)) {
    const { out, w } = importPage('review.example.json', text, why.replace(/ /g, '-'));
    assert.equal(w.status, 2, `${why}: ${w.stdout}`);
    assert.match(w.stderr, message, why);
    assert.ok(!existsSync(out), `${why}: wrote a file`);
  }
});

test('#78: answers that fail the checker are refused before anything is written', () => {
  const { out, w } = importPage('review.example.json', exported(page('review.example.json'), { verdicts: { 'guest-checkout': { x: 1 } } }), 'bad-verdict');
  assert.equal(w.status, 2, w.stdout);
  assert.match(w.stderr, /verdicts in vocabulary/);
  assert.ok(!existsSync(out));
});

test('#78: answer.mjs never overwrites a file', () => {
  const out = raw('taken.feedback.json', 'keep me');
  const w = run('bin/answer.mjs', join(root, 'examples/review.example.json'), raw('taken.html', exported(page('review.example.json'), {})), out);
  assert.equal(w.status, 2);
  assert.equal(readFileSync(out, 'utf8'), 'keep me');
});

test('#78: the reader never runs, loads or fetches the page', () => {
  const src = readFileSync(join(root, 'bin/answer.mjs'), 'utf8');
  assert.doesNotMatch(src, /node:vm|eval\(|new Function|playwright|import\(|fetch\(|https?:/);
});

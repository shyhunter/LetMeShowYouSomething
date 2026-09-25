// SPDX-License-Identifier: Apache-2.0
// #82 — a continuing review: the chain of rounds is checked, the renderer refuses a broken one, and what
// became of each question is derived from the files alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { roundsView } from '../lib/review-parts.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const at = (p) => join(ROOT, p);
const read = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const node = (...args) => spawnSync(process.execPath, args, { encoding: 'utf8' });
const R1 = 'examples/review.example.json', F1 = 'examples/checkout-uat.feedback.json', R2 = 'examples/checkout-round2.review.json';
const withNext = (change) => { const dir = mkdtempSync(join(tmpdir(), 'rounds-')), p = join(dir, 'next.json'), r = read(R2); change(r); writeFileSync(p, JSON.stringify(r)); return { dir, p }; };

test('rounds: the round-2 example carries everything round 1 left open', () => {
  const r = node(at('bin/check.mjs'), 'rounds', at(R2), at(R1), at(F1));
  assert.equal(r.status, 0, r.stdout);
});

test('rounds: a dropped open point, a reply to nothing and a repeated id are each refused', () => {
  const cases = {
    'gaps carried': (r) => { r.items = r.items.filter((i) => i.id !== 'back-button'); },
    'replies answer something': (r) => { r.items.push({ id: 'brand-new', title: 'A new question', reply: 'Changed, as you asked.' }); },
    'each round has its own id': (r) => { r.id = read(R1).id; },
  };
  for (const [check, change] of Object.entries(cases)) {
    const { p } = withNext(change);
    const r = node(at('bin/check.mjs'), 'rounds', p, at(R1), at(F1));
    assert.equal(r.status, 1, `${check} should fail`);
    assert.match(r.stdout, new RegExp(`✗ .*${check}`), r.stdout);
  }
});

test('rounds: the renderer writes nothing for a broken chain, and carries a checked one in one line', () => {
  const { dir, p } = withNext((r) => { r.items = r.items.filter((i) => i.id !== 'back-button'); });
  const bad = join(dir, 'bad.html');
  const refused = node(at('bin/render.mjs'), p, bad, '--earlier', at(R1), at(F1));
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /the rounds do not check out; nothing was written/);
  assert.equal(existsSync(bad), false);
  const good = join(dir, 'good.html');
  assert.equal(node(at('bin/render.mjs'), at(R2), good, '--earlier', at(R1), at(F1)).status, 0);
  const lines = readFileSync(good, 'utf8').split('\n').filter((l) => l.startsWith('const HISTORY = '));
  assert.equal(lines.length, 1);
  const history = JSON.parse(lines[0].slice('const HISTORY = '.length, -1));
  assert.deepEqual([history.protocol, history.schemaVersion, history.rounds.length], ['letmeshowyousomething/history', 1, 1]);
  assert.deepEqual(history.rounds[0], { review: read(R1), feedback: read(F1) });
  assert.match(readFileSync(good, 'utf8'), /Let me explain · round 2/);
});

test('rounds: tags and settled answers come from the files, never invented', () => {
  const v = roundsView(read(R2), [{ review: read(R1), feedback: read(F1) }]);
  assert.deepEqual(v.tags, { 'saved-card': 'changed', 'declined-card': 'changed', 'back-button': 'open', 'added-1': 'added' });
  assert.deepEqual(v.settled.map((x) => x.id), ['guest-checkout']);
  assert.equal(v.earlier['declined-card'].response.note, 'Customer sees error 51.');
  const same = read(R2); same.items.find((i) => i.id === 'saved-card').summary = read(R1).items.find((i) => i.id === 'saved-card').summary;
  assert.equal(roundsView(same, [{ review: read(R1), feedback: read(F1) }]).tags['saved-card'], 'again');
  const fresh = read(R2); fresh.items.push({ id: 'brand-new', title: 'A new question' });
  assert.equal(roundsView(fresh, [{ review: read(R1), feedback: read(F1) }]).tags['brand-new'], 'new');
  assert.equal(roundsView(read(R2), null), null);
});

// SPDX-License-Identifier: Apache-2.0
// #89 — each fixture's machine checks must tell a run that did the job from one that did nothing.
// The "good" runs below use the skill's own tools, the way a conforming agent would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIXTURES, ROOT } from '../conformance/fixtures.mjs';

const node = (script, ...args) => spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const write = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2));
const nextOf = (dir, id) => ({ ...read(join(dir, 'docs/checkout.review.json')), id });

const GOOD = {
  handoff(dir) {
    write(join(dir, 'checkout.review.json'), { ...read(join(ROOT, 'examples/review.example.json')), id: 'checkout-release' });
    node('bin/render.mjs', join(dir, 'checkout.review.json'), join(dir, 'checkout.html'));
  },
  'renderer-fails'(dir) { write(join(dir, 'checkout.review.json'), { ...read(join(ROOT, 'examples/review.example.json')), id: 'checkout-release' }); },
  'returned-page'(dir) { node('bin/answer.mjs', join(dir, 'docs/checkout.review.json'), join(dir, 'checkout.feedback.html'), join(dir, 'docs/checkout.feedback.json')); },
  'couldnt-test'(dir) { write(join(dir, 'docs/checkout-2.review.json'), nextOf(dir, 'checkout-uat-untested-2')); },
  'proposal-outcomes'(dir) {
    const next = nextOf(dir, 'checkout-uat-proposals-2'), prev = 'checkout-uat-proposals';
    next.diagrams[0].nodes.find((n) => n.id === 'pay').label = 'Charges the card';
    next.items[0].answers = ['comment-1', { review: prev, id: 'proposal-1', outcome: 'drawn' }];
    next.items[1].answers = ['comment-2', { review: prev, id: 'proposal-2', outcome: 'question', why: 'A PIN every time would end one-tap pay. Is it required?' }];
    write(join(dir, 'docs/checkout-2.review.json'), next);
  },
};

for (const fx of FIXTURES) {
  test(`conformance fixture "${fx.id}" (${fx.issue}): its checks tell done from not done`, () => {
    const score = (dir) => node('conformance/run.mjs', 'score', fx.id, dir, '--agent', 'test');
    const setup = () => { const dir = mkdtempSync(join(tmpdir(), `conf-${fx.id}-`)); assert.equal(node('conformance/run.mjs', 'setup', fx.id, join(dir, 'p')).status, 0); return join(dir, 'p'); };
    assert.ok(GOOD[fx.id], `fixture "${fx.id}" needs a good run in this test`);
    const idle = setup(), done = setup();
    if (fx.id !== 'renderer-fails') assert.equal(score(idle).status, 1, `doing nothing must not pass "${fx.id}"`);
    GOOD[fx.id](done);
    const s = score(done);
    assert.equal(s.status, 0, s.stdout);
    const report = read(join(done, 'conformance-report.json'));
    assert.equal(report.fixture, fx.id);
    assert.ok(report.rubric.length && report.rubric.every((r) => r.score === null), 'the rubric is left for a person');
  });
}

test('conformance: a hand-made page and a changed skill fail "renderer-fails"', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'conf-rf-')), 'p');
  node('conformance/run.mjs', 'setup', 'renderer-fails', dir);
  writeFileSync(join(dir, 'checkout.html'), '<html>hand-made</html>');
  writeFileSync(join(dir, '_skill/bin/render.mjs'), '// "fixed"');
  const s = node('conformance/run.mjs', 'score', 'renderer-fails', dir);
  assert.match(s.stdout, /✗ no page was made by hand/);
  assert.match(s.stdout, /✗ the skill folder was left alone/);
});

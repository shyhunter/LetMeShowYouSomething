// SPDX-License-Identifier: Apache-2.0
// #87 — the follow-up says what it did with each proposed change, and the diagrams must bear it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFeedback } from '../lib/build-feedback.mjs';

const root = new URL('..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'outcomes-'));
const at = (p) => join(root, p);
const check = (...args) => spawnSync(process.execPath, [at('bin/check.mjs'), ...args], { encoding: 'utf8' });
const write = (o) => { const p = join(tmp, `${Math.random().toString(36).slice(2)}.json`); writeFileSync(p, JSON.stringify(o)); return p; };
const review = JSON.parse(readFileSync(at('examples/review.example.json'), 'utf8'));
const d = review.diagrams[0];
const fbPath = write(buildFeedback(review, { proposals: [
  { id: 'proposal-1', diagram: d.id, op: 'rename', node: 'pay', label: 'Takes the payment', text: 'Charges the card' },
  { id: 'proposal-2', diagram: d.id, op: 'add-node', from: 'pay', label: 'Takes the payment', text: 'Shows the amount' }] }));

// The next round: item 0 answers proposal-1, item 1 answers proposal-2. `drawRename` draws proposal-1.
const round2 = (a1, a2, drawRename = true) => {
  const next = structuredClone(review); next.id = 'checkout-uat-2026-09-round-2';
  if (drawRename) next.diagrams[0].nodes.find((n) => n.id === 'pay').label = 'Charges the card';
  next.items[0].answers = [a1]; next.items[1].answers = [a2];
  return next;
};
const ok1 = { review: review.id, id: 'proposal-1', outcome: 'drawn' };
const ok2 = { review: review.id, id: 'proposal-2', outcome: 'not-drawn', why: 'The amount is already on the button.' };
const followup = (next) => check('followup', write(next), at('examples/review.example.json'), fbPath).stdout;

test('#87: true outcomes pass, and plain ids still do', () => {
  assert.match(followup(round2(ok1, ok2)), /✓ proposal outcomes true[\s\S]*PASS/);
  assert.match(followup(round2('proposal-1', 'proposal-2')), /PASS/, 'string entries stay valid');
});

test('#87: an outcome the diagrams contradict is refused', () => {
  assert.match(followup(round2(ok1, ok2, false)), /✗ proposal outcomes true: .*proposal-1 says drawn, but "Takes the payment" is not changed that way/);
  const drawnAnyway = round2(ok1, ok2);
  drawnAnyway.diagrams[0].nodes.push({ id: 'amount', kind: 'system-action', label: 'Shows the amount' });
  drawnAnyway.diagrams[0].edges.push({ from: 'pay', to: 'amount' });
  assert.match(followup(drawnAnyway), /✗ proposal outcomes true: .*proposal-2 says not drawn, but the next diagram has the change/);
});

test('#87: the wrong review, an unknown proposal or two outcomes for one are refused', () => {
  assert.match(followup(round2({ ...ok1, review: 'some-other-review' }, ok2)), /proposal-1 names review "some-other-review", but this follow-up is to "checkout-uat-2026-09"/);
  assert.match(followup(round2(ok1, { ...ok2, id: 'proposal-9' })), /proposal-9 is no proposal in the feedback for "checkout-uat-2026-09"/);
  const twice = round2(ok1, ok2); twice.items[2].answers = [{ ...ok1, outcome: 'question', why: 'Which card?' }];
  assert.match(followup(twice), /proposal-1 is answered both "drawn" and "question"/);
});

test('#87: an outcome needs a known word and, unless drawn, a reason', () => {
  const next = (a) => { const n = round2(ok1, ok2); n.items[3].answers = [a]; return write(n); };
  assert.match(check('review', next({ ...ok2, why: '' })).stdout, /✗ answers well-formed: .*proposal-2 is "not-drawn" without a "why"/);
  assert.match(check('review', next({ ...ok1, outcome: 'accepted' })).stdout, /✗ answers well-formed: .*"accepted" is not an outcome/);
  assert.match(check('review', next({ review: review.id, id: 'comment-1', outcome: 'drawn' })).stdout, /✗ answers well-formed: .*only a proposal/);
  assert.match(check('review', write(round2(ok1, ok2))).stdout, /✓ answers well-formed/);
});

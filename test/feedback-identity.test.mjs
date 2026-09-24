// SPDX-License-Identifier: Apache-2.0
// #77 — a new answer never takes an id already in use, and ambiguous feedback is refused, never guessed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFeedback, freeId } from '../lib/build-feedback.mjs';

const root = new URL('..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'identity-test-'));
const run = (bin, ...args) => spawnSync(process.execPath, [join(root, bin), ...args], { encoding: 'utf8' });
const base = JSON.parse(readFileSync(join(root, 'examples/review.example.json'), 'utf8'));
// Round 2 carries the reviewer's earlier added item under its own id, as PROTOCOL.md asks.
const round2 = { ...base, id: 'identity-round-2', items: [...base.items,
  { id: 'added-1', title: 'Earlier concern', sectionId: base.items[0].sectionId }] };
const write = (name, o) => { const p = join(tmp, name); writeFileSync(p, JSON.stringify(o)); return p; };
// The page before #77: counted only its own added items, so it handed out the carried added-1 again.
const collided = { verdicts: { 'added-1': 'works' }, added: [{ id: 'added-1', title: 'New unrelated concern', verdict: 'unset' }] };

test('#77: a new id skips every id in use, carried items included', () => {
  assert.equal(freeId('added-', round2.items.map((i) => i.id)), 'added-2');
  assert.equal(freeId('comment-', ['comment-1', 'comment-3']), 'comment-2');
});

test('#77: the checker refuses an added item that reuses a carried item id', () => {
  const r = run('bin/check.mjs', 'pair', write('r2.json', round2), write('f2.json', buildFeedback(round2, collided)));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /✗ answer ids unique: added-1 names two different answers/);
});

test('#77: the checker refuses a comment that reuses an item id', () => {
  const f = buildFeedback(base, {});
  f.comments = [{ id: 'comment-1', diagram: 'checkout-path', node: 'cart', label: 'Items in the cart', note: 'n' }];
  f.responses[0].itemId = 'comment-1';
  const r = run('bin/check.mjs', 'feedback', write('fc.json', f));
  assert.match(r.stdout, /✗ answer ids unique: comment-1/);
});

test('#77: history and followup refuse an earlier feedback whose ids are ambiguous', () => {
  const earlier = write('f2h.json', buildFeedback(round2, collided));
  const r3 = { ...base, id: 'identity-round-3', items: [{ ...base.items[0], affects: [{ effect: 'extends',
    decision: { review: round2.id, itemId: 'added-1', title: 'Earlier concern', verdict: 'works' } }] }, ...base.items.slice(1)] };
  for (const args of [['history', write('r3.json', r3), earlier], ['followup', write('r3f.json', r3), write('r2f.json', round2), earlier]]) {
    const r = run('bin/check.mjs', ...args);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /✗ answer ids unique: added-1/, args[0]);
  }
});

test('#77: feedback without collisions still passes, carried added-1 included', () => {
  const fine = { verdicts: { 'added-1': 'works' }, added: [{ id: 'added-2', title: 'New unrelated concern', verdict: 'unset' }] };
  const r = run('bin/check.mjs', 'pair', write('r2ok.json', round2), write('f2ok.json', buildFeedback(round2, fine)));
  assert.equal(r.status, 0, r.stdout);
});

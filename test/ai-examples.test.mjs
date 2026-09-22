// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFeedback, partLabel } from '../lib/build-feedback.mjs';
const root = new URL('..', import.meta.url).pathname;
for (const name of ['retry-backoff', 'booking-race', 'ai-tool-loop']) test(`AI catalogue: ${name} checks and round-trips comments, proposals and followup`, () => {
  const rp = join(root, `examples/${name}.review.json`), review = JSON.parse(readFileSync(rp, 'utf8'));
  const check = (...args) => { const r = spawnSync(process.execPath, [join(root, 'bin/check.mjs'), ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr); };
  check('review', rp); assert.equal(review.verdictSet.id, 'understanding');
  const d = review.diagrams[0], n = d.nodes.find(n => n.step), dir = mkdtempSync(join(tmpdir(), 'ai-example-'));
  assert.ok(n, 'example has item-linked nodes');
  const label = partLabel(d, { node: n.id });
  const f = buildFeedback(review, { comments: [{ id: 'comment-1', diagram: d.id, node: n.id, label, note: 'Explain the assumption.' }],
    proposals: [{ id: 'proposal-1', diagram: d.id, node: n.id, label, op: 'rename', text: 'Illustrated step' }] });
  const fp = join(dir, 'feedback.json'); writeFileSync(fp, JSON.stringify(f)); check('pair', rp, fp);
  const next = structuredClone(review); next.id += '-followup'; next.items[0].answers = ['comment-1', 'proposal-1'];
  const np = join(dir, 'next.json'); writeFileSync(np, JSON.stringify(next)); check('followup', np, rp, fp);
});

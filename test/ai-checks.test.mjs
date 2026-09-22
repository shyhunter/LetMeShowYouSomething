// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { agentDiagram, aiReview, aiMutations } from './ai-fixtures.mjs';
import { applyProposals, buildFeedback, partLabel } from '../lib/build-feedback.mjs';
const root = new URL('..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'ai-checks-'));
let serial = 0;
const json = value => { const path = join(dir, `${serial++}.json`); writeFileSync(path, JSON.stringify(value)); return path; };
const check = (...args) => spawnSync(process.execPath, [join(root, 'bin/check.mjs'), ...args], { encoding: 'utf8' });
const valid = d => { const r = check('review', json(aiReview(d))); assert.equal(r.status, 0, r.stdout + r.stderr); };
test('AI accepts explained endings, estimated/reported and zero token totals', () => {
  valid(agentDiagram());
  const d = agentDiagram(); d.tokenUsage.basis = 'reported'; d.tokenUsage.total = 0;
  d.tokenUsage.parts.forEach(p => { p.tokens = 0; }); valid(d);
});
test('AI accepts terminal and continuing human handoffs and connected loops with exits', () => {
  const d = agentDiagram(); d.nodes[2].kind = 'human-handoff'; valid(d);
  d.nodes.push({ id: 'done', kind: 'end', label: 'Done', stop: { reason: 'Person confirmed.', next: 'Read the answer.' } });
  d.edges.push({ from: 'end', to: 'model' }, { from: 'end', to: 'done' }); valid(d);
});
test('AI system boxes and ordinary token charts need no agent stops', () => {
  const d = agentDiagram(); delete d.agent; d.kind = 'system'; d.nodes = [{ id: 'model', kind: 'model-call', label: 'Model' }, { id: 'tool', kind: 'tool-call', label: 'Tool' }];
  d.edges = [{ from: 'model', to: 'tool' }]; valid(d);
  const ordinary = agentDiagram(); delete ordinary.agent; delete ordinary.nodes[2].stop; ordinary.nodes[1].kind = 'process'; valid(ordinary);
});
for (const [rule, mutate] of Object.entries(aiMutations)) test(`AI refuses ${rule}`, () => {
  const d = agentDiagram(); mutate(d);
  const r = check('review', json(aiReview(d)));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.includes(`(${rule})`), r.stdout + r.stderr);
});
test('AI refuses numeric strings, oversized counts, unknown fields and missing stop objects', () => {
  for (const mutate of [d => { delete d.nodes[2].stop; }, d => { d.nodes[2].stop.reason = 'x'.repeat(301); },
    d => { d.tokenUsage.total = '1400'; }, d => { d.tokenUsage.parts[0].tokens = 1000000001; },
    d => { d.tokenUsage.parts = Array(31).fill(d.tokenUsage.parts[0]); }, d => { d.agent = 'true'; },
    d => { d.nodes[1].label = 'x'.repeat(161); }, d => { d.edges = {}; }]) {
    const d = agentDiagram(); mutate(d); const r = check('review', json(aiReview(d))); assert.equal(r.status, 1, r.stdout + r.stderr);
  }
});
test('AI annotations and association edges cannot hide a silent stop or provide an exit', () => {
  const d = agentDiagram(); d.edges[1].kind = 'association';
  d.nodes.push({ id: 'note', kind: 'note', label: 'Not an exit' });
  d.edges.push({ from: 'model', to: 'note' });
  const r = check('review', json(aiReview(d))); assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /\(silent stop\)/);
});
test('AI add-node proposals are refused while ordinary/system proposals retain their behavior', () => {
  const p = { id: 'proposal-1', op: 'add-node', from: 'model', text: 'Extra' };
  assert.equal(applyProposals(agentDiagram(), [p]).failed.length, 1);
  for (const kind of ['flowchart', 'system']) { const d = agentDiagram(); delete d.agent; d.kind = kind; assert.equal(applyProposals(d, [p]).failed.length, 0); }
});
test('AI cannot hide a closed loop behind an annotation bridge', () => {
  const d = agentDiagram();
  d.nodes.push({ id: 'note', kind: 'note', label: 'Bridge' }, { id: 'loop', kind: 'process', label: 'Closed loop' });
  d.edges.push({ from: 'model', to: 'note' }, { from: 'note', to: 'loop' }, { from: 'loop', to: 'loop' });
  const r = check('review', json(aiReview(d))); assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /can't be reached from a start/);
});
test('AI terminal stops may connect to decorative annotations without continuing control', () => {
  for (const kind of ['end', 'human-handoff']) {
    const d = agentDiagram(); d.nodes[2].kind = kind; d.nodes.push({ id: 'note', kind: 'note', label: 'A decorative note' });
    d.edges.push({ from: 'end', to: 'note' }); valid(d);
  }
});
test('AI proposals, comments and followup keep the checked original contract', () => {
  const review = aiReview(), d = review.diagrams[0], rp = json(review);
  const comment = { id: 'comment-1', diagram: d.id, node: 'model', label: partLabel(d, { node: 'model' }), note: 'Explain the model input.' };
  const proposal = { id: 'proposal-1', diagram: d.id, op: 'rename', node: 'model', text: 'Draft a proposed answer', label: comment.label };
  const feedback = buildFeedback(review, { comments: [comment], proposals: [proposal] }), fp = json(feedback);
  assert.equal(check('pair', rp, fp).status, 0);
  const next = structuredClone(review); next.id = 'ai-followup'; next.items[0].answers = ['comment-1', 'proposal-1'];
  assert.equal(check('followup', json(next), rp, fp).status, 0);
  for (const p of [{ ...proposal, op: 'add-node', from: 'model', node: undefined },
    { ...proposal, op: 'remove-edge', node: undefined, from: 'model', to: 'end', text: undefined, label: partLabel(d, { edge: { from: 'model', to: 'end' } }) }]) {
    const f = buildFeedback(review, { proposals: [p] }); const r = check('pair', rp, json(f)); assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /proposals fit the diagram/);
  }
});
test('AI valid removals, additions and relabels retain the agent contract', () => {
  const d = agentDiagram(); d.nodes.push({ id: 'extra', kind: 'human-handoff', label: 'Ask a person', stop: { reason: 'Needs a person.', next: 'Wait for their decision.' } });
  d.edges.push({ from: 'model', to: 'extra' });
  for (const p of [
    { op: 'remove-node', node: 'extra' },
    { op: 'add-edge', from: 'start', to: 'end' },
    { op: 'relabel-edge', from: 'model', to: 'end', text: 'Ready' }
  ]) {
    const changed = applyProposals(d, [{ id: 'proposal-1', ...p }]);
    assert.equal(changed.failed.length, 0); assert.equal(changed.diagram.agent, true); valid(changed.diagram);
  }
});
test('AI removing its AI boxes never removes the explicit agent marker', () => {
  const d = agentDiagram(); d.edges.push({ from: 'start', to: 'end' });
  const changed = applyProposals(d, [{ id: 'proposal-1', op: 'remove-node', node: 'model' }]);
  assert.equal(changed.diagram.agent, true); valid(changed.diagram);
  assert.equal(applyProposals(changed.diagram, [{ id: 'proposal-2', op: 'add-node', from: 'start', text: 'Silent process' }]).failed.length, 1);
});

// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReviewSelection } from '../lib/review-selection.mjs';

const review = () => ({
  flow: { screens: [{ id: 'shared', title: 'Shared screen' }, { id: 'alone', title: 'One action' }, { id: 'end', title: 'Finished' }] },
  items: [
    { id: 'first', title: 'First action', step: { from: 'shared', outcomes: [
      { label: 'Accepted', effect: 'Saved', to: 'end', system: [{ id: 'save', name: 'Save booking' }], data: [{ id: 'record', entity: 'Booking' }] },
      { effect: 'Try again', to: 'shared' }
    ] } },
    { id: 'second', title: 'Second action', step: { from: 'shared', outcomes: [] } },
    { id: 'single', title: 'Only action', step: { from: 'alone', outcomes: [] } },
    { id: 'approval', title: 'Approve release' }
  ],
  diagrams: [{ id: 'technical', kind: 'flowchart', nodes: [
    { id: 'linked', label: 'Linked action', step: 'first' },
    { id: 'first', label: 'Unlinked action' },
    { id: 'screen:shared', label: 'Technical screen name' },
    { id: 'bad-link', label: 'Broken reference', step: 'missing' }
  ], edges: [
    { from: 'first', to: 'linked', label: 'Unique' },
    { from: 'linked', to: 'first', label: 'Accepted' },
    { from: 'linked', to: 'first', label: 'Rejected' }
  ] }, { id: 'user-flow', nodes: [
    { id: 'screen:shared', label: 'Shared screen' },
    { id: 'screen:alone', label: 'One action' },
    { id: 'screen:missing', label: 'Missing' }
  ], edges: [] }]
});
const select = (target, data = review()) => {
  assert.equal(typeof resolveReviewSelection, 'function', 'the pure review resolver must be exported');
  return resolveReviewSelection(data, target);
};
const empty = target => ({ target, label: null, itemId: null, screenId: null, relatedItemIds: [], diagramId: null, commentTarget: null, layerKey: null, outcomeIndex: null });

test('selection: item resolves the source screen and approval items need no step', () => {
  const target = { kind: 'item', itemId: 'first' };
  assert.deepEqual(select(target), { ...empty(target), label: 'First action', itemId: 'first', screenId: 'shared', relatedItemIds: ['first'] });
  const approval = select({ kind: 'item', itemId: 'approval' });
  assert.equal(approval.itemId, 'approval');
  assert.equal(approval.screenId, null);
});

test('selection: screen keeps all outgoing actions without choosing among them', () => {
  const shared = select({ kind: 'screen', screenId: 'shared' });
  assert.equal(shared.itemId, null);
  assert.deepEqual(shared.relatedItemIds, ['first', 'second']);
  assert.equal(shared.label, 'Shared screen');
  assert.equal(select({ kind: 'screen', screenId: 'alone' }).itemId, 'single');
  const end = select({ kind: 'screen', screenId: 'end' });
  assert.equal(end.itemId, null);
  assert.deepEqual(end.relatedItemIds, []);
});

test('selection: outcomes carry the owner, destination and original index', () => {
  const target = { kind: 'outcome', itemId: 'first', outcomeIndex: 0 };
  assert.deepEqual(select(target), { ...empty(target), label: 'Accepted', itemId: 'first', screenId: 'end', relatedItemIds: ['first'], outcomeIndex: 0 });
  assert.equal(select({ ...target, outcomeIndex: 1 }).label, 'Try again');
});

test('selection: layers use exact owner/entry identity and outcome context', () => {
  const target = { kind: 'layer', itemId: 'first', entryId: 'save' };
  assert.deepEqual(select(target), { ...empty(target), label: 'Save booking', itemId: 'first', screenId: 'end', relatedItemIds: ['first'], layerKey: 'first/save', outcomeIndex: 0 });
  assert.equal(select({ ...target, entryId: 'record' }).label, 'Booking');
  assert.equal(select({ ...target, itemId: 'second' }), null);
});

test('selection: diagram nodes follow only an explicit step reference', () => {
  const linked = select({ kind: 'node', diagramId: 'technical', nodeId: 'linked' });
  assert.equal(linked.itemId, 'first');
  assert.equal(linked.screenId, 'shared');
  assert.equal(linked.label, 'Linked action');
  assert.deepEqual(linked.commentTarget, { node: 'linked' });
  const unlinked = select({ kind: 'node', diagramId: 'technical', nodeId: 'first' });
  assert.equal(unlinked.itemId, null);
  assert.deepEqual(unlinked.relatedItemIds, []);
  assert.equal(select({ kind: 'node', diagramId: 'technical', nodeId: 'bad-link' }), null);
});

test('selection: only user-flow screen nodes resolve screen context', () => {
  const shared = select({ kind: 'node', diagramId: 'user-flow', nodeId: 'screen:shared' });
  assert.equal(shared.screenId, 'shared');
  assert.equal(shared.itemId, null);
  assert.deepEqual(shared.relatedItemIds, ['first', 'second']);
  const alone = select({ kind: 'node', diagramId: 'user-flow', nodeId: 'screen:alone' });
  assert.equal(alone.itemId, null, 'screen node must not infer a step');
  assert.deepEqual(alone.relatedItemIds, ['single']);
  assert.equal(select({ kind: 'node', diagramId: 'technical', nodeId: 'screen:shared' }).screenId, null);
  assert.equal(select({ kind: 'node', diagramId: 'user-flow', nodeId: 'screen:missing' }), null);
});

test('selection: edges are comment targets without inferred endpoint items', () => {
  const target = { kind: 'edge', diagramId: 'technical', from: 'first', to: 'linked' };
  assert.deepEqual(select(target), { ...empty(target), label: 'Unlinked action → Linked action (Unique)', diagramId: 'technical', commentTarget: { edge: { from: 'first', to: 'linked' } } });
});

test('selection: parallel edges require their absolute original index', () => {
  const target = { kind: 'edge', diagramId: 'technical', from: 'linked', to: 'first' };
  assert.equal(select(target), null);
  assert.equal(select({ ...target, nth: 0 }), null, 'index zero points at a different pair');
  assert.match(select({ ...target, nth: 1 }).label, /Accepted/);
  assert.deepEqual(select({ ...target, nth: 2 }).commentTarget, { edge: { from: 'linked', to: 'first', nth: 2 } });
});

test('selection: database relationship label identifies the column mapping', () => {
  const data = review();
  data.diagrams.push({ id: 'database', kind: 'database', nodes: [{ id: 'booking', label: 'Bookings', columns: [{ id: 'member' }] }, { id: 'member', label: 'Members', columns: [{ id: 'id' }] }], edges: [{ from: 'booking', to: 'member', fromColumn: 'member', toColumn: 'id', label: 'Booked by' }] });
  assert.equal(select({ kind: 'edge', diagramId: 'database', from: 'booking', to: 'member' }, data).label, 'Bookings.member (many) → Members.id (one) (Booked by)');
});

test('selection: invalid references and noninteger indices fail closed', () => {
  for (const target of [null, {}, { kind: 'unknown' }, { kind: 'item', itemId: 'missing' }, { kind: 'item', itemId: '__proto__' }, { kind: 'screen', screenId: 'missing' }, { kind: 'node', diagramId: 'missing', nodeId: 'first' }, { kind: 'node', diagramId: 'technical', nodeId: 'missing' }, { kind: 'layer', itemId: 'first', entryId: 'missing' }]) assert.equal(select(target), null);
  for (const index of [-1, 1.2, '0', null, NaN, Infinity, 99]) {
    assert.equal(select({ kind: 'outcome', itemId: 'first', outcomeIndex: index }), null);
    assert.equal(select({ kind: 'edge', diagramId: 'technical', from: 'linked', to: 'first', nth: index }), null);
  }
  assert.equal(select({ kind: 'item', itemId: 'first' }, null), null);
  const data = review();
  data.items[0].step.outcomes[0].to = 'missing';
  assert.equal(select({ kind: 'outcome', itemId: 'first', outcomeIndex: 0 }, data), null);
});

test('selection: frozen input stays unchanged and returned target is independent', () => {
  const data = review(), target = { kind: 'edge', diagramId: 'technical', from: 'linked', to: 'first', nth: 2 };
  const before = JSON.stringify(data);
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(data); freeze(target);
  const result = select(target, data);
  result.target.nth = 1;
  result.commentTarget.edge.nth = 0;
  assert.equal(target.nth, 2);
  assert.equal(JSON.stringify(data), before);
});

test('selection: absent labels resolve to null for every direct label source', () => {
  const data = review();
  delete data.items[0].title;
  delete data.flow.screens[0].title;
  delete data.items[0].step.outcomes[0].label;
  delete data.items[0].step.outcomes[0].effect;
  delete data.items[0].step.outcomes[0].system[0].name;
  delete data.items[0].step.outcomes[0].data[0].entity;
  delete data.diagrams[0].nodes[0].label;
  for (const target of [
    { kind: 'item', itemId: 'first' },
    { kind: 'screen', screenId: 'shared' },
    { kind: 'outcome', itemId: 'first', outcomeIndex: 0 },
    { kind: 'layer', itemId: 'first', entryId: 'save' },
    { kind: 'layer', itemId: 'first', entryId: 'record' },
    { kind: 'node', diagramId: 'technical', nodeId: 'linked' }
  ]) assert.equal(select(target, data).label, null, target.kind);
});

test('selection: screens refuse missing or ambiguous related item identities', () => {
  for (const id of [undefined, null, '', 7, 'second', 'approval']) {
    const data = review();
    data.items[0].id = id;
    assert.equal(select({ kind: 'screen', screenId: 'shared' }, data), null);
    assert.equal(select({ kind: 'node', diagramId: 'user-flow', nodeId: 'screen:shared' }, data), null);
  }
});

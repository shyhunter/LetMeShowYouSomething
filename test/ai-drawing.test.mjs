// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawDiagram } from '../lib/draw-diagram.mjs';
import { layout } from '../lib/layout.mjs';
import { agentDiagram } from './ai-fixtures.mjs';

test('AI kinds have visible captions and original glyphs without relying on colour', () => {
  const kinds = ['model-call', 'tool-call', 'retrieval', 'guardrail', 'human-handoff'];
  for (const [i, caption] of ['Model call', 'Tool call', 'Retrieval', 'Guardrail', 'Human handoff'].entries()) {
    const d = agentDiagram(); d.nodes[1].kind = kinds[i];
    const svg = drawDiagram(d, { commentable: true, selected: 'model' });
    assert.ok(svg.includes(`>${caption}</text>`), caption);
    assert.match(svg, /data-icon=/); assert.match(svg, /data-step="model"/);
    assert.match(svg, /dg-selected/);
  }
});
test('AI stops are drawn in full and taller boxes stay inside layout bounds', () => {
  const d = agentDiagram(); d.nodes[2].stop = { reason: '界'.repeat(150), next: 'x'.repeat(300) };
  const svg = drawDiagram(d), l = layout(d), box = l.nodes.end;
  assert.match(svg, />Why</); assert.match(svg, />Next</);
  const visible = svg.replace(/<[^>]*>/g, '');
  assert.ok(visible.includes(d.nodes[2].stop.reason)); assert.ok(visible.includes(d.nodes[2].stop.next));
  assert.ok(box.h > 500); assert.ok(box.y + box.h <= l.height);
  assert.ok(!svg.includes('…'));
});
test('AI token chart identifies its author-supplied basis and exact counts including zero', () => {
  const d = agentDiagram();
  for (const basis of ['estimated', 'reported']) {
    d.tokenUsage.basis = basis;
    const svg = drawDiagram(d);
    assert.ok(svg.includes(`${basis === 'estimated' ? 'Estimated' : 'Reported'} tokens`));
    for (const text of ['Input tokens', '1000', 'Output tokens', '400', 'Total: 1400', 'Author-supplied']) assert.ok(svg.includes(text), text);
  }
  d.tokenUsage.total = 0; d.tokenUsage.parts.forEach(p => { p.tokens = 0; });
  const svg = drawDiagram(d); assert.match(svg, /Total: 0/); assert.ok(!/NaN|Infinity/.test(svg));
});
test('AI text surfaces escape markup and retain long labels without ellipses', () => {
  const d = agentDiagram(), hostile = '<script>alert("fiction")</script>';
  d.nodes[1].label = hostile; d.nodes[2].stop = { reason: hostile, next: hostile };
  d.tokenUsage.parts[0].label = hostile;
  const svg = drawDiagram(d);
  assert.ok(!svg.includes('<script>')); assert.match(svg, /&lt;script&gt;/);
  const long = '界'.repeat(80); d.nodes[1].label = long;
  const visible = drawDiagram(d).replace(/<[^>]*>/g, ''); assert.ok(visible.includes(long));
});

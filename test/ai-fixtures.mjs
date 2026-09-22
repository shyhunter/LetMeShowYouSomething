// SPDX-License-Identifier: Apache-2.0
export const agentDiagram = () => ({ id: 'agent', kind: 'flowchart', title: 'Invented agent', agent: true,
  nodes: [{ id: 'start', kind: 'start', label: 'Start' },
    { id: 'model', kind: 'model-call', label: 'Draft an answer', step: 'model' },
    { id: 'end', kind: 'end', label: 'Done', stop: { reason: 'The answer is ready.', next: 'The person reads it.' } }],
  edges: [{ from: 'start', to: 'model' }, { from: 'model', to: 'end' }],
  tokenUsage: { basis: 'estimated', total: 1400, parts: [
    { id: 'input', label: 'Input tokens', tokens: 1000 }, { id: 'output', label: 'Output tokens', tokens: 400 }] }
});
export const aiReview = (d = agentDiagram()) => ({ protocol: 'letmeshowyousomething/review', schemaVersion: 1,
  id: 'ai-unit-review', title: 'An invented example', verdictSet: { id: 'understanding', options: [
    { value: 'clear', label: 'Clear', tone: 'positive' }, { value: 'lost', label: 'Lost me', tone: 'negative' }] },
  items: [{ id: 'model', title: 'The model drafts an answer', body: 'This is invented.' }], diagrams: [d] });
// Each rule has an independently runnable CLI refusal test and can be mutation-tested.
export const aiMutations = {
  'agent flag': d => { d.agent = false; },
  'agent context': d => { delete d.agent; },
  'agent kind': d => { d.kind = 'system'; },
  'AI kind': d => { delete d.agent; delete d.tokenUsage; delete d.nodes[2].stop; d.kind = 'sequence'; },
  'AI label': d => { d.nodes[1].label = ' '; },
  'agent graph shape': d => { d.nodes = {}; },
  'agent node count': d => { d.nodes = Array(81).fill(d.nodes[0]); },
  'agent edge count': d => { d.edges = Array(161).fill(d.edges[0]); },
  'agent node shape': d => { d.nodes[1] = null; },
  'agent node id': d => { d.nodes[1].id = 'bad id'; },
  'agent duplicate id': d => { d.nodes.push(structuredClone(d.nodes[1])); },
  'agent edge shape': d => { d.edges[0] = null; },
  'agent endpoint': d => { d.edges[0].to = 'missing'; },
  'stop context': d => { d.nodes[1].stop = { reason: 'Why', next: 'Next' }; },
  'stop shape': d => { d.nodes[2].stop.extra = true; },
  'stop reason': d => { d.nodes[2].stop.reason = ' '; },
  'stop next': d => { delete d.nodes[2].stop.next; },
  'stop outgoing': d => { d.edges.push({ from: 'end', to: 'model' }); },
  'silent stop': d => { d.edges = d.edges.slice(0, 1); },
  'no stop path': d => { d.nodes.push({ id: 'loop', kind: 'process', label: 'Never exits' }); d.edges.push({ from: 'model', to: 'loop' }, { from: 'loop', to: 'loop' }); },
  'token kind': d => { delete d.agent; d.kind = 'sequence'; },
  'token shape': d => { d.tokenUsage.extra = true; },
  'token basis': d => { delete d.tokenUsage.basis; },
  'token total': d => { d.tokenUsage.total = -1; },
  'token parts': d => { d.tokenUsage.parts = []; },
  'token part shape': d => { d.tokenUsage.parts[0].extra = true; },
  'token part id': d => { d.tokenUsage.parts[0].id = 'bad id'; },
  'token duplicate id': d => { d.tokenUsage.parts[1].id = 'input'; },
  'token label': d => { d.tokenUsage.parts[0].label = ' '; },
  'token count': d => { d.tokenUsage.parts[0].tokens = 0.5; },
  'token sum': d => { d.tokenUsage.total++; }
};

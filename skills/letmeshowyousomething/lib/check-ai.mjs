// SPDX-License-Identifier: Apache-2.0
// Author-supplied explanations, not proof of runtime termination or usage provenance.
const AI = new Set(['model-call', 'tool-call', 'retrieval', 'guardrail', 'human-handoff']);
const STOPS = new Set(['end', 'end-failed', 'exit', 'human-handoff']);
const NOTES = new Set(['note', 'group', 'connector', 'off-page']);
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const closed = (x, keys) => object(x) && Object.keys(x).every(k => keys.includes(k));
const label = (x, max) => typeof x === 'string' && x.trim().length > 0 && x.length <= max && x === x.trim();
const count = x => Number.isSafeInteger(x) && x >= 0 && x <= 1000000000;

// Call after shape/endpoint validation. Annotations are not control-flow steps.
export function agentControlEdges(d) {
  const nodes = new Map(d.nodes.map(n => [n.id, n]));
  return d.edges.filter(e => e.kind !== 'association' && nodes.has(e.from) && nodes.has(e.to)
    && !NOTES.has(nodes.get(e.from).kind) && !NOTES.has(nodes.get(e.to).kind));
}

export function aiFaults(d) {
  const faults = [];
  const no = (rule, message) => faults.push(`${d.id} (${rule}): ${message}`);
  if (d.agent !== undefined && d.agent !== true) no('agent flag', 'Use exactly agent:true, or omit the flag on a non-agent diagram.');
  if (d.agent !== undefined && d.kind !== 'flowchart') no('agent kind', 'Only flowcharts can declare agent:true. Use a flowchart to explain agent control flow.');
  // Token rules apply independently, even when the graph itself is malformed.
  if (d.tokenUsage !== undefined) {
    const t = d.tokenUsage;
    if (!['flowchart', 'system'].includes(d.kind)) no('token kind', 'Token summaries belong only to flowchart or system diagrams.');
    if (!closed(t, ['basis', 'total', 'parts'])) no('token shape', 'Use only basis, total and parts in tokenUsage.');
    if (!['estimated', 'reported'].includes(t?.basis)) no('token basis', 'Declare estimated or reported; neither is independently verified usage.');
    if (!count(t?.total)) no('token total', 'Use an integer total from 0 to 1000000000, not a string.');
    if (!Array.isArray(t?.parts) || t.parts.length < 1 || t.parts.length > 30) no('token parts', 'Supply 1–30 disjoint token parts.');
    if (Array.isArray(t?.parts)) {
      const ids = new Set();
      let sum = 0, numeric = true;
      for (const p of t.parts) {
        if (!closed(p, ['id', 'label', 'tokens'])) no('token part shape', 'Each part uses only id, label and tokens.');
        if (typeof p?.id !== 'string' || !ID.test(p.id)) no('token part id', 'Give each token part a lowercase protocol id.');
        if (ids.has(p?.id)) no('token duplicate id', 'Give every token part a distinct id.');
        ids.add(p?.id);
        if (!label(p?.label, 80)) no('token label', 'Give each part a trimmed, nonblank label of at most 80 characters.');
        if (!count(p?.tokens)) { numeric = false; no('token count', 'Use integer part counts from 0 to 1000000000, not strings.'); }
        else sum += p.tokens;
      }
      if (numeric && count(t?.total) && sum !== t.total) no('token sum', 'Make the disjoint parts sum exactly to total; do not repeat a subtotal.');
    }
  }
  const agent = d.agent === true;
  if (agent && (!Array.isArray(d.nodes) || !Array.isArray(d.edges))) {
    no('agent graph shape', 'Supply nodes and edges arrays so the agent flow can be checked.');
    return faults;
  }
  const nodes = Array.isArray(d.nodes) ? d.nodes : [];
  for (const n of nodes) {
    if (AI.has(n?.kind)) {
      if (!['flowchart', 'system'].includes(d.kind)) no('AI kind', 'AI nodes belong only to flowchart or system diagrams.');
      if (d.kind === 'flowchart' && !agent) no('agent context', 'Mark AI flowcharts agent:true and explain every stopping point.');
      if (!label(n.label, 160)) no('AI label', 'Give each AI box a trimmed, nonblank label of at most 160 characters.');
    }
    if (n?.stop !== undefined && (!agent || !STOPS.has(n.kind))) no('stop context', 'Put stop details only on end, end-failed, exit or human-handoff nodes in an agent flowchart.');
    if (agent && STOPS.has(n?.kind)) {
      if (!closed(n.stop, ['reason', 'next'])) no('stop shape', 'Supply a stop object with only reason and next.');
      if (!label(n.stop?.reason, 300)) no('stop reason', 'Explain why this stops in 1–300 trimmed characters.');
      if (!label(n.stop?.next, 300)) no('stop next', 'Explain what happens next in 1–300 trimmed characters.');
    }
  }
  if (!agent) return faults;
  if (nodes.length > 80) no('agent node count', 'Use at most 80 agent nodes; split a larger explanation.');
  if (d.edges.length > 160) no('agent edge count', 'Use at most 160 agent edges; split a larger explanation.');
  const byId = new Map();
  let broken = false;
  for (const n of nodes) {
    if (!object(n)) { broken = true; no('agent node shape', 'Each agent node must be an object.'); continue; }
    if (typeof n.id !== 'string' || !ID.test(n.id)) { broken = true; no('agent node id', 'Give each agent node a lowercase protocol id.'); }
    if (byId.has(n.id)) { broken = true; no('agent duplicate id', 'Give every agent node a distinct id.'); }
    byId.set(n.id, n);
  }
  for (const e of d.edges) {
    if (!object(e)) { broken = true; no('agent edge shape', 'Each agent edge must be an object.'); continue; }
    if (!byId.has(e.from) || !byId.has(e.to)) { broken = true; no('agent endpoint', 'Point each agent edge at two existing node ids.'); }
  }
  if (broken || nodes.length > 80 || d.edges.length > 160) return faults;
  const control = agentControlEdges(d);
  const outgoing = new Map(nodes.map(n => [n.id, []])), incoming = new Map(nodes.map(n => [n.id, []]));
  for (const e of control) { outgoing.get(e.from).push(e.to); incoming.get(e.to).push(e.from); }
  const terminals = [];
  for (const n of nodes) {
    if (NOTES.has(n.kind)) continue;
    const out = outgoing.get(n.id);
    if (['end', 'end-failed', 'exit'].includes(n.kind) && out.length) no('stop outgoing', `Remove outgoing control arrows from ${n.id}, or make it a continuing step.`);
    if (!out.length) {
      if (!STOPS.has(n.kind)) no('silent stop', `Explain the stop at ${n.id} with an ending or human handoff, or connect its next step.`);
      else terminals.push(n.id);
    }
  }
  const walk = (seeds, adjacency) => {
    const seen = new Set(), queue = [...seeds];
    for (let i = 0; i < queue.length; i++) if (!seen.has(queue[i])) { seen.add(queue[i]); queue.push(...adjacency.get(queue[i])); }
    return seen;
  };
  const reachable = walk(nodes.filter(n => ['start', 'entry'].includes(n.kind)).map(n => n.id), outgoing);
  const canStop = walk(terminals, incoming);
  for (const n of nodes) if (!NOTES.has(n.kind) && reachable.has(n.id) && !canStop.has(n.id))
    no('no stop path', `Connect ${n.id} to a terminal explained stop; annotations and associations cannot provide a loop exit.`);
  return faults;
}

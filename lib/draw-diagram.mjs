// SPDX-License-Identifier: MIT-0
// Draws a flow chart as an SVG string: our own shapes per node kind, our own icons (D041), screen
// components inside nodes, and the selected step marked (D045). Pure; the renderer inlines this file
// with its imports removed, so the page and the tests run the same code. Every text goes through esc().
import { layout, layoutSequence } from './layout.mjs';
import { drawBlock } from './draw-components.mjs';

function escSvg(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Our own icon set: simple strokes on a 24-unit grid, drawn for this project (nothing copied).
const ICON_PATHS = {
  envelope: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 7l9 6 9-6"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  warning: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="1"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  document: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  cart: '<path d="M3 4h3l2 11h11l2-8H7"/><circle cx="10" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
};
// A kind without an explicit icon still gets a hint of what it is.
// #32 — a system diagram's boxes: what runs, what it keeps, what it talks to.
const KIND_ICON = { client: 'phone', service: 'gear', component: 'gear', guard: 'lock', queue: 'envelope', external: 'cloud',
  'user-action': 'person', notification: 'bell', timer: 'clock', wait: 'clock', deadline: 'clock', schedule: 'calendar',
  error: 'warning', escalate: 'person', cancel: 'cross', send: 'envelope', receive: 'envelope', callback: 'chat', 'data-store': 'database', document: 'document', screen: 'phone' };

function icon(name, x, y) {
  return ICON_PATHS[name] ? `<g class="dg-icon" data-icon="${escSvg(name)}" transform="translate(${x} ${y}) scale(.75)">${ICON_PATHS[name]}</g>` : '';
}

// One outline per kind; the box is x, y, w, h from the layout.
function outline(kind, x, y, w, h) {
  const r = (rx) => `<rect class="dg-shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
  const poly = (pts) => `<polygon class="dg-shape" points="${pts.map((p) => p.join(',')).join(' ')}"/>`;
  const cx = x + w / 2, cy = y + h / 2;
  switch (kind) {
    case 'start': case 'entry': case 'end': case 'end-failed': case 'exit': return r(Math.min(h / 2, 28));
    case 'decision': case 'event-choice': case 'merge': case 'parallel-start': case 'parallel-join':
      return poly([[cx, y], [x + w, cy], [cx, y + h], [x, cy]]);
    case 'input': case 'output': case 'data': return poly([[x + 14, y], [x + w, y], [x + w - 14, y + h], [x, y + h]]);
    case 'manual': return poly([[x, y], [x + w, y], [x + w - 14, y + h], [x + 14, y + h]]);
    case 'off-page': return poly([[x, y], [x + w, y], [x + w, y + h - 14], [cx, y + h], [x, y + h - 14]]);
    case 'loop': return poly([[x + 14, y], [x + w - 14, y], [x + w, cy], [x + w - 14, y + h], [x + 14, y + h], [x, cy]]);
    case 'connector': return `<circle class="dg-shape" cx="${cx}" cy="${cy}" r="${Math.min(w, h) / 2}"/>`;
    case 'data-store': return `<path class="dg-shape" d="M${x} ${y + 8}c0-10 ${w} -10 ${w} 0v${h - 16}c0 10 -${w} 10 -${w} 0z"/><path class="dg-line" d="M${x} ${y + 8}c0 10 ${w} 10 ${w} 0"/>`;
    case 'document': return `<path class="dg-shape" d="M${x} ${y}h${w}v${h - 8}c-${w / 4} -10 -${w / 2} 10 -${w} 0z"/>`;
    case 'note': return `<path class="dg-shape dg-note" d="M${x} ${y}h${w - 14}l14 14v${h - 14}h-${w}z"/>`;
    case 'subflow': case 'component': return r(6) + `<path class="dg-line" d="M${x + 8} ${y}v${h}M${x + w - 8} ${y}v${h}"/>`;
    // A system diagram: the thing the person uses has a window bar; what we run is plain; what we call
    // out to is drawn open-edged; a queue shows its slots; a check is a shield.
    case 'client': return r(8) + `<path class="dg-line" d="M${x} ${y + 14}h${w}"/>`;
    case 'service': return r(10);
    case 'external': return `<rect class="dg-shape dg-dashed" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`;
    case 'queue': return r(6) + `<path class="dg-line" d="M${x + 10} ${y}v${h}M${x + 16} ${y}v${h}"/>`;
    case 'guard': return poly([[x + 10, y], [x + w - 10, y], [x + w, cy], [x + w - 10, y + h], [x + 10, y + h], [x, cy]]);
    case 'group': return `<rect class="dg-shape dg-group" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`;
    default: return r(8);
  }
}

function wrap(text, max = 22, lines = 3) {
  const out = [];
  let line = '';
  for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    if ((line + ' ' + word).trim().length > max && line) { out.push(line); line = word; } else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out.length > lines ? [...out.slice(0, lines - 1), out.slice(lines - 1).join(' ').slice(0, max - 1) + '…'] : out;
}

export function drawDiagram(diagram, opts = {}) {
  if (diagram.kind === 'sequence') return drawSequence(diagram, opts);
  const L = layout(diagram);
  const id = escSvg(diagram.id);
  const byId = Object.fromEntries((diagram.nodes || []).map((n) => [n.id, n]));
  const parts = [], labels = [];

  // D054 — highlight one part: its boxes strongly, what leads into them lightly, the rest dimmed.
  const onIds = new Set(), upIds = new Set();
  if (opts.part) {
    for (const n of diagram.nodes || []) if (n.part === opts.part || (n.step && opts.partSteps && opts.partSteps.has(n.step))) onIds.add(n.id);
    for (const queue = [...onIds]; queue.length;) {
      const id = queue.shift();
      for (const e of diagram.edges || []) if (e.to === id && !onIds.has(e.from) && !upIds.has(e.from)) { upIds.add(e.from); queue.push(e.from); }
    }
  }
  const partClass = (nodeId) => (!opts.part ? '' : onIds.has(nodeId) ? ' dg-part-on' : upIds.has(nodeId) ? ' dg-part-up' : ' dg-part-off');

  for (const lane of L.lanes) {
    if (lane.id === null && L.lanes.length === 1) continue;
    parts.push(`<g class="dg-lane"><rect x="0" y="${lane.y}" width="${L.width}" height="${lane.h}"/><text class="dg-lane-title" x="10" y="${lane.y + 22}">${escSvg(lane.title)}</text></g>`);
  }

  for (const e of L.edges) {
    const d = e.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
    const [mx, my] = e.labelAt;
    // #60 — commenting: every arrow can be picked, by a wider invisible line and by keyboard.
    const pick = opts.commentable ? ` tabindex="0" role="button" aria-label="Arrow from ${escSvg(byId[e.from]?.label || e.from)} to ${escSvg(byId[e.to]?.label || e.to)}${e.label ? `: ${escSvg(e.label)}` : ''}"` : '';
    parts.push(`<g class="dg-edge dg-e-${escSvg(e.kind)}${e.back ? ' dg-back' : ''}" data-from="${escSvg(e.from)}" data-to="${escSvg(e.to)}"${pick}>`
      + `<path d="${d}" marker-end="url(#dg-arrow-${id})"/>${opts.commentable ? `<path class="dg-hit" d="${d}"/>` : ''}</g>`);
    // Labels are drawn after the boxes, so a label wider than its corridor stays readable.
    if (e.label) labels.push(`<text class="dg-edge-label" x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle">${escSvg(e.label)}</text>`);
  }

  for (const [nodeId, box] of Object.entries(L.nodes)) {
    const n = byId[nodeId];
    const linked = n.step !== undefined;
    const selected = (linked && n.step === opts.selected) || opts.here === nodeId;
    const diamond = ['decision', 'event-choice', 'merge', 'parallel-start', 'parallel-join'].includes(n.kind);
    const glyph = diamond ? null : n.icon || KIND_ICON[n.kind];
    const textX = diamond ? box.x + box.w / 2 : box.x + (glyph ? 34 : 12);
    const lines = wrap(n.label, diamond ? 14 : glyph ? 18 : 22);
    const labelTop = box.y + (n.component ? 22 : box.h / 2 - (lines.length - 1) * 7 + 4);
    parts.push(`<g data-node="${escSvg(nodeId)}" class="dg-node dg-k-${escSvg(n.kind)}${selected ? ' dg-selected' : ''}${partClass(nodeId)}"`
      + (linked ? ` data-step="${escSvg(n.step)}"` : '') + (linked || opts.commentable ? ' tabindex="0" role="button"' : '')
      + ` aria-label="${escSvg(n.label || n.kind)}" aria-current="${selected}">`
      + outline(n.kind, box.x, box.y, box.w, box.h)
      + (glyph ? icon(glyph, box.x + 8, box.y + (n.component ? 6 : box.h / 2 - 9)) : '')
      + `<text class="dg-label" x="${textX}" y="${labelTop}"${diamond ? ' text-anchor="middle"' : ''}>${lines.map((l, i) => `<tspan x="${textX}" dy="${i ? 14 : 0}">${escSvg(l)}</tspan>`).join('')}</text>`
      + (n.component ? `<foreignObject x="${box.x + 6}" y="${box.y + 34}" width="${box.w - 12}" height="${box.h - 40}"><div class="dg-component">${drawBlock(n.component, { targets: new Set() })}</div></foreignObject>` : '')
      + '</g>');
  }

  return `<svg class="dg" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}" role="group" aria-label="${escSvg(diagram.title)}">`
    + `<defs><marker id="dg-arrow-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>`
    + parts.join('') + labels.join('') + '</svg>';
}

// #32 — a sequence: the participants in a row with their lifelines, one message per row underneath.
// The same hooks as any chart, so a comment or a proposed change lands on a box or a message.
function drawSequence(diagram, opts = {}) {
  const L = layoutSequence(diagram);
  const id = escSvg(diagram.id);
  const byId = Object.fromEntries((diagram.nodes || []).map((n) => [n.id, n]));
  const parts = [];
  for (const l of L.lifelines) parts.push(`<path class="dg-life" d="M${l.x} ${l.from}V${l.to}"/>`);
  for (const e of L.edges) {
    const d = e.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
    const pick = opts.commentable ? ` tabindex="0" role="button" aria-label="Message from ${escSvg(byId[e.from]?.label || e.from)} to ${escSvg(byId[e.to]?.label || e.to)}${e.label ? `: ${escSvg(e.label)}` : ''}"` : '';
    parts.push(`<g class="dg-edge dg-e-${escSvg(e.kind)}" data-from="${escSvg(e.from)}" data-to="${escSvg(e.to)}" data-nth="${e.nth}"${pick}>`
      + `<path d="${d}" marker-end="url(#dg-arrow-${id})"/>${opts.commentable ? `<path class="dg-hit" d="${d}"/>` : ''}</g>`);
  }
  for (const [nodeId, box] of Object.entries(L.nodes)) {
    const n = byId[nodeId];
    const glyph = n.icon || KIND_ICON[n.kind];
    const lines = wrap(n.label, glyph ? 18 : 22, 2);
    parts.push(`<g data-node="${escSvg(nodeId)}" class="dg-node dg-k-${escSvg(n.kind)}"`
      + (n.step !== undefined ? ` data-step="${escSvg(n.step)}"` : '') + (n.step !== undefined || opts.commentable ? ' tabindex="0" role="button"' : '')
      + ` aria-label="${escSvg(n.label || n.kind)}">`
      + outline(n.kind, box.x, box.y, box.w, box.h)
      + (glyph ? icon(glyph, box.x + 8, box.y + box.h / 2 - 9) : '')
      + `<text class="dg-label" x="${box.x + (glyph ? 34 : 12)}" y="${box.y + box.h / 2 - (lines.length - 1) * 7 + 4}">${lines.map((l, i) => `<tspan x="${box.x + (glyph ? 34 : 12)}" dy="${i ? 14 : 0}">${escSvg(l)}</tspan>`).join('')}</text></g>`);
  }
  const labels = L.edges.filter((e) => e.label).map((e) =>
    `<text class="dg-edge-label" x="${e.labelAt[0]}" y="${e.labelAt[1]}" text-anchor="${e.self ? 'start' : 'middle'}" dominant-baseline="middle">${escSvg(e.label)}</text>`);
  return `<svg class="dg" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}" role="group" aria-label="${escSvg(diagram.title)}">`
    + `<defs><marker id="dg-arrow-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>`
    + parts.join('') + labels.join('') + '</svg>';
}

// The user-flow chart, computed from the flow: screens, and the steps that move between them. Never
// written by hand, so it can't disagree with the clickable flow.
export function flowAsDiagram(review) {
  const flow = review.flow || { screens: [] };
  const steps = (review.items || []).filter((i) => i.step);
  const leaves = (screenId) => steps.some((s) => s.step.from === screenId);
  const nodes = [{ id: 'start', kind: 'start', label: 'Start' }];
  for (const s of flow.screens) nodes.push({ id: `screen:${s.id}`, kind: 'screen', label: s.title });
  for (const s of steps) nodes.push({ id: `step:${s.id}`, kind: 'user-action', label: s.title, step: s.id });
  // A chart that begins with Start ends with End: every screen the journey can stop on leads there,
  // whether it is a dead stop (nothing leaves it) or an ending the person can still act on.
  const ends = flow.screens.filter((s) => s.end || !leaves(s.id));
  if (ends.length) nodes.push({ id: 'end', kind: 'end', label: 'End' });
  const edges = [{ from: 'start', to: `screen:${flow.start}` }];
  for (const s of ends) edges.push({ from: `screen:${s.id}`, to: 'end' });
  for (const s of steps) edges.push({ from: `screen:${s.step.from}`, to: `step:${s.id}` });
  for (const s of steps) for (const o of s.step.outcomes)
    edges.push(s.step.outcomes.length > 1 ? { from: `step:${s.id}`, to: `screen:${o.to}`, kind: 'conditional', label: o.label } : { from: `step:${s.id}`, to: `screen:${o.to}` });
  return { id: 'user-flow', kind: 'flowchart', title: 'The user flow', nodes, edges };
}

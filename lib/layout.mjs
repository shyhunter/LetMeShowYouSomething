// SPDX-License-Identifier: MIT-0
// Lays out a flow chart (D052, D075 — each column gap as wide as its widest label): boxes in columns by their longest distance from a start, one row band
// per lane, loops found and routed underneath. Deterministic and pure; the renderer inlines this file.
//
// Deliberately not a general graph-layout engine (D009). When a chart comes out awkward, a node's
// `col` (and `row` within its lane) pins it; everything else stays automatic.

const NODE_W = 168, GAP_MIN = 32, NODE_H = 64, COMPONENT_H = 170, PAD = 16, LANE_W = 110, LOOP_GAP = 14;

export function layout(diagram) {
  const nodes = diagram.nodes || [];
  // A node showing a screen component is taller; only the lane holding one gets taller rows.
  const cellH = (members) => (members.some((n) => n.component) ? COMPONENT_H + 26 : 96);
  const ids = nodes.map((n) => n.id);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = (diagram.edges || []).filter((e) => byId[e.from] && byId[e.to] && e.kind !== 'association');

  // 1. Loops: a depth-first walk from every start (then from anything left) marks edges that point back
  //    at a node still on the path. Those are drawn underneath and ignored when ranking columns.
  const back = new Set(), state = {};
  const outOf = (id) => edges.filter((e) => e.from === id);
  const walk = (root) => {
    const stack = [[root, 0]];
    state[root] = 'open';
    while (stack.length) {
      const top = stack[stack.length - 1], outs = outOf(top[0]);
      if (top[1] >= outs.length) { state[top[0]] = 'done'; stack.pop(); continue; }
      const e = outs[top[1]++];
      if (state[e.to] === 'open') back.add(e);
      else if (!state[e.to]) { state[e.to] = 'open'; stack.push([e.to, 0]); }
    }
  };
  for (const n of nodes) if ((n.kind === 'start' || n.kind === 'entry') && !state[n.id]) walk(n.id);
  for (const id of ids) if (!state[id]) walk(id);
  const forward = edges.filter((e) => !back.has(e));

  // 2. Columns: longest forward distance from anything without predecessors; a pinned col wins.
  const col = {}, indegree = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const e of forward) indegree[e.to]++;
  const queue = ids.filter((id) => indegree[id] === 0);
  for (const id of ids) col[id] = 0;
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (Number.isInteger(byId[id].col)) col[id] = byId[id].col;
    for (const e of forward.filter((x) => x.from === id)) {
      col[e.to] = Math.max(col[e.to], col[id] + 1);
      if (--indegree[e.to] === 0) queue.push(e.to);
    }
  }

  // An end stands alone in the last column, the way a start stands alone in the first (D077).
  const ends = ids.filter((id) => byId[id].kind === 'end' && !Number.isInteger(byId[id].col));
  if (ends.length && ends.length < ids.length) {
    const last = Math.max(...ids.filter((id) => !ends.includes(id)).map((id) => col[id]));
    for (const id of ends) col[id] = last + 1;
  }

  // 3. Lanes as row bands; inside a band, boxes sharing a column stack in sub-rows (pins first).
  const laneList = (diagram.lanes || []).map((l) => ({ id: l.id, title: l.title }));
  if (!laneList.length || nodes.some((n) => !laneList.some((l) => l.id === n.lane))) laneList.push({ id: null, title: '' });
  const laneOf = (n) => (laneList.some((l) => l.id === n.lane) ? n.lane : null);
  const taken = {}, sub = {};
  const place = (n, want) => {
    const key = (r) => `${laneOf(n)}|${col[n.id]}|${r}`;
    let r = want;
    while (taken[key(r)]) r++;
    taken[key(r)] = true;
    sub[n.id] = r;
  };
  for (const n of nodes) if (Number.isInteger(n.row)) place(n, n.row);
  for (const n of nodes) if (!Number.isInteger(n.row)) place(n, 0);

  const offsetX = laneList.some((l) => l.id !== null) ? LANE_W : 0;
  let y = 0;
  const lanes = [];
  for (const l of laneList) {
    const members = nodes.filter((n) => laneOf(n) === l.id);
    if (l.id === null && !members.length && laneList.length > 1) continue;
    const rows = members.length ? Math.max(...members.map((n) => sub[n.id])) + 1 : 1;
    const h = PAD + rows * cellH(members);
    lanes.push({ id: l.id, title: l.title, y, h, cell: cellH(members) });
    y += h;
  }
  const bandY = Object.fromEntries(lanes.map((l) => [l.id, l.y]));
  const bandCell = Object.fromEntries(lanes.map((l) => [l.id, l.cell]));

  // Each corridor between columns is as wide as the widest label it carries, so no label covers a box.
  const maxCol = nodes.length ? Math.max(...Object.values(col)) : 0;
  const gap = Array.from({ length: maxCol + 1 }, () => GAP_MIN);
  for (const e of edges) {
    const a = col[e.from], b = col[e.to];
    if (e.label && !back.has(e) && b === a + 1) gap[a] = Math.max(gap[a], labelWidth(e.label) + 12);
  }
  const colX = [offsetX + PAD];
  for (let c = 1; c <= maxCol; c++) colX[c] = colX[c - 1] + NODE_W + gap[c - 1];

  const boxes = {};
  for (const n of nodes) {
    boxes[n.id] = { x: colX[col[n.id]], y: bandY[laneOf(n)] + PAD + sub[n.id] * bandCell[laneOf(n)],
      w: NODE_W, h: n.component ? COMPONENT_H : NODE_H, col: col[n.id], row: sub[n.id], lane: laneOf(n) };
  }

  // 4. Edges travel only where no box can be: the corridor between columns, the gap above a row, and
  //    below everything for loops. Nothing crosses an unrelated box (tested on random diagrams).
  const bottom = y;
  let loops = 0;
  const lines = edges.map((e) => {
    const a = boxes[e.from], b = boxes[e.to];
    const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
    const out = x1 + gap[a.col] / 2, into = x2 - gap[Math.max(0, b.col - 1)] / 2;
    const isBack = back.has(e) || b.col <= a.col;
    let points, labelAt;
    if (isBack) {
      const ly = bottom + LOOP_GAP + loops++ * LOOP_GAP;
      points = [[x1, y1], [out, y1], [out, ly], [into, ly], [into, y2], [x2, y2]];
      labelAt = [(out + into) / 2, ly];
    } else if (b.col === a.col + 1) {
      points = [[x1, y1], [out, y1], [out, y2], [x2, y2]];
      labelAt = [out, (y1 + y2) / 2];
    } else {
      const gy = b.y - PAD / 2;
      points = [[x1, y1], [out, y1], [out, gy], [into, gy], [into, y2], [x2, y2]];
      labelAt = [(out + into) / 2, gy];
    }
    return { from: e.from, to: e.to, kind: e.kind || 'sequence', label: e.label, back: isBack, points, labelAt };
  });

  return { nodes: boxes, edges: lines, lanes, width: colX[maxCol] + NODE_W + gap[maxCol] + PAD, height: bottom + (loops ? LOOP_GAP * (loops + 1) : 0) };
}

// Edge labels are 600 11px sans: about 6.6px a character, plus the halo drawn around them.
export function labelWidth(text) { return Math.ceil(String(text).length * 6.6) + 10; }

// #32 — a sequence: who calls whom, in the order the edges are written. Participants stand in a row,
// each with a lifeline; every message is one row down. A message to itself gets a taller row for its
// bracket. Deterministic and pure, like the flow layout.
const SEQ = { w: 168, h: 56, gap: 56, pad: 16, top: 16, first: 40, row: 52, self: 34 };

export function layoutSequence(diagram) {
  const nodes = diagram.nodes || [];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = (diagram.edges || []).filter((e) => byId[e.from] && byId[e.to]);
  const boxes = {};
  nodes.forEach((n, i) => {
    const x = SEQ.pad + i * (SEQ.w + SEQ.gap);
    boxes[n.id] = { x, y: SEQ.top, w: SEQ.w, h: SEQ.h, cx: x + SEQ.w / 2 };
  });
  let y = SEQ.top + SEQ.h + SEQ.first;
  const lines = edges.map((e, i) => {
    const a = boxes[e.from], b = boxes[e.to];
    const self = e.from === e.to;
    const at = y;
    y += self ? SEQ.row + SEQ.self : SEQ.row;
    const points = self
      ? [[a.cx, at], [a.cx + 46, at], [a.cx + 46, at + SEQ.self], [a.cx + 6, at + SEQ.self]]
      : [[a.cx, at], [b.cx, at]];
    return { from: e.from, to: e.to, kind: e.kind || 'sequence', label: e.label, nth: i,
      self, points, labelAt: self ? [a.cx + 52, at + SEQ.self / 2] : [(a.cx + b.cx) / 2, at - 9] };
  });
  const bottom = Math.max(y + 10, SEQ.top + SEQ.h + SEQ.first + 40);
  return { nodes: boxes, edges: lines, lanes: [], lifelines: nodes.map((n) => ({ id: n.id, x: boxes[n.id].cx, from: SEQ.top + SEQ.h, to: bottom })),
    width: SEQ.pad * 2 + nodes.length * SEQ.w + Math.max(0, nodes.length - 1) * SEQ.gap, height: bottom + SEQ.pad };
}

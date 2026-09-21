// SPDX-License-Identifier: MIT-0
// The single source of truth for what a completed review exports.
//
// Pure: takes the review and the reviewer's raw input, returns a feedback.v1 object. No DOM, no
// storage, no side effects. `render.mjs` inlines this function's source into the generated
// page, so the page and the test suite run the SAME code — the export shape cannot drift from what
// the checker expects without both failing together.
//
// Everything here exists to satisfy an invariant in PROTOCOL.md. The comments name which.

// One line of text per flow layer entry. Exported so the checker compares with exactly what the page
// wrote into the feedback (invariant 1: the verdict carries the text it judged).
export function layerEntryText(layer, e) {
  if (layer === 'system') return `${e.kind} ${e.name} · ${e.status}${e.ref ? ` · ${e.ref}` : ''}`;
  const fields = (e.fields || []).map((f) => `${f.name} ${f.before ?? '—'} → ${f.after ?? '—'}`).join(', ');
  return `${e.entity} ${e.change}${fields ? `: ${fields}` : ''}`;
}

// Finds a system or data entry of a flow step by its id (D033).
export function findLayerEntry(item, entryId) {
  for (const outcome of item?.step?.outcomes || [])
    for (const layer of ['system', 'data'])
      for (const entry of outcome[layer] || []) if (entry.id === entryId) return { outcome, layer, entry };
  return null;
}

// #60 — what a comment is on, in words, so the feedback reads without the review (invariant 1).
// null when the diagram has no such box or arrow.
export function partLabel(diagram, on) {
  const nodes = Object.fromEntries((diagram?.nodes || []).map((n) => [n.id, n]));
  const name = (id) => nodes[id]?.label || nodes[id]?.kind || id;
  if (on?.node !== undefined) return nodes[on.node] ? name(on.node) : null;
  // The same pair can be joined more than once (a sequence): `nth` says which arrow, by its place
  // in the diagram's own list.
  const all = diagram?.edges || [];
  if (diagram?.kind === 'database' && on?.edge?.nth === undefined && all.filter(x => x.from === on?.edge?.from && x.to === on?.edge?.to).length > 1) return null;
  const e = on?.edge?.nth !== undefined ? all[on.edge.nth] : all.find((x) => x.from === on?.edge?.from && x.to === on?.edge?.to);
  if (!e || e.from !== on?.edge?.from || e.to !== on?.edge?.to) return null;
  if (diagram.kind === 'database') return `${name(e.from)}.${e.fromColumn} (many) → ${name(e.to)}.${e.toColumn} (one)${e.label ? ` (${e.label})` : ''}`;
  return `${name(e.from)} → ${name(e.to)}${e.label ? ` (${e.label})` : ''}`;
}

// #60 — the reviewer's proposed changes to a diagram, applied to a copy of it: what the next round
// would draw. Used by the page to show the change and by the checker to prove it still makes sense.
// Returns the changed diagram and the proposals that could not be applied, each with why.
export function applyProposals(diagram, proposals) {
  const d = structuredClone(diagram);
  d.nodes = d.nodes ?? []; d.edges = d.edges ?? [];
  const originalEdges = [...d.edges];
  const failed = [], added = [];
  let n = 0;
  for (const p of proposals) {
    const node = d.nodes.find((x) => x.id === p.node);
    // `nth` picks one arrow when the same pair is joined more than once (a sequence).
    const positioned = originalEdges[p.nth];
    const edge = p.nth !== undefined ? (d.edges.includes(positioned) && positioned?.from === p.from && positioned?.to === p.to ? positioned : undefined)
      : d.edges.find((x) => x.from === p.from && x.to === p.to);
    const no = (why) => failed.push({ id: p.id, why });
    if (d.kind === 'database' && ['remove-edge', 'relabel-edge'].includes(p.op) && p.nth === undefined && originalEdges.filter(e => e.from === p.from && e.to === p.to).length > 1) {
      no('more than one relationship joins these tables. Name its original position with nth, or the change could land on the wrong columns'); continue;
    }
    if (d.kind === 'database' && ['add-node', 'add-edge'].includes(p.op)) {
      no('database additions need columns and key mappings. Describe the addition in a comment for the next review, or the new table or relationship would be incomplete'); continue;
    }
    if (p.op === 'rename') {
      if (!node) no(`box "${p.node}" is not in this diagram`);
      else if (!String(p.text ?? '').trim()) no('a new name is missing');
      else node.label = p.text;
    } else if (p.op === 'remove-node') {
      if (!node) no(`box "${p.node}" is not in this diagram`);
      else { d.nodes = d.nodes.filter((x) => x !== node); d.edges = d.edges.filter((e) => e.from !== p.node && e.to !== p.node); }
    } else if (p.op === 'add-node') {
      if (!d.nodes.some((x) => x.id === p.from)) no(`box "${p.from}" is not in this diagram`);
      else if (!String(p.text ?? '').trim()) no('the new box has no words');
      else { const id = `added-${++n}`; added.push(id); d.nodes.push({ id, kind: 'process', label: p.text }); d.edges.push({ from: p.from, to: id }); }
    } else if (p.op === 'add-edge') {
      if (!d.nodes.some((x) => x.id === p.from) || !d.nodes.some((x) => x.id === p.to)) no('an arrow needs two boxes that are in this diagram');
      else if (edge) no('that arrow is already there');
      else d.edges.push(String(p.text ?? '').trim() ? { from: p.from, to: p.to, kind: 'conditional', label: p.text } : { from: p.from, to: p.to });
    } else if (p.op === 'remove-edge') {
      if (!edge) no(`arrow ${p.from} → ${p.to} is not in this diagram`);
      else d.edges = d.edges.filter((x) => x !== edge);
    } else if (p.op === 'relabel-edge') {
      if (!edge) no(`arrow ${p.from} → ${p.to} is not in this diagram`);
      else if (!String(p.text ?? '').trim()) no('a new label is missing');
      else { edge.label = p.text; if (d.kind !== 'database') edge.kind = edge.kind ?? 'conditional'; }
    } else no(`"${p.op}" is not a change this format knows`);
  }
  return { diagram: d, failed, added };
}

export function buildFeedback(review, store, now = new Date().toISOString()) {
  const sectionLabel = {};
  const sectionKind = {};
  for (const s of review.sections || []) { sectionLabel[s.id] = s.label; if (s.kind) sectionKind[s.id] = s.kind; }

  const negative = new Set(
    (review.verdictSet?.options || []).filter((o) => o.tone === 'negative').map((o) => o.value),
  );
  const positive = new Set(
    (review.verdictSet?.options || []).filter((o) => o.tone === 'positive').map((o) => o.value),
  );

  // Invariant 2 — every item appears, including ones nobody touched. An untouched item is written
  // as "unset", never omitted, so "no opinion" stays distinguishable from "never reached them".
  const responses = (review.items || []).map((item) => {
    const r = {
      itemId: item.id,
      // Invariant 1 — the echoed title is what makes the file readable without the review.
      title: item.title,
      verdict: store.verdicts?.[item.id] || 'unset',
      note: (store.notes?.[item.id] || '').trim() || null,
    };
    if (item.sectionId) r.sectionId = item.sectionId;
    if (sectionKind[item.sectionId]) r.sectionKind = sectionKind[item.sectionId];
    if (item.sectionId && sectionLabel[item.sectionId]) r.sectionLabel = sectionLabel[item.sectionId];
    if (item.ref) r.ref = item.ref;
    if (item.affects?.length) r.affects = item.affects;
    // #54 — what exactly was approved or declined travels with the answer (invariant 1).
    if (item.approval) r.approval = item.approval;
    return r;
  });

  // Invariant 3 — what the reviewer added. `added-` prefix so these can never be mistaken for
  // something the agent asked about.
  const addedItems = (store.added || []).map((a, i) => {
    const out = {
      id: a.id || `added-${i + 1}`,
      title: (a.title || '').trim() || '(untitled)',
      verdict: a.verdict || 'unset',
      note: (a.note || '').trim() || null,
    };
    if ((a.body || '').trim()) out.body = a.body.trim();
    if (a.sectionLabel) out.sectionLabel = a.sectionLabel;
    return out;
  });

  // Invariant 4 — derived, and required to agree with the data. The checker recomputes all of this.
  const unset = responses.filter((r) => r.verdict === 'unset').length;
  const byVerdict = { unset };
  for (const o of review.verdictSet?.options || []) {
    byVerdict[o.value] = responses.filter((r) => r.verdict === o.value).length;
  }

  // Invariant 5 — gap-first: anything judged negative, plus anything nobody answered. In a choose-one
  // section that has a pick, the pick answers the section, so unrated options are not gaps.
  // D006 — verdicts on single flow layer entries, only the ones the reviewer judged. Each echoes the
  // entry text. Nothing about how the reviewer navigated is recorded (D003).
  const itemById = {};
  for (const it of review.items || []) itemById[it.id] = it;
  const layerVerdicts = Object.entries(store.layerVerdicts || {}).map(([id, v]) => {
    const [stepId, entryId] = id.split('/');
    const found = findLayerEntry(itemById[stepId], entryId);
    if (!found || !v?.verdict) return null;
    return { id, stepId, entryId, stepTitle: itemById[stepId].title, layer: found.layer,
      outcome: found.outcome.label ?? null, entry: layerEntryText(found.layer, found.entry),
      verdict: v.verdict, note: (v.note || '').trim() || null };
  }).filter(Boolean);

  // D060 — what the reviewer asks the agent for: an example, or an explanation. Answered next round.
  const requests = [];
  for (const [itemId, ask] of Object.entries(store.requests || {})) {
    const item = itemById[itemId];
    if (!item) continue;
    for (const kind of ['example', 'explain']) if (ask && ask[kind])
      requests.push({ itemId, title: item.title, kind, note: (ask.note || '').trim() || null });
  }

  const picked = new Set((review.sections || []).filter((s) => s.mode === 'choose-one' && store.choices?.[s.id]).map((s) => s.id));
  const gaps = [...responses, ...addedItems, ...layerVerdicts]
    .filter((x) => (x.verdict === 'unset' ? !picked.has(x.sectionId)
      // D051 — in a doubts section, agree (a positive verdict) means the concern is real: that is the gap.
      : x.sectionKind === 'challenge' ? positive.has(x.verdict) : negative.has(x.verdict)))
    .map((x) => x.itemId || x.id);

  // choose-one sections — every one is written down, chosen or not (itemId null), mirroring
  // invariant 2. followedRecommendation is derived, so the checker can recompute it (invariant 4).
  const titleOf = {};
  for (const it of review.items || []) titleOf[it.id] = it.title;
  const choices = (review.sections || []).filter((s) => s.mode === 'choose-one').map((s) => {
    const picked = store.choices?.[s.id] || null;
    const c = { sectionId: s.id, sectionLabel: s.label, itemId: picked, title: picked ? titleOf[picked] : null };
    if (s.recommended) {
      c.recommended = { itemId: s.recommended.itemId, title: titleOf[s.recommended.itemId] };
      c.followedRecommendation = picked ? picked === s.recommended.itemId : null;
    }
    return c;
  });

  const out = {
    protocol: 'letmeshowyousomething/feedback',
    schemaVersion: 1,
    review: { id: review.id, title: review.title, schemaVersion: review.schemaVersion },
    respondedAt: now,
    // Echoed so a value like "partial" still means something to a reader without the review.
    verdictSet: review.verdictSet,
    responses,
    summary: {
      total: responses.length,
      answered: responses.length - unset,
      unset,
      added: addedItems.length,
      byVerdict,
    },
    gaps,
  };
  if (addedItems.length) out.addedItems = addedItems;
  if (choices.length) out.choices = choices;
  if (requests.length) out.requests = requests;
  if (layerVerdicts.length) out.layerVerdicts = layerVerdicts;
  // #60 — the reviewer's comments on a box or an arrow of a diagram, each with what it is on. An empty
  // comment is not an answer and is left out.
  const comments = (store.comments || []).filter((c) => (c.note || '').trim()).map((c) => {
    const o = { id: c.id, diagram: c.diagram };
    if (c.node !== undefined) o.node = c.node;
    // `nth` says which arrow, when the same pair is joined more than once (a sequence): it must travel.
    else o.edge = c.edge.nth === undefined ? { from: c.edge.from, to: c.edge.to } : { from: c.edge.from, to: c.edge.to, nth: c.edge.nth };
    o.label = c.label; o.note = c.note.trim();
    return o;
  });
  if (comments.length) out.comments = comments;
  // #60 — pictures the reviewer attached to a note or a comment. The page re-saves each one, so hidden
  // details such as a photo's location are gone. Each says what it is attached to (invariant 1); a
  // picture on something that is not in the file is left out.
  const onTitle = Object.fromEntries([...responses.map((r) => [r.itemId, r.title]), ...addedItems.map((a) => [a.id, a.title]),
    ...comments.map((c) => [c.id, c.label])]);
  const pictures = (store.pictures || []).filter((p) => onTitle[p.on] !== undefined).map((p) => ({
    id: p.id, on: p.on, onTitle: onTitle[p.on], type: p.type, width: p.width, height: p.height, data: p.data }));
  if (pictures.length) out.pictures = pictures;
  // #60 — changes the reviewer proposes to a diagram. `label` says what the change is on, `why` is
  // their own words from the comment on the same part.
  const why = Object.fromEntries((store.comments || []).map((c) => [c.id, (c.note || '').trim()]));
  const proposals = (store.proposals || []).map((p) => {
    const o = { id: p.id, diagram: p.diagram, op: p.op, label: p.label };
    for (const k of ['node', 'from', 'to', 'nth', 'text']) if (p[k] !== undefined) o[k] = p[k];
    if (why[p.comment]) o.why = why[p.comment];
    return o;
  });
  if (proposals.length) out.proposals = proposals;
  if (store.respondent && (store.respondent.name || store.respondent.role)) {
    out.respondent = {};
    if (store.respondent.name) out.respondent.name = store.respondent.name;
    if (store.respondent.role) out.respondent.role = store.respondent.role;
  }
  return out;
}

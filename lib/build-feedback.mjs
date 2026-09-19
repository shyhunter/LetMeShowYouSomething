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
  if (store.respondent && (store.respondent.name || store.respondent.role)) {
    out.respondent = {};
    if (store.respondent.name) out.respondent.name = store.respondent.name;
    if (store.respondent.role) out.respondent.role = store.respondent.role;
  }
  return out;
}

// SPDX-License-Identifier: MIT-0
// The parts of a review and its "Let me explain" cards. Pure: no DOM. The renderer uses it to write the
// cards into the page itself (#74: a phone's file preview runs no script and must still show them), and
// inlines it verbatim so the page groups its questions the same way.

function partsEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Text without its Markdown marks, for a sentence shown as plain words.
export function plain(t) { return String(t || '').split('**').join('').split(String.fromCharCode(96)).join('').trim(); }
export function firstSentence(t) { const s = plain(t), m = s.match(/^.+?[.!?](?=\s|$)/); return m ? [m[0], s.slice(m[0].length).trim()] : [s, '']; }

// The review's sections, a flow's journeys, or one part. Each part keeps its items in the review's order.
export function reviewParts(review) {
  const flow = review.flow || null, items = review.items || [], sections = review.sections || [];
  const partsById = flow ? Object.fromEntries((flow.parts || []).map((p) => [p.id, p])) : {};
  const top = flow ? (flow.parts || []).filter((p) => !p.parent) : [];
  const journeys = top.length === 1 ? (flow.parts || []).filter((p) => p.parent === top[0].id) : top;
  const journeyOf = (it) => { for (let p = partsById[it.step.part], n = 0; p && n < 50; p = partsById[p.parent], n++) if (journeys.some((j) => j.id === p.id)) return p.id; return null; };
  const list = [], taken = new Set();
  const iconFor = (sec, its) => sec && sec.mode === 'choose-one' ? 'branch' : sec && sec.kind === 'challenge' ? 'alert' : its.every((i) => i.approval) ? 'shield' : flow ? 'phone' : 'help';
  const add = (label, sec, its) => { if (!its.length) return; its.forEach((i) => taken.add(i.id)); list.push({ label, sec, items: its, icon: iconFor(sec, its) }); };
  for (const sec of sections) add(sec.label || sec.id, sec, items.filter((i) => i.sectionId === sec.id));
  if (flow && !sections.length) for (const j of journeys) add(j.title || j.id, null, items.filter((i) => i.step && !taken.has(i.id) && journeyOf(i) === j.id));
  const rest = items.filter((i) => !taken.has(i.id));
  add(list.length ? 'Other questions' : 'Questions', null, rest);
  list.forEach((p, i) => { p.color = 'var(--s' + (i % 6 + 1) + ')'; p.questions = p.sec && p.sec.mode === 'choose-one' ? 1 : p.items.length; });
  return list;
}

// #82 — Since last time: what became of the round before, in one sentence, the settled answers behind More.
function sinceCard(view, icon) {
  const count = (t) => Object.values(view.tags).filter((x) => x === t).length;
  const said = [['changed', 'changed after your notes'], ['again', 'asked again'], ['open', 'still open'], ['added', 'you added'], ['new', 'new']]
    .map(([t, words]) => [count(t), words]).filter(([k]) => k).map(([k, words]) => k + ' ' + words);
  if (view.settled.length) said.push(view.settled.length + ' settled');
  const more = view.settled.length ? '<details class="start-more"><summary>More</summary><ul>' + view.settled.map((x) => '<li>' + partsEsc(x.title) + ': ' + partsEsc(x.label) + ' (round ' + x.round + ')</li>').join('') + '</ul></details>' : '';
  return ['history', 'Since last time', '<p>Round ' + view.round + ': ' + partsEsc(said.join(', ')) + '.</p>' + more];
}

// #105 — Let me explain in short cards: one sentence each, the rest one tap away, never dropped.
export function startCardsHtml(review, parts, icon, view) {
  const b = review.brief || {}, n = parts.reduce((k, p) => k + p.questions, 0);
  const card = (ic, title, text, moreHtml) => {
    const fs = firstSentence(text), more = (fs[1] ? '<p>' + partsEsc(fs[1]) + '</p>' : '') + (moreHtml || '');
    return [ic, title, '<p>' + partsEsc(fs[0]) + '</p>' + (more ? '<details class="start-more"><summary>More</summary>' + more + '</details>' : '')];
  };
  const about = b.question || b.explains || review.intro || review.subtitle || review.title;
  const aboutMore = [b.question && b.explains, about !== review.intro && review.intro].filter(Boolean).map((t) => '<p>' + partsEsc(plain(t)) + '</p>').join('');
  const exRows = (b.examples || []).map((x) => '<li><b>' + partsEsc(x.name) + '</b> ' + partsEsc(x.what || '') + (x.shows ? ' What people see: ' + partsEsc(x.shows) : '') + ' '
    + (x.source ? '<a href="' + partsEsc(x.source) + '" target="_blank" rel="noopener noreferrer">' + partsEsc(String(x.source).replace(/^https?:\/\//, '').split('/')[0]) + '</a>' : '<span class="unverified">unverified · I could not find a source</span>') + '</li>').join('');
  const cards = [
    card('flag', b.question ? 'What I need you to decide' : 'What this is about', about, aboutMore),
    b.recommendation && card('star', 'My recommendation', b.recommendation),
    ['list', "What I'll ask", '<p>' + n + (n === 1 ? ' question' : ' questions') + (parts.length > 1 ? ' in ' + parts.length + ' parts.' : '.') + '</p><p class="start-parts">'
      + parts.map((p) => '<span class="chip-part" style="--sc:' + p.color + '">' + icon(p.icon, 'sm') + partsEsc(p.label) + '</span>').join('') + '</p>'],
    (b.examples || []).length && card('globe', 'Done before', (b.examples.length === 1 ? 'One example: ' : b.examples.length + ' examples, like ') + b.examples[0].name + '.', '<ul>' + exRows + '</ul>'),
    (b.risks || []).length && card('alert', 'What could go wrong', b.risks[0], b.risks.length > 1 ? '<ul>' + b.risks.slice(1).map((r) => '<li>' + partsEsc(r) + '</li>').join('') + '</ul>' : ''),
    view && sinceCard(view, icon),
    card('help', 'How to answer', review.ask || 'Tap the answer that fits. Skip anything you are unsure about.'),
    card('send', 'What happens next', review.afterwards || 'Nothing is sent until you download your answers.', review.afterwards ? '<p>Nothing is sent until you download your answers.</p>' : ''),
  ].filter(Boolean);
  return cards.map(([ic, title, h], i) => '<li class="scard"><span class="num">' + (i + 1) + '</span><div><h3' + (i === 0 ? ' id="brief-h"' : '') + '>' + icon(ic, 'sm') + partsEsc(title) + '</h3>' + h + '</div></li>').join('');
}

// #82 — what became of each question since the round before, from the files alone: never invented.
// earlier[itemId]: the answer given to it in the round before (same id, or quoted by its `affects`).
// tags[itemId]: new · added (the reviewer raised it) · open (left unanswered) · changed (answered, and the
// question changed since) · again (answered, the same question asked again). settled: answers with a
// positive tone that the next round no longer carries.
export function roundsView(review, rounds) {
  if (!rounds || !rounds.length) return null;
  const prev = rounds[rounds.length - 1], pr = prev.review, fb = prev.feedback;
  const APPROVAL = { approve: { label: 'Approve', tone: 'positive' }, decline: { label: 'Decline', tone: 'negative' } };
  const optionOf = (rv, v) => (rv.verdictSet?.options || []).find((o) => o.value === v) || APPROVAL[v] || null;
  const known = (id) => (fb.responses || []).some((r) => r.itemId === id) || (fb.addedItems || []).some((a) => a.id === id);
  const earlier = {}, tags = {};
  for (const it of review.items || []) {
    let id = it.id;
    if (!known(id)) { const a = (it.affects || []).find((x) => x.decision && x.decision.review === pr.id && known(x.decision.itemId)); if (a) id = a.decision.itemId; else { tags[it.id] = 'new'; continue; } }
    const response = (fb.responses || []).find((r) => r.itemId === id), added = (fb.addedItems || []).find((a) => a.id === id);
    const before = (pr.items || []).find((i) => i.id === id), option = response && optionOf(pr, response.verdict);
    earlier[it.id] = { id, round: rounds.length, response, added, before, label: option ? option.label : null, tone: option ? option.tone : null };
    const text = (x) => JSON.stringify([x.title, x.summary, x.body, x.step, x.fields, x.approval]);
    tags[it.id] = added ? 'added' : !response || response.verdict === 'unset' ? 'open' : before && text(before) === text(it) ? 'again' : 'changed';
  }
  const settled = [];
  rounds.forEach(({ review: rv, feedback: f }, i) => {
    const next = i + 1 < rounds.length ? rounds[i + 1].review : review;
    const carried = (id) => (next.items || []).some((x) => x.id === id || (x.affects || []).some((a) => a.decision && a.decision.review === rv.id && a.decision.itemId === id));
    for (const r of f.responses || []) { const o = optionOf(rv, r.verdict); if (o && o.tone === 'positive' && !carried(r.itemId)) settled.push({ id: r.itemId, title: r.title, label: o.label, round: i + 1 }); }
  });
  return { round: rounds.length + 1, prev, earlier, tags, settled };
}
export const ROUND_TAGS = { new: ['tg-new', 'New', 'star'], changed: ['tg-changed', 'Changed after your note', 'repeat'], again: ['tg-again', 'Asked again', 'repeat'], open: ['tg-open', 'Still open', 'open'], added: ['tg-added', 'You added', 'plus'] };

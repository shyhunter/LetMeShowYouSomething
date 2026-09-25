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

// #105 — Let me explain in short cards: one sentence each, the rest one tap away, never dropped.
export function startCardsHtml(review, parts, icon) {
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
    card('help', 'How to answer', review.ask || 'Tap the answer that fits. Skip anything you are unsure about.'),
    card('send', 'What happens next', review.afterwards || 'Nothing is sent until you download your answers.', review.afterwards ? '<p>Nothing is sent until you download your answers.</p>' : ''),
  ].filter(Boolean);
  return cards.map(([ic, title, h], i) => '<li class="scard"><span class="num">' + (i + 1) + '</span><div><h3' + (i === 0 ? ' id="brief-h"' : '') + '>' + icon(ic, 'sm') + partsEsc(title) + '</h3>' + h + '</div></li>').join('');
}

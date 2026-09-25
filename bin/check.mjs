#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// LetMeShowYouSomething — protocol checker.
//
// JSON Schema pins the SHAPE. This pins the things a schema cannot say: that ids are unique, that a
// verdict is one the review actually offered, that every item got a response, that a derived summary
// is not lying, and — the one that makes the format portable — that every response carries the text
// of the item it answers.
//
// Deliberately dependency-free. A protocol checker that needs an install is a protocol fewer people
// check. Run the schemas through any standard validator alongside it.
//
//   node bin/check.mjs review   <review.json>
//   node bin/check.mjs feedback <feedback.json> [review.json]
//   node bin/check.mjs pair     <review.json> <feedback.json>
//   node bin/check.mjs history  <review.json> <earlier-feedback.json>...
//   node bin/check.mjs followup <next-review.json> <review.json> <feedback.json>
//   add --root <project folder> to prove every file:line reference in a flow
//
// Exit 0 only when there are zero errors. Warnings never fail the run.

import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { applyProposals, findLayerEntry, layerEntryText, partLabel } from '../lib/build-feedback.mjs';
import { flowAsDiagram } from '../lib/draw-diagram.mjs';
import { databaseFaults } from '../lib/check-database.mjs';
import { aiFaults, agentControlEdges } from '../lib/check-ai.mjs';

// #38 — the examples' ids are taken: a review that keeps one (agents start from the examples) would share
// its answers with the example page in the same browser. Only the example itself may carry its id.
const EXAMPLE_IDS = {};
try {
  const dir = new URL('../examples/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const x = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    if (x?.protocol === 'letmeshowyousomething/review' && typeof x.id === 'string') EXAMPLE_IDS[x.id] = { file: f, text: JSON.stringify(x) };
  }
} catch {}

const UNSET = 'unset';
const APPROVAL_VERDICTS = new Set(['approve', 'decline', UNSET]);
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
// #87 — what a follow-up says it did with a proposed change: what the next review shows, never "accepted".
const OUTCOMES = ['drawn', 'drawn-differently', 'not-drawn', 'question'];

const load = (p) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { fail(`cannot read ${p}: ${e.message}`); }
};
function fail(msg) { console.error(`✗ ${msg}`); process.exit(2); }

class Report {
  constructor() { this.errors = []; this.warnings = []; this.checks = []; }
  check(name, ok, detail) {
    this.checks.push({ name, ok });
    if (!ok) this.errors.push(`${name}: ${detail}`);
    return ok;
  }
  warn(name, cond, detail) { if (cond) this.warnings.push(`${name}: ${detail}`); }
}

// ── review ──────────────────────────────────────────────────────────────────────────────────────
function checkReview(r, rep) {
  rep.check('protocol', r?.protocol === 'letmeshowyousomething/review', `expected "letmeshowyousomething/review", got ${JSON.stringify(r?.protocol)}`);
  rep.check('schemaVersion', r?.schemaVersion === 1, `only version 1 exists; got ${JSON.stringify(r?.schemaVersion)}`);
  rep.check('review id', ID.test(r?.id ?? ''), `"${r?.id}" is not a valid id`);
  const example = EXAMPLE_IDS[r?.id];
  rep.check('own id', !example || example.text === JSON.stringify(r),
    `"${r?.id}" is the id of the example ${example?.file}. Give this review its own id, for example with today's date: a page with the example's id shares its answers with the example's page in the same browser`);

  const items = Array.isArray(r?.items) ? r.items : [];
  rep.check('has items', items.length > 0, 'a review with no items asks nothing');

  const ids = items.map((i) => i?.id);
  const dupes = ids.filter((v, i) => v && ids.indexOf(v) !== i);
  rep.check('item ids unique', dupes.length === 0, `duplicated: ${[...new Set(dupes)].join(', ')}`);

  const sectionIds = new Set((r?.sections ?? []).map((s) => s.id));
  const orphans = items.filter((i) => i?.sectionId && !sectionIds.has(i.sectionId)).map((i) => i.id);
  rep.check('sections resolve', orphans.length === 0, `item(s) point at a section that does not exist: ${orphans.join(', ')}`);

  const values = new Set((r?.verdictSet?.options ?? []).map((o) => o.value));
  rep.check('verdict set usable', values.size >= 2, 'a verdict set needs at least two options to be a judgement');
  rep.check('verdict values unique', values.size === (r?.verdictSet?.options ?? []).length, 'two options share a value');
  rep.check('no reserved verdict', !values.has(UNSET), `"${UNSET}" is reserved for "the reviewer did not answer" and cannot be an option`);

  const badChoice = [];
  for (const s of r?.sections ?? []) {
    const options = items.filter((i) => i?.sectionId === s.id).map((i) => i.id);
    if (s.mode === 'choose-one' && options.length < 2) badChoice.push(`${s.id}: a choice needs at least two options`);
    if (s.recommended && s.mode !== 'choose-one') badChoice.push(`${s.id}: "recommended" only makes sense in a choose-one section`);
    if (s.recommended && !options.includes(s.recommended.itemId)) badChoice.push(`${s.id}: recommends "${s.recommended.itemId}", which is not one of its options`);
  }
  rep.check('choices well-formed', badChoice.length === 0, badChoice.join(' · '));

  // #54 — an approval names one exact action, what it affects, how risky it is, and when it ends.
  if (items.some((i) => i?.approval)) {
    const badApproval = [];
    for (const i of items) {
      const a = i?.approval; if (!a) continue;
      const sec = (r?.sections ?? []).find((x) => x.id === i.sectionId);
      if (!String(a.action ?? '').trim()) badApproval.push(`${i.id}: names no action. Write exactly what will be done, or the reviewer approves something unnamed`);
      if (!String(a.scope ?? '').trim()) badApproval.push(`${i.id}: says nothing about what it affects. Name the systems, records, people or money it touches, or the reviewer cannot weigh it`);
      if (!['low', 'medium', 'high'].includes(a.risk)) badApproval.push(`${i.id}: risk "${a.risk}" is not low, medium or high. Pick one, or the reviewer cannot tell a rename from a deletion`);
      if (!UTC.test(a.expiresAt ?? '')) badApproval.push(`${i.id}: expiresAt "${a.expiresAt}" is not a UTC date-time like 2026-10-03T08:00:00Z. Give it an end, or an old yes can be used for a new situation`);
      else if (r?.createdAt && Date.parse(a.expiresAt) <= Date.parse(r.createdAt)) badApproval.push(`${i.id}: expires at ${a.expiresAt}, before the review was even written. Give the reviewer time to answer`);
      if (sec?.mode === 'choose-one' || sec?.kind === 'challenge') badApproval.push(`${i.id}: an approval cannot be an option or a doubt. Put it in a section of its own, or picking another option would look like declining it`);
    }
    rep.check('approvals well-formed', badApproval.length === 0, badApproval.join(' · '));
    const lapsed = items.filter((i) => i?.approval && UTC.test(i.approval.expiresAt ?? '') && Date.parse(i.approval.expiresAt) < Date.now()).map((i) => i.id);
    rep.warn('approval already expired', lapsed.length > 0, `${lapsed.join(', ')} expired before this check: an answer to it will be refused. Set a later expiresAt`);
  }

  // #47 — the page loads nothing, so a Mermaid chart shows as its source text: a picture must be drawn.
  const textCharts = (r?.sections ?? []).filter((s) => s?.diagram).map((s) => s.id);
  rep.check('pictures are drawn', textCharts.length === 0,
    `section(s) ${textCharts.join(', ')} carry a Mermaid "diagram", which the page shows as source text, not a picture. Draw it in "diagrams" instead (boxes, arrows, lanes; PROTOCOL.md → Diagrams), and point a box at an item with "step"`);

  const EFFECTS = new Set(['reopens', 'extends', 'contradicts', 'depends-on']);
  const badAffects = items.filter((i) => (i?.affects ?? []).some((a) =>
    !EFFECTS.has(a?.effect) || !a?.why || !a?.decision?.review || !a?.decision?.itemId || !a?.decision?.title || !a?.decision?.verdict));
  rep.check('affects well-formed', badAffects.length === 0,
    `item(s) with an incomplete quote of an earlier decision or an unknown effect: ${badAffects.map((i) => i.id).join(', ')}`);

  // Image data is excluded: base64 can match a pattern by chance.
  const text = JSON.stringify(r ?? {}, (k, v) => (k === 'src' ? undefined : v));
  const found = SECRETS.filter(([, re]) => re.test(text)).map(([what]) => what);
  rep.check('no secrets', found.length === 0,
    `looks like it contains: ${found.join(', ')}. Replace it with a placeholder like <API_KEY>; reviews get forwarded, and a real one would have to be revoked`);

  if (r?.flow) checkFlow(r, rep);
  if (Array.isArray(r?.diagrams)) checkDiagrams(r, rep);
  if (r?.focus !== undefined || r?.brief || items.some((i) => i?.examples)) checkBrief(r, rep);

  const fieldKeys = new Set((r?.fields ?? []).map((f) => f.key));
  const strayFields = items.flatMap((i) => Object.keys(i?.fields ?? {}).filter((k) => !fieldKeys.has(k)).map((k) => `${i.id}.${k}`));
  rep.check('item fields declared', strayFields.length === 0, `field(s) used but never declared: ${strayFields.join(', ')}`);

  // #87 — what an item answers: a comment or proposal id, or, for a proposal, what the agent did with it.
  const answerList = items.flatMap((i) => (i?.answers ?? []).map((a) => ({ item: i.id, a })));
  if (answerList.length) {
    const bad = [];
    for (const { item, a } of answerList) {
      if (typeof a === 'string') { if (!/^(comment|proposal)-\d{1,4}$/.test(a)) bad.push(`${item}: "${a}" is no comment or proposal id`); continue; }
      const w = `${item}: ${a?.id}`;
      const stray = Object.keys(a ?? {}).filter((k) => !['review', 'id', 'outcome', 'why'].includes(k));
      if (!/^proposal-\d{1,4}$/.test(a?.id ?? '')) bad.push(`${w}: an outcome is said of only a proposal (proposal-1); answer a comment by its id alone`);
      else if (!ID.test(a?.review ?? '')) bad.push(`${w}: "review" must name the earlier review it came from`);
      else if (!OUTCOMES.includes(a?.outcome)) bad.push(`${w}: "${a?.outcome}" is not an outcome; use ${OUTCOMES.join(', ')}`);
      else if (a.outcome !== 'drawn' && !String(a.why ?? '').trim()) bad.push(`${a.id} is "${a.outcome}" without a "why"`);
      else if (stray.length) bad.push(`${w}: unknown ${stray.join(', ')}`);
    }
    rep.check('answers well-formed', bad.length === 0,
      `${bad.join(' · ')}. Say what the next review shows (drawn, drawn differently, not drawn, or a question) and why, or the reviewer cannot tell what became of their change`);
  }

  // Warnings: shape that is legal but usually a mistake.
  rep.warn('add-your-own disabled', r?.allowAddedItems === false,
    'the reviewer cannot add anything — the items you did not know to ask about are usually the valuable ones');
  rep.warn('unsectioned items', (r?.sections ?? []).length > 0 && items.some((i) => !i.sectionId),
    'some items sit outside every section and will render in an unlabelled group');
  rep.warn('very long review', items.length > 60,
    `${items.length} items; past roughly 60 people stop reading and start clicking`);
}

// ── secrets ─────────────────────────────────────────────────────────────────────────────────────
// Reviews get emailed and forwarded. Some patterns are assembled from parts so this file never holds
// a string that looks like a real key.
const SECRETS = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['API key', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['GitHub token', new RegExp('\\bgh' + '[pousr]_[A-Za-z0-9]{36}')],
  ['Slack token', new RegExp('\\bxox' + '[abpr]-[A-Za-z0-9-]{10,}')],
  ['private key', new RegExp('-----BEGIN [A-Z ]*' + 'PRIVATE KEY-----')],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['credentials in a URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i],
];

// ── flow ────────────────────────────────────────────────────────────────────────────────────────
// Every message says what is wrong, what to do, and what it would cause if left (D032).
const LAYERS = new Set(['ui', 'flow', 'system', 'data']);
// The screen component catalogue (D034). Each rule returns messages in the D032 shape; groups are
// filled in by type. Order matters only for the "Use one of" list in messages.
const COMPONENT_RULES = Object.fromEntries([
  'heading', 'text', 'input', 'button', 'list',
  'header', 'tab-bar', 'tabs', 'side-menu', 'breadcrumb',
  'checkbox', 'radio-group', 'switch', 'select', 'date-time', 'search', 'stepper', 'slider',
  'card', 'chip', 'image', 'table', 'avatar',
  'dialog', 'toast', 'banner', 'empty-state', 'progress',
].map((type) => [type, () => ({ errors: [], warnings: [] })]));

const inOptions = (value, list) => list.some((x) => (typeof x === 'object' ? x?.id : x) === value);
const optionIds = (list) => list.map((x) => (typeof x === 'object' ? x?.id : x)).join(', ');
const outside = (where, b) => (b.min > b.max
  ? [`${where}: min ${b.min} is above max ${b.max}. Swap them, or no value can be valid`]
  : b.value < b.min || b.value > b.max ? [`${where}: value ${b.value} is outside ${b.min}–${b.max}. Set value within min and max, or the reviewer sees a state the app can't reach`] : []);
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const rule = (errors = [], warnings = []) => ({ errors, warnings });

Object.assign(COMPONENT_RULES, {
  // navigation
  'list': (b, w) => rule((b.items ?? []).length ? [] : [`${w}: has no items. Add at least one, or the list shows nothing`]),
  'tab-bar': (b, w) => {
    const items = b.items ?? [], e = [];
    if (items.length < 2 || items.length > 5) e.push(`${w}: has ${items.length} item(s). Use 2 to 5, or it isn't a tab bar people can use`);
    if (!inOptions(b.active, items)) e.push(`${w}: active "${b.active}" is not one of its items (${optionIds(items)}). Set active to one of them, or no tab looks selected`);
    return rule(e);
  },
  'tabs': (b, w) => {
    const items = b.items ?? [], e = [];
    if (items.length < 2) e.push(`${w}: has ${items.length} item(s). Use at least 2, or there is nothing to switch between`);
    if (!inOptions(b.active, items)) e.push(`${w}: active "${b.active}" is not one of its items (${optionIds(items)}). Set active to one of them, or no tab looks selected`);
    return rule(e);
  },
  'side-menu': (b, w) => rule(b.active !== undefined && !inOptions(b.active, b.items ?? [])
    ? [`${w}: active "${b.active}" is not one of its items (${optionIds(b.items ?? [])}). Set active to one of them or leave it out`] : []),
  'breadcrumb': (b, w) => rule((b.items ?? []).length >= 2 ? [] : [`${w}: has ${(b.items ?? []).length} level. Show at least 2, or it doesn't show where the person is`]),
  // input
  'radio-group': (b, w) => {
    const o = b.options ?? [], e = [];
    if (o.length < 2) e.push(`${w}: has ${o.length} option(s). Give at least 2, or there is no choice to make`);
    if (b.selected !== undefined && !inOptions(b.selected, o)) e.push(`${w}: selected "${b.selected}" is not one of its options (${optionIds(o)}). Select one of them or leave it out`);
    return rule(e);
  },
  'select': (b, w) => {
    const o = b.options ?? [], e = [];
    if (!o.length) e.push(`${w}: has no options. Add the values a person can pick, or the dropdown is empty`);
    else if (b.value !== undefined && !inOptions(b.value, o)) e.push(`${w}: value "${b.value}" is not one of its options (${optionIds(o)}). Use one of them or leave it out`);
    return rule(e);
  },
  'date-time': (b, w) => {
    if (b.value === undefined) return rule();
    if (b.mode === 'date-time' && !UTC.test(b.value)) return rule([`${w}: "${b.value}" is not a UTC date-time like 2026-10-03T08:00:00Z. Store times in UTC and show local time only on screen, or bookings shift around daylight-saving changes`]);
    if (b.mode === 'date' && !DATE.test(b.value)) return rule([`${w}: "${b.value}" is not a date like 2026-10-03. Use year-month-day, or it can be read two ways`]);
    if (b.mode === 'time' && !TIME.test(b.value)) return rule([`${w}: "${b.value}" is not a time like 10:00. Use 24-hour HH:MM`]);
    return rule();
  },
  'stepper': (b, w) => rule(outside(w, b)),
  'slider': (b, w) => rule(outside(w, b)),
  // content
  'table': (b, w) => {
    const n = (b.columns ?? []).length;
    return rule((b.rows ?? []).flatMap((row, i) => (Array.isArray(row) && row.length === n ? []
      : [`${w}: row ${i + 1} has ${Array.isArray(row) ? row.length : 0} cell(s) but there are ${n} columns. Fill every column (use "" for empty), or the table misaligns`])));
  },
  // feedback
  'dialog': (b, w) => rule((b.actions ?? []).length ? [] : [`${w}: has no actions. Give it at least one way out, or the person is trapped in it`]),
  'progress': (b, w) => rule(b.value !== undefined && (b.value < 0 || b.value > 100) ? [`${w}: value ${b.value} is outside 0–100. Use a percentage, or leave it out for an endless spinner`] : []),
  'banner': (b, w) => rule([], ['caution', 'negative'].includes(b.tone) && !b.canNow
    ? [`${w}: a ${b.tone} banner without canNow. Say what the person can do, or they read a problem with no way forward`] : []),
  'empty-state': (b, w) => rule([], b.action ? [] : [`${w}: no action. Offer the next step ("Find a time"), or the empty screen is a dead end`]),
});

// Every id a step can point at on a screen: blocks, and ids nested inside them, and hotspots.
function screenIds(screen) {
  const ids = [];
  for (const b of screen.blocks ?? []) {
    if (b.id) ids.push(b.id);
    if (b.back?.id) ids.push(b.back.id);
    if (b.action?.id) ids.push(b.action.id);
    for (const key of ['actions', 'items', 'options']) for (const x of Array.isArray(b[key]) ? b[key] : []) if (x && typeof x === 'object' && x.id) ids.push(x.id);
  }
  for (const h of screen.hotspots ?? []) ids.push(h.id);
  return ids;
}
const IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const REF = /^[^:\s]+:[1-9][0-9]*$/;

function checkFlow(r, rep) {
  const flow = r.flow;
  const screens = flow.screens ?? [];
  const byId = Object.fromEntries(screens.map((s) => [s.id, s]));
  const steps = (r.items ?? []).filter((i) => i?.step);
  const ids = screens.map((s) => s.id);

  const broken = [];
  if (!byId[flow.start]) broken.push(`start screen "${flow.start}" does not exist. Set flow.start to one of: ${ids.join(', ')}`);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) broken.push(`screen id(s) used twice: ${[...new Set(dupes)].join(', ')}. Rename one, or steps may land on the wrong screen`);
  for (const it of steps) {
    const { from, on, outcomes = [] } = it.step;
    const s = byId[from];
    if (!s) { broken.push(`${it.id}: starts on unknown screen "${from}". Use one of: ${ids.join(', ')}`); continue; }
    const targets = screenIds(s);
    if (!targets.includes(on)) broken.push(`${it.id}: "${on}" is not a button, input or hotspot on "${from}". Point "on" at ${targets.length ? `one of: ${targets.join(', ')}` : 'an element you add to that screen'}, or the reviewer has nothing to tap`);
    if (!outcomes.length) broken.push(`${it.id}: a step needs at least one outcome, or tapping does nothing`);
    if (outcomes.length > 1 && outcomes.some((o) => !o.label)) broken.push(`${it.id}: with several outcomes, give each a label, or the reviewer can't choose which one to see`);
    for (const o of outcomes) if (!byId[o.to]) broken.push(`${it.id}: leads to unknown screen "${o.to}". Use one of: ${ids.join(', ')}`);
  }
  rep.check('flow resolves', broken.length === 0, broken.join(' · '));

  // D038 — nested parts (sub-processes), so a reviewer always knows where in the whole process a step sits.
  if (flow.parts) {
    const parts = flow.parts;
    const partIds = parts.map((p) => p.id);
    const byPart = Object.fromEntries(parts.map((p) => [p.id, p]));
    const bad = [];
    for (const id of new Set(partIds.filter((id, i) => partIds.indexOf(id) !== i)))
      bad.push(`part id "${id}" is used twice. Rename one, or steps can't say which part they belong to`);
    for (const p of parts) if (p.parent && !byPart[p.parent])
      bad.push(`${p.id}: parent "${p.parent}" does not exist. Use one of: ${partIds.join(', ')}, or drop parent to make it top-level`);
    const reported = new Set();
    for (const p of parts) {
      const chain = [p.id];
      for (let cur = byPart[p.parent]; cur; cur = byPart[cur.parent]) {
        chain.push(cur.id);
        if (cur.id === p.id) {
          const key = [...chain].sort().join();
          if (!reported.has(key)) { reported.add(key); bad.push(`parts nest in a loop: ${chain.join(' → ')}. Break the loop by giving one of them a different parent, or the process map has no top`); }
          break;
        }
        if (chain.length > parts.length + 1) break;
      }
    }
    const used = new Set();
    for (const it of steps) {
      if (!it.step.part) bad.push(`${it.id} has no part. Name the part it belongs to (${partIds.join(', ')}), or the reviewer can't see where it sits`);
      else if (!byPart[it.step.part]) bad.push(`${it.id}: part "${it.step.part}" does not exist. Use one of: ${partIds.join(', ')}`);
      else for (let cur = byPart[it.step.part], hops = 0; cur && hops <= parts.length; cur = byPart[cur.parent], hops++) used.add(cur.id);
    }
    // #82 — a round that continues another carries only what is still open: a part settled earlier may be empty now.
    for (const p of parts) if (!used.has(p.id) && !reported.size) {
      if (r.continues) rep.warn('part settled earlier', true, `${p.id} has no steps in this round; it is whole only with the rounds before`);
      else bad.push(`${p.id} has no steps. Give it a step, or remove it; an empty part shows the reviewer a process that isn't there`);
    }
    rep.check('flow parts resolve', bad.length === 0, bad.join(' · '));
  }

  const next = {};
  for (const it of steps) for (const o of it.step.outcomes ?? []) (next[it.step.from] ??= new Set()).add(o.to);
  const seen = new Set();
  for (const queue = byId[flow.start] ? [flow.start] : []; queue.length;) {
    const id = queue.shift();
    if (!seen.has(id)) { seen.add(id); queue.push(...(next[id] ?? [])); }
  }
  const unreachable = ids.filter((id) => !seen.has(id));
  const deadEnds = screens.filter((s) => !next[s.id] && !s.end).map((s) => s.id);
  // #82 — a round that continues another may reach some screens only through steps settled earlier;
  // `check rounds` then proves the flow is whole across the rounds.
  if (r.continues) rep.warn('flow is whole only with the rounds before', unreachable.length || deadEnds.length,
    `not reached in this round: ${[...new Set([...unreachable, ...deadEnds])].join(', ')}. check rounds proves the rounds before reach them`);
  else rep.check('flow has no orphans or dead ends', !unreachable.length && !deadEnds.length, [
    unreachable.length && `unreachable from "${flow.start}": ${unreachable.join(', ')}. Add a step that leads there, or remove it; a reviewer can never see it`,
    deadEnds.length && `no way out and not marked end: ${deadEnds.join(', ')}. Add a step out, or set "end": true if the flow may stop there; otherwise the reviewer gets stuck`,
  ].filter(Boolean).join(' · '));

  const unsafe = [];
  for (const s of screens) {
    if (s.image && !IMAGE.test(s.image.src ?? '')) unsafe.push(`${s.id}: image must be inline PNG, JPEG or WebP. Convert it and inline it as a data: URL; SVG can carry script and a URL breaks offline use`);
    if (s.hotspots?.length && !s.image) unsafe.push(`${s.id}: hotspots but no image. Add the screenshot they sit on, or remove them`);
    for (const h of s.hotspots ?? []) if ([h.x, h.y, h.w, h.h].some((n) => typeof n !== 'number' || n < 0 || n > 100) || !(h.w > 0 && h.h > 0) || h.x + h.w > 100 || h.y + h.h > 100) unsafe.push(`${s.id}.${h.id}: hotspot not inside the image. Give x, y, w, h as percent of the image, w and h above 0, x + w and y + h at most 100, or it can't be tapped`);
    for (const b of s.blocks ?? []) if (!COMPONENT_RULES[b.type]) unsafe.push(`${s.id}: unknown block type "${b.type}". Use one of: ${Object.keys(COMPONENT_RULES).join(', ')}, or it won't be drawn`);
  }
  for (const l of flow.layers?.default ?? []) if (!LAYERS.has(l)) unsafe.push(`unknown default layer "${l}". Use ui, flow, system or data`);
  rep.check('screens are safe to show', unsafe.length === 0, unsafe.join(' · '));

  // #33 — an area on a screenshot that no step starts from is a tap that does nothing.
  const idle = screens.flatMap((s) => (s.hotspots ?? []).filter((h) => !steps.some((it) => it.step.from === s.id && it.step.on === h.id)).map((h) => `${s.id}.${h.id}`));
  const idleSay = `no step starts from: ${idle.join(', ')}. Add a step "on" it, or remove the area; tapping it would do nothing`;
  if (r.continues) rep.warn('every area leads to a step', idle.length, idleSay); else rep.check('every area leads to a step', !idle.length, idleSay);

  const inconsistent = [], componentWarnings = [];
  for (const s of screens) {
    const seenIds = screenIds(s);
    for (const id of new Set(seenIds.filter((id, i) => seenIds.indexOf(id) !== i)))
      inconsistent.push(`${s.id}: id "${id}" is used twice. Rename one, or a step pointing at it can't say which element was tapped`);
    for (const b of s.blocks ?? []) {
      const rule = COMPONENT_RULES[b.type];
      if (!rule) continue;
      const { errors, warnings } = rule(b, `${s.id}${b.id ? '.' + b.id : ''} (${b.type})`);
      inconsistent.push(...errors); componentWarnings.push(...warnings);
    }
  }
  rep.check('components are consistent', inconsistent.length === 0, inconsistent.join(' · '));
  rep.warn('components explain themselves', componentWarnings.length > 0, componentWarnings.join(' · '));

  const dishonest = [];
  for (const it of steps) {
    const entryIds = [];
    for (const o of it.step.outcomes ?? []) {
      for (const layer of ['system', 'data']) for (const e of o[layer] ?? []) {
        const where = `${it.id}/${e.id ?? '?'}`;
        if (!e.id) dishonest.push(`${it.id}: a ${layer} entry has no id. Give it a short one, or no verdict can point at it`);
        else if (entryIds.includes(e.id)) dishonest.push(`${it.id}: entry id "${e.id}" is used twice. Make it unique within the step, or a verdict on it is ambiguous`);
        if (e.id) entryIds.push(e.id);
        if (e.status === 'exists' && !e.ref) dishonest.push(`${where}: marked exists but gives no ref. Add the file:line, or mark it proposed; "exists" is a claim the checker has to be able to prove`);
        if (e.ref && !REF.test(e.ref)) dishonest.push(`${where}: ref "${e.ref}" is not path:line. Write it like src/booking.mjs:12`);
      }
    }
  }
  rep.check('layer entries honest', dishonest.length === 0, dishonest.join(' · '));

  const unexplained = [];
  for (const it of steps) {
    if (!it.step.goal) unexplained.push(`${it.id} has no goal. Add why the person does it ("to secure the slot"), or the reviewer judges an action without its purpose`);
    for (const o of it.step.outcomes ?? []) if (!byId[o.to]?.end && !o.canNow) unexplained.push(`${it.id} → ${o.label ? `"${o.label}"` : o.to} leaves the person with no next step. Add canNow (what they can do there), or the reviewer can't judge whether they get stuck`);
  }
  rep.warn('flow explains itself', unexplained.length > 0, unexplained.join(' · '));

  // D047 — what is there and what is missing: every claim says where it comes from.
  const claims = [...(flow.parts ?? []).map((p) => [`part ${p.id}`, p]), ...steps.map((it) => [`step ${it.id}`, it.step])];
  const unfounded = [];
  for (const [where, c] of claims) {
    const b = c.basis;
    if (c.status === 'exists' && !b) unfounded.push(`${where}: marked exists but has no basis. Add basis (code with a ref, prd, docs, conversation or assumption), or mark it proposed; "exists" is a claim the reviewer should be able to trace`);
    if (!b) continue;
    if (b.kind === 'code' && !b.ref) unfounded.push(`${where}: basis is code but gives no ref. Add the file:line it comes from, or the claim can't be checked`);
    if ((b.kind === 'prd' || b.kind === 'docs') && !b.ref) unfounded.push(`${where}: basis is ${b.kind} but gives no ref. Name the section or document (e.g. "PRD §3.2"), or the reviewer can't find it`);
    if ((b.kind === 'conversation' || b.kind === 'assumption') && !b.note) unfounded.push(`${where}: basis is ${b.kind} but has no note. Say who said it or what is assumed, or it reads as fact`);
  }
  rep.check('claims have a basis', unfounded.length === 0, unfounded.join(' · '));
  const overclaimed = [];
  for (const it of steps) if (it.step.status === 'suggested') for (const o of it.step.outcomes ?? []) for (const e of [...(o.system ?? []), ...(o.data ?? [])])
    if (e.status === 'exists') overclaimed.push(`${it.id}/${e.id}: the step is suggested but this entry is marked exists. Mark it proposed; something not built yet can't have existing code`);
  rep.check('suggestions stay suggestions', overclaimed.length === 0, overclaimed.join(' · '));

  const refs = [];
  for (const it of steps) for (const o of it.step.outcomes ?? []) for (const e of [...(o.system ?? []), ...(o.data ?? [])]) if (e.ref && REF.test(e.ref)) refs.push([`${it.id}/${e.id}`, e.ref]);
  for (const [where, c] of claims) if (c.basis?.kind === 'code' && c.basis.ref && REF.test(c.basis.ref)) refs.push([where, c.basis.ref]);
  if (!refs.length) return;
  if (!ROOT) {
    rep.warn('references not verified', true, `${refs.length} reference(s) were not checked because no project folder was given. Run again with --root <folder>. Until then, a reference to code that does not exist would pass unnoticed.`);
    return;
  }
  const missing = [];
  for (const [where, ref] of refs) {
    const cut = ref.lastIndexOf(':');
    const file = resolve(ROOT, ref.slice(0, cut)), line = Number(ref.slice(cut + 1));
    const inside = relative(ROOT, file);
    // A review is written by an agent: never let it make the checker read outside the project.
    if (inside.startsWith('..') || resolve(ROOT, inside) !== file) { missing.push(`${where}: ${ref} points outside the project folder. Use a path inside ${ROOT}; the checker will not read anywhere else`); continue; }
    let lines;
    try { lines = readFileSync(file, 'utf8').split('\n').length; }
    catch { missing.push(`${where}: ${ref} does not exist under ${ROOT}. Fix the path, or mark the entry proposed; "exists" must point at real code`); continue; }
    if (line > lines) missing.push(`${where}: ${inside} has ${lines} lines, the ref points at line ${line}. Fix the line number, or the reviewer is sent to code that isn't there`);
  }
  rep.check('references resolve', missing.length === 0, missing.join(' · '));
}

// ── diagrams (v0.2 part 3b, D036, D041, D052) ─────────────────────────────────────────────────────
// #32 — a closed catalogue per diagram kind: a flow chart says what happens in order, a system diagram
// says what runs and what it talks to. A box from the wrong catalogue is refused, not drawn oddly.
const SYSTEM_KINDS = new Set(["client", "service", "component", "guard", "queue", "data-store", "external", "note", "group", "connector", "off-page", "model-call", "tool-call", "retrieval", "guardrail", "human-handoff"]);
// A sequence has participants, not steps: who is in the conversation, and nothing else.
const SEQUENCE_KINDS = new Set(["client", "service", "component", "queue", "data-store", "external", "note"]);
const NODE_KINDS = new Set([...SYSTEM_KINDS, "start", "end", "end-failed", "entry", "exit", "process", "user-action", "system-action", "manual", "subflow", "screen", "input", "output", "document", "notification", "decision", "parallel-start", "parallel-join", "merge", "event-choice", "wait", "timer", "deadline", "schedule", "error", "retry", "compensate", "escalate", "cancel", "send", "receive", "signal", "callback", "data", "data-store", "group", "connector", "off-page", "note", "loop"]);
const EDGE_KINDS = new Set(['sequence', 'conditional', 'default', 'message', 'association', 'async', 'return']);
const ICONS = ["envelope", "phone", "lock", "clock", "warning", "person", "database", "cloud", "gear", "card", "calendar", "bell", "document", "search", "check", "cross", "chat", "cart", "key", "globe"];
const ANNOTATIONS = new Set(['note', 'group', 'connector', 'off-page']);   // need not be reachable

// The rules for one diagram, so the same ones judge a diagram the reviewer changed (#60 part 3).
function diagramFaults(d, ctx) {
  const aiErrors = aiFaults(d);
  if (aiErrors.length) return { unresolved: aiErrors, senseless: [], collisions: [] };
  if (d.kind === 'database') return { unresolved: databaseFaults(d, ctx.stepIds), senseless: [], collisions: [] };
  const { stepIds, partIds, diagramIds, flow } = ctx;
  const unresolved = [], senseless = [], collisions = [];
  const nodes = d.nodes ?? [], edges = d.edges ?? [], lanes = (d.lanes ?? []).map((l) => l.id);
  const ids = nodes.map((n) => n.id);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i)))
    unresolved.push(`${d.id}: node id "${id}" is used twice. Rename one, or arrows can't say which box they mean`);
  for (const n of nodes) {
    const w = `${d.id}.${n.id}`;
    const kinds = d.kind === 'system' ? SYSTEM_KINDS : d.kind === 'sequence' ? SEQUENCE_KINDS : NODE_KINDS;
      if (!kinds.has(n.kind)) unresolved.push(`${w}: ${NODE_KINDS.has(n.kind) ? `"${n.kind}" does not belong in a ${d.kind} diagram` : `unknown kind "${n.kind}"`}. Use one of: ${[...kinds].join(', ')}, or it can't be drawn`);
    if (n.icon !== undefined && !ICONS.includes(n.icon)) unresolved.push(`${w}: unknown icon "${n.icon}". Use one of: ${ICONS.join(', ')}`);
    if (n.lane !== undefined && !lanes.includes(n.lane)) unresolved.push(`${w}: lane "${n.lane}" does not exist. Use one of: ${lanes.join(', ') || '(declare lanes first)'}`);
    if (n.step !== undefined && !stepIds.has(n.step)) unresolved.push(`${w}: step "${n.step}" is not ${flow ? 'a step' : 'an item'} in this review. Point at ${flow ? 'a step' : 'an item'} id or drop the link, or selecting it highlights nothing`);
    if (n.part !== undefined && !partIds.has(n.part)) unresolved.push(`${w}: part "${n.part}" is not a part of this flow. Point at a part id or drop the link`);
    if (n.subflow !== undefined && !diagramIds.includes(n.subflow) && !partIds.has(n.subflow)) unresolved.push(`${w}: subflow "${n.subflow}" is neither a diagram nor a part. Point at one, or the reader can't open it`);
    if (n.component) {
      const rule = COMPONENT_RULES[n.component.type];
      if (!rule) unresolved.push(`${w}: unknown component type "${n.component.type}". Use a screen component type`);
      else unresolved.push(...rule(n.component, `${w} (${n.component.type})`).errors);
    }
  }
  for (const e of edges) {
    if (!byId[e.from] || !byId[e.to]) unresolved.push(`${d.id}: edge ${e.from} → ${e.to} points at a node that does not exist. Use one of: ${ids.join(', ')}`);
    if (e.kind !== undefined && !EDGE_KINDS.has(e.kind)) unresolved.push(`${d.id}: edge ${e.from} → ${e.to} has unknown kind "${e.kind}". Use sequence, conditional, default, message, association, async or return`);
  }

  const flowEdges = d.agent === true ? agentControlEdges(d) : edges.filter((e) => byId[e.from] && byId[e.to] && e.kind !== 'association');
  const out = (id) => flowEdges.filter((e) => e.from === id), inc = (id) => flowEdges.filter((e) => e.to === id);
  // #32 — a sequence says who calls whom, in order. Every message says what it is, every participant
  // is in the conversation, and an answer follows a question.
  if (d.kind === 'sequence') {
    const seen = new Set();
    for (const [i, e] of edges.entries()) {
      const w = `${d.id}: message ${i + 1} (${e.from} → ${e.to})`;
      if (!String(e.label ?? '').trim()) senseless.push(`${w} says nothing. Write what is asked or answered, or the reader sees an arrow and no reason`);
      if (e.kind === 'return' && !seen.has(`${e.to}>${e.from}`)) senseless.push(`${w} is an answer to a call that never happened. Put the call first, or make it a message of its own`);
      seen.add(`${e.from}>${e.to}`);
    }
    for (const n of nodes) if (!ANNOTATIONS.has(n.kind) && !edges.some((e) => e.from === n.id || e.to === n.id))
      senseless.push(`${d.id}.${n.id}: takes part in no message. Give it one, or leave it out of the conversation`);
    return { unresolved, senseless, collisions };
  }

  // #32 — a system diagram has no beginning and no end: it says what runs and what it talks to.
  // Its own rule instead: nothing floats. Every box is on an arrow, and a check sits on a path.
  if (d.kind === 'system') {
    for (const n of nodes) {
      if (ANNOTATIONS.has(n.kind)) continue;
      if (!flowEdges.some((e) => e.from === n.id || e.to === n.id))
        senseless.push(`${d.id}.${n.id}: nothing calls it and it calls nothing. Draw the arrow, or leave the box out`);
      else if (n.kind === 'guard' && !(out(n.id).length && inc(n.id).length))
        senseless.push(`${d.id}.${n.id}: a check sits on a path — something reaches it, and it passes something on. Draw both arrows, or make it a service`);
    }
    return { unresolved, senseless, collisions };
  }
  const starts = nodes.filter((n) => n.kind === 'start' || n.kind === 'entry');
  if (!starts.length) senseless.push(`${d.id}: has no start. Add a start node, or the reader doesn't know where to begin`);
  if (!nodes.some((n) => ['end', 'end-failed', 'exit'].includes(n.kind) || (d.agent === true && n.kind === 'human-handoff' && !out(n.id).length))) senseless.push(`${d.id}: has no end. Add an end node, or the process never finishes`);
  const seen = new Set();
  for (const queue = starts.map((n) => n.id); queue.length;) { const id = queue.shift(); if (!seen.has(id)) { seen.add(id); queue.push(...out(id).map((e) => e.to)); } }
  for (const n of nodes) if (starts.length && !seen.has(n.id) && !ANNOTATIONS.has(n.kind))
    senseless.push(`${d.id}.${n.id}: can't be reached from a start. Connect it, or remove it; the reader would never get there`);
  for (const n of nodes) {
    const w = `${d.id}.${n.id}`;
    if (n.kind === 'start' && inc(n.id).length) senseless.push(`${w}: a start can't have arrows coming in. Point them at a later step, or use a loop node`);
    if ((n.kind === 'end' || n.kind === 'end-failed') && out(n.id).length) senseless.push(`${w}: an end can't have arrows going out. Make it a step, or remove the arrow`);
    if (n.kind === 'decision') {
      if (out(n.id).length < 2) senseless.push(`${w}: a decision needs at least two ways out. Add the other answer, or make it a step`);
      for (const e of out(n.id)) if (!e.label) senseless.push(`${w}: the way out to ${e.to} has no label. Say which answer leads there`);
    }
    if (n.kind === 'parallel-start' && out(n.id).length < 2) senseless.push(`${w}: a parallel start needs at least two paths out, or nothing runs in parallel`);
    if (n.kind === 'parallel-join' && inc(n.id).length < 2) senseless.push(`${w}: a parallel join needs at least two paths in, or there is nothing to wait for`);
  }
  for (const e of edges) if (e.kind === 'message' && byId[e.from] && byId[e.to] && (byId[e.from].lane ?? null) === (byId[e.to].lane ?? null))
    senseless.push(`${d.id}: message ${e.from} → ${e.to} stays inside one lane. Use a sequence arrow; messages go between lanes`);

  const cells = {};
  for (const n of nodes) if (n.col !== undefined && n.row !== undefined) {
    const k = `${n.col},${n.row}`;
    if (cells[k]) collisions.push(`${d.id}: ${cells[k]} and ${n.id} are both pinned to column ${n.col}, row ${n.row}. Move one, or they draw on top of each other`);
    else cells[k] = n.id;
  }
  return { unresolved, senseless, collisions };
}

function checkDiagrams(r, rep) {
  // Without a flow, a box may point at any item (#47): tapping it opens that item.
  const ctx = { stepIds: new Set((r.items ?? []).filter((i) => i?.step || !r.flow).map((i) => i.id)),
    partIds: new Set((r.flow?.parts ?? []).map((p) => p.id)),
    diagramIds: r.diagrams.map((d) => d?.id), flow: !!r.flow };
  const unresolved = [], senseless = [], collisions = [];
  for (const id of new Set(ctx.diagramIds.filter((x, i) => ctx.diagramIds.indexOf(x) !== i)))
    unresolved.push(`diagram id "${id}" is used twice. Rename one, or links to it are ambiguous`);
  for (const d of r.diagrams) {
    const f = diagramFaults(d, ctx);
    unresolved.push(...f.unresolved); senseless.push(...f.senseless); collisions.push(...f.collisions);
  }
  rep.check('diagrams resolve', unresolved.length === 0, unresolved.join(' · '));
  rep.check('diagrams make sense', senseless.length === 0, senseless.join(' · '));
  rep.check("diagram pins don't collide", collisions.length === 0, collisions.join(' · '));
}

// ── focus and the agent's brief (D057, D059) ────────────────────────────────────────────────────
function checkBrief(r, rep) {
  const computed = ['user-flow'];
  const diagramIds = (r.diagrams ?? []).map((d) => d?.id);
  if (r.focus !== undefined && !computed.includes(r.focus) && !diagramIds.includes(r.focus))
    rep.check('focus resolves', false, `focus "${r.focus}" is neither the computed user flow (user-flow) nor a diagram in this review. Use one of: ${[...computed, ...diagramIds].join(', ')}, or the page opens on something else than you meant`);
  else rep.check('focus resolves', true, '');

  // Examples in the brief and on items (#42) are held to the same rule: who, what they did, and a source
  // or an honest "unverified".
  const b = r.brief;
  const wrong = [], unverified = [];
  const lists = [['brief', b?.examples], ...(r.items ?? []).map((it) => [it?.id, it?.examples])];
  for (const [where, list] of lists) for (const [i, e] of (list ?? []).entries()) {
    const at = where === 'brief' ? '' : ` on ${where}`;
    const who = e?.name ? `"${e.name}"` : `example ${i + 1}`;
    if (!e?.name) wrong.push(`example ${i + 1}${at} has no name. Say who did it, or the reviewer can't weigh it`);
    else if (!e.what) wrong.push(`example ${who}${at} says who but not what they did. Add "what", or it is a name without a lesson`);
    if (e?.source !== undefined && !/^https?:\/\/[^\s"<>]+$/i.test(e.source)) wrong.push(`${who}${at}: source "${e.source}" is not a web address. Give the https:// link where it can be checked, or leave source out and it is shown as unverified`);
    if (e?.name && !e.source) unverified.push(`${who}${at} has no source. Add one, or the page shows it as unverified; agents invent convincing examples`);
  }
  rep.check('examples are honest', wrong.length === 0, wrong.join(' · '));
  rep.warn('examples are unverified', unverified.length > 0, unverified.join(' · '));
  if (!b) return;

  const screens = (r.flow?.screens ?? []).map((s) => s.id);
  const nodes = (r.diagrams ?? []).flatMap((d) => (d.nodes ?? []).map((n) => n.id))
    .concat((r.flow?.screens ?? []).map((s) => `screen:${s.id}`), (r.items ?? []).filter((i) => i.step || !r.flow).map((i) => `step:${i.id}`));
  const lost = [];
  for (const id of b.highlights?.screens ?? []) if (!screens.includes(id)) lost.push(`highlights screen "${id}", which does not exist. Use one of: ${screens.join(', ')}`);
  for (const id of b.highlights?.nodes ?? []) if (!nodes.includes(id)) lost.push(`highlights node "${id}", which is in no chart. Use a node id from a diagram, or screen:<id> / step:<id>`);
  rep.check('brief highlights resolve', lost.length === 0, lost.join(' · '));
}

// ── feedback ────────────────────────────────────────────────────────────────────────────────────
function checkFeedback(f, rep, review) {
  rep.check('protocol', f?.protocol === 'letmeshowyousomething/feedback', `expected "letmeshowyousomething/feedback", got ${JSON.stringify(f?.protocol)}`);
  rep.check('schemaVersion', f?.schemaVersion === 1, `only version 1 exists; got ${JSON.stringify(f?.schemaVersion)}`);
  rep.check('names its review', ID.test(f?.review?.id ?? '') && !!f?.review?.title, 'feedback must name the review id AND echo its title');

  const responses = Array.isArray(f?.responses) ? f.responses : [];
  const added = Array.isArray(f?.addedItems) ? f.addedItems : [];

  // THE INVARIANT THAT MAKES THIS PORTABLE.
  const mute = responses.filter((x) => !x?.title || !String(x.title).trim()).map((x) => x?.itemId ?? '?');
  rep.check('self-describing', mute.length === 0,
    `response(s) carry no echoed title, so the file cannot be read without the original review: ${mute.join(', ')}`);

  rep.check('verdict set echoed', (f?.verdictSet?.options ?? []).length >= 2,
    'without the echoed verdict set, a value like "partial" has no defined meaning to a reader who lacks the review');

  const allowed = new Set((f?.verdictSet?.options ?? []).map((o) => o.value));
  allowed.add(UNSET);
  // #54 — an approval is answered approve or decline, never with the verdict set: "agree" is not permission.
  const ofSet = (x) => (x?.approval ? APPROVAL_VERDICTS : allowed);
  const bad = [...responses, ...added].filter((x) => !ofSet(x).has(x?.verdict)).map((x) => `${x?.itemId ?? x?.id}=${x?.verdict}${x?.approval ? ' (an approval: approve, decline or unset)' : ''}`);
  rep.check('verdicts in vocabulary', bad.length === 0, `value(s) outside the declared set: ${bad.join(', ')}`);

  if (responses.some((x) => x?.approval)) {
    const late = [];
    for (const x of responses.filter((y) => y?.approval && y.verdict === 'approve')) {
      const end = Date.parse(x.approval.expiresAt);
      if (!(end > Date.parse(f?.respondedAt))) late.push(`"${x.title}" was approved at ${f?.respondedAt}, after it expired at ${x.approval.expiresAt}`);
      else if (Date.now() > end) late.push(`"${x.title}": the approval expired at ${x.approval.expiresAt}`);
    }
    rep.check('approvals still valid', late.length === 0,
      `${late.join(' · ')}. Do not act on it: ask again in a new review with a new end, or an old yes is used for a new situation`);
  }

  const layerVerdicts = Array.isArray(f?.layerVerdicts) ? f.layerVerdicts : [];
  if (layerVerdicts.length) {
    const offList = layerVerdicts.filter((x) => !allowed.has(x?.verdict) || x?.verdict === UNSET).map((x) => `${x?.id}=${x?.verdict}`);
    rep.check('layer verdicts in vocabulary', offList.length === 0,
      `${offList.join(', ')}. Use one of: ${[...allowed].filter((v) => v !== UNSET).join(', ')}; an unjudged entry is left out, never written as unset`);
  }

  // #60 — comments on a box or an arrow: each has its own id, says what it is on, and says something.
  const comments = Array.isArray(f?.comments) ? f.comments : [];
  if (comments.length) {
    const ids = comments.map((c) => c?.id);
    const bad = comments.filter((c, i) => !/^comment-\d{1,4}$/.test(c?.id ?? '') || ids.indexOf(c.id) !== i
      || (c.node === undefined) === (c.edge === undefined) || !String(c.label ?? '').trim() || !String(c.note ?? '').trim())
      .map((c) => c?.id ?? '?');
    rep.check('comments well-formed', bad.length === 0,
      `${bad.join(', ')}: a comment needs its own id (comment-1), exactly one box (node) or arrow (edge), the label it is on and the reviewer's words. Export it from the page again, or the agent cannot tell what it is about`);
  }

  // #60 — pictures: really PNG, JPEG or WebP (by their own first bytes, not only by name), attached to
  // something in this file, and small enough to forward.
  const pictures = Array.isArray(f?.pictures) ? f.pictures : [];
  if (pictures.length) {
    const on = new Set([...responses.map((x) => x?.itemId), ...added.map((x) => x?.id), ...comments.map((c) => c?.id)]);
    const MAGIC = { 'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
      'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' };
    const bad = []; let total = 0;
    const pids = pictures.map((x) => x?.id);
    for (const [i, x] of pictures.entries()) {
      const w = x?.id ?? `picture #${i + 1}`;
      if (!/^picture-\d{1,4}$/.test(x?.id ?? '') || pids.indexOf(x.id) !== i) { bad.push(`${w}: needs its own id like picture-1`); continue; }
      if (!on.has(x.on)) bad.push(`${w}: is attached to "${x.on}", which is no item, added item or comment in this file`);
      if (x.screen !== undefined && review && !(review.flow?.screens ?? []).some((s) => s.id === x.screen)) bad.push(`${w}: shows screen "${x.screen}", which is no screen in the review`);
      if (!MAGIC[x.type]) { bad.push(`${w}: "${x.type}" is not PNG, JPEG or WebP`); continue; }
      const raw = typeof x.data === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(x.data) ? Buffer.from(x.data, 'base64') : null;
      if (!raw) { bad.push(`${w}: its data is not base64`); continue; }
      if (!MAGIC[x.type](raw)) bad.push(`${w}: says ${x.type}, but its bytes are not that kind of picture`);
      if (raw.length > 1024 * 1024) bad.push(`${w}: ${(raw.length / 1048576).toFixed(1)} MB, more than 1 MB`);
      total += raw.length;
    }
    if (pictures.length > 10) bad.push(`${pictures.length} pictures, more than 10`);
    if (total > 5 * 1024 * 1024) bad.push(`${(total / 1048576).toFixed(1)} MB of pictures, more than 5 MB`);
    rep.check('pictures are pictures', bad.length === 0,
      `${bad.join(' · ')}. Attach them from the page again: it keeps only real PNG, JPEG or WebP pictures, re-saved and small enough to forward`);
  }

  // #60 part 3 — changes the reviewer proposes to a diagram.
  const OPS = ['rename', 'remove-node', 'add-node', 'add-edge', 'remove-edge', 'relabel-edge'];
  const proposals = Array.isArray(f?.proposals) ? f.proposals : [];
  if (proposals.length) {
    const pids = proposals.map((p) => p?.id);
    const bad = proposals.filter((p, i) => !/^proposal-\d{1,4}$/.test(p?.id ?? '') || pids.indexOf(p.id) !== i
      || !OPS.includes(p?.op) || !String(p?.label ?? '').trim()).map((p) => `${p?.id ?? '?'}${OPS.includes(p?.op) ? '' : ` ("${p?.op}")`}`);
    rep.check('proposals well-formed', bad.length === 0,
      `${bad.join(', ')}: a proposed change needs its own id (proposal-1), one of ${OPS.join(', ')}, and the part it is on in words. Export it from the page again`);
  }

  const addedIds = added.map((a) => a?.id);
  rep.check('added ids prefixed', addedIds.every((id) => /^added-/.test(id ?? '')),
    'reviewer-added items must use the "added-" prefix so they can never be confused with items the agent asked about');
  checkTargetsUnique(f, rep);

  // Derived fields must be true.
  const s = f?.summary ?? {};
  const unsetCount = responses.filter((x) => x.verdict === UNSET).length;
  const byVerdict = {};
  for (const v of allowed) byVerdict[v] = responses.filter((x) => x.verdict === v).length;
  const ok =
    s.total === responses.length &&
    s.unset === unsetCount &&
    s.answered === responses.length - unsetCount &&
    s.added === added.length &&
    Object.entries(byVerdict).every(([k, n]) => (s.byVerdict?.[k] ?? 0) === n);
  // Name the field that actually differs. An error that prints two identical-looking objects is how
  // people learn to distrust a checker — the first version of this message did exactly that when the
  // mismatch was inside byVerdict.
  const diffs = [];
  const cmp = (k, want, got) => { if (want !== got) diffs.push(`${k}: expected ${want}, file says ${got ?? 0}`); };
  cmp('total', responses.length, s.total);
  cmp('answered', responses.length - unsetCount, s.answered);
  cmp('unset', unsetCount, s.unset);
  cmp('added', added.length, s.added);
  for (const [k, n] of Object.entries(byVerdict)) cmp(`byVerdict.${k}`, n, s.byVerdict?.[k]);
  for (const k of Object.keys(s.byVerdict ?? {})) if (!(k in byVerdict)) diffs.push(`byVerdict.${k}: counted, but "${k}" is not in the verdict set`);
  rep.check('summary is true', ok, diffs.join(' · '));

  if (f?.gaps !== undefined) {
    const negative = new Set((f?.verdictSet?.options ?? []).filter((o) => o.tone === 'negative').map((o) => o.value));
    const positive = new Set((f?.verdictSet?.options ?? []).filter((o) => o.tone === 'positive').map((o) => o.value));
    const picked = new Set((Array.isArray(f?.choices) ? f.choices : []).filter((c) => c?.itemId).map((c) => c.sectionId));
    const expected = [...responses, ...added, ...layerVerdicts]
      .filter((x) => (x.verdict === UNSET ? !picked.has(x.sectionId)
        : x.sectionKind === 'challenge' ? positive.has(x.verdict) : negative.has(x.verdict)))
      .map((x) => x.itemId ?? x.id).sort();
    const got = [...f.gaps].sort();
    rep.check('gaps are derived', JSON.stringify(expected) === JSON.stringify(got),
      `gap-first list should be [${expected.join(', ')}] but is [${got.join(', ')}]`);
  }

  const choices = Array.isArray(f?.choices) ? f.choices : [];
  if (choices.some((c) => c?.recommended)) {
    const lies = choices.filter((c) => c.recommended &&
      c.followedRecommendation !== (c.itemId === null ? null : c.itemId === c.recommended.itemId)).map((c) => c.sectionId);
    rep.check('choices are derived', lies.length === 0, `followedRecommendation does not match the pick in: ${lies.join(', ')}`);
  }

  // A pick in a choose-one section is an answer too (#53: a chat record can be picks alone).
  rep.warn('nothing answered', responses.length > 0 && responses.every((x) => x.verdict === UNSET) && !choices.some((c) => c?.itemId),
    'every item is unset — this is a blank form, not feedback');
  rep.warn('no notes', responses.length > 3 && responses.every((x) => !x.note),
    'verdicts with no notes anywhere: usable, but the reviewer\'s own words are the part an agent can actually act on');

  // ── the pair ──
  if (review) {
    const reviewIds = new Set((review.items ?? []).map((i) => i.id));
    const answered = new Set(responses.map((x) => x.itemId));
    const missing = [...reviewIds].filter((id) => !answered.has(id));
    const unknown = [...answered].filter((id) => !reviewIds.has(id));
    rep.check('every item answered', missing.length === 0,
      `no response for: ${missing.join(', ')} — an unanswered item must be present with verdict "${UNSET}", never omitted`);
    rep.check('no unknown responses', unknown.length === 0, `response(s) for items not in the review: ${unknown.join(', ')}`);
    rep.check('review matches', review.id === f?.review?.id, `feedback names "${f?.review?.id}" but the review is "${review.id}"`);

    const chooseOne = (review.sections ?? []).filter((s) => s.mode === 'choose-one');
    if (chooseOne.length) {
      const bySection = Object.fromEntries(choices.map((c) => [c.sectionId, c]));
      const itemById = Object.fromEntries((review.items ?? []).map((i) => [i.id, i]));
      const problems = [];
      for (const s of chooseOne) {
        const c = bySection[s.id];
        if (!c) problems.push(`${s.id}: missing — an unchosen section is written with itemId null, never omitted`);
        else if (c.itemId !== null && itemById[c.itemId]?.sectionId !== s.id) problems.push(`${s.id}: "${c.itemId}" is not one of its options`);
        else if (c.itemId !== null && c.title !== itemById[c.itemId].title) problems.push(`${s.id}: the title does not echo the chosen option`);
      }
      rep.check('every choice recorded', problems.length === 0, problems.join(' · '));
    }

    if ((review.items ?? []).some((i) => i.approval) || responses.some((x) => x?.approval)) {
      const byId = Object.fromEntries(responses.map((x) => [x.itemId, x]));
      const KEYS = ['action', 'scope', 'risk', 'preview', 'expiresAt'];
      const differ = [];
      for (const i of review.items ?? []) {
        const x = byId[i.id]; if (!x) continue;
        if (!i.approval && x.approval) differ.push(`${i.id}: answered as an approval, but the review asked for a verdict`);
        else if (i.approval && !x.approval) differ.push(`${i.id}: the review asked for an approval, but the answer carries none`);
        else if (i.approval) {
          const keys = KEYS.filter((k) => (i.approval[k] ?? null) !== (x.approval[k] ?? null));
          if (keys.length) differ.push(`${i.id}: the approval in the file is not the one asked (${keys.join(', ')} differ)`);
        }
      }
      rep.check('approvals echo the review', differ.length === 0,
        `${differ.join(' · ')}. Export the answer from the page again: an approval only counts for the exact action that was shown`);
    }

    if (comments.length) {
      const charts = Object.fromEntries((review.diagrams ?? []).map((d) => [d.id, d]));
      if (review.flow) charts['user-flow'] = flowAsDiagram(review);
      const lost = [];
      for (const c of comments) {
        const d = charts[c.diagram];
        const want = d ? partLabel(d, c) : null;
        if (!d) lost.push(`${c.id}: diagram "${c.diagram}" is not in the review`);
        else if (want === null) lost.push(`${c.id}: "${c.label}" is no ${c.node !== undefined ? 'box' : 'arrow'} of "${d.title || d.id}"`);
        else if (want !== c.label) lost.push(`${c.id}: says it is on "${c.label}", but that part is "${want}"`);
      }
      rep.check('comments resolve', lost.length === 0,
        `${lost.join(' · ')}. Export the answer from the page again, or a comment lands on the wrong part`);
    }

    if (proposals.length) {
      const charts = Object.fromEntries((review.diagrams ?? []).map((d) => [d.id, d]));
      if (review.flow) charts['user-flow'] = flowAsDiagram(review);
      const ctx = { stepIds: new Set((review.items ?? []).filter((i) => i?.step || !review.flow).map((i) => i.id)),
        partIds: new Set((review.flow?.parts ?? []).map((p) => p.id)),
        diagramIds: Object.keys(charts), flow: !!review.flow };
      const broken = [];
      for (const id of new Set(proposals.map((p) => p.diagram))) {
        const d = charts[id];
        if (!d) { broken.push(`${proposals.filter((p) => p.diagram === id).map((p) => p.id).join(', ')}: diagram "${id}" is not in the review`); continue; }
        const { diagram, failed } = applyProposals(d, proposals.filter((p) => p.diagram === id));
        for (const x of failed) broken.push(`${x.id}: ${x.why}`);
        const faults = diagramFaults(diagram, ctx);
        for (const m of [...faults.unresolved, ...faults.senseless]) broken.push(`with the changes, ${m}`);
      }
      rep.check('proposals fit the diagram', broken.length === 0,
        `${broken.join(' · ')}. A change must land on a part that exists and leave a diagram that still holds together; ask the reviewer again rather than drawing something broken`);
    }

    const requests = Array.isArray(f?.requests) ? f.requests : [];
    if (requests.length) {
      const itemIds = new Set((review.items ?? []).map((i) => i.id));
      const KINDS = ['example', 'explain'];
      const bad2 = requests.filter((q) => !itemIds.has(q?.itemId) || !KINDS.includes(q?.kind))
        .map((q) => (!itemIds.has(q?.itemId) ? `"${q?.itemId}" is not an item in this review` : `${q.itemId}: "${q.kind}" is not something to ask for`));
      rep.check('requests resolve', bad2.length === 0, `${bad2.join(' · ')}. Ask for ${KINDS.join(' or ')} on an item that exists, or the agent can't answer it`);
    }

    if (layerVerdicts.length) {
      const itemById = Object.fromEntries((review.items ?? []).map((i) => [i.id, i]));
      const mismatched = [];
      for (const x of layerVerdicts) {
        const found = findLayerEntry(itemById[x.stepId], x.entryId);
        if (!found || x.id !== `${x.stepId}/${x.entryId}`) { mismatched.push(`${x.id}: points at no entry in the review. Remove it, or fix stepId/entryId`); continue; }
        if (x.layer !== found.layer || x.stepTitle !== itemById[x.stepId].title || x.entry !== layerEntryText(found.layer, found.entry))
          mismatched.push(`${x.id}: the echoed entry does not match the review. Rebuild the feedback from the page; a reader of this file alone would see different text than the reviewer judged`);
      }
      rep.check('layer verdicts echo the review', mismatched.length === 0, mismatched.join(' · '));
    }
    rep.warn('added items not permitted', review.allowAddedItems === false && added.length > 0,
      'the review disallowed added items but the feedback carries some');
  }
}

// #77 — a gap, a picture or a later review names what it means by id alone. Two answers with one id (an
// item carried as added-1 and a new added-1) and it names both: refuse, never pick the first.
function checkTargetsUnique(f, rep) {
  const ids = [...(f?.responses ?? []).map((x) => x?.itemId), ...(f?.addedItems ?? []).map((x) => x?.id), ...(f?.comments ?? []).map((x) => x?.id)];
  const dupes = [...new Set(ids.filter((id, i) => id && ids.indexOf(id) !== i))];
  rep.check('answer ids unique', dupes.length === 0,
    `${dupes.join(', ')} ${dupes.length === 1 ? 'names' : 'name'} two different answers in the feedback for "${f?.review?.id}", so a gap, a picture or a later review pointing at it could mean either. Keep this file and ask the reviewer which answer each one is; give one a new id in a copy, never guess`);
}

// ── history: an item that affects an earlier decision must quote it truthfully ──────────────────
function checkHistory(r, earlier, rep) {
  for (const f of earlier) checkTargetsUnique(f, rep);
  const byReview = Object.fromEntries(earlier.map((f) => [f?.review?.id, f]));
  const misquotes = [];
  for (const item of r?.items ?? []) {
    for (const a of item.affects ?? []) {
      const d = a?.decision ?? {};
      const f = byReview[d.review];
      if (!f) { rep.warn('decision not verified', true, `${item.id} quotes review "${d.review}", but no earlier feedback for it was given`); continue; }
      const answers = [...(f.responses ?? []), ...(f.addedItems ?? []).map((x) => ({ ...x, itemId: x.id }))];
      const earlierAnswer = answers.find((x) => x.itemId === d.itemId);
      if (!earlierAnswer) misquotes.push(`${item.id}: review "${d.review}" has no item "${d.itemId}"`);
      else if (earlierAnswer.title !== d.title) misquotes.push(`${item.id}: quotes the title "${d.title}", but the earlier item is "${earlierAnswer.title}"`);
      else if (earlierAnswer.verdict !== d.verdict) misquotes.push(`${item.id}: quotes the verdict "${d.verdict}", but the reviewer answered "${earlierAnswer.verdict}"`);
    }
  }
  rep.check('earlier decisions quoted truthfully', misquotes.length === 0, misquotes.join(' · '));
}

// ── followup: nothing the reviewer left open is dropped in the next round (#52) ────────────────────
// An earlier item is carried when the next review has an item with the same id, or one whose `affects`
// quotes it. No status field: the files already hold the state, and a second copy could disagree.
// #87 — every chart of a review by id, the drawn user flow included.
function chartsOf(r) {
  const charts = Object.fromEntries((r?.diagrams ?? []).map((d) => [d.id, d]));
  if (r?.flow) charts['user-flow'] = flowAsDiagram(r);
  return charts;
}

// #87 — is the proposed change there in the next diagram? Only the part the change names is compared,
// so the agent may redraw the rest.
function proposalDrawn(p, before, after) {
  const node = (d, id) => (d?.nodes ?? []).find((n) => n.id === id);
  const pair = (d) => (d?.edges ?? []).filter((e) => e.from === p.from && e.to === p.to);
  if (p.op === 'rename') return node(after, p.node)?.label === p.text;
  if (p.op === 'remove-node') return !node(after, p.node);
  if (p.op === 'add-node') return (after?.nodes ?? []).some((n) => n.label === p.text && (after.edges ?? []).some((e) => e.from === p.from && e.to === n.id));
  if (p.op === 'add-edge') return pair(after).length > pair(before).length;
  if (p.op === 'remove-edge') return pair(after).length < pair(before).length;
  if (p.op === 'relabel-edge') return pair(after).some((e) => e.label === p.text);
  return false;
}

function checkFollowup(next, review, f, rep) {
  const carriers = (id) => (next?.items ?? []).filter((i) => i.id === id
    || (i.affects ?? []).some((a) => a?.decision?.review === review?.id && a?.decision?.itemId === id));
  const title = (id) => [...(f?.responses ?? []), ...(f?.addedItems ?? []).map((x) => ({ ...x, itemId: x.id }))].find((x) => x.itemId === id)?.title ?? id;
  const how = `Add it to the next review with the same id, or as an item whose "affects" quotes it`;
  rep.check('next review has its own id', next?.id !== review?.id,
    `the next review keeps the id "${review?.id}". Give it its own id, or the reviewer's new answers and the old ones are hard to tell apart`);
  const addedIds = new Set((f?.addedItems ?? []).map((x) => x.id));   // reported on their own below
  const dropped = (f?.gaps ?? []).filter((id) => !addedIds.has(id) && !carriers(id).length);
  rep.check('gaps carried', dropped.length === 0,
    `${dropped.map((id) => `"${title(id)}"`).join(', ')} ${dropped.length === 1 ? 'is a gap' : 'are gaps'} the next review drops. ${how}, or the reviewer never sees their open point answered`);
  // #88 — a caution or neutral answer ("Partially works", "Couldn't test it", "Revisit") settles nothing,
  // and it is not a gap: carry it the same way, or it drops out unanswered. Tones come from the agent's own
  // review, never from the returned file. Gaps themselves stay as they are.
  const option = Object.fromEntries((review?.verdictSet?.options ?? []).map((o) => [o.value, o]));
  const openDropped = (f?.responses ?? []).filter((x) => ['caution', 'neutral'].includes(option[x.verdict]?.tone) && !carriers(x.itemId).length)
    .map((x) => `"${x.title}" was answered "${option[x.verdict].label ?? x.verdict}"`);
  rep.check('open answers carried', openDropped.length === 0,
    `${openDropped.join(', ')}, and the next review drops ${openDropped.length === 1 ? 'it' : 'them'}. That answer settles nothing. ${how}, or it is never looked at again`);
  const addedDropped = (f?.addedItems ?? []).filter((x) => !carriers(x.id).length).map((x) => `"${x.title}"`);
  rep.check('added items carried', addedDropped.length === 0,
    `the reviewer added ${addedDropped.join(', ')}, and the next review drops ${addedDropped.length === 1 ? 'it' : 'them'}. ${how}, or what they raised unasked is lost`);
  const itemText = (i) => `${i?.summary ?? ''}\n${i?.body ?? ''}`.trim();
  const before = Object.fromEntries((review?.items ?? []).map((i) => [i.id, itemText(i)]));
  const unanswered = [];
  for (const q of f?.requests ?? []) {
    const c = carriers(q.itemId);
    if (!c.length) unanswered.push(`"${q.title}" asked for ${q.kind === 'example' ? 'an example' : 'an explanation'}, and the next review drops the item. ${how}`);
    else if (q.kind === 'example' && !c.some((i) => (i.examples ?? []).length))
      unanswered.push(`"${q.title}" asked for an example, and no item carrying it has "examples". Add real precedents there, each with a source or marked unverified`);
    else if (q.kind === 'explain' && !c.some((i) => itemText(i) && itemText(i) !== before[q.itemId]))
      unanswered.push(`"${q.title}" asked for an explanation, and its text is unchanged. Explain it again in "summary" or "body", in other words than before`);
  }
  const answerList = (next?.items ?? []).flatMap((i) => (i.answers ?? []).map((a) => ({ item: i.id, a })));
  const answered = new Set(answerList.map(({ a }) => (typeof a === 'string' ? a : a?.id)));
  // #87 — an outcome must be what the next review shows: checked against both diagrams, never taken on trust.
  const outcomes = answerList.filter(({ a }) => a && typeof a === 'object');
  if (outcomes.length) {
    const proposal = Object.fromEntries((f?.proposals ?? []).map((p) => [p.id, p]));
    const [before, after] = [review, next].map(chartsOf);
    const said = {}, wrong = [];
    for (const { item, a } of outcomes) {
      const w = `${item}: ${a.id}`;
      if (a.review !== review?.id) { wrong.push(`${w} names review "${a.review}", but this follow-up is to "${review?.id}"`); continue; }
      const p = proposal[a.id];
      if (!p) { wrong.push(`${w} is no proposal in the feedback for "${review?.id}"`); continue; }
      if (said[a.id] && said[a.id] !== a.outcome) wrong.push(`${a.id} is answered both "${said[a.id]}" and "${a.outcome}"`);
      said[a.id] = a.outcome;
      const drawn = proposalDrawn(p, before[p.diagram], after[p.diagram]);
      if (a.outcome === 'drawn' && !drawn) wrong.push(`${w} says drawn, but "${p.label}" is not changed that way in the next "${p.diagram}"`);
      if (a.outcome === 'not-drawn' && drawn) wrong.push(`${w} says not drawn, but the next diagram has the change`);
    }
    rep.check('proposal outcomes true', wrong.length === 0,
      `${wrong.join(' · ')}. Say what the next review actually shows, or the reviewer is told something the page contradicts`);
  }
  if ((f?.comments ?? []).length) {
    const open = f.comments.filter((c) => !answered.has(c.id)).map((c) => `${c.id} on "${c.label}"`);
    rep.check('comments answered', open.length === 0,
      `${open.join(', ')} ${open.length === 1 ? 'is' : 'are'} not answered. Answer each in an item of the next review and list it in that item's "answers", or the reviewer's point is dropped`);
  }
  if ((f?.proposals ?? []).length) {
    const openP = f.proposals.filter((p) => !answered.has(p.id)).map((p) => `${p.id} on "${p.label}"`);
    rep.check('proposals answered', openP.length === 0,
      `${openP.join(', ')} ${openP.length === 1 ? 'is' : 'are'} not answered. Draw the change (or say why not) in an item of the next review and list the id in its "answers", or the reviewer's change is dropped`);
  }
  rep.check('requests answered', unanswered.length === 0, `${unanswered.join(' · ')}, or the reviewer's question goes unanswered where they asked it`);
}

// ── rounds: a continuing review, every round checked against the one before (#82) ─────────────────
// Each earlier round is a checked pair; each next round carries what the round before left open
// (followup); ids never repeat; and a `reply` answers something the reviewer said. The renderer runs this
// before it writes a page that carries the history.
function checkRounds(current, rounds, rep) {
  const as = (label) => ({ check: (n, ok, d) => rep.check(`${label}: ${n}`, ok, d), warn: (n, c, d) => rep.warn(`${label}: ${n}`, c, d) });
  const ids = [...rounds.map((x) => x.review?.id), current?.id];
  rep.check('each round has its own id', new Set(ids).size === ids.length,
    `review ids repeat across rounds (${ids.join(', ')}). Each round is a review of its own, with its own id`);
  const chain = [...rounds.map((x) => x.review), current];
  const broken = chain.slice(1).map((r, i) => r?.continues === chain[i]?.id ? null : `round ${i + 2} ("${r?.id}") ${r?.continues ? `continues "${r.continues}"` : 'says nothing it continues'}, but the round before is "${chain[i]?.id}"`).filter(Boolean);
  rep.check('each round continues the one before', broken.length === 0,
    `${broken.join(' · ')}. Set "continues" to the id of the round before, and give the rounds oldest first; a missing or reordered round would pair answers with the wrong questions`);
  // A flow that continues another is whole when every screen is reached by a step of this round or of a
  // round before, with no way in that leads nowhere.
  chain.forEach((r, k) => {
    if (!r?.flow || !r.continues) return;
    const screens = r.flow.screens ?? [], ids = new Set(screens.map((s) => s.id)), steps = {};
    for (const x of chain.slice(0, k + 1)) for (const it of x?.items ?? []) if (it.step) steps[it.id] = it;
    const next = {};
    for (const it of Object.values(steps)) if (ids.has(it.step.from)) for (const o of it.step.outcomes ?? []) if (ids.has(o.to)) (next[it.step.from] ??= new Set()).add(o.to);
    const seen = new Set();
    for (const queue = ids.has(r.flow.start) ? [r.flow.start] : []; queue.length;) { const id = queue.shift(); if (!seen.has(id)) { seen.add(id); queue.push(...(next[id] ?? [])); } }
    const unreached = [...ids].filter((id) => !seen.has(id)), stuck = screens.filter((s) => !next[s.id] && !s.end).map((s) => s.id);
    as(`round ${k + 1}`).check('flow is whole across the rounds', !unreached.length && !stuck.length, [
      unreached.length && `no step in this round or the rounds before reaches ${unreached.join(', ')}. Carry a step that leads there, or remove the screen`,
      stuck.length && `no way out of ${stuck.join(', ')} in any round, and not marked end. Add a step out, or set "end": true`,
    ].filter(Boolean).join(' · '));
  });
  rounds.forEach(({ review, feedback }, i) => {
    const here = as(`round ${i + 1}`), next = i + 1 < rounds.length ? rounds[i + 1].review : current, there = as(`round ${i + 2}`);
    checkReview(review, here); checkFeedback(feedback, here, review);
    checkHistory(next, [feedback], there); checkFollowup(next, review, feedback, there);
    const earlier = new Set([...(feedback?.responses ?? []).map((x) => x.itemId), ...(feedback?.addedItems ?? []).map((x) => x.id)]);
    const toNothing = (next?.items ?? []).filter((it) => it.reply && !earlier.has(it.id)
      && !(it.affects ?? []).some((a) => a?.decision?.review === review?.id && earlier.has(a?.decision?.itemId))).map((it) => it.id);
    there.check('replies answer something', toNothing.length === 0,
      `${toNothing.join(', ')} ${toNothing.length === 1 ? 'has' : 'have'} a "reply", but the round before has no answer on ${toNothing.length === 1 ? 'it' : 'them'}. A reply answers what the reviewer said; leave it out on a new question`);
  });
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const rootAt = argv.indexOf('--root');
const ROOT = rootAt >= 0 ? resolve(argv.splice(rootAt, 2)[1] ?? '.') : null;
const [mode, a, b] = argv;
if (!mode || !a) {
  console.error('usage: check.mjs review <review.json>\n       check.mjs feedback <feedback.json> [review.json]\n       check.mjs pair <review.json> <feedback.json>\n       check.mjs history <review.json> <earlier-feedback.json>...\n       check.mjs followup <next-review.json> <review.json> <feedback.json>\n       check.mjs rounds <review.json> <round-1-review.json> <round-1-feedback.json> [<round-2-review.json> <round-2-feedback.json>]...');
  process.exit(2);
}
const rep = new Report();
if (mode === 'review') checkReview(load(a), rep);
else if (mode === 'feedback') checkFeedback(load(a), rep, b ? load(b) : null);
else if (mode === 'pair') { const r = load(a); checkReview(r, rep); checkFeedback(load(b), rep, r); }
else if (mode === 'history') {
  if (!b) fail('history needs at least one earlier feedback file');
  const r = load(a); checkReview(r, rep); checkHistory(r, argv.slice(2).map(load), rep);
}
else if (mode === 'followup') {
  const c = argv[3];
  if (!b || !c) fail('followup needs the next review, the earlier review and its feedback');
  const next = load(a), r = load(b), f = load(c);
  checkReview(next, rep); checkFeedback(f, rep, r); checkHistory(next, [f], rep); checkFollowup(next, r, f, rep);
}
else if (mode === 'rounds') {
  const rest = argv.slice(2);
  if (!rest.length || rest.length % 2) fail('rounds needs the current review, then each earlier round oldest first: its review, then its feedback');
  const rounds = [];
  for (let i = 0; i < rest.length; i += 2) rounds.push({ review: load(rest[i]), feedback: load(rest[i + 1]) });
  const current = load(a); checkReview(current, rep); checkRounds(current, rounds, rep);
}
else fail(`unknown mode "${mode}"`);

for (const c of rep.checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}`);
for (const w of rep.warnings) console.log(`  ! ${w}`);
if (rep.errors.length) {
  console.log(`\n${rep.errors.length} error(s):`);
  for (const e of rep.errors) console.log(`  ✗ ${e}`);
}
const n = rep.checks.length;
console.log(`\n${rep.errors.length === 0 ? 'PASS' : 'FAIL'} — ${n - rep.errors.length}/${n} checks, ${rep.warnings.length} warning(s)`);
process.exit(rep.errors.length === 0 ? 0 : 1);

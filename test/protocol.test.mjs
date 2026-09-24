// SPDX-License-Identifier: Apache-2.0
// The protocol's guarantees, as one runnable file:  node --test
//
// 1. The worked examples pass the checker, and a fresh builder round trip does too.
// 2. The checker REFUSES the five faults that would quietly corrupt feedback.
// 3. The page inlines lib/build-feedback.mjs verbatim and makes no network requests.

import { test } from 'node:test';
import './ai-checks.test.mjs';
import './ai-drawing.test.mjs';
import './ai-examples.test.mjs';
import './feedback-identity.test.mjs';
import './answered-html.test.mjs';
import './proposal-outcomes.test.mjs';
import './conformance.test.mjs';
import './review-selection.test.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFeedback, applyProposals, partLabel } from '../lib/build-feedback.mjs';
import { flowAsDiagram, drawDiagram } from '../lib/draw-diagram.mjs';

const root = new URL('..', import.meta.url).pathname;
const at = (p) => join(root, p);
const tmp = mkdtempSync(join(tmpdir(), 'review-test-'));
const readJson = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const REVIEW = 'examples/review.example.json';

// #69 / #32 part 3: tables are data, never executable SQL or live records.
const database = () => ({ id: 'db', kind: 'database', title: 'Example booking data', nodes: [
  { id: 'members', kind: 'table', label: 'Members', step: 'guest-checkout', columns: [
    { id: 'id', label: 'Member id', type: 'text', key: true },
    { id: 'name', label: 'Name', type: 'text', key: false }], sampleRows: [{ id: 'm1', name: 'Example member' }] },
  { id: 'bookings', kind: 'table', label: 'Bookings', columns: [
    { id: 'id', label: 'Booking id', type: 'text', key: true },
    { id: 'member', label: 'Member id', type: 'text', key: false },
    { id: 'creator', label: 'Created by', type: 'text', key: false }] }
], edges: [
  { from: 'bookings', fromColumn: 'member', to: 'members', toColumn: 'id', cardinality: 'many-to-one', label: 'Booked by' },
  { from: 'bookings', fromColumn: 'creator', to: 'members', toColumn: 'id', cardinality: 'many-to-one', label: 'Created by' }
] });
const databaseReview = (d = database()) => ({ ...readJson(REVIEW), id: 'database-unit-review', diagrams: [d] });

test('database: a valid diagram and isolated table pass; keys may also be child columns', () => {
  const d = database();
  assert.equal(checkReviewObj(databaseReview(d)).status, 0);
  d.edges = []; assert.equal(checkReviewObj(databaseReview(d)).status, 0);
  d.edges = [{ ...database().edges[0], fromColumn: 'id' }];
  assert.equal(checkReviewObj(databaseReview(d)).status, 0);
});

const databaseFaults = {
  'diagram shape': d => { d.lanes = []; },
  'diagram id type': d => { d.id = 23; },
  'table count': d => { d.nodes = []; },
  'table limit': d => { d.nodes = Array.from({ length: 31 }, (_, i) => ({ ...d.nodes[0], id: `t${i}` })); d.edges = []; },
  'table shape': d => { d.nodes[0] = null; },
  'table fields': d => { d.nodes[0].sql = 'unused'; },
  'table id': d => { d.nodes[0].id = 'bad id'; },
  'duplicate table': d => { d.nodes.push(structuredClone(d.nodes[0])); },
  'table kind': d => { d.nodes[0].kind = 'service'; },
  'table label': d => { d.nodes[0].label = ' '; },
  'columns': d => { d.nodes[0].columns = []; },
  'column limit': d => { d.nodes[0].columns = Array.from({ length: 31 }, (_, i) => ({ id: `c${i}`, label: 'Column', type: 'text', key: i === 0 })); },
  'column shape': d => { d.nodes[0].columns[0] = null; },
  'column fields': d => { d.nodes[0].columns[0].extra = true; },
  'column id': d => { d.nodes[0].columns[0].id = 'bad id'; },
  'duplicate column': d => { d.nodes[0].columns.push(structuredClone(d.nodes[0].columns[1])); },
  'column label': d => { d.nodes[0].columns[0].label = ' '; },
  'column type': d => { d.nodes[0].columns[0].type = ' '; },
  'key flag': d => { d.nodes[0].columns[0].key = 'id'; },
  'key count': d => { d.nodes[0].columns[0].key = false; },
  'multiple keys': d => { d.nodes[0].columns[1].key = true; },
  'absent key column': d => { d.nodes[0].key = 'missing'; },
  'sample rows': d => { d.nodes[0].sampleRows = {}; },
  'row limit': d => { d.nodes[0].sampleRows = Array(11).fill({ id: 'm1', name: 'Example' }); },
  'row shape': d => { d.nodes[0].sampleRows = [null]; },
  'row columns': d => { d.nodes[0].sampleRows[0].extra = 'missing column'; },
  'missing cell': d => { delete d.nodes[0].sampleRows[0].name; },
  'cell scalar': d => { d.nodes[0].sampleRows[0].name = {}; },
  'cell length': d => { d.nodes[0].sampleRows[0].name = 'x'.repeat(501); },
  'relationships': d => { d.edges = {}; },
  'relationship limit': d => { d.edges = Array(161).fill(d.edges[0]); },
  'relationship shape': d => { d.edges[0] = null; },
  'relationship fields': d => { d.edges[0].kind = 'conditional'; },
  'relationship table': d => { d.edges[0].to = 'missing'; },
  'relationship column': d => { d.edges[0].fromColumn = 'missing'; },
  'target column': d => { d.edges[0].toColumn = 'missing'; },
  'target key': d => { d.edges[0].toColumn = 'name'; },
  'cardinality': d => { d.edges[0].cardinality = 'one-to-many'; },
  'relationship label': d => { d.edges[0].label = ' '; },
  'duplicate mapping': d => { d.edges.push(structuredClone(d.edges[0])); },
  'step': d => { d.nodes[0].step = 'missing'; }
};
for (const [name, change] of Object.entries(databaseFaults)) test(`database refuses ${name}`, () => {
  const d = database(); change(d);
  const result = checkReviewObj(databaseReview(d));
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const rule = { 'diagram id type': 'diagram shape', 'table limit': 'table count', 'column limit': 'columns', 'multiple keys': 'key count', 'absent key column': 'table fields', 'row limit': 'sample rows', 'missing cell': 'row columns', 'relationship limit': 'relationships', 'target column': 'relationship column' }[name] || name;
  assert.ok(result.stdout.includes(`(${rule})`), result.stdout);
});

test('database drawing: columns, keys, example cells, cardinalities and repeated-edge targets', () => {
  const html = drawDiagram(database(), { selected: 'guest-checkout', commentable: true });
  for (const word of ['Member id', 'text', 'Key', 'Example data', 'Example member', 'Many', 'One', 'data-nth="1"', 'dg-selected']) assert.ok(html.includes(word), word);
  const d = database(), hostile = '<img src=x onerror="boom()">';
  d.nodes[0].label = hostile; d.nodes[0].columns[0].label = hostile;
  d.nodes[0].columns[0].type = hostile; d.nodes[0].sampleRows[0].name = hostile; d.edges[0].label = hostile;
  const safe = drawDiagram(d, { commentable: true });
  assert.doesNotMatch(safe, /<img|<script/);
  assert.ok(safe.includes('&lt;img'));
});

test('database proposals: bounded operations preserve relationship fields and comments identify columns', () => {
  const d = database();
  for (const op of ['add-node', 'add-edge']) assert.equal(applyProposals(d, [{ id: 'proposal-1', op, from: 'bookings', to: 'members', text: 'Extra' }]).failed.length, 1);
  const next = applyProposals(d, [{ id: 'proposal-1', op: 'relabel-edge', from: 'bookings', to: 'members', nth: 1, text: 'Entered by' }]);
  assert.equal(checkReviewObj(databaseReview(next.diagram)).status, 0);
  assert.equal(next.diagram.edges[0].label, 'Booked by');
  assert.equal(next.diagram.edges[1].fromColumn, 'creator');
  assert.equal(d.edges[1].label, 'Created by');
  assert.match(partLabel(d, { edge: { from: 'bookings', to: 'members', nth: 1 } }), /creator/);
  const removed = applyProposals(d, [{ id: 'proposal-2', op: 'remove-edge', from: 'bookings', to: 'members', nth: 0 }]);
  const shown = drawDiagram(removed.diagram, { commentable: true, originalEdges: d.edges });
  assert.match(shown, /data-nth="1"/);
  assert.doesNotMatch(shown, /data-nth="0"/);
});

test('database: real example, repeated relationships, proposals and followup pass the same contract', () => {
  const review = readJson('examples/database-booking.review.json');
  assert.equal(check('review', at('examples/database-booking.review.json')).status, 0);
  const d = review.diagrams[0];
  const on = { diagram: d.id, edge: { from: 'bookings', to: 'members', nth: 1 } };
  const label = partLabel(d, on);
  const store = { comments: [{ ...on, id: 'comment-1', label, note: 'Say who entered it.' }], proposals: [
    { id: 'proposal-1', diagram: d.id, op: 'remove-edge', from: 'bookings', to: 'members', nth: 0, label: partLabel(d, { edge: { from: 'bookings', to: 'members', nth: 0 } }) },
    { id: 'proposal-2', diagram: d.id, op: 'relabel-edge', from: 'bookings', to: 'members', nth: 1, text: 'Entered by member', label }
  ] };
  const feedback = buildFeedback(review, store);
  const fp = join(tmp, 'database-feedback.json'); writeFileSync(fp, JSON.stringify(feedback));
  const result = check('pair', at('examples/database-booking.review.json'), fp);
  assert.equal(result.status, 0, result.stdout);
  const next = structuredClone(review); next.id = 'database-followup';
  next.items[0].answers = ['comment-1', 'proposal-1', 'proposal-2'];
  const rp = join(tmp, 'database-followup.json'); writeFileSync(rp, JSON.stringify(next));
  assert.equal(check('followup', rp, at('examples/database-booking.review.json'), fp).status, 0);
  next.items[0].answers = []; writeFileSync(rp, JSON.stringify(next));
  assert.equal(check('followup', rp, at('examples/database-booking.review.json'), fp).status, 1);
  // A missing position is ambiguous when there are two foreign keys between the same tables.
  assert.equal(partLabel(d, { edge: { from: 'bookings', to: 'members' } }), null);
  for (const op of ['add-node', 'add-edge']) {
    const bad = buildFeedback(review, { proposals: [{ id: 'proposal-1', diagram: d.id, op, from: 'bookings', to: 'members', text: 'Extra', label: 'Bookings' }] });
    writeFileSync(fp, JSON.stringify(bad));
    assert.match(check('pair', at('examples/database-booking.review.json'), fp).stdout, /✗ proposals fit the diagram/);
  }
});

const check = (...args) => spawnSync(process.execPath, [at('bin/check.mjs'), ...args], { encoding: 'utf8' });
const checkFeedback = (feedback) => {
  const p = join(tmp, `f-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(feedback));
  return check('pair', at(REVIEW), p);
};

test('worked examples pass', () => {
  for (const args of [
    ['review', at(REVIEW)],
    ['pair', at(REVIEW), at('examples/feedback.example.json')],
    ['pair', at(REVIEW), at('examples/checkout-uat.feedback.json')],
  ]) {
    const r = check(...args);
    assert.equal(r.status, 0, `${args[0]} ${args.slice(1).join(' ')}\n${r.stdout}`);
  }
});

test('builder round trip passes the checker', () => {
  const store = {
    verdicts: { 'guest-checkout': 'works', 'declined-card': 'fails' },
    notes: { 'declined-card': 'Shows error 51.' },
    added: [{ id: 'added-1', title: 'Currency flips mid-flow', verdict: 'fails' }],
  };
  const r = checkFeedback(buildFeedback(readJson(REVIEW), store));
  assert.equal(r.status, 0, r.stdout);
});

// Each fault must fail the run AND be reported under the check that owns it.
const faults = {
  'self-describing': (f) => { delete f.responses[0].title; },
  'summary is true': (f) => { f.summary.answered += 1; },
  'every item answered': (f) => { f.responses = f.responses.filter((x) => x.itemId !== 'back-button'); },
  'verdicts in vocabulary': (f) => { f.responses[0].verdict = 'great'; },
  'gaps are derived': (f) => { f.gaps = f.gaps.filter((id) => id !== 'declined-card'); },
  'answer ids unique': (f) => {
    f.addedItems.push({ ...f.addedItems[0], title: 'A second item under the same id' });
    f.summary.added += 1; f.gaps.push(f.addedItems[0].id);
  },
};

for (const [checkName, inject] of Object.entries(faults)) {
  test(`checker refuses: ${checkName}`, () => {
    const feedback = readJson('examples/feedback.example.json');
    inject(feedback);
    const r = checkFeedback(feedback);
    assert.equal(r.status, 1, `expected a refusal\n${r.stdout}`);
    assert.match(r.stdout, new RegExp(`✗ ${checkName}:`), r.stdout);
  });
}

// A page must work with no network at all. A source the agent cites may be a link the reviewer
// chooses to click (D050); nothing may be fetched — no src, no stylesheet, no import, no fetch.
const offline = (html, where) => {
  for (const bad of [/src\s*=\s*["']?https?:/i, /url\(\s*["']?https?:/i, /@import/i, /\bfetch\s*\(/,
    /<link[^>]+href\s*=\s*["']?https?:/i, /<script[^>]+src=/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i])
    assert.doesNotMatch(html, bad, `${where} would go to the network: ${bad}`);
  // A URL may appear as a source the reviewer can click, or as data inside the embedded review —
  // never as something the page loads by itself. Those two forms are all that is allowed.
  for (const m of html.match(/https?:\/\/[^"'\s<>]*/g) || []) {
    const i = html.indexOf(m);
    const before = html.slice(Math.max(0, i - 40), i);
    assert.ok(/href="$|"source":"$|source":"$/.test(before), `${where}: a URL that is neither a link nor review data: …${before}${m.slice(0, 30)}`);
  }
};

test('the offline rule catches a page that would fetch', () => {
  for (const bad of ['<script src="https://cdn.example.com/x.js"></script>', '<img src="https://e.org/x.png">',
    '<style>body{background:url(https://e.org/x.png)}</style>', '<script>fetch("/x")</script>', '<p>https://e.org/loose</p>'])
    assert.throws(() => offline(bad, 'a made-up page'), /network|neither a link/, bad);
  offline('<a href="https://e.org/why">why</a> and "source":"https://e.org/why"', 'a page with a cited link');
});

test('page inlines the builder verbatim and fetches nothing', () => {
  const out = join(tmp, 'page.html');
  const r = spawnSync(process.execPath, [at('bin/render.mjs'), at(REVIEW), out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(out, 'utf8');
  const builder = readFileSync(at('lib/build-feedback.mjs'), 'utf8').replace(/^export function/gm, 'function');
  assert.ok(html.includes(builder), 'the page does not contain lib/build-feedback.mjs verbatim');
  offline(html, 'the list page');
});

// Every theme block must tell the browser its scheme (or native controls stay light in dark mode)
// and keep the primary button's text readable: WCAG AA, 4.5:1.
test('each theme is readable', () => {
  const out = join(tmp, 'theme.html');
  spawnSync(process.execPath, [at('bin/render.mjs'), at(REVIEW), out]);
  const css = readFileSync(out, 'utf8');
  const blocks = {
    light: css.match(/:root\{([^}]*)\}/)[1],
    'dark (system)': css.match(/prefers-color-scheme:dark\)\{:root:not\(\[data-theme\]\)\{([^}]*)\}/)[1],
  };
  blocks['dark (toggle)'] = css.match(/:root\[data-theme="dark"\]\{([^}]*)\}/)[1];
  // Every style (D080), in light and in dark (D083), sets its own scheme and colours.
  for (const [, name, dark, block] of css.matchAll(/:root\[data-style="([\w-]+)"\](\[data-theme="dark"\])?\{([^}]*--bg[^}]*)\}/g)) {
    blocks[`${name} ${dark ? 'dark' : 'light'}`] = block;
  }
  assert.equal(Object.keys(blocks).length, 11, 'three base blocks and four styles in two modes');
  const token = (block, name) => block.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [name, block] of Object.entries(blocks)) {
    assert.match(block, new RegExp(`color-scheme:\\s*${/dark/.test(name) ? 'dark' : 'light'}`), `${name}: wrong or missing color-scheme`);
    const bg = token(block, 'bg') || token(blocks.light, 'bg'), mut = token(block, 'mut') || token(blocks.light, 'mut');
    assert.ok(ratio(bg, mut) >= 4.5, `${name}: quiet text ${mut} on ${bg} is ${ratio(bg, mut).toFixed(2)}:1, needs 4.5:1`);
    const ac = token(block, 'ac'), onAc = token(block, 'on-ac');
    assert.ok(ac && onAc, `${name}: --ac and --on-ac must both be set`);
    assert.ok(ratio(ac, onAc) >= 4.5, `${name}: button text ${onAc} on ${ac} is ${ratio(ac, onAc).toFixed(2)}:1, needs 4.5:1`);
  }
});

// ── decisions: choose-one, recommendation, memory of earlier decisions ────────────────────────────
const DECISION = 'examples/decision-review.example.json';
const EARLIER = 'examples/earlier-decisions.feedback.json';
const decisionFeedback = (choices = { storage: 'opt-db' }) => buildFeedback(readJson(DECISION), {
  verdicts: { 'opt-file': 'agree', 'opt-db': 'partly-agree' }, notes: {}, added: [], choices,
});
const checkDecision = (feedback) => {
  const p = join(tmp, `d-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(feedback));
  return check('pair', at(DECISION), p);
};
const history = (review) => {
  const p = join(tmp, `h-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify({ ...review, id: review.id + '-variant' }));
  return check('history', p, at(EARLIER));
};

test('decision example passes, and its choice round-trips', () => {
  assert.equal(check('review', at(DECISION)).status, 0, check('review', at(DECISION)).stdout);
  const f = decisionFeedback();
  assert.deepEqual(f.choices, [{ sectionId: 'storage', sectionLabel: 'Where the answers are kept', itemId: 'opt-db',
    title: 'Answers save to a hosted database as the reviewer works',
    recommended: { itemId: 'opt-file', title: 'The reviewer exports a file and sends it back' }, followedRecommendation: false }]);
  assert.equal(f.responses.find((r) => r.itemId === 'opt-db').affects[0].effect, 'contradicts', 'affects must travel into feedback');
  const r = checkDecision(f);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(checkDecision(decisionFeedback({})).status, 0, 'an unchosen section is valid (itemId null)');
});

const decisionFaults = {
  'choices are derived': (f) => { f.choices[0].followedRecommendation = true; },
  'every choice recorded': (f) => { delete f.choices; },
};
for (const [checkName, inject] of Object.entries(decisionFaults)) {
  test(`checker refuses: ${checkName}`, () => {
    const f = decisionFeedback(); inject(f);
    const r = checkDecision(f);
    assert.equal(r.status, 1, `expected a refusal\n${r.stdout}`);
    assert.match(r.stdout, new RegExp(`✗ ${checkName}:`), r.stdout);
  });
}

test('checker refuses a malformed choice', () => {
  const review = readJson(DECISION);
  review.sections[0].recommended.itemId = 'autosave-local';
  const p = join(tmp, 'bad-choice.json'); writeFileSync(p, JSON.stringify(review));
  const r = check('review', p);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /✗ choices well-formed:/, r.stdout);
});

test('history: earlier decisions must be quoted truthfully', () => {
  assert.equal(history(readJson(DECISION)).status, 0, history(readJson(DECISION)).stdout);
  const misquoted = readJson(DECISION);
  misquoted.items[1].affects[0].decision.verdict = 'disagree';
  const r = history(misquoted);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /✗ earlier decisions quoted truthfully:.*reviewer answered "agree"/, r.stdout);
  const unknown = readJson(DECISION);
  unknown.items[1].affects[0].decision.review = 'never-given';
  const w = history(unknown);
  assert.equal(w.status, 0, 'a decision we cannot verify is a warning, not an error');
  assert.match(w.stdout, /! decision not verified/, w.stdout);
});

// Agent-written text reaches the reviewer's browser. Every field must arrive as text, never markup.
// This covers what the renderer writes into the HTML itself (header) and the embedded data. Items are
// drawn by the page's script at runtime, so their escaping is verified in a real browser, not here.
test('page escapes every agent-written field', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const review = readJson(DECISION);
  Object.assign(review, { title: evil, subtitle: evil, audience: evil, ask: evil, afterwards: evil, intro: evil });
  review.sections[0].label = evil; review.sections[0].recommended.why = evil;
  for (const it of review.items) Object.assign(it, { title: evil, summary: evil, body: evil, ref: evil });
  review.items[1].affects[0].why = evil; review.items[1].affects[0].decision.title = evil;
  review.fields[0].label = evil; review.items[0].fields.assumes = evil;
  const src = join(tmp, 'evil.json'), out = join(tmp, 'evil.html');
  writeFileSync(src, JSON.stringify(review));
  spawnSync(process.execPath, [at('bin/render.mjs'), src, out]);
  const html = readFileSync(out, 'utf8');
  // The page's own code draws pictures (#60); what must never appear is the review's markup, unescaped.
  assert.doesNotMatch(html, /<img src=x onerror/i, 'raw markup from the review reached the static HTML');
  // the embedded data must not be able to close the script tag either
  assert.doesNotMatch(html.slice(html.indexOf('<script>')), /<\/script>[\s\S]*<\/script>/, 'embedded data closed the script tag');
});

// SKILL.md is what an agent actually reads. If it names a file or command that no longer exists,
// every agent using the skill fails at that step.
test('SKILL.md frontmatter is valid and every path it names exists', async () => {
  const { existsSync } = await import('node:fs');
  const skill = readFileSync(at('SKILL.md'), 'utf8');
  const front = skill.match(/^---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n/);
  assert.ok(front, 'frontmatter must be exactly name + description');
  assert.match(front[2], /^Use when /, 'description must start with "Use when"');
  assert.ok(front[0].length <= 1024, `frontmatter is ${front[0].length} chars, max 1024`);
  const paths = [...skill.matchAll(/<skill>\/([\w./-]+)/g)].map((m) => m[1])
    .concat([...skill.matchAll(/`([\w-]+\.example\.json)`/g)].map((m) => `examples/${m[1]}`));
  assert.ok(paths.length >= 4, `expected SKILL.md to reference its tools, found ${paths.length}`);
  for (const p of paths) assert.ok(existsSync(at(p.replace(/\/$/, ''))), `SKILL.md names ${p}, which does not exist`);
  for (const mode of skill.matchAll(/check\.mjs (\w+)/g))
    assert.ok(['review', 'feedback', 'pair', 'history', 'followup'].includes(mode[1]), `SKILL.md uses unknown checker mode "${mode[1]}"`);
});

// Licensing (LICENSING.md): a generated page must carry no obligation, so everything copied into it is
// MIT-0. An Apache-2.0 line inside a page means Apache code leaked into what users send to others.
test('licences: every file declares one, and generated pages are MIT-0 only', async () => {
  const { existsSync, readdirSync } = await import('node:fs');
  const spdx = (text) => text.split('\n').slice(0, 3).join('\n').match(/SPDX-License-Identifier: ([\w.-]+)/)?.[1];
  const code = ['bin', 'lib', 'test'].flatMap((d) => readdirSync(at(d)).filter((f) => f.endsWith('.mjs')).map((f) => `${d}/${f}`));
  const used = new Set();
  for (const f of code) {
    const id = spdx(readFileSync(at(f), 'utf8'));
    assert.ok(id, `${f} has no SPDX-License-Identifier in its first lines`);
    used.add(id);
  }
  assert.equal(spdx(readFileSync(at('lib/build-feedback.mjs'), 'utf8')), 'MIT-0', 'lib/build-feedback.mjs is copied into every page and must be MIT-0');

  const out = join(tmp, 'licence.html');
  spawnSync(process.execPath, [at('bin/render.mjs'), at(DECISION), out]);
  const page = readFileSync(out, 'utf8');
  const inPage = [...page.matchAll(/SPDX-License-Identifier: ([\w.-]+)/g)].map((m) => m[1]);
  assert.ok(inPage.length >= 2, 'the page must say it is MIT-0 (page header + inlined builder)');
  assert.deepEqual([...new Set(inPage)], ['MIT-0'], `generated page carries: ${[...new Set(inPage)].join(', ')}`);

  const toml = readFileSync(at('REUSE.toml'), 'utf8');
  const licenceFor = (glob) => toml.match(new RegExp(`path = \\[[^\\]]*"${glob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^\\]]*\\]\\nSPDX-License-Identifier = "([\\w.-]+)"`))?.[1];
  assert.equal(licenceFor('examples/**'), 'MIT-0', 'examples must be MIT-0');
  assert.equal(licenceFor('schemas/**'), 'CC0-1.0', 'schemas must be CC0-1.0');
  assert.equal(licenceFor('PROTOCOL.md'), 'CC0-1.0', 'the protocol must be CC0-1.0');
  for (const m of toml.matchAll(/SPDX-License-Identifier = "([\w.-]+)"/g)) used.add(m[1]);
  for (const id of used) assert.ok(existsSync(at(`LICENSES/${id}.txt`)), `${id} is used but LICENSES/${id}.txt is missing`);
});

// D031 — in a choose-one section that has a pick, unrated options are not gaps.
test('a pick answers its section: unrated options are not gaps', () => {
  const picked = decisionFeedback();                       // storage: opt-db; opt-both unrated
  assert.ok(!picked.gaps.includes('opt-both'), `opt-both should not be a gap once a pick exists: ${picked.gaps}`);
  assert.equal(picked.responses.find((r) => r.itemId === 'opt-both').sectionId, 'storage', 'responses carry sectionId');
  assert.equal(checkDecision(picked).status, 0, checkDecision(picked).stdout);
  const unpicked = decisionFeedback({});
  assert.ok(unpicked.gaps.includes('opt-both'), 'with no pick, unrated options stay gaps');
  assert.equal(checkDecision(unpicked).status, 0, checkDecision(unpicked).stdout);
  const lying = decisionFeedback(); lying.gaps.push('opt-both');
  assert.match(checkDecision(lying).stdout, /✗ gaps are derived:/, 'the checker must recompute gaps with the same rule');
});

// ── flows (v0.2 part 1a) ─────────────────────────────────────────────────────────────────────────
const FLOW = 'examples/flow-booking.review.json';
// A changed example is a new review, and gets its own id, as an agent's must (#38).
const ownId = (review) => ({ ...review, id: review.id + '-variant' });
const checkReviewObj = (review, ...extra) => {
  const p = join(tmp, `flow-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(ownId(review)));
  return check('review', p, ...extra);
};

test('flow example passes', () => {
  const r = check('review', at(FLOW), '--root', root);
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /! flow explains itself/, 'the worked example must explain itself fully');
});

// Every refusal must name the problem AND say what to do (D032).
const flowFaults = {
  'flow resolves': [(r) => { r.items[0].step.on = 'no-such-button'; }, /"no-such-button" is not a button, input or hotspot on "slot-list".*Point "on" at/],
  'flow has no orphans or dead ends': [(r) => { r.flow.screens.push({ id: 'orphan', title: 'Nobody gets here', end: true }); }, /unreachable from "slot-list": orphan.*Add a step that leads there, or remove it/],
  'screens are safe to show': [(r) => { r.flow.screens[0].image = { src: 'data:image/svg+xml;base64,PHN2Zz4=', alt: 'x' }; }, /image must be inline PNG, JPEG or WebP.*Convert it/],
  'layer entries honest': [(r) => { delete r.items[0].step.outcomes[0].system[0].ref; }, /marked exists but gives no ref.*Add the file:line, or mark it proposed/],
};
for (const [name, [inject, advice]] of Object.entries(flowFaults)) {
  test(`checker refuses: ${name}`, () => {
    const review = readJson(FLOW); inject(review);
    const r = checkReviewObj(review, '--root', root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, new RegExp(`✗ ${name}:`), r.stdout);
    assert.match(r.stdout, advice, `the message must say what to do\n${r.stdout}`);
  });
}

test('flow: a dead end must be marked, entry ids must be unique', () => {
  const deadEnd = readJson(FLOW);
  deadEnd.flow.screens.find((s) => s.id === 'too-late').end = false;
  assert.match(checkReviewObj(deadEnd, '--root', root).stdout, /no way out and not marked end: too-late/);
  const twice = readJson(FLOW);
  twice.items[0].step.outcomes[0].data[1].id = 'booking-row';
  const r = checkReviewObj(twice, '--root', root);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /book: entry id "booking-row" is used twice/);
});

test('flow explains itself: missing goal or canNow is a warning that says why it matters', () => {
  const review = readJson(FLOW);
  delete review.items[2].step.goal;
  delete review.items[0].step.outcomes[1].canNow;
  const r = checkReviewObj(review, '--root', root);
  assert.equal(r.status, 0, 'explanations are warnings, not errors');
  assert.match(r.stdout, /! flow explains itself:.*cancel has no goal\. Add why the person does it/);
  assert.match(r.stdout, /! flow explains itself:.*book → "Someone took it first" leaves the person with no next step\. Add canNow/);
});

test('checker refuses: references resolve', () => {
  const review = readJson(FLOW);
  review.items[0].step.outcomes[0].system[1].ref = 'test/fixtures/booking-app/src/booking.mjs:999';
  const r = checkReviewObj(review, '--root', root);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /✗ references resolve:.*has \d+ lines, the ref points at line 999\. Fix the line number/);
});

test('references never leave the project folder', () => {
  const review = readJson(FLOW);
  review.items[0].step.outcomes[0].system[1].ref = '../outside.mjs:1';
  const r = checkReviewObj(review, '--root', join(root, 'test'));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /✗ references resolve:.*points outside the project folder/);
});

test('without --root, references are a warning that says what to do', () => {
  const r = check('review', at(FLOW));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /! references not verified: \d+ reference\(s\) were not checked because no project folder was given\. Run again with --root <folder>\. Until then, a reference to code that does not exist would pass unnoticed\./);
});

// Reviews get forwarded. Fake secrets are assembled at runtime so no key-shaped string sits in a file.
test('checker refuses: no secrets, in any review, with advice', () => {
  const fakes = {
    'AWS access key': 'AKIA' + 'X'.repeat(16),
    'private key': '-----BEGIN ' + 'PRIVATE KEY-----',
    'credentials in a URL': 'postgres://app:' + 'hunter2' + '@db.internal/bookings',
    'GitHub token': 'gh' + 'p_' + 'a'.repeat(36),
  };
  for (const [what, secret] of Object.entries(fakes)) {
    for (const [file, inject] of [
      [FLOW, (r) => { r.items[0].step.outcomes[0].system[2].name = `Confirmation email via ${secret}`; }],
      [REVIEW, (r) => { r.items[0].body = `Log in with ${secret}`; }],
    ]) {
      const review = readJson(file); inject(review);
      const r = checkReviewObj(review, '--root', root);
      assert.equal(r.status, 1, `${what} in ${file} was not refused\n${r.stdout}`);
      assert.match(r.stdout, new RegExp(`✗ no secrets: looks like it contains: ${what}\\. Replace it with a placeholder`), r.stdout);
    }
  }
});

test('an inline screenshot never trips the secret check', () => {
  const review = readJson(FLOW);
  review.flow.screens[0].image = { src: 'data:image/png;base64,' + 'AKIA' + 'Q'.repeat(16) + 'AAAA', alt: 'Time list' };
  review.flow.screens[0].hotspots = [{ id: 'time-list-area', x: 10, y: 20, w: 80, h: 50 }];
  const r = checkReviewObj(review, '--root', root);
  assert.equal(r.status, 0, r.stdout);
});

// ── layer verdicts (D006, D033) ──
const flowFeedback = () => buildFeedback(readJson(FLOW), {
  verdicts: { book: 'agree', back: 'agree' }, notes: {}, added: [],
  layerVerdicts: {
    'book/booking-row': { verdict: 'disagree', note: 'Start as pending until the email is sent.' },
    'book/reserve': { verdict: 'agree' },
    'book/no-such-entry': { verdict: 'agree' },                     // ignored: points at nothing
  },
});
const checkFlowPair = (f) => {
  const p = join(tmp, `ff-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(f));
  return check('pair', at(FLOW), p, '--root', root);
};

test('layer verdicts round-trip, echo their entry, and a negative one is a gap', () => {
  const f = flowFeedback();
  assert.deepEqual(f.layerVerdicts.map((v) => v.id), ['book/booking-row', 'book/reserve']);
  assert.deepEqual(f.layerVerdicts[0], {
    id: 'book/booking-row', stepId: 'book', entryId: 'booking-row', stepTitle: 'Taps Book 10:00', layer: 'data',
    outcome: 'Slot is free', entry: 'bookings insert: starts_at — → 2026-10-03T08:00:00Z, status — → confirmed',
    verdict: 'disagree', note: 'Start as pending until the email is sent.' });
  assert.equal(f.layerVerdicts[1].entry, 'component reserve() · exists · test/fixtures/booking-app/src/booking.mjs:6');
  assert.ok(f.gaps.includes('book/booking-row') && !f.gaps.includes('book/reserve'), `gaps: ${f.gaps}`);
  const r = checkFlowPair(f);
  assert.equal(r.status, 0, r.stdout);
});

const layerFaults = {
  'layer verdicts in vocabulary': [(f) => { f.layerVerdicts[1].verdict = 'meh'; }, /book\/reserve=meh.*Use one of/],
  'gaps are derived': [(f) => { f.gaps = f.gaps.filter((g) => g !== 'book/booking-row'); }, /gap-first list/],
  'layer verdicts echo the review': [(f) => { f.layerVerdicts[0].entry = 'bookings insert: something else'; }, /book\/booking-row: the echoed entry does not match the review.*Rebuild the feedback/],
};
for (const [name, [inject, advice]] of Object.entries(layerFaults)) {
  test(`checker refuses (layers): ${name}`, () => {
    const f = flowFeedback(); inject(f);
    const r = checkFlowPair(f);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, new RegExp(`✗ ${name}:`), r.stdout);
    assert.match(r.stdout, advice, r.stdout);
  });
}

// ── nested parts / sub-processes (D038) ──
const partFaults = {
  'unknown part': [(r) => { r.items[0].step.part = 'no-such-part'; }, /book: part "no-such-part" does not exist\. Use one of: booking, book-slot, cancel-booking/],
  'unknown parent': [(r) => { r.flow.parts[1].parent = 'nowhere'; }, /book-slot: parent "nowhere" does not exist/],
  'nesting loop': [(r) => { r.flow.parts[0].parent = 'book-slot'; }, /parts nest in a loop: booking → book-slot → booking\. Break the loop/],
  'empty part': [(r) => { r.flow.parts.push({ id: 'pay', title: 'Pay', parent: 'booking' }); }, /pay has no steps\. Give it a step, or remove it/],
  'step without part': [(r) => { delete r.items[1].step.part; }, /back has no part\. Name the part it belongs to/],
  'duplicate part id': [(r) => { r.flow.parts[2].id = 'book-slot'; }, /part id "book-slot" is used twice/],
};
for (const [what, [inject, advice]] of Object.entries(partFaults)) {
  test(`checker refuses parts: ${what}`, () => {
    const review = readJson(FLOW); inject(review);
    const r = checkReviewObj(review, '--root', root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /✗ flow parts resolve:/, r.stdout);
    assert.match(r.stdout, advice, r.stdout);
  });
}
test('a flow without parts needs none', () => {
  const review = readJson(FLOW);
  delete review.flow.parts;
  delete review.diagrams;   // its chart links a part; linking is tested separately
  for (const it of review.items) delete it.step.part;
  assert.equal(checkReviewObj(review, '--root', root).status, 0);
});

// ── screen component catalogue (v0.2 part 1b, D034) ──
const withBlock = (screenId, block, edit) => {
  const review = readJson(FLOW);
  review.flow.screens.find((s) => s.id === screenId).blocks.push(block);
  if (edit) edit(review);
  return review;
};

test('a step can point at an id nested inside a component', () => {
  const review = withBlock('booked', { type: 'dialog', title: 'Cancel this booking?', actions: [{ id: 'confirm-cancel', label: 'Cancel booking' }, { id: 'keep', label: 'Keep it' }] },
    (r) => { r.items.find((i) => i.id === 'cancel').step.on = 'confirm-cancel'; });
  const r = checkReviewObj(review, '--root', root);
  assert.equal(r.status, 0, r.stdout);
});

test('checker refuses: components are consistent (ids unique per screen, nested included)', () => {
  const review = withBlock('booked', { type: 'dialog', title: 'Sure?', actions: [{ id: 'cancel', label: 'Yes' }] });
  const r = checkReviewObj(review, '--root', root);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /✗ components are consistent:.*booked: id "cancel" is used twice\. Rename one/);
});

test('an unknown component type lists the whole catalogue', () => {
  const r = checkReviewObj(withBlock('booked', { type: 'carousel' }), '--root', root);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /unknown block type "carousel"\. Use one of: heading, text, input, button, list, header, tab-bar, tabs, side-menu, breadcrumb, checkbox, radio-group, switch, select, date-time, search, stepper, slider, card, chip, image, table, avatar, dialog, toast, banner, empty-state, progress/);
});

// One fault per error rule, by group. Each must fail the check AND say what to do (D032).
const componentFaults = {
  navigation: [
    [{ type: 'list', items: [] }, /booked \(list\): has no items\. Add at least one/],
    [{ type: 'tab-bar', items: [{ id: 't1', label: 'Home' }], active: 't1' }, /booked \(tab-bar\): has 1 item\(s\)\. Use 2 to 5/],
    [{ type: 'tab-bar', items: [{ id: 't1', label: 'Home' }, { id: 't2', label: 'Bookings' }], active: 'profile' }, /booked \(tab-bar\): active "profile" is not one of its items \(t1, t2\)\. Set active to one of them/],
    [{ type: 'tabs', items: [{ id: 'up', label: 'Upcoming' }], active: 'up' }, /booked \(tabs\): has 1 item\(s\)\. Use at least 2/],
    [{ type: 'side-menu', items: [{ id: 'm1', label: 'Slots' }], active: 'staff', open: true }, /booked \(side-menu\): active "staff" is not one of its items/],
    [{ type: 'breadcrumb', items: ['Venues'] }, /booked \(breadcrumb\): has 1 level\. Show at least 2/],
  ],
  input: [
    [{ type: 'radio-group', id: 'pay', label: 'Pay', options: [{ id: 'now', label: 'Now' }] }, /booked\.pay \(radio-group\): has 1 option\(s\)\. Give at least 2/],
    [{ type: 'radio-group', id: 'pay', label: 'Pay', options: [{ id: 'now', label: 'Now' }, { id: 'venue', label: 'At the venue' }], selected: 'later' }, /booked\.pay \(radio-group\): selected "later" is not one of its options/],
    [{ type: 'select', id: 'guests', label: 'Guests', options: [] }, /booked\.guests \(select\): has no options/],
    [{ type: 'select', id: 'guests', label: 'Guests', options: ['1', '2'], value: '9' }, /booked\.guests \(select\): value "9" is not one of its options/],
    [{ type: 'date-time', id: 'when', label: 'When', mode: 'date-time', value: '2026-10-03 10:00' }, /booked\.when \(date-time\): "2026-10-03 10:00" is not a UTC date-time like 2026-10-03T08:00:00Z\. Store times in UTC/],
    [{ type: 'date-time', id: 'day', label: 'Day', mode: 'date', value: '03.10.2026' }, /booked\.day \(date-time\): "03\.10\.2026" is not a date like 2026-10-03/],
    [{ type: 'date-time', id: 'at', label: 'At', mode: 'time', value: '10' }, /booked\.at \(date-time\): "10" is not a time like 10:00/],
    [{ type: 'stepper', id: 'guests', label: 'Guests', value: 12, min: 1, max: 8 }, /booked\.guests \(stepper\): value 12 is outside 1–8\. Set value within min and max/],
    [{ type: 'slider', id: 'price', label: 'Price', value: 5, min: 10, max: 5 }, /booked\.price \(slider\): min 10 is above max 5/],
  ],
  content: [
    [{ type: 'table', columns: ['Time', 'Name', 'Status'], rows: [['10:00', 'A. K.', 'confirmed'], ['11:00', 'B. L.']] }, /booked \(table\): row 2 has 2 cell\(s\) but there are 3 columns\. Fill every column/],
  ],
  feedback: [
    [{ type: 'dialog', title: 'Cancel?', actions: [] }, /booked \(dialog\): has no actions\. Give it at least one way out/],
    [{ type: 'progress', value: 140 }, /booked \(progress\): value 140 is outside 0–100/],
  ],
};
for (const [group, faults] of Object.entries(componentFaults)) {
  test(`checker refuses component faults: ${group}`, () => {
    for (const [block, advice] of faults) {
      const r = checkReviewObj(withBlock('booked', block), '--root', root);
      assert.equal(r.status, 1, `${JSON.stringify(block)} was not refused\n${r.stdout}`);
      assert.match(r.stdout, /✗ components are consistent:/, r.stdout);
      assert.match(r.stdout, advice, r.stdout);
    }
  });
}

test('components explain themselves: warnings, not errors', () => {
  const review = withBlock('booked', { type: 'banner', tone: 'negative', text: 'Payment failed.' });
  review.flow.screens.find((s) => s.id === 'booked').blocks.push({ type: 'empty-state', text: 'No bookings yet.' });
  const r = checkReviewObj(review, '--root', root);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /! components explain themselves:.*booked \(banner\): a negative banner without canNow\. Say what the person can do/);
  assert.match(r.stdout, /booked \(empty-state\): no action\. Offer the next step/);
});

// ── drawing components (v0.2 part 2) ─────────────────────────────────────────────────────────────
// One sample per type carrying EVERY property its schema defines, so a new field cannot go untested.
const SAMPLES = {
  heading: { type: 'heading', text: 'Saturday 3 October' },
  text: { type: 'text', text: 'Pick a time that suits you.' },
  input: { type: 'input', id: 'name', label: 'Name', value: 'Alex', placeholder: 'Your name' },
  button: { type: 'button', id: 'go', label: 'Continue' },
  list: { type: 'list', items: ['10:00', '11:00'] },
  header: { type: 'header', title: 'Your booking', back: { id: 'back-home' }, actions: [{ id: 'help', label: 'Help' }] },
  'tab-bar': { type: 'tab-bar', items: [{ id: 'home', label: 'Home' }, { id: 'mine', label: 'Bookings' }], active: 'home' },
  tabs: { type: 'tabs', items: [{ id: 'up', label: 'Upcoming' }, { id: 'past', label: 'Past' }], active: 'up' },
  'side-menu': { type: 'side-menu', items: [{ id: 'slots', label: 'Slots' }, { id: 'staff', label: 'Staff' }], active: 'slots', open: true },
  breadcrumb: { type: 'breadcrumb', items: ['Venues', 'Berlin'] },
  checkbox: { type: 'checkbox', id: 'terms', label: 'I accept the cancellation rules', checked: true },
  'radio-group': { type: 'radio-group', id: 'pay', label: 'Payment', options: [{ id: 'now', label: 'Pay now' }, { id: 'venue', label: 'At the venue' }], selected: 'now' },
  switch: { type: 'switch', id: 'remind', label: 'Email me a reminder', on: true },
  select: { type: 'select', id: 'guests-select', label: 'Guests', options: ['1', '2'], value: '2' },
  'date-time': { type: 'date-time', id: 'when', label: 'When', mode: 'date-time', value: '2026-10-03T08:00:00Z' },
  search: { type: 'search', id: 'find', placeholder: 'Search venues', value: 'yoga' },
  stepper: { type: 'stepper', id: 'guests', label: 'Guests', value: 2, min: 1, max: 8, step: 1 },
  slider: { type: 'slider', id: 'price', label: 'Price up to', value: 30, min: 10, max: 60 },
  card: { type: 'card', id: 'slot', title: '10:00 · Studio A', text: '2 places left', actions: [{ id: 'book', label: 'Book 10:00' }] },
  chip: { type: 'chip', text: 'Confirmed', tone: 'positive' },
  image: { type: 'image', alt: 'Studio A', caption: 'Bright room, 12 mats' },
  table: { type: 'table', columns: ['Time', 'Status'], rows: [['10:00', 'confirmed']] },
  avatar: { type: 'avatar', name: 'Alex Kim' },
  dialog: { type: 'dialog', id: 'confirm', title: 'Cancel this booking?', text: 'You get store credit.', actions: [{ id: 'yes', label: 'Cancel booking' }] },
  toast: { type: 'toast', text: 'Booking saved' },
  banner: { type: 'banner', tone: 'negative', text: 'Payment failed.', because: 'The card was declined', canNow: 'Try another card' },
  'empty-state': { type: 'empty-state', text: 'No bookings yet.', action: { id: 'find-time', label: 'Find a time' } },
  progress: { type: 'progress', label: 'Saving', value: 40 },
};
const ENUM_KEYS = new Set(['type', 'mode', 'tone']);

test('every component type has a sample carrying every property its schema defines', () => {
  const defs = readJson('schemas/review.v1.schema.json').$defs;
  const types = defs.block.oneOf.map((x) => x.$ref.split('/block-')[1]);
  assert.deepEqual(Object.keys(SAMPLES).sort(), [...types].sort(), 'SAMPLES must cover exactly the catalogue');
  for (const t of types) {
    const missing = Object.keys(defs[`block-${t}`].properties).filter((k) => !(k in SAMPLES[t]));
    assert.deepEqual(missing, [], `sample for ${t} lacks: ${missing.join(', ')}`);
  }
});

test('drawBlock draws every type and shows its text', async () => {
  const { drawBlock } = await import('../lib/draw-components.mjs');
  for (const [type, block] of Object.entries(SAMPLES)) {
    const html = drawBlock(block, { targets: new Set() });
    assert.equal(typeof html, 'string', type);
    const texts = [];
    JSON.stringify(block, (k, v) => { if (typeof v === 'string' && !ENUM_KEYS.has(k) && k !== 'id' && k !== 'active' && k !== 'selected') texts.push(v); return v; });
    for (const t of texts) assert.ok(html.includes(t), `${type}: "${t}" is not shown\n${html}`);
  }
});

test('drawBlock turns only step targets into buttons', async () => {
  const { drawBlock } = await import('../lib/draw-components.mjs');
  const card = drawBlock(SAMPLES.card, { targets: new Set(['book']) });
  assert.match(card, /<button type="button"[^>]*data-target="book"[^>]*>Book 10:00<\/button>/);
  const untargeted = drawBlock(SAMPLES.card, { targets: new Set() });
  assert.doesNotMatch(untargeted, /data-target|<button/);
  const dialog = drawBlock(SAMPLES.dialog, { targets: new Set(['yes']) });
  assert.match(dialog, /data-target="yes"/);
});

test('drawBlock escapes every text field of every type', async () => {
  const { drawBlock } = await import('../lib/draw-components.mjs');
  const evil = '<img src=x onerror=alert(1)>"\'';
  for (const [type, sample] of Object.entries(SAMPLES)) {
    const hostile = JSON.parse(JSON.stringify(sample), function (k, v) { return typeof v === 'string' && !ENUM_KEYS.has(k) ? evil : v; });
    for (const targets of [new Set(), new Set([evil])]) {
      const html = drawBlock(hostile, { targets });
      assert.doesNotMatch(html, /<img/i, `${type} put raw markup into the page\n${html}`);
      assert.doesNotMatch(html, /="[^"]*"'[^"]*"/, `${type} let a quote break out of an attribute\n${html}`);
    }
  }
});

test('flow page inlines the drawing and feedback code verbatim, and fetches nothing', () => {
  const out = join(tmp, 'flow.html');
  const r = spawnSync(process.execPath, [at('bin/render.mjs'), at(FLOW), out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(out, 'utf8');
  for (const lib of ['lib/draw-components.mjs', 'lib/build-feedback.mjs', 'lib/layout.mjs', 'lib/draw-diagram.mjs'])
    assert.ok(html.includes(readFileSync(at(lib), 'utf8').replace(/^export function/gm, 'function').replace(/^import .*\n/gm, '')), `${lib} is not inlined verbatim`);
  offline(html, 'the flow page');
  assert.match(html, /id="upanel"/);
});

// D051 — in a doubts section (kind: challenge), agree means the concern is real: that is the gap.
test('doubt sections: agree is the gap, disagree is not', () => {
  const review = readJson(DECISION);
  review.sections.find((s) => s.id === 'challenge').kind = 'challenge';
  const f = buildFeedback(review, { verdicts: { 'challenge-forgotten-file': 'agree', 'challenge-browser-storage': 'disagree' }, notes: {}, added: [], choices: { storage: 'opt-file' } });
  assert.ok(f.gaps.includes('challenge-forgotten-file'), `a real concern must be a gap: ${f.gaps}`);
  assert.ok(!f.gaps.includes('challenge-browser-storage'), `a rejected concern must not be a gap: ${f.gaps}`);
  assert.equal(f.responses.find((r) => r.itemId === 'challenge-browser-storage').sectionKind, 'challenge');
  const p = join(tmp, 'doubts.json'), fp = join(tmp, 'doubts.feedback.json');
  writeFileSync(p, JSON.stringify(review)); writeFileSync(fp, JSON.stringify(f));
  assert.equal(check('pair', p, fp).status, 0, check('pair', p, fp).stdout);
  f.gaps.push('challenge-browser-storage'); writeFileSync(fp, JSON.stringify(f));
  assert.match(check('pair', p, fp).stdout, /✗ gaps are derived:/);
});

// ── what is there and what is missing (D047) ──
const basisFaults = {
  'exists without a basis': [(r) => { r.flow.parts[1].status = 'exists'; delete r.flow.parts[1].basis; }, /claims have a basis:.*part book-slot: marked exists but has no basis\. Add basis/],
  'code without a ref': [(r) => { r.flow.parts[1].status = 'exists'; r.flow.parts[1].basis = { kind: 'code' }; }, /part book-slot: basis is code but gives no ref\. Add the file:line/],
  'prd without a ref': [(r) => { r.items[0].step.basis = { kind: 'prd' }; }, /step book: basis is prd but gives no ref\. Name the section or document/],
  'assumption without a note': [(r) => { r.items[0].step.basis = { kind: 'assumption' }; }, /step book: basis is assumption but has no note\. Say who said it or what is assumed/],
};
for (const [what, [inject, advice]] of Object.entries(basisFaults)) {
  test(`checker refuses: ${what}`, () => {
    const review = readJson(FLOW); inject(review);
    const r = checkReviewObj(review, '--root', root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, advice, r.stdout);
  });
}
test('checker refuses: suggestions stay suggestions', () => {
  const review = readJson(FLOW);
  review.items[0].step.status = 'suggested';
  review.items[0].step.basis = { kind: 'conversation', note: 'Product owner asked for it' };
  const r = checkReviewObj(review, '--root', root);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /✗ suggestions stay suggestions:.*book\/capacity-guard: the step is suggested but this entry is marked exists\. Mark it proposed/);
});
test('a code basis is proven like any reference', () => {
  const review = readJson(FLOW);
  Object.assign(review.flow.parts[1], { status: 'exists', basis: { kind: 'code', ref: 'test/fixtures/booking-app/src/booking.mjs:6' } });
  assert.equal(checkReviewObj(review, '--root', root).status, 0, checkReviewObj(review, '--root', root).stdout);
  review.flow.parts[1].basis.ref = 'test/fixtures/booking-app/src/booking.mjs:400';
  assert.match(checkReviewObj(review, '--root', root).stdout, /✗ references resolve:.*part book-slot/);
});

// ── flow charts (v0.2 part 3b) ──
const bookingChart = () => ({
  id: 'booking-process', kind: 'flowchart', title: 'What happens when someone books',
  lanes: [{ id: 'customer', title: 'Customer' }, { id: 'system', title: 'Booking system' }],
  nodes: [
    { id: 'start', kind: 'start', lane: 'customer', label: 'Wants a class' },
    { id: 'tap-book', kind: 'user-action', lane: 'customer', label: 'Taps Book', step: 'book' },
    { id: 'free', kind: 'decision', lane: 'system', label: 'Slot still free?' },
    { id: 'reserve', kind: 'system-action', lane: 'system', label: 'Reserve the slot', icon: 'calendar', part: 'book-slot' },
    { id: 'mail', kind: 'notification', lane: 'system', label: 'Confirmation email', icon: 'envelope' },
    { id: 'done', kind: 'end', lane: 'customer', label: 'Booked', component: { type: 'toast', text: 'Booking saved' } },
    { id: 'taken', kind: 'end-failed', lane: 'customer', label: 'Slot taken' },
  ],
  edges: [
    { from: 'start', to: 'tap-book' }, { from: 'tap-book', to: 'free' },
    { from: 'free', to: 'reserve', kind: 'conditional', label: 'yes' },
    { from: 'free', to: 'taken', kind: 'conditional', label: 'no' },
    { from: 'reserve', to: 'mail' }, { from: 'mail', to: 'done', kind: 'message' },
  ],
});
const withChart = (edit) => { const r = readJson(FLOW); const d = bookingChart(); if (edit) edit(d, r); r.diagrams = [d]; return r; };

test('a written flow chart passes', () => {
  const r = checkReviewObj(withChart(), '--root', root);
  assert.equal(r.status, 0, r.stdout);
});

const chartFaults = {
  'diagrams resolve': [
    [(d) => { d.edges[0].to = 'nowhere'; }, /booking-process: edge start → nowhere points at a node that does not exist\. Use one of/],
    [(d) => { d.nodes[3].icon = 'rocket'; }, /booking-process\.reserve: unknown icon "rocket"\. Use one of: envelope/],
    [(d) => { d.nodes[1].step = 'nope'; }, /booking-process\.tap-book: step "nope" is not a step in this review/],
    [(d) => { d.nodes[3].part = 'nope'; }, /booking-process\.reserve: part "nope" is not a part of this flow/],
    [(d) => { d.nodes[2].id = 'tap-book'; }, /booking-process: node id "tap-book" is used twice/],
    [(d) => { d.nodes[0].lane = 'staff'; }, /booking-process\.start: lane "staff" does not exist/],
    [(d) => { d.nodes[2].kind = 'rhombus'; }, /booking-process\.free: unknown kind "rhombus"/],
  ],
  'diagrams make sense': [
    [(d) => { d.nodes = d.nodes.filter((n) => !n.kind.startsWith('end')); d.edges = d.edges.filter((e) => !['done', 'taken'].includes(e.to)); }, /booking-process: has no end\. Add an end node/],
    [(d) => { d.nodes.push({ id: 'orphan', kind: 'process', label: 'Nobody gets here', lane: 'system' }); }, /booking-process\.orphan: can't be reached from a start\. Connect it, or remove it/],
    [(d) => { d.edges = d.edges.filter((e) => e.to !== 'taken'); d.nodes = d.nodes.filter((n) => n.id !== 'taken'); }, /booking-process\.free: a decision needs at least two ways out/],
    [(d) => { delete d.edges[2].label; }, /booking-process\.free: the way out to reserve has no label\. Say which answer leads there/],
    [(d) => { d.edges.push({ from: 'mail', to: 'start' }); }, /booking-process\.start: a start can't have arrows coming in/],
    [(d) => { d.edges.push({ from: 'done', to: 'mail' }); }, /booking-process\.done: an end can't have arrows going out/],
    [(d) => { d.edges.push({ from: 'reserve', to: 'mail', kind: 'message' }); d.edges = d.edges.filter((e, i) => i !== 4); }, /booking-process: message reserve → mail stays inside one lane\. Use a sequence arrow/],
  ],
  "diagram pins don't collide": [
    [(d) => { d.nodes[2].col = 2; d.nodes[2].row = 0; d.nodes[3].col = 2; d.nodes[3].row = 0; }, /booking-process: free and reserve are both pinned to column 2, row 0\. Move one/],
  ],
};
for (const [check, faults] of Object.entries(chartFaults)) {
  test(`checker refuses chart faults: ${check}`, () => {
    for (const [inject, advice] of faults) {
      const r = checkReviewObj(withChart(inject), '--root', root);
      assert.equal(r.status, 1, `not refused: ${advice}\n${r.stdout}`);
      assert.match(r.stdout, new RegExp(`✗ ${check}:`), r.stdout);
      assert.match(r.stdout, advice, r.stdout);
    }
  });
}

// ── layout (D052) ──
const overlaps = (boxes) => {
  const list = Object.entries(boxes);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [a, A] = list[i], [b, B] = list[j];
    if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) return `${a} overlaps ${b}`;
  }
  return null;
};

test('layout: deterministic, columns by distance from the start, rows by lane', async () => {
  const { layout } = await import('../lib/layout.mjs');
  const chart = bookingChart();
  const a = layout(chart), b = layout(bookingChart());
  assert.deepEqual(a, b, 'the same diagram must always get the same layout');
  const col = Object.fromEntries(Object.entries(a.nodes).map(([id, n]) => [id, n.col]));
  assert.deepEqual(col, { start: 0, 'tap-book': 1, free: 2, reserve: 3, mail: 4, done: 5, taken: 3 });
  const band = Object.fromEntries(a.lanes.map((l) => [l.id, l]));
  for (const n of chart.nodes) {
    const box = a.nodes[n.id], l = band[n.lane];
    assert.ok(box.y >= l.y && box.y + box.h <= l.y + l.h, `${n.id} sits outside its lane ${n.lane}`);
  }
  assert.equal(overlaps(a.nodes), null);
  assert.ok(a.width > 0 && a.height > 0);
});

test('layout: loops are routed underneath and pins are respected', async () => {
  const { layout } = await import('../lib/layout.mjs');
  const chart = bookingChart();
  chart.nodes.push({ id: 'retry', kind: 'retry', lane: 'system', label: 'Try again' });
  chart.edges.push({ from: 'mail', to: 'retry' }, { from: 'retry', to: 'reserve' });
  const l = layout(chart);
  const back = l.edges.filter((e) => e.back).map((e) => `${e.from}→${e.to}`);
  assert.deepEqual(back, ['retry→reserve'], 'the loop edge is the one routed back');
  assert.ok(l.edges.find((e) => e.back).points.some(([, y]) => y >= l.height - 40), 'a loop is drawn underneath the boxes');
  assert.equal(overlaps(l.nodes), null);
  chart.nodes.find((n) => n.id === 'free').col = 6;
  const pinned = layout(chart);
  assert.equal(pinned.nodes.free.col, 6, 'a pinned column is kept');
  assert.equal(overlaps(pinned.nodes), null);
});

test('layout: 200 random diagrams, never an overlap', async () => {
  const { layout } = await import('../lib/layout.mjs');
  let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let t = 0; t < 200; t++) {
    const laneCount = 1 + Math.floor(rnd() * 4);
    const lanes = Array.from({ length: laneCount }, (_, i) => ({ id: `l${i}`, title: `Lane ${i}` }));
    const n = 2 + Math.floor(rnd() * 24);
    const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, kind: i === 0 ? 'start' : 'process', lane: `l${Math.floor(rnd() * laneCount)}`, label: `Node ${i}` }));
    const edges = [];
    for (let i = 1; i < n; i++) if (rnd() < 0.9) edges.push({ from: `n${Math.floor(rnd() * i)}`, to: `n${i}` });
    for (let k = 0; k < 3; k++) if (rnd() < 0.3) edges.push({ from: `n${Math.floor(rnd() * n)}`, to: `n${Math.floor(rnd() * n)}` });
    const l = layout({ id: `r${t}`, kind: 'flowchart', title: 'random', lanes, nodes, edges });
    assert.equal(overlaps(l.nodes), null, `random diagram ${t}: ${overlaps(l.nodes)}`);
    assert.equal(Object.keys(l.nodes).length, n, `random diagram ${t} lost a node`);
  }
});

// ── drawing diagrams (our own shapes and icons, D041) ──
const NODE_KINDS_ALL = readJson('schemas/review.v1.schema.json').$defs.diagramNode.properties.kind.enum;
const ICONS_ALL = readJson('schemas/review.v1.schema.json').$defs.diagramNode.properties.icon.enum;

test('drawDiagram draws every node kind and every icon, as SVG', async () => {
  const { drawDiagram } = await import('../lib/draw-diagram.mjs');
  const nodes = NODE_KINDS_ALL.map((kind, i) => ({ id: `n${i}`, kind: i === 0 ? 'start' : kind, label: `${kind} label`, icon: ICONS_ALL[i % ICONS_ALL.length] }));
  const edges = nodes.slice(1).map((n, i) => ({ from: `n${i}`, to: n.id, kind: ['sequence', 'conditional', 'default', 'message', 'association'][i % 5], label: `edge ${i}` }));
  const svg = drawDiagram({ id: 'all', kind: 'flowchart', title: 'Every kind', nodes, edges });
  assert.match(svg, /^<svg[^>]*role="group"[^>]*aria-label="Every kind"/);
  for (const [i, kind] of NODE_KINDS_ALL.entries()) {
    if (i === 0) continue;
    assert.match(svg, new RegExp(`data-node="n${i}"[^>]*class="[^"]*dg-k-${kind}`), `kind ${kind} not drawn`);
  }
  for (const icon of ICONS_ALL) assert.match(svg, new RegExp(`data-icon="${icon}"`), `icon ${icon} not drawn`);
  assert.doesNotMatch(svg, /https?:\/\//, 'no URLs, not even an SVG namespace');
});

test('drawDiagram shows components inside nodes, links steps, and marks the selected one', async () => {
  const { drawDiagram } = await import('../lib/draw-diagram.mjs');
  const svg = drawDiagram(bookingChart(), { selected: 'book' });
  assert.match(svg, /data-node="done"[\s\S]*<foreignObject[\s\S]*Booking saved/, 'the toast component is drawn inside the end node');
  assert.match(svg, /data-node="tap-book"[^>]*data-step="book"[^>]*aria-current="true"/, 'the selected step is marked on its node');
  assert.match(svg, /data-node="free"[^>]*aria-current="false"/);
  assert.match(svg, /data-node="tap-book"[^>]*tabindex="0"/, 'a node linked to a step can be reached by keyboard');
});

test('drawDiagram escapes every text: title, lanes, labels, edge labels, components, ids', async () => {
  const { drawDiagram } = await import('../lib/draw-diagram.mjs');
  const evil = '<img src=x onerror=alert(1)>"\'';
  const d = bookingChart();
  d.title = evil; d.lanes[0].title = evil;
  for (const n of d.nodes) { n.label = evil; }
  d.nodes[1].step = evil; d.nodes[5].component = { type: 'dialog', title: evil, text: evil, actions: [{ id: 'a', label: evil }] };
  for (const e of d.edges) e.label = evil;
  const svg = drawDiagram(d, { selected: evil });
  assert.doesNotMatch(svg, /<img/i);
  assert.doesNotMatch(svg, /="[^"]*"'[^"]*"/, 'a quote broke out of an attribute');
});

// ── computed charts: exactly the flow, nothing added or lost ──
test('the user-flow chart is computed from the flow and matches it exactly', async () => {
  const { flowAsDiagram, drawDiagram } = await import('../lib/draw-diagram.mjs');
  const review = readJson(FLOW);
  const steps = review.items.filter((i) => i.step);
  const d = flowAsDiagram(review);
  const kinds = (k) => d.nodes.filter((n) => n.kind === k);
  assert.equal(kinds('start').length, 1);
  assert.equal(d.nodes.filter((n) => n.step).length, steps.length, 'one node per step');
  assert.deepEqual(d.nodes.filter((n) => n.step).map((n) => n.step), steps.map((s) => s.id));
  const screenNodes = d.nodes.filter((n) => n.kind === 'screen');
  assert.equal(screenNodes.length, review.flow.screens.length, 'one node per screen');
  const outcomes = steps.reduce((n, s) => n + s.step.outcomes.length, 0);
  const endings = review.flow.screens.filter((s) => s.end || !steps.some((x) => x.step.from === s.id)).length;
  assert.equal(d.edges.length, 1 + steps.length + outcomes + endings,
    'start → first screen, screen → each step, step → each outcome screen, each ending → End');
  for (const s of steps) for (const o of s.step.outcomes)
    assert.ok(d.edges.some((e) => e.from === `step:${s.id}` && e.to === `screen:${o.to}` && (s.step.outcomes.length === 1 || e.label === o.label)), `${s.id} → ${o.to} missing`);
  assert.match(drawDiagram(d, { selected: 'book' }), /data-step="book"[^>]*aria-current="true"/);
});

// A line that runs through an unrelated box makes a chart unreadable. Found by looking at the first render.
const crossings = (l) => {
  const hits = [];
  for (const e of l.edges) {
    for (let i = 1; i < e.points.length; i++) {
      const [ax, ay] = e.points[i - 1], [bx, by] = e.points[i];
      const [x1, x2] = [Math.min(ax, bx), Math.max(ax, bx)], [y1, y2] = [Math.min(ay, by), Math.max(ay, by)];
      for (const [id, b] of Object.entries(l.nodes)) {
        if (id === e.from || id === e.to) continue;
        if (x1 < b.x + b.w - 1 && x2 > b.x + 1 && y1 < b.y + b.h - 1 && y2 > b.y + 1) hits.push(`${e.from}→${e.to} crosses ${id}`);
      }
    }
  }
  return hits;
};
test('layout: no line runs through an unrelated box (example, user-flow chart, 200 random diagrams)', async () => {
  const { layout } = await import('../lib/layout.mjs');
  const { flowAsDiagram } = await import('../lib/draw-diagram.mjs');
  assert.deepEqual(crossings(layout(bookingChart())), []);
  assert.deepEqual(crossings(layout(flowAsDiagram(readJson(FLOW)))), []);
  let seed = 11; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let t = 0; t < 200; t++) {
    const laneCount = 1 + Math.floor(rnd() * 3);
    const lanes = Array.from({ length: laneCount }, (_, i) => ({ id: `l${i}`, title: `Lane ${i}` }));
    const n = 2 + Math.floor(rnd() * 20);
    const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, kind: i === 0 ? 'start' : 'process', lane: `l${Math.floor(rnd() * laneCount)}` }));
    const edges = [];
    for (let i = 1; i < n; i++) edges.push({ from: `n${Math.floor(rnd() * i)}`, to: `n${i}` });
    for (let k = 0; k < 3; k++) if (rnd() < 0.4) edges.push({ from: `n${Math.floor(rnd() * n)}`, to: `n${Math.floor(rnd() * n)}` });
    assert.deepEqual(crossings(layout({ id: `r${t}`, kind: 'flowchart', title: 'r', lanes, nodes, edges })), [], `random diagram ${t}`);
  }
});

test('layout: the End stands alone in the last column, like the Start in the first (D077)', async () => {
  const { layout } = await import('../lib/layout.mjs');
  const { flowAsDiagram } = await import('../lib/draw-diagram.mjs');
  const L = layout(flowAsDiagram(readJson(FLOW)));
  const cols = Object.values(L.nodes).map((b) => b.col), last = Math.max(...cols);
  assert.equal(L.nodes.end.col, last);
  assert.deepEqual(Object.entries(L.nodes).filter(([, b]) => b.col === last).map(([id]) => id), ['end']);
  assert.deepEqual(Object.entries(L.nodes).filter(([, b]) => b.col === 0).map(([id]) => id), ['start']);
});

// A label drawn over a box hides both (D075). Each label's box, as wide as layout reckons it, must touch no node.
test('layout: no edge label covers a box (example, user-flow chart, 200 random diagrams with labels)', async () => {
  const { layout, labelWidth } = await import('../lib/layout.mjs');
  const { flowAsDiagram } = await import('../lib/draw-diagram.mjs');
  const covered = (l) => {
    const hits = [];
    for (const e of l.edges) {
      if (!e.label) continue;
      const w = labelWidth(e.label), [mx, my] = e.labelAt;
      const x1 = mx - w / 2, x2 = mx + w / 2, y1 = my - 8, y2 = my + 8;
      for (const [id, b] of Object.entries(l.nodes))
        if (x1 < b.x + b.w && x2 > b.x && y1 < b.y + b.h && y2 > b.y) hits.push(`"${e.label}" (${e.from}→${e.to}) covers ${id}`);
    }
    return hits;
  };
  assert.deepEqual(covered(layout(flowAsDiagram(readJson(FLOW)))), []);
  assert.deepEqual(covered(layout(bookingChart())), []);
  let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const words = ['Yes', 'No', 'Slot is free', 'Someone took it first', 'Payment declined by the bank'];
  for (let t = 0; t < 200; t++) {
    const n = 2 + Math.floor(rnd() * 16);
    const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, kind: i === 0 ? 'start' : 'process' }));
    const edges = [];
    for (let i = 1; i < n; i++) edges.push({ from: `n${Math.floor(rnd() * i)}`, to: `n${i}`, label: rnd() < 0.6 ? words[Math.floor(rnd() * words.length)] : undefined });
    assert.deepEqual(covered(layout({ id: `r${t}`, kind: 'flowchart', title: 'r', nodes, edges })), [], `random diagram ${t}`);
  }
});

// ── the page as drawn: focus, the agent's brief, asking the agent back (D057, D059, D060) ──
const withBrief = (edit) => {
  const r = readJson(FLOW);
  r.focus = 'user-flow';
  r.brief = {
    explains: 'Cancelling frees the slot, but the money stays with us as store credit.',
    highlights: { nodes: ['free'], screens: ['booked'] },
    recommendation: 'Keep store credit, and say so on the booking screen before payment.',
    examples: [{ name: 'Class passes at gyms', what: 'A cancelled class returns a credit, not money', source: 'https://example.org/class-passes' }],
    risks: ['Customers may read credit as a refund and ask for money back.'],
  };
  if (edit) edit(r);
  return r;
};

test('a review with a focus and a brief passes', () => {
  const r = checkReviewObj(withBrief(), '--root', root);
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /! examples are unverified/);
});

const briefFaults = {
  'focus resolves': [(r) => { r.focus = 'nope'; }, /focus "nope" is neither the computed user flow \(user-flow\) nor a diagram in this review\. Use one of/],
  'examples are honest': [(r) => { delete r.brief.examples[0].what; }, /example "Class passes at gyms" says who but not what they did\. Add "what"/],
  'brief highlights resolve': [(r) => { r.brief.highlights.screens = ['nowhere']; }, /highlights screen "nowhere", which does not exist\. Use one of/],
};
for (const [check, [inject, advice]] of Object.entries(briefFaults)) {
  test(`checker refuses: ${check}`, () => {
    const r = checkReviewObj(withBrief(inject), '--root', root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, advice, r.stdout);
  });
}

test('an example without a source is a warning, not a refusal (D050)', () => {
  const r = checkReviewObj(withBrief((x) => { delete x.brief.examples[0].source; }), '--root', root);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /! examples are unverified:.*"Class passes at gyms" has no source\. Add one, or the page shows it as unverified/);
});

test('the reviewer can ask the agent back, and it travels in the feedback', () => {
  const review = readJson(FLOW);
  const f = buildFeedback(review, {
    verdicts: { book: 'partly-agree' }, notes: {}, added: [],
    requests: { book: { example: true }, cancel: { explain: true, note: 'Why 24 hours?' } },
  });
  assert.deepEqual(f.requests, [
    { itemId: 'book', title: 'Taps Book 10:00', kind: 'example', note: null },
    { itemId: 'cancel', title: 'Taps Cancel booking', kind: 'explain', note: 'Why 24 hours?' },
  ]);
  const p = join(tmp, 'req.json'); writeFileSync(p, JSON.stringify(f));
  assert.equal(check('pair', at(FLOW), p, '--root', root).status, 0, check('pair', at(FLOW), p, '--root', root).stdout);
  f.requests.push({ itemId: 'nope', title: 'x', kind: 'example', note: null });
  writeFileSync(p, JSON.stringify(f));
  const bad = check('pair', at(FLOW), p, '--root', root);
  assert.equal(bad.status, 1, bad.stdout);
  assert.match(bad.stdout, /✗ requests resolve:.*"nope" is not an item in this review/);
});

test('the user flow chart begins with a Start and ends with an End', () => {
  const review = readJson(FLOW);
  const d = flowAsDiagram(review);
  const ends = d.nodes.filter((n) => n.kind === 'end');
  assert.deepEqual(ends.map((n) => n.id), ['end']);
  const into = d.edges.filter((e) => e.to === 'end').map((e) => e.from.replace('screen:', ''));
  const leaves = (id) => review.items.some((i) => i.step?.from === id);
  const shouldEnd = review.flow.screens.filter((s) => s.end || !leaves(s.id)).map((s) => s.id);
  assert.deepEqual(into.sort(), shouldEnd.sort());
  assert.ok(shouldEnd.length > 1, 'the example has several endings');
  // Nothing leaves the End, and no screen is drawn as a terminator any more.
  assert.equal(d.edges.filter((e) => e.from === 'end').length, 0);
  assert.ok(d.nodes.filter((n) => n.id.startsWith('screen:')).every((n) => n.kind === 'screen'));
});

// #38 — an agent kept the example's id; its page then shared answers with the example page.
test('a review may not keep an example\'s id, unless it is that example', () => {
  const copy = readJson('examples/review.example.json');
  copy.title = 'My own checkout test';
  const p = join(tmp, 'copied-id.review.json');
  writeFileSync(p, JSON.stringify(copy));
  const r = check('review', p);
  assert.equal(r.status, 1, 'a changed review with the example\'s id must fail');
  assert.match(r.stdout, /own id: "checkout-uat-2026-09" is the id of the example review\.example\.json\. Give this review its own id/);
  copy.id = 'my-checkout-2026-09';
  writeFileSync(p, JSON.stringify(copy));
  assert.equal(check('review', p).status, 0, 'with its own id it passes');
  for (const ex of ['review.example.json', 'decision-review.example.json', 'flow-booking.review.json'])
    assert.equal(check('review', at('examples/' + ex)).status, 0, `${ex} itself still passes`);
});

// #42 — an item can carry real precedents, held to the same rule as the brief's.
test('item examples: who and what are required, a missing source is a warning, not a refusal', () => {
  const r = readJson('examples/review.example.json');
  r.id = 'examples-on-items';
  r.items[0].examples = [{ name: 'Shopify checkout', what: 'Lets people pay without an account; offers one after the order.', shows: 'A "Continue as guest" choice next to "Sign in".', source: 'https://help.shopify.com/en/manual/checkout-settings/customer-accounts' },
    { name: 'A shop a colleague ran', what: 'Asked for the account only after payment.' }];
  let res = checkReviewObj(r);
  assert.equal(res.status, 0, res.stdout);
  assert.match(res.stdout, /examples are unverified: "A shop a colleague ran" on guest-checkout has no source/);
  delete r.items[0].examples[1].what;
  res = checkReviewObj(r);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /example "A shop a colleague ran" on guest-checkout says who but not what they did/);
});

// #47 — a picture must be drawn: Mermaid on an offline page is only its source text.
test('checker refuses a Mermaid section diagram, and a list chart may point at items', () => {
  const r = readJson('examples/review.example.json');
  r.sections[0].diagram = { kind: 'mermaid', source: 'flowchart LR\n  A --> B' };
  const bad = checkReviewObj(r);
  assert.equal(bad.status, 1, bad.stdout);
  assert.match(bad.stdout, /✗ pictures are drawn: section\(s\) happy carry a Mermaid "diagram"/);
  delete r.sections[0].diagram;
  r.diagrams[0].nodes[2].step = 'nowhere';
  assert.match(checkReviewObj(r).stdout, /step "nowhere" is not an item in this review/);
});

// #48 — an explanation asks nothing: its brief is headed as one.
test('the brief is headed by what it does: a decision, or an explanation', () => {
  const page = (brief) => {
    const src = join(tmp, `brief-${Math.random().toString(36).slice(2)}.json`), out = src.replace(/json$/, 'html');
    writeFileSync(src, JSON.stringify(ownId(withBrief((r) => Object.assign(r.brief, brief)))));
    spawnSync(process.execPath, [at('bin/render.mjs'), src, out]);
    return readFileSync(out, 'utf8').match(/id="brief-h">([^<]*)/)[1];
  };
  assert.equal(page({ question: 'Store credit or refund?' }), 'What I need you to decide');
  assert.equal(page({ question: undefined }), 'What this explains');
});

// #52 — the next round carries everything the reviewer left open.
test('followup: gaps, added items and requests are carried into the next review', () => {
  const review = readJson('examples/review.example.json');
  const base = readJson('examples/feedback.example.json');
  const run = (editNext, editFb) => {
    const next = structuredClone(review); next.id = 'checkout-uat-2026-09-round-2';
    next.items.push({ id: 'added-currency', title: 'Prices switch currency halfway through', summary: 'You found this one: which country did you switch to?' });
    const fb = structuredClone(base);
    if (editFb) editFb(fb);
    if (editNext) editNext(next);
    const [pn, pf] = ['next', 'fb'].map((k) => join(tmp, `${k}-${Math.random().toString(36).slice(2)}.json`));
    writeFileSync(pn, JSON.stringify(next)); writeFileSync(pf, JSON.stringify(fb));
    return check('followup', pn, at('examples/review.example.json'), pf);
  };
  const ok = run();
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(run((n) => { n.items = n.items.filter((i) => i.id !== 'declined-card'); }).stdout, /✗ gaps carried: "A declined card explains itself" is a gap the next review drops/);
  // Carried under a new id, quoting the earlier item truthfully.
  const byAffects = run((n) => {
    n.items = n.items.filter((i) => i.id !== 'declined-card');
    n.diagrams[0].nodes.find((x) => x.step === 'declined-card').step = 'decline-message';
    n.items.push({ id: 'decline-message', title: 'The decline message says what to do next',
      affects: [{ effect: 'extends', why: 'You saw error 51.', decision: { review: review.id, itemId: 'declined-card', title: 'A declined card explains itself', verdict: 'fails' } }] });
  });
  assert.equal(byAffects.status, 0, byAffects.stdout);
  assert.match(run((n) => { n.items = n.items.filter((i) => i.id !== 'added-currency'); }).stdout, /✗ added items carried: the reviewer added "Prices switch currency/);
  const ask = (kind) => (fb) => { fb.requests = [{ itemId: 'guest-checkout', title: 'A guest can buy without creating an account', kind }]; };
  assert.match(run(null, ask('example')).stdout, /✗ requests answered: "A guest can buy without creating an account" asked for an example, and no item carrying it has "examples"/);
  const withEx = run((n) => { n.items[0].examples = [{ name: 'Shop', what: 'Guest checkout on the first page', source: 'https://example.org/guest' }]; }, ask('example'));
  assert.equal(withEx.status, 0, withEx.stdout);
  assert.match(run(null, ask('explain')).stdout, /asked for an explanation, and its text is unchanged/);
  assert.equal(run((n) => { n.items[0].summary = 'No sign-in anywhere: pay with a test card as a stranger would.'; }, ask('explain')).status, 0);
  assert.match(run((n) => { n.id = review.id; }).stdout, /✗ next review has its own id/);
});

// #54 — an approval is one exact action, answered approve or decline, echoed, and refused once expired.
test('approvals: well-formed, answered approve or decline, echoed exactly, never used after they end', () => {
  const iso = (ms) => new Date(Date.now() + ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const review = () => {
    const r = readJson('examples/decision-review.example.json');
    r.id = 'approval-test'; r.createdAt = iso(-3600e3);
    r.sections.push({ id: 'approve', label: 'Needs your approval' });
    r.items.push({ id: 'drop-db', sectionId: 'approve', title: 'Drop the old staging database',
      approval: { action: 'Drop the database checkout_v1_staging', scope: 'One staging database, no production data', risk: 'high', expiresAt: iso(7 * 864e5) } });
    return r;
  };
  const files = (r, fb) => ['r', 'f'].map((k, i) => { const p = join(tmp, `${k}-${Math.random().toString(36).slice(2)}.json`); writeFileSync(p, JSON.stringify([r, fb][i])); return p; });
  const pair = (r, fb) => check('pair', ...files(r, fb));
  const answer = (r, verdict, now = iso(0)) => buildFeedback(r, { verdicts: { 'drop-db': verdict } }, now);

  // The review: an approval names its action, scope, risk and end, and stands in a section of its own.
  const bad = review(); Object.assign(bad.items.at(-1).approval, { scope: ' ', risk: 'huge', expiresAt: iso(-7200e3) });
  const refused = check('review', ...files(bad, {}).slice(0, 1)).stdout;
  assert.match(refused, /✗ approvals well-formed: drop-db: says nothing about what it affects.*risk "huge" is not low, medium or high.*expires at .*, before the review was even written/);

  // The page's own export passes; it echoes the approval, and neither approve nor decline is a gap.
  const r = review();
  for (const v of ['approve', 'decline']) {
    const fb = answer(r, v);
    assert.deepEqual(fb.responses.at(-1).approval, r.items.at(-1).approval);
    assert.ok(!fb.gaps.includes('drop-db'), `${v} is an answer, not a gap`);
    const ok = pair(r, fb); assert.equal(ok.status, 0, ok.stdout);
  }
  assert.ok(answer(r, undefined).gaps.includes('drop-db'), 'an unanswered approval is a gap');

  // "Agree" is not permission: an approval takes approve or decline only.
  assert.match(pair(r, answer(r, 'agree')).stdout, /✗ verdicts in vocabulary: .*drop-db=agree \(an approval: approve, decline or unset\)/);
  // The file must carry the approval that was asked, word for word.
  const changed = answer(r, 'approve'); changed.responses.at(-1).approval = { ...changed.responses.at(-1).approval, scope: 'All databases' };
  assert.match(pair(r, changed).stdout, /✗ approvals echo the review: drop-db: the approval in the file is not the one asked \(scope differ\)/);
  // Approved after its end, or used after its end: refused.
  assert.match(pair(r, answer(r, 'approve', iso(8 * 864e5))).stdout, /✗ approvals still valid: "Drop the old staging database" was approved at .*, after it expired/);
  const lapsed = review(); lapsed.items.at(-1).approval.expiresAt = iso(-60e3);
  assert.match(pair(lapsed, answer(lapsed, 'approve', iso(-120e3))).stdout, /✗ approvals still valid: "Drop the old staging database": the approval expired at/);
  // A declined approval that has since ended is still a valid "no".
  assert.equal(pair(lapsed, answer(lapsed, 'decline', iso(-120e3))).status, 0);
});

// #53 — answers given in chat become a feedback file through the page's own builder, and pass the checker.
test('answer.mjs: confirmed chat answers become a checked feedback file; what was not answered stays open', () => {
  const answers = join(tmp, 'answers.json'), out = join(tmp, 'chat.feedback.json');
  writeFileSync(answers, JSON.stringify({ choices: { storage: 'opt-db' }, verdicts: { 'autosave-local': 'agree' },
    notes: { 'opt-db': 'Only if backups are daily.', 'challenge-forgotten-file': 'Ask Sam.' } }));
  const w = spawnSync(process.execPath, [at('bin/answer.mjs'), at('examples/decision-review.example.json'), answers, out], { encoding: 'utf8' });
  assert.equal(w.status, 0, w.stderr);
  const fb = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(fb.via, 'chat');
  assert.equal(fb.choices.find((c) => c.sectionId === 'storage').itemId, 'opt-db');
  assert.equal(fb.responses.find((r) => r.itemId === 'challenge-forgotten-file').verdict, 'unset', 'a note alone is not an answer');
  assert.ok(fb.gaps.includes('challenge-forgotten-file'));
  const c = check('pair', at('examples/decision-review.example.json'), out);
  assert.equal(c.status, 0, c.stdout);
});

// #88 — an answer that settles nothing (a caution or neutral verdict: "Partially works", "Couldn't
// test it", "Revisit") is carried like a gap; a settled one may be left out.
test('followup: caution and neutral answers are carried; settled ones may be dropped', () => {
  const review = readJson('examples/review.example.json');
  const run = (dropId, editFb, carry) => {
    const next = structuredClone(review); next.id = 'checkout-uat-2026-09-round-2';
    next.items = next.items.filter((i) => i.id !== dropId);
    for (const n of next.diagrams[0].nodes) if (n.step === dropId) delete n.step;
    if (carry) next.items.push(carry);
    const fb = readJson('examples/feedback.example.json');
    if (editFb) editFb(fb);
    const [pn, pf] = ['next', 'fb'].map((k) => join(tmp, `${k}-${Math.random().toString(36).slice(2)}.json`));
    writeFileSync(pn, JSON.stringify(next)); writeFileSync(pf, JSON.stringify(fb));
    return check('followup', pn, at('examples/review.example.json'), pf).stdout;
  };
  // saved-card is "Partially works" (caution) in the example feedback.
  assert.match(run('saved-card'), /✗ open answers carried: "A returning customer can pay with a saved card" was answered "Partially works"/);
  const blocked = (fb) => { fb.responses.find((r) => r.itemId === 'guest-checkout').verdict = 'blocked'; };
  assert.match(run('guest-checkout', blocked), /✗ open answers carried: "A guest can buy without creating an account" was answered "Couldn't test it"/);
  const quoting = { id: 'guest-again', title: 'Retest guest checkout once the sandbox is up',
    affects: [{ effect: 'extends', why: 'You could not test it.', decision: { review: review.id, itemId: 'guest-checkout', title: 'A guest can buy without creating an account', verdict: 'blocked' } }] };
  assert.doesNotMatch(run('guest-checkout', blocked, quoting), /✗ open answers carried/);
  assert.doesNotMatch(run('guest-checkout'), /✗ open answers carried/, 'a settled "Works" may be left out');
});

// #60 — comments on a box or an arrow: echoed in words, checked against the review, answered next round.
test('comments on a diagram: labelled, resolved against the review, and answered in the follow-up', () => {
  const review = readJson('examples/review.example.json');
  const d = review.diagrams[0];
  const store = { comments: [
    { id: 'comment-1', diagram: d.id, node: 'guest', label: 'Checks out as a guest', note: 'Say who pays.' },
    { id: 'comment-2', diagram: d.id, edge: { from: 'cart', to: 'signed-in' }, label: 'Items in the cart → Signed in?', note: 'What if the cart is empty?' },
    { id: 'comment-3', diagram: d.id, node: 'pay', label: 'Takes the payment', note: '  ' } ] };
  const fb = buildFeedback(review, store);
  assert.deepEqual(fb.comments.map((c) => c.id), ['comment-1', 'comment-2'], 'an empty comment is not an answer');
  const write = (o) => { const p = join(tmp, `c-${Math.random().toString(36).slice(2)}.json`); writeFileSync(p, JSON.stringify(o)); return p; };
  const pair = (f) => check('pair', at('examples/review.example.json'), write(f));
  assert.equal(pair(fb).status, 0, pair(fb).stdout);
  const moved = structuredClone(fb); moved.comments[0].label = 'Picks a saved card';
  assert.match(pair(moved).stdout, /✗ comments resolve: comment-1: says it is on "Picks a saved card", but that part is "Checks out as a guest"/);
  const lost = structuredClone(fb); lost.comments[1].edge.to = 'confirmed';
  assert.match(pair(lost).stdout, /✗ comments resolve: comment-2: "Items in the cart → Signed in\?" is no arrow of/);
  const both = structuredClone(fb); both.comments[0].edge = { from: 'a', to: 'b' };
  assert.match(pair(both).stdout, /✗ comments well-formed: comment-1: a comment needs its own id/);
  // The next round answers every comment, by id, or the follow-up check refuses it.
  const next = structuredClone(review); next.id = 'checkout-uat-2026-09-round-2';
  next.items[0].answers = ['comment-1'];
  const fbPath = write(fb);
  assert.match(check('followup', write(next), at('examples/review.example.json'), fbPath).stdout, /✗ comments answered: comment-2 on "Items in the cart → Signed in\?" is not answered/);
  next.items[2].answers = ['comment-2'];
  const ok = check('followup', write(next), at('examples/review.example.json'), fbPath);
  assert.doesNotMatch(ok.stdout, /✗ comments answered/, ok.stdout);
});

// #60 — pictures: really PNG, JPEG or WebP by their own bytes, attached to something in the file, small enough.
test('pictures: kept on what they are attached to, refused when they are not really pictures', () => {
  const review = readJson('examples/review.example.json');
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const store = { notes: { 'declined-card': 'See the picture.' }, pictures: [
    { id: 'picture-1', on: 'declined-card', type: 'image/png', width: 1, height: 1, data: PNG },
    { id: 'picture-2', on: 'comment-9', type: 'image/png', width: 1, height: 1, data: PNG } ] };
  const fb = buildFeedback(review, store);
  assert.deepEqual(fb.pictures.map((p) => [p.id, p.onTitle]), [['picture-1', 'A declined card explains itself']], 'a picture on nothing is left out');
  const write = (o) => { const p = join(tmp, `p-${Math.random().toString(36).slice(2)}.json`); writeFileSync(p, JSON.stringify(o)); return p; };
  const pair = (f) => check('pair', at('examples/review.example.json'), write(f));
  assert.equal(pair(fb).status, 0, pair(fb).stdout);
  const svg = structuredClone(fb); svg.pictures[0].data = Buffer.from('<svg onload="alert(1)"/>').toString('base64');
  assert.match(pair(svg).stdout, /✗ pictures are pictures: picture-1: says image\/png, but its bytes are not that kind of picture/);
  const kind = structuredClone(fb); kind.pictures[0].type = 'image/svg+xml';
  assert.match(pair(kind).stdout, /picture-1: "image\/svg\+xml" is not PNG, JPEG or WebP/);
  const big = structuredClone(fb); big.pictures[0].data = Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(1100 * 1024)]).toString('base64');
  assert.match(pair(big).stdout, /picture-1: 1\.1 MB, more than 1 MB/);
  const lost = structuredClone(fb); lost.pictures[0].on = 'nowhere';
  assert.match(pair(lost).stdout, /picture-1: is attached to "nowhere", which is no item, added item or comment in this file/);
  // The agent looks at them as files.
  const dir = join(tmp, 'pics');
  const w = spawnSync(process.execPath, [at('bin/pictures.mjs'), write(fb), dir], { encoding: 'utf8' });
  assert.equal(w.status, 0, w.stderr);
  assert.match(w.stdout, /picture-1\.png {2}on "A declined card explains itself"/);
  assert.deepEqual(readFileSync(join(dir, 'picture-1.png')), Buffer.from(PNG, 'base64'));
});

// #60 part 3 — proposed changes: applied to a copy of the diagram, refused when they would break it.
test('proposals: applied, refused when they break the diagram, and answered in the follow-up', () => {
  const review = readJson('examples/review.example.json');
  const d = review.diagrams[0];
  const store = { proposals: [
    { id: 'proposal-1', diagram: d.id, op: 'rename', node: 'pay', label: 'Takes the payment', text: 'Charges the card', comment: 'comment-1' },
    { id: 'proposal-2', diagram: d.id, op: 'add-node', from: 'pay', label: 'Takes the payment', text: 'Shows the amount' } ],
    comments: [{ id: 'comment-1', diagram: d.id, node: 'pay', label: 'Takes the payment', note: 'Say what is charged.' }] };
  const fb = buildFeedback(review, store);
  assert.equal(fb.proposals[0].why, 'Say what is charged.', 'the words from the comment on the same part travel with it');
  const write = (o) => { const p = join(tmp, `pr-${Math.random().toString(36).slice(2)}.json`); writeFileSync(p, JSON.stringify(o)); return p; };
  const pair = (f) => check('pair', at('examples/review.example.json'), write(f));
  assert.equal(pair(fb).status, 0, pair(fb).stdout);

  // The change is applied to a copy of the diagram, and the same rules judge the result.
  const cut = structuredClone(fb);
  cut.proposals = [{ id: 'proposal-1', diagram: d.id, op: 'remove-node', node: 'signed-in', label: 'Signed in?' }];
  assert.match(pair(cut).stdout, /✗ proposals fit the diagram: with the changes, checkout-path\.guest: can't be reached from a start/);
  const gone = structuredClone(fb);
  gone.proposals = [{ id: 'proposal-1', diagram: d.id, op: 'rename', node: 'nowhere', label: 'x', text: 'y' }];
  assert.match(pair(gone).stdout, /✗ proposals fit the diagram: proposal-1: box "nowhere" is not in this diagram/);
  const junk = structuredClone(fb);
  junk.proposals = [{ id: 'proposal-1', diagram: d.id, op: 'redraw-everything', label: 'x' }];
  assert.match(pair(junk).stdout, /✗ proposals well-formed: proposal-1 \("redraw-everything"\)/);

  // The next round draws the change, or says why not, and names the proposal it answers.
  const next = structuredClone(review); next.id = 'checkout-uat-2026-09-round-2';
  next.items[0].answers = ['comment-1', 'proposal-1'];
  const fbPath = write(fb);
  assert.match(check('followup', write(next), at('examples/review.example.json'), fbPath).stdout, /✗ proposals answered: proposal-2 on "Takes the payment" is not answered/);
  next.items[1].answers = ['proposal-2'];
  assert.doesNotMatch(check('followup', write(next), at('examples/review.example.json'), fbPath).stdout, /✗ proposals answered/);
});

// #32 — a system diagram: its own boxes, its own rules. No start and no end, but nothing floats.
test('system diagrams: their own catalogue of boxes, and nothing unconnected', () => {
  const base = () => ({ id: 'sys', kind: 'system', title: 'What runs',
    lanes: [{ id: 'ours', title: 'What we run' }, { id: 'out', title: "Someone else's" }],
    nodes: [{ id: 'app', kind: 'service', lane: 'ours', label: 'Booking service' },
      { id: 'db', kind: 'data-store', lane: 'ours', label: 'Bookings' },
      { id: 'mail', kind: 'external', lane: 'out', label: 'Email provider' }],
    edges: [{ from: 'app', to: 'db' }, { from: 'app', to: 'mail', kind: 'async' }] });
  const withDiagram = (d) => { const r = readJson('examples/decision-review.example.json'); r.diagrams = [d]; return r; };
  const run = (d) => checkReviewObj(withDiagram(d));
  const ok = run(base());
  assert.equal(ok.status, 0, ok.stdout);                        // no start, no end: that is right for a system diagram

  const floating = base(); floating.nodes.push({ id: 'cache', kind: 'data-store', lane: 'ours', label: 'A cache' });
  assert.match(run(floating).stdout, /✗ diagrams make sense: sys\.cache: nothing calls it and it calls nothing/);

  const wrongBox = base(); wrongBox.nodes.push({ id: 'pick', kind: 'decision', lane: 'ours', label: 'Which one?' });
  assert.match(run(wrongBox).stdout, /✗ diagrams resolve: sys\.pick: "decision" does not belong in a system diagram/);

  const halfGuard = base();
  halfGuard.nodes.push({ id: 'auth', kind: 'guard', lane: 'ours', label: 'Signed in?' });
  halfGuard.edges.push({ from: 'auth', to: 'app' });
  assert.match(run(halfGuard).stdout, /✗ diagrams make sense: sys\.auth: a check sits on a path/);

  // A flow chart keeps its own rules: it still needs a start and an end.
  const flow = base(); flow.kind = 'flowchart';
  assert.match(run(flow).stdout, /sys: has no start/);
});

// #32 — a sequence: who calls whom, in order. Every message says something; an answer follows a call.
test('sequence diagrams: every message speaks, every participant takes part, an answer follows a call', () => {
  const base = () => ({ id: 'calls', kind: 'sequence', title: 'Booking, call by call',
    nodes: [{ id: 'app', kind: 'client', label: 'Phone' }, { id: 'svc', kind: 'service', label: 'Booking service' },
      { id: 'db', kind: 'data-store', label: 'Slots' }],
    edges: [{ from: 'app', to: 'svc', label: 'book 10:00' }, { from: 'svc', to: 'db', label: 'still free?' },
      { from: 'db', to: 'svc', kind: 'return', label: 'free' }, { from: 'svc', to: 'app', kind: 'return', label: 'booked' }] });
  const withDiagram = (d) => { const r = readJson('examples/decision-review.example.json'); r.diagrams = [d]; return r; };
  const run = (d) => checkReviewObj(withDiagram(d));
  assert.equal(run(base()).status, 0, run(base()).stdout);

  const mute = base(); mute.edges[1].label = '  ';
  assert.match(run(mute).stdout, /✗ diagrams make sense: calls: message 2 \(svc → db\) says nothing/);
  const early = base(); early.edges = [{ from: 'db', to: 'svc', kind: 'return', label: 'free' }, ...base().edges];
  assert.match(run(early).stdout, /message 1 \(db → svc\) is an answer to a call that never happened/);
  const idle = base(); idle.nodes.push({ id: 'mail', kind: 'external', label: 'Email provider' });
  assert.match(run(idle).stdout, /calls\.mail: takes part in no message/);
  const wrongBox = base(); wrongBox.nodes.push({ id: 'gate', kind: 'guard', label: 'Signed in?' });
  wrongBox.edges.push({ from: 'app', to: 'gate', label: 'who are you?' });
  assert.match(run(wrongBox).stdout, /calls\.gate: "guard" does not belong in a sequence diagram/);

  // The same pair speaks more than once: a comment says which message, by its place in the list.
  const review = withDiagram(base()); review.id = 'sequence-comment-test';
  const fb = buildFeedback(review, { comments: [
    { id: 'comment-1', diagram: 'calls', edge: { from: 'svc', to: 'db', nth: 1 }, label: 'Booking service → Slots (still free?)', note: 'Say what happens when it is not free.' }] });
  const paths = ['r', 'f'].map((k, i) => { const p = join(tmp, `${k}q-${Math.random().toString(36).slice(2)}.json`); writeFileSync(p, JSON.stringify([review, fb][i])); return p; });
  assert.equal(check('pair', ...paths).status, 0, check('pair', ...paths).stdout);
  const wrongPlace = structuredClone(fb); wrongPlace.comments[0].edge.nth = 3;
  writeFileSync(paths[1], JSON.stringify(wrongPlace));
  assert.match(check('pair', ...paths).stdout, /✗ comments resolve: comment-1: "Booking service → Slots \(still free\?\)" is no arrow of/);
});

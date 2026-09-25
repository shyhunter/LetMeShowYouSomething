// SPDX-License-Identifier: Apache-2.0
// The fifteen moments an agent needs a person's judgement as data (the use cases in the project brief), each
// played over several rounds until nothing is left open. Every round is checked as the skill tells an agent
// to check it: the review, the chain of rounds before it, the page it renders with its history, the answers
// against the review, and the answers file on its own (readable by another agent, a week later).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildFeedback } from '../lib/build-feedback.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const at = (p) => join(ROOT, p);
const read = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const run = (...args) => spawnSync(process.execPath, args, { encoding: 'utf8' });
const ok = (r, what) => assert.equal(r.status, 0, `${what}\n${r.stdout}${r.stderr}`);

// ── the vocabularies (PROTOCOL.md → Verdict sets), with the tones that decide what is a gap ──
const V = (id, ...o) => ({ id, options: o.map(([value, label, tone]) => ({ value, label, tone })) });
const DECISION = V('decision', ['agree', 'Agree', 'positive'], ['partly-agree', 'Partly agree', 'caution'], ['disagree', 'Disagree', 'negative'], ['revisit', 'Revisit', 'caution']);
const TEST = V('test', ['works', 'Works', 'positive'], ['partial', 'Partially works', 'caution'], ['fails', "Doesn't work", 'negative'], ['untested', "Couldn't test it", 'neutral']);
const EXPLAIN = V('explanation', ['clear', 'Clear', 'positive'], ['partly-clear', 'Partly clear', 'caution'], ['lost-me', 'Lost me', 'negative'], ['seems-wrong', 'Seems wrong', 'negative']);
const PRIORITY = V('priority', ['now', 'Now', 'positive'], ['next', 'Next', 'caution'], ['later', 'Later', 'neutral'], ['unclear', "Can't place it", 'negative']);
const GENERATED = V('generated', ['keep', 'Keep', 'positive'], ['fix', 'Fix', 'negative'], ['drop', 'Drop', 'positive']);
const HYPOTHESIS = V('hypothesis', ['plausible', 'Plausible', 'caution'], ['incorrect', 'Ruled out', 'positive'], ['missing', 'Misses the cause', 'negative']);
const UNDERSTOOD = V('understood', ['right', 'Right', 'positive'], ['partly', 'Partly right', 'caution'], ['wrong', 'Wrong', 'negative']);
const HANDOVER = V('handover', ['accept', 'Accept', 'positive'], ['redo', 'Redo', 'negative']);

const review = (title, verdictSet, items, extra = {}) => ({ protocol: 'letmeshowyousomething/review', schemaVersion: 1, id: 'set-by-play', title,
  ask: 'Judge each one; add what is missing.', afterwards: 'I change what you mark and send the rest back as a new round.',
  createdAt: '2026-09-25T09:00:00Z', createdBy: { agent: 'claude-code' }, verdictSet, items, ...extra });
const item = (id, title, extra = {}) => ({ id, title, summary: `About ${title.toLowerCase()}.`, ...extra });
const approval = (id, title, action) => ({ id, title, sectionId: 'permission', approval: { action, scope: 'The staging database only', risk: 'medium', preview: action, expiresAt: '2099-01-01T00:00:00Z' } });

// Plays a use case: each round is [review, what the reviewer answered]. Round n continues round n-1. Returns
// every feedback, so a test can say what the end looks like.
function play(name, rounds, { root } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `scenario-${name}-`)), earlier = [], feedbacks = [], rootArgs = root ? ['--root', ROOT] : [];
  rounds.forEach(([rv, answers], i) => {
    const n = i + 1;
    // A review written here gets its id, its link to the round before and its date; an example file is used as it is.
    if (rv.id === 'set-by-play') {
      rv.id = `${name}-r${n}`;
      if (i) rv.continues = rounds[i - 1][0].id;
      rv.createdAt = `2026-09-${String(10 + i * 2).padStart(2, '0')}T09:00:00Z`;
    }
    const rp = join(dir, `r${n}.review.json`); writeFileSync(rp, JSON.stringify(rv));
    ok(run(at('bin/check.mjs'), 'review', rp, ...rootArgs), `${name} round ${n}: the review`);
    if (i) ok(run(at('bin/check.mjs'), 'rounds', rp, ...earlier, ...rootArgs), `${name} round ${n}: the chain of rounds`);
    const withRounds = earlier.flatMap((f, k) => (k % 2 ? [f] : ['--earlier', f]));
    ok(run(at('bin/render.mjs'), rp, join(dir, `r${n}.html`), ...withRounds), `${name} round ${n}: the page`);
    const f = typeof answers === 'function' ? answers(rp, dir) : buildFeedback(rv, answers, `2026-09-${String(11 + i * 2).padStart(2, '0')}T09:00:00Z`);
    const fp = join(dir, `r${n}.feedback.json`); writeFileSync(fp, JSON.stringify(f));
    ok(run(at('bin/check.mjs'), 'pair', rp, fp, ...rootArgs), `${name} round ${n}: the answers`);
    ok(run(at('bin/check.mjs'), 'feedback', fp), `${name} round ${n}: the answers, read on their own`);
    earlier.push(rp, fp); feedbacks.push(f);
  });
  return { feedbacks, dir, earlier };
}
const settled = (f) => { assert.deepEqual(f.gaps, [], 'nothing is left open at the end'); assert.equal(f.summary.unset, 0, 'every question answered'); };
const store = (verdicts, more = {}) => ({ verdicts, notes: {}, added: [], choices: {}, requests: {}, ...more });

// ── Decide: the person picks a direction ──
test('choose between approaches: the person overrides the recommendation, a consequence is revisited, then settled', () => {
  const opts = [item('opt-file', 'Export a file'), item('opt-db', 'A hosted database'), item('opt-both', 'A file now, sync later')].map((x) => ({ ...x, sectionId: 'storage' }));
  const sections = [{ id: 'storage', label: 'Where answers are kept', mode: 'choose-one', recommended: { itemId: 'opt-file', why: 'It works offline.' } }, { id: 'after', label: 'What follows' }];
  const cost = item('cost', 'The running cost is acceptable', { sectionId: 'after' });
  const { feedbacks } = play('choose', [
    [review('Where do answers go?', DECISION, [...opts, cost], { sections }), store({ cost: 'revisit' }, { choices: { storage: 'opt-db' }, notes: { 'opt-db': 'We need answers live.' } })],
    [review('Where do answers go?', DECISION, [{ ...cost, summary: 'About 12 € a month on the smallest plan.', reply: 'You chose the database: here is its cost.' }], { sections: [sections[1]] }), store({ cost: 'agree' })],
  ]);
  assert.equal(feedbacks[0].choices[0].followedRecommendation, false, 'the override is recorded');
  settled(feedbacks.at(-1));
});

test('approve a plan: a step is changed, a missing step added, the first approval declined, then approved', () => {
  const steps = [item('s1', 'Copy the table'), item('s2', 'Switch reads to the copy'), item('s3', 'Drop the old table')].map((x) => ({ ...x, sectionId: 'steps' }));
  const sections = [{ id: 'steps', label: 'The plan' }, { id: 'permission', label: 'Permission' }];
  const go = approval('run', 'Run the migration on staging', 'npm run migrate -- --env staging');
  const { feedbacks } = play('plan', [
    [review('Move the orders table', DECISION, [...steps, go], { sections }),
      store({ s1: 'agree', s2: 'disagree', s3: 'agree', run: 'decline' }, { notes: { s2: 'Switch writes first.' }, added: [{ id: 'added-1', title: 'Back up first', body: '', verdict: 'unset', note: null }] })],
    [review('Move the orders table', DECISION, [{ ...steps[1], title: 'Switch writes, then reads, to the copy', reply: 'Writes first, as you said.' },
      item('added-1', 'Back up first', { sectionId: 'steps', reply: 'Added as the first step.' }), { ...go, reply: 'Asked again with the changed plan.' }], { sections }),
      store({ s2: 'agree', 'added-1': 'agree', run: 'approve' })],
  ]);
  assert.deepEqual(feedbacks[0].gaps.sort(), ['added-1', 's2'], 'the change and the added step are open; a no to the approval is an answer, not a gap');
  assert.equal(feedbacks[0].responses.find((r) => r.itemId === 'run').verdict, 'decline');
  settled(feedbacks.at(-1));
});

test('revisit an earlier decision: a new proposal quotes what was agreed, and the person accepts the change', () => {
  const { feedbacks, dir, earlier } = play('revisit', [
    [review('Offline first', DECISION, [item('no-network', 'The page makes no network requests'), item('one-file', 'The review is one file')]), store({ 'no-network': 'agree', 'one-file': 'agree' })],
    [review('Offline first', DECISION, [item('fonts', 'Load one web font', { reply: 'This reopens what you agreed.',
      affects: [{ decision: { review: 'revisit-r1', itemId: 'no-network', title: 'The page makes no network requests', verdict: 'agree' }, effect: 'contradicts', why: 'A web font is a network request.' }] })]),
      store({ fonts: 'disagree' }, { notes: { fonts: 'Keep it offline.' } })],
    [review('Offline first', DECISION, [item('fonts', 'Use the system font instead', { reply: 'No web font: the page stays offline, as agreed in round 1.' })]),
      store({ fonts: 'agree' })],
  ]);
  ok(run(at('bin/check.mjs'), 'history', join(dir, 'r2.review.json'), earlier[1]), 'the earlier decision is quoted word for word');
  settled(feedbacks.at(-1));
});

test('prioritise a backlog: now, next and later move over three rounds; what could not be placed is explained', () => {
  const b = ['Search', 'Export to PDF', 'Dark mode', 'Offline sync', 'Two-factor login'].map((t, i) => item(`b${i + 1}`, t));
  const { feedbacks } = play('backlog', [
    [review('What do we build next?', PRIORITY, b), store({ b1: 'now', b2: 'next', b3: 'later', b4: 'unclear', b5: 'now' }, { notes: { b4: 'Sync with what?' } })],
    [review('What do we build next?', PRIORITY, [b[1], b[2], { ...b[3], summary: 'Answers made on a phone without signal reach the agent once it is back.', reply: 'Sync of the reviewer’s answers, said plainly.' }]),
      store({ b2: 'now', b3: 'later', b4: 'next' })],
    [review('What do we build next?', PRIORITY, [b[2], b[3]]), store({ b3: 'later', b4: 'now' })],
  ]);
  assert.deepEqual(feedbacks[0].gaps, ['b4'], 'only what could not be placed is a gap');
  assert.equal(feedbacks.at(-1).summary.byVerdict.now, 1);
  settled(feedbacks.at(-1));
});

// ── Show: the person reacts to something visual ──
test('show a graphical concept: a part that lost them is explained differently, then clear', () => {
  const parts = [item('client', 'The page in the browser'), item('checker', 'The checker'), item('agent', 'The agent reads the file')];
  const diagram = { id: 'how', kind: 'flowchart', title: 'How an answer travels', nodes: [{ id: 'n1', kind: 'start', label: 'Page', step: 'client' }, { id: 'n2', kind: 'process', label: 'Checker', step: 'checker' }, { id: 'n3', kind: 'end', label: 'Agent', step: 'agent' }], edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }] };
  const { feedbacks, dir, earlier } = play('concept', [
    [review('How an answer travels', EXPLAIN, parts, { diagrams: [diagram], focus: 'how' }), store({ client: 'clear', checker: 'lost-me', agent: 'clear' }, { requests: { checker: { explain: true } } })],
    [review('How an answer travels', EXPLAIN, [{ ...parts[1], summary: 'A program that reads the answers and refuses a file that does not add up, before the agent trusts it.', reply: 'Said without the jargon.' }], { diagrams: [diagram], focus: 'how' }),
      store({ checker: 'clear' })],
  ]);
  assert.deepEqual(feedbacks[0].requests.map((r) => r.kind), ['explain']);
  settled(feedbacks.at(-1));
  // Round 2 keeps the whole diagram: its boxes on parts settled in round 1 are fine; a box on a part no round asked is not.
  const r2 = JSON.parse(readFileSync(join(dir, 'r2.review.json'), 'utf8'));
  r2.diagrams[0].nodes[0].step = 'never-asked';
  const bad = join(dir, 'r2-bad.review.json'); writeFileSync(bad, JSON.stringify(r2));
  const r = run(at('bin/check.mjs'), 'rounds', bad, ...earlier.slice(0, 2));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /✗ round 2: diagrams resolve across the rounds: how\.n1 → never-asked: no round asked about it/);
});

test('walk through a clickable prototype: the booking flow over four rounds, until every step is agreed', () => {
  const R = ['flow-booking.review.json', 'flow-booking-round2.review.json', 'flow-booking-round3.review.json'].map((f) => read(`examples/${f}`));
  const F = ['flow-booking.feedback.json', 'flow-booking-round2.feedback.json'].map((f) => read(`examples/${f}`));
  const agreeAll = (r) => buildFeedback(r, store(Object.fromEntries(r.items.map((i) => [i.id, 'agree']))), '2026-09-25T10:00:00Z');
  const { feedbacks } = play('prototype', [[R[0], () => F[0]], [R[1], () => F[1]], [R[2], (rp) => agreeAll(JSON.parse(readFileSync(rp, 'utf8')))]], { root: true });
  settled(feedbacks.at(-1));
});

test('walk through screenshots: the password reset, a step marked with a picture of the real screen, then agreed', () => {
  const r1 = read('examples/password-reset.review.json');
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const shot = { id: 'picture-1', on: 'send', screen: 'reset', type: 'image/png', width: 1, height: 1, data: PNG };
  const r2 = () => { const r = structuredClone(r1); r.id = 'set-by-play'; r.items = [{ ...r.items.find((i) => i.id === 'send'), reply: 'Your screenshot is the reset screen now.' }]; return r; };
  const { feedbacks } = play('screenshots', [
    [structuredClone(r1), store({ forgot: 'agree', send: 'partly-agree', back: 'agree', resend: 'agree' }, { notes: { send: 'The button says Send link in the app.' }, pictures: [shot] })],
    [r2(), store({ send: 'agree' })],
  ]);
  assert.equal(feedbacks[0].pictures[0].screen, 'reset', 'the real screen comes back, for the next round to use');
  settled(feedbacks.at(-1));
});

test('compare visual variants: one is picked with a change from another, and the merged one is agreed', () => {
  const vs = [item('v-a', 'Variant A: cards'), item('v-b', 'Variant B: a list'), item('v-c', 'Variant C: a table')].map((x) => ({ ...x, sectionId: 'look' }));
  const sections = [{ id: 'look', label: 'Which layout', mode: 'choose-one', recommended: { itemId: 'v-a', why: 'Easiest to scan on a phone.' } }];
  const { feedbacks } = play('variants', [
    [review('The results page', DECISION, vs, { sections }), store({}, { choices: { look: 'v-b' }, notes: { 'v-b': 'The list, with the colours of A.' } })],
    [review('The results page', DECISION, [item('merged', 'A list with the colours of A', { summary: 'Your pick, with the change you asked for.' })]), store({ merged: 'agree' })],
  ]);
  assert.equal(feedbacks[0].choices[0].itemId, 'v-b');
  settled(feedbacks.at(-1));
});

test('confirm the agent understood: a wrong assumption is corrected, a partly right one sharpened', () => {
  const a = [item('who', 'It is for the product owner'), item('when', 'It runs once a week'), item('where', 'It stays on one laptop')].map((x) => ({ ...x, fields: { changes: 'If you say otherwise.' } }));
  const { feedbacks } = play('understood', [
    [review('What I understood', UNDERSTOOD, a, { fields: [{ key: 'changes', label: 'What would change my mind' }] }), store({ who: 'right', when: 'wrong', where: 'partly' }, { notes: { when: 'Every day.', where: 'And on the shared drive.' } })],
    [review('What I understood', UNDERSTOOD, [{ ...a[1], title: 'It runs every day', reply: 'Daily, as you said.' }, { ...a[2], title: 'It stays on one laptop and the shared drive', reply: 'Both places now.' }], { fields: [{ key: 'changes', label: 'What would change my mind' }] }),
      store({ when: 'right', where: 'right' })],
  ]);
  settled(feedbacks.at(-1));
});

// ── Judge a batch: many items, one verdict each ──
test('acceptance testing: the checkout, round 2 retests what failed and the added case, then everything works', () => {
  const R2 = read('examples/checkout-round2.review.json');
  const works = (rp) => { const r = JSON.parse(readFileSync(rp, 'utf8')); return buildFeedback(r, store(Object.fromEntries(r.items.map((i) => [i.id, r.verdictSet.options.find((o) => o.tone === 'positive').value]))), '2026-09-25T10:00:00Z'); };
  const { feedbacks } = play('acceptance', [[read('examples/review.example.json'), () => read('examples/checkout-uat.feedback.json')], [R2, works]]);
  settled(feedbacks.at(-1));
});

test('review generated work: stories kept, fixed and dropped; the missing one is added and written', () => {
  const s = [item('st1', 'Sign in with email'), item('st2', 'Reset a password'), item('st3', 'Sign in with a fax')];
  const { feedbacks } = play('generated', [
    [review('User stories for sign-in', GENERATED, s), store({ st1: 'keep', st2: 'fix', st3: 'drop' }, { notes: { st2: 'Say how long the link works.' }, added: [{ id: 'added-1', title: 'Sign out on every device', body: '', verdict: 'unset', note: null }] })],
    [review('User stories for sign-in', GENERATED, [{ ...s[1], summary: 'The link works for 30 minutes.', reply: 'Added how long it works.' }, item('added-1', 'Sign out on every device', { reply: 'Written as a story.' })]),
      store({ st2: 'keep', 'added-1': 'keep' })],
  ]);
  settled(feedbacks.at(-1));
});

test('triage incident hypotheses: one is ruled out, the cause the agent missed is added, then confirmed', () => {
  const h = [item('h1', 'The connection pool ran out'), item('h2', 'A bad deploy at 03:00')];
  const { feedbacks } = play('triage', [
    [review('Why checkout failed at 03:12', HYPOTHESIS, h), store({ h1: 'plausible', h2: 'incorrect' }, { notes: { h1: 'Check the pool size.' }, added: [{ id: 'added-1', title: 'The disk on the database host was full', body: '', verdict: 'unset', note: null }] })],
    [review('Why checkout failed at 03:12', HYPOTHESIS, [{ ...h[0], summary: 'The pool never went above 40 of 100.', reply: 'The logs rule it out.' }, item('added-1', 'The disk on the database host was full', { reply: 'The disk hit 100 % at 03:11.' })]),
      store({ h1: 'incorrect', 'added-1': 'incorrect' })],
  ]);
  settled(feedbacks.at(-1));
});

// ── Challenge and hand over: the answer outlives the session ──
test('challenge the agent: a concern the person finds real is handled, then no longer real', () => {
  const sections = [{ id: 'doubts', label: 'Where I could be wrong', kind: 'challenge' }];
  const c = [item('c1', 'This plan underestimates the cost of sync', { sectionId: 'doubts' }), item('c2', 'Nobody will use the export', { sectionId: 'doubts' })];
  const { feedbacks } = play('challenge', [
    [review('Before we build sync', DECISION, c, { sections }), store({ c1: 'agree', c2: 'disagree' })],
    [review('Before we build sync', DECISION, [{ ...c[0], title: 'Sync costs two more weeks, now in the plan', reply: 'Two weeks added.' }], { sections }), store({ c1: 'disagree' })],
  ]);
  assert.deepEqual(feedbacks[0].gaps, ['c1'], 'agree on a doubt means the concern is real: that is the gap');
  settled(feedbacks.at(-1));
});

test('sign-off by someone with no AI account: the answered page comes back and is read as data, twice', () => {
  const sections = [{ id: 'terms', label: 'The terms' }, { id: 'permission', label: 'Permission' }];
  const terms = [item('t1', 'Refunds within 14 days'), item('t2', 'Data kept for one year')].map((x) => ({ ...x, sectionId: 'terms' }));
  const send = approval('send', 'Send the contract to the client', 'Email contract-v3.pdf to client@example.com');
  // The reviewer answers on the page and sends the answered HTML back; the agent reads it without running it.
  const viaPage = (answers) => (rp, dir) => {
    const n = rp.match(/r(\d+)\.review/)[1], page = readFileSync(join(dir, `r${n}.html`), 'utf8');
    const seed = JSON.stringify({ ...answers, exportedAt: '2026-09-25T10:00:00Z' }).replace(/[<\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    const answered = join(dir, `r${n}.answered.html`), out = join(dir, `r${n}.from-page.json`);
    writeFileSync(answered, page.replace(/^const SEED = .*$/m, () => `const SEED = ${seed};`));
    ok(run(at('bin/answer.mjs'), rp, answered, out), 'the answered page is read as data');
    return JSON.parse(readFileSync(out, 'utf8'));
  };
  const { feedbacks } = play('signoff', [
    [review('The contract, before it is sent', DECISION, [...terms, send], { sections }), viaPage(store({ t1: 'agree', t2: 'disagree', send: 'decline' }, { notes: { t2: 'Six months.' } }))],
    [review('The contract, before it is sent', DECISION, [{ ...terms[1], title: 'Data kept for six months', reply: 'Six months, as you said.' }, { ...send, reply: 'With the changed term.' }], { sections }),
      viaPage(store({ t2: 'agree', send: 'approve' }))],
  ]);
  assert.equal(feedbacks.at(-1).responses.find((r) => r.itemId === 'send').verdict, 'approve');
  settled(feedbacks.at(-1));
});

test('hand over at the end of a task: what is unsure is redone until it is accepted', () => {
  const w = [item('w1', 'The export button'), item('w2', 'The error message'), item('w3', 'The empty state')];
  const { feedbacks } = play('handover', [
    [review('What I finished today', HANDOVER, w), store({ w1: 'accept', w2: 'redo', w3: 'redo' }, { notes: { w2: 'Say what to do next.', w3: 'Offer an action.' } })],
    [review('What I finished today', HANDOVER, [{ ...w[1], summary: 'It now says: try another card.', reply: 'Says what to do.' }, { ...w[2], summary: 'It now offers: find a time.', reply: 'An action is offered.' }]), store({ w2: 'accept', w3: 'redo' }, { notes: { w3: 'Bigger button.' } })],
    [review('What I finished today', HANDOVER, [{ ...w[2], summary: 'The action is the main button now.', reply: 'Bigger.' }]), store({ w3: 'accept' })],
  ]);
  settled(feedbacks.at(-1));
});

test('resume later, or in another agent: each answers file reads on its own, and the last page carries every round', () => {
  const x = [item('x1', 'Keep the file format'), item('x2', 'Rename the command')];
  const { feedbacks, dir } = play('resume', [
    [review('Before the break', DECISION, x), store({ x1: 'agree', x2: 'revisit' }, { notes: { x2: 'After the launch.' } })],
    [review('Before the break', DECISION, [{ ...x[1], reply: 'Asked again after the launch.' }]), store({ x2: 'agree' })],
  ]);
  const f = feedbacks[0], x2 = f.responses.find((r) => r.itemId === 'x2');
  assert.equal(x2.title, 'Rename the command', 'the question travels with the answer');
  assert.equal(x2.note, 'After the launch.');
  const page = readFileSync(join(dir, 'r2.html'), 'utf8'), line = page.split('\n').find((l) => l.startsWith('const HISTORY = '));
  assert.equal(JSON.parse(line.slice('const HISTORY = '.length, -1)).rounds.length, 1, 'the page of round 2 carries round 1');
  settled(feedbacks.at(-1));
});

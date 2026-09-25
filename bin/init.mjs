#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// The smallest valid review of each kind, to start from instead of reshaping an example by hand.
//
//   node bin/init.mjs <kind> <out.review.json> --title "…" [--audience "…"] [--agent claude-code]
//   kinds: decision · plan · test · explain · flow · backlog
//
// It writes structure only: a fresh id, the date, the verdict words that fit, the sections. Every place that
// needs your own words says [[fill in: …]], and the checker refuses a review that still has one. It never
// overwrites a file, and it runs the checker when done.
import { existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
const title = opt('--title'), audience = opt('--audience'), agent = opt('--agent') || 'agent';
const [kind, out] = argv;
const refuse = (why) => { console.error(`✗ ${why}`); process.exit(2); };
const V = (id, ...o) => ({ id, options: o.map(([value, label, tone]) => ({ value, label, tone })) });
const DECISION = V('decision', ['agree', 'Agree', 'positive'], ['partly-agree', 'Partly agree', 'caution'], ['disagree', 'Disagree', 'negative'], ['revisit', 'Revisit', 'caution']);
const f = (what) => `[[fill in: ${what}]]`;
const item = (id, what, extra = {}) => ({ id, title: f(what), summary: f('one plain sentence about it'), ...extra });

const KINDS = {
  decision: () => ({ verdictSet: DECISION,
    sections: [{ id: 'options', label: f('what is being chosen'), mode: 'choose-one', recommended: { itemId: 'option-1', why: f('why you recommend it') } }],
    items: [item('option-1', 'the first option', { sectionId: 'options' }), item('option-2', 'the second option', { sectionId: 'options' })] }),
  plan: () => ({ verdictSet: DECISION,
    sections: [{ id: 'steps', label: 'The plan' }, { id: 'permission', label: 'Your permission' }],
    items: [item('step-1', 'the first step', { sectionId: 'steps' }), item('step-2', 'the next step', { sectionId: 'steps' }),
      { id: 'go-ahead', sectionId: 'permission', title: f('the one action that needs a yes'),
        approval: { action: f('exactly what will be done'), scope: f('what it touches'), risk: 'medium', preview: f('the command or message, as it will be'), expiresAt: new Date(Date.now() + 7 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z') } }] }),
  test: () => ({ verdictSet: V('test', ['works', 'Works', 'positive'], ['partial', 'Partially works', 'caution'], ['fails', "Doesn't work", 'negative'], ['untested', "Couldn't test it", 'neutral']),
    items: [item('check-1', 'the first thing to try'), item('check-2', 'the next thing to try')] }),
  explain: () => ({ verdictSet: V('explanation', ['clear', 'Clear', 'positive'], ['partly-clear', 'Partly clear', 'caution'], ['lost-me', 'Lost me', 'negative'], ['seems-wrong', 'Seems wrong', 'negative']),
    brief: { explains: f('what you explain, in one or two sentences') }, focus: 'how',
    diagrams: [{ id: 'how', kind: 'flowchart', title: f('what the picture shows'),
      nodes: [{ id: 'a', kind: 'start', label: f('the first part'), step: 'part-1' }, { id: 'b', kind: 'end', label: f('the next part'), step: 'part-2' }], edges: [{ from: 'a', to: 'b' }] }],
    items: [item('part-1', 'the first part'), item('part-2', 'the next part')] }),
  flow: () => ({ verdictSet: DECISION, focus: 'user-flow',
    flow: { start: 'first', screens: [
      { id: 'first', title: f('the first screen'), blocks: [{ type: 'header', title: f('its title') }, { type: 'text', text: f('what it shows') }, { type: 'button', id: 'go', label: f('the button') }] },
      { id: 'next', title: f('the screen it leads to'), end: true, blocks: [{ type: 'header', title: f('its title') }, { type: 'text', text: f('what it shows') }] }] },
    items: [{ id: 'tap-go', title: f('Taps …, the cause'), step: { goal: f('what the person wants'), from: 'first', on: 'go', status: 'proposed',
      outcomes: [{ effect: f('what happens'), to: 'next', canNow: f('what they can do then') }] } }] }),
  backlog: () => ({ verdictSet: V('priority', ['now', 'Now', 'positive'], ['next', 'Next', 'caution'], ['later', 'Later', 'neutral'], ['unclear', "Can't place it", 'negative']),
    items: [item('work-1', 'the first piece of work'), item('work-2', 'the next piece of work')] }),
};

if (!KINDS[kind] || !out) refuse(`usage: init.mjs <${Object.keys(KINDS).join('|')}> <out.review.json> --title "…" [--audience "…"]`);
if (!title) refuse('give --title: what the person is asked about, in their words');
if (existsSync(out)) refuse(`${out} already exists. Name a new file; nothing is overwritten`);
const now = new Date(), slug = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'review';
const review = { protocol: 'letmeshowyousomething/review', schemaVersion: 1, id: `${slug}-${now.toISOString().slice(0, 10)}`, title,
  ...(audience ? { audience } : {}), ask: f('what you need from the person, in one sentence'), afterwards: f('what you will do with the answers'),
  createdAt: now.toISOString().replace(/\.\d+Z$/, 'Z'), createdBy: { agent }, ...KINDS[kind]() };
writeFileSync(out, JSON.stringify(review, null, 2) + '\n');
const places = JSON.stringify(review).split('[[fill in:').length - 1;
console.log(`wrote ${out}: a ${kind} review with ${places} places to fill in, each marked [[fill in: …]]`);
const c = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'check.mjs'), 'review', out], { encoding: 'utf8' });
const failing = c.stdout.split('\n').filter((l) => /^\s+✗ [^:]+$/.test(l)).map((l) => l.trim().slice(2));
console.log(failing.length === 1 && failing[0] === 'nothing left to fill in' ? 'check: only the places to fill in are open. Write them, add your items, then check again:' : `check: ${c.stdout.trim().split('\n').pop()}`);
console.log(`  node ${join(dirname(fileURLToPath(import.meta.url)), 'check.mjs')} review ${out}`);

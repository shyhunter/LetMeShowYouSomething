#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// #53 — answers given in chat become a feedback file, built by the same code as the page's export.
// #78 — so do the answers in an exported feedback.html, read as data: the page is never run.
//
//   node bin/answer.mjs <review.json> <answers.json | answered.html> [feedback.json]
//
// answers.json holds only what the person confirmed, keyed like the page keeps it:
//   { "verdicts": { "<itemId>": "<value>" }, "notes": { "<itemId>": "their words" },
//     "choices": { "<sectionId>": "<itemId>" }, "respondent": { "name": "…" } }
// Anything left out stays unset: an unanswered question is never written as agreement.
// The feedback is checked against the review (check.mjs pair) before it is written, and an existing
// file is never overwritten.
import { readFileSync, writeFileSync, statSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFeedback } from '../lib/build-feedback.mjs';

const [reviewPath, answersPath, outPath] = process.argv.slice(2);
if (!reviewPath || !answersPath) {
  console.error('usage: answer.mjs <review.json> <answers.json | answered.html> [feedback.json]');
  process.exit(2);
}
const refuse = (why) => { console.error(`✗ ${why}`); process.exit(2); };
const out = outPath || reviewPath.replace(/(\.review)?\.json$/, '') + '.feedback.json';
if (existsSync(out)) refuse(`${out} already exists. Name a new file, so no earlier answers are overwritten`);
const review = JSON.parse(readFileSync(reviewPath, 'utf8'));

// The exported page holds the review and the answers each on one line of JSON: the renderer escapes
// `<`, U+2028 and U+2029, so nothing can end the line early. Exactly one of each, parsed, never run.
function fromPage(html) {
  const line = (name) => {
    const found = [...html.matchAll(new RegExp(`^const ${name} = (.*);$`, 'gm'))];
    if (found.length !== 1) refuse(`${answersPath} is not one feedback.html exported from the review page (${found.length} "${name}" lines). Ask for the answered page (HTML) downloaded on its last step, or its JSON`);
    try { return JSON.parse(found[0][1]); } catch { refuse(`${answersPath}: its ${name} line is not JSON. Ask for a fresh export; the page is never run to recover it`); }
  };
  if (JSON.stringify(line('REVIEW')) !== JSON.stringify(review))
    refuse(`${answersPath} answers a different version of ${reviewPath}. Use the review the reviewer actually saw, or answers would land on changed questions`);
  const seed = line('SEED');
  if (!seed || typeof seed !== 'object' || Array.isArray(seed))
    refuse(`${answersPath} has no answers in it: it is the page as it was sent. Ask the reviewer to answer and press "Export feedback.html"`);
  const { exportedAt, ...answers } = seed;
  return { answers, at: exportedAt, via: 'page' };
}

// ponytail: 32 MB cap; an answered page is the review plus at most 5 MB of pictures.
if (statSync(answersPath).size > 32 * 1024 * 1024) refuse(`${answersPath} is over 32 MB, more than an answered page holds`);
const text = readFileSync(answersPath, 'utf8');
const given = /\.html?$/i.test(answersPath) ? fromPage(text) : { answers: JSON.parse(text), via: 'chat' };
let feedback;
try { feedback = { ...buildFeedback(review, given.answers, given.at), via: given.via }; }
catch (e) { refuse(`${answersPath}: its answers do not fit ${reviewPath} (${e.message}). Ask for a fresh export`); }

// Checked before it exists anywhere an agent would read it.
const dir = mkdtempSync(join(tmpdir(), 'answer-'));
const draft = join(dir, 'feedback.json');
writeFileSync(draft, JSON.stringify(feedback, null, 2) + '\n');
const check = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'check.mjs'), 'pair', reviewPath, draft], { encoding: 'utf8' });
const json = readFileSync(draft, 'utf8');
rmSync(dir, { recursive: true, force: true });   // only the folder made above
if (check.status !== 0) {
  console.error(check.stdout.split('\n').filter((l) => /✗/.test(l)).join('\n'));
  refuse(`these answers do not pass the checker, so no feedback file was written. Ask the reviewer for a fresh export`);
}
writeFileSync(out, json, { flag: 'wx' });
console.log(`wrote ${out}  (${feedback.summary.answered}/${feedback.summary.total} answered · ${feedback.gaps.length} gap(s)), checked against ${reviewPath}.`);

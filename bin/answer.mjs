#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// #53 — answers given in chat become a feedback file, built by the same code as the page's export.
//
//   node bin/answer.mjs <review.json> <answers.json> [feedback.json]
//
// answers.json holds only what the person confirmed, keyed like the page keeps it:
//   { "verdicts": { "<itemId>": "<value>" }, "notes": { "<itemId>": "their words" },
//     "choices": { "<sectionId>": "<itemId>" }, "respondent": { "name": "…" } }
// Anything left out stays unset: an unanswered question is never written as agreement.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildFeedback } from '../lib/build-feedback.mjs';

const [reviewPath, answersPath, outPath] = process.argv.slice(2);
if (!reviewPath || !answersPath) {
  console.error('usage: answer.mjs <review.json> <answers.json> [feedback.json]');
  process.exit(2);
}
const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
const answers = JSON.parse(readFileSync(answersPath, 'utf8'));
const feedback = { ...buildFeedback(review, answers), via: 'chat' };
const out = outPath || reviewPath.replace(/(\.review)?\.json$/, '') + '.feedback.json';
writeFileSync(out, JSON.stringify(feedback, null, 2) + '\n');
console.log(`wrote ${out}  (${feedback.summary.answered}/${feedback.summary.total} answered · ${feedback.gaps.length} gap(s)). Now run: node bin/check.mjs pair ${reviewPath} ${out}`);

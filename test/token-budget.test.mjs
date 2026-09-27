// SPDX-License-Identifier: Apache-2.0
// #164 — the skill stays lean. What an agent reads or is shown, held to limits in tokens (about 4 characters a token),
// so a change that would make every use of the skill cost more fails here instead of going unnoticed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..'), tokens = (text) => Math.ceil(text.length / 4);
const run = (bin, ...args) => spawnSync(process.execPath, [join(ROOT, 'skills/letmeshowyousomething/bin', bin), ...args], { encoding: 'utf8', cwd: ROOT });
const SKILL = readFileSync(join(ROOT, 'skills/letmeshowyousomething/SKILL.md'), 'utf8');
const within = (what, text, limit) => assert.ok(tokens(text) <= limit, `${what}: about ${tokens(text)} tokens, over the budget of ${limit}`);

test('what every agent carries: the description in its context, SKILL.md when the skill is used', () => {
  within('the description', SKILL.match(/^description: (.+)$/m)[1], 150);
  within('skills/letmeshowyousomething/SKILL.md', SKILL, 5000);
});

test('the start SKILL.md recommends is small: init.mjs, what it prints and what it writes', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'budget-')), 'r.review.json'), r = run('init.mjs', 'flow', out, '--title', 'A budget check');
  within('init.mjs output and file', r.stdout + r.stderr + readFileSync(out, 'utf8'), 1000);
});

test('every example SKILL.md names is small enough to open when needed', () => {
  const named = [...new Set([...SKILL.matchAll(/`([\w.-]+\.json)`/g)].map((m) => m[1]))].filter((f) => existsSync(join(ROOT, 'skills/letmeshowyousomething/examples', f)));
  assert.ok(named.length >= 3, 'skills/letmeshowyousomething/SKILL.md names its examples');
  for (const f of named) within(`examples/${f}`, readFileSync(join(ROOT, 'skills/letmeshowyousomething/examples', f), 'utf8'), 8000);
});

test('what the tools print back is short: check, render and reading the answers', () => {
  const review = 'skills/letmeshowyousomething/examples/salon-booking.review.json', feedback = 'skills/letmeshowyousomething/examples/salon-booking.feedback.json';
  within('check.mjs review', run('check.mjs', 'review', review, '--root', ROOT).stdout, 400);
  const page = join(mkdtempSync(join(tmpdir(), 'budget-')), 'p.html');
  within('render.mjs', run('render.mjs', review, page).stdout, 60);
  within('check.mjs pair', run('check.mjs', 'pair', review, feedback).stdout, 500);
  within('the answers file', readFileSync(join(ROOT, feedback), 'utf8'), 1500);
});

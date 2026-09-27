// SPDX-License-Identifier: Apache-2.0
// #175 — `npx skills add` copies the folder that holds SKILL.md into the user's project, all of it. So that folder
// holds what the skill needs at runtime and nothing else: no tests, site, videos, fixtures or rubric.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKILL = join(ROOT, 'skills/letmeshowyousomething');
const ALLOWED = ['SKILL.md', 'PROTOCOL.md', 'LICENSING.md', 'LICENSES', 'bin', 'lib', 'schemas', 'examples', 'logo.svg'];
const files = (dir) => readdirSync(dir).flatMap((n) => statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]);

test('install: the repository root has no SKILL.md, so the installer takes only the skill folder', () => {
  assert.ok(!existsSync(join(ROOT, 'SKILL.md')), 'a SKILL.md at the root makes `npx skills add` copy the whole repository');
  assert.ok(existsSync(join(SKILL, 'SKILL.md')));
});

test('install: the skill folder holds only what the skill needs at runtime', () => {
  const extra = readdirSync(SKILL).filter((n) => !ALLOWED.includes(n));
  assert.deepEqual(extra, [], 'every user would get these: keep tests, pages, media and tooling outside skills/letmeshowyousomething/');
  const pages = readdirSync(join(SKILL, 'examples')).filter((n) => !n.endsWith('.json'));
  assert.deepEqual(pages, [], 'examples in the skill are review and feedback JSON; generated pages live in examples/ at the root');
  const size = files(SKILL).reduce((n, f) => n + statSync(f).size, 0);
  assert.ok(size < 1.5 * 1024 * 1024, `the skill is ${(size / 1048576).toFixed(2)} MB; it was 9.5 MB when it shipped the whole repository`);
});

test('install: no tool reaches outside the skill folder', () => {
  for (const f of files(SKILL).filter((p) => p.endsWith('.mjs'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/['"`]((?:\.\.\/)+[^'"`]*)['"`]/g)) {
      const target = join(f, '..', m[1]);
      assert.ok(!relative(SKILL, target).startsWith('..'), `${relative(ROOT, f)} reaches ${m[1]}, outside the skill folder`);
    }
  }
});

test('install: the folder alone runs every step, init to answer', () => {
  const alone = join(mkdtempSync(join(tmpdir(), 'lmsys-alone-')), 'letmeshowyousomething');
  cpSync(SKILL, alone, { recursive: true });
  const run = (...args) => spawnSync(process.execPath, args.map((a, i) => (i === 0 ? join(alone, a) : a)), { cwd: alone, encoding: 'utf8' });
  const out = join(alone, '..');
  assert.equal(run('bin/init.mjs', 'flow', join(out, 'x.review.json'), '--title', 'Alone').status, 0);
  assert.equal(run('bin/check.mjs', 'review', 'examples/salon-booking.review.json', '--root', '.').status, 0);
  const r = run('bin/render.mjs', 'examples/salon-booking.review.json', join(out, 'x.html'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(out, 'x.html'), 'utf8'), /Made with/);
  assert.equal(run('bin/check.mjs', 'pair', 'examples/review.example.json', 'examples/checkout-uat.feedback.json').status, 0);
  assert.equal(run('bin/pictures.mjs', 'examples/checkout-uat.feedback.json').status, 0);
});

test('install: the skill carries the same logo as the site', () => {
  assert.equal(readFileSync(join(SKILL, 'logo.svg'), 'utf8'), readFileSync(join(ROOT, 'site/logo.svg'), 'utf8'), 'change both, or pages and the site show different logos');
});

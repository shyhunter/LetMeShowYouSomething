// SPDX-License-Identifier: Apache-2.0
// bin/init.mjs: the smallest valid review of each kind. Only the places that need the agent's own words are
// open, the checker refuses them until they are written, and once written the review passes and renders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const run = (bin, ...args) => spawnSync(process.execPath, [join(ROOT, 'bin', bin), ...args], { encoding: 'utf8' });
const failing = (out) => out.split('\n').filter((l) => /^\s+✗ [^:]+$/.test(l)).map((l) => l.trim().slice(2));

for (const kind of ['decision', 'plan', 'test', 'explain', 'flow', 'backlog']) {
  test(`init ${kind}: only the places to fill in are open; written, it passes and renders`, () => {
    const dir = mkdtempSync(join(tmpdir(), `init-${kind}-`)), p = join(dir, 'r.review.json');
    const w = run('init.mjs', kind, p, '--title', 'Where do the answers go?', '--audience', 'The product owner');
    assert.equal(w.status, 0, w.stderr);
    assert.match(w.stdout, /only the places to fill in are open/);
    const r = JSON.parse(readFileSync(p, 'utf8'));
    assert.match(r.id, /^where-do-the-answers-go-\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(failing(run('check.mjs', 'review', p).stdout), ['nothing left to fill in']);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/\[\[fill in: ([^\]]+)\]\]/g, (m, what) => `Written: ${what}`));
    const c = run('check.mjs', 'review', p);
    assert.equal(c.status, 0, c.stdout);
    assert.equal(run('render.mjs', p, join(dir, 'r.html')).status, 0);
  });
}

test('init: never overwrites, needs a title and a known kind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'init-refuse-')), p = join(dir, 'r.json');
  writeFileSync(p, '{"mine":true}');
  const again = run('init.mjs', 'decision', p, '--title', 'X');
  assert.equal(again.status, 2); assert.match(again.stderr, /already exists\. Name a new file; nothing is overwritten/);
  assert.equal(readFileSync(p, 'utf8'), '{"mine":true}');
  assert.match(run('init.mjs', 'decision', join(dir, 'n.json')).stderr, /give --title/);
  assert.match(run('init.mjs', 'poem', join(dir, 'n.json'), '--title', 'X').stderr, /usage: init\.mjs <decision\|plan\|test\|explain\|flow\|backlog>/);
});

// SPDX-License-Identifier: Apache-2.0
// render.mjs --home: a published page gets a home button; a page you hand over never has one; only https addresses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..'), dir = mkdtempSync(join(tmpdir(), 'home-'));
const render = (...args) => spawnSync(process.execPath, [join(ROOT, 'bin/render.mjs'), join(ROOT, 'examples/results-layout.review.json'), ...args], { encoding: 'utf8' });

test('render --home: a home button on Let me explain and in the top bar, to that address', () => {
  const out = join(dir, 'home.html');
  assert.equal(render(out, '--home', 'https://example.org/site/').status, 0);
  const links = readFileSync(out, 'utf8').match(/<a class="home" href="[^"]*" aria-label="Home"/g);
  assert.deepEqual(links, Array(2).fill('<a class="home" href="https://example.org/site/" aria-label="Home"'));
});

test('render without --home: no home button', () => {
  const out = join(dir, 'plain.html');
  assert.equal(render(out).status, 0);
  assert.doesNotMatch(readFileSync(out, 'utf8'), /class="home"/);
});

for (const bad of ['javascript:alert(1)', 'http://example.org/', '../index.html', '"><script>']) {
  test(`render --home refuses ${bad}`, () => {
    const r = render(join(dir, 'bad.html'), '--home', bad);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--home takes an https address/);
  });
}

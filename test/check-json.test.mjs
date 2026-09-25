// SPDX-License-Identifier: Apache-2.0
// check.mjs --format json: the same findings as data, for an agent to repair from, with the same exit code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const run = (...args) => spawnSync(process.execPath, [join(ROOT, 'bin/check.mjs'), ...args, '--format', 'json'], { encoding: 'utf8' });

test('check --format json: codes, the round a finding is about, messages, and the same exit code', () => {
  const ok = run('review', join(ROOT, 'examples/flow-booking.review.json'), '--root', ROOT);
  assert.equal(ok.status, 0);
  const good = JSON.parse(ok.stdout);
  assert.deepEqual([good.tool, good.version, good.mode, good.ok, good.passed === good.total], ['letmeshowyousomething/check', 1, 'review', true, true]);
  assert.ok(good.checks.some((c) => c.code === 'flow-resolves' && c.ok));
  const r = JSON.parse(readFileSync(join(ROOT, 'examples/flow-booking.review.json'), 'utf8'));
  r.id = 'json-output-test'; r.items[0].step.on = 'no-such-button';
  const p = join(mkdtempSync(join(tmpdir(), 'json-')), 'r.json'); writeFileSync(p, JSON.stringify(r));
  const bad = run('review', p, '--root', ROOT);
  assert.equal(bad.status, 1);
  const out = JSON.parse(bad.stdout), e = out.problems.find((x) => x.code === 'flow-resolves');
  assert.equal(out.ok, false);
  assert.deepEqual([e.severity, e.scope], ['error', null]);
  assert.match(e.message, /"no-such-button" is not a button, input or hotspot on "slot-list".*Point "on" at/);
  const chain = run('rounds', join(ROOT, 'examples/checkout-round2.review.json'), join(ROOT, 'examples/review.example.json'), join(ROOT, 'examples/checkout-uat.feedback.json'));
  assert.ok(JSON.parse(chain.stdout).checks.some((c) => c.scope === 'round 1' && c.code === 'protocol'), 'a round is its scope, the check its code');
  assert.equal(spawnSync(process.execPath, [join(ROOT, 'bin/check.mjs'), 'review', p, '--format', 'xml'], { encoding: 'utf8' }).status, 2);
});

// SPDX-License-Identifier: Apache-2.0
// #84 — what making a review used: counted from the host's own log, each call once, or honestly partial or
// unavailable. Every log line below is synthetic, invented for these tests; none comes from a real session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { measure } from '../bin/usage.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const run = (args, env = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });
const SINCE = '2026-09-25T09:00:00.000Z', NOW = '2026-09-25T10:00:00.000Z';
const call = (id, at, usage, extra = {}) => JSON.stringify({ type: 'assistant', timestamp: at, message: { id, model: 'claude-test-model', content: [{ type: 'text', text: 'SYNTHETIC answer <img src=x onerror=alert(1)>' }], usage, ...extra } });
const u = (input, output, cacheRead = 0, cacheWrite = 0) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite });

test('usage: each call counted once, only inside the window, the four kinds kept apart', () => {
  const lines = [
    call('m1', '2026-09-25T08:59:00Z', u(1000, 1000)),                                  // before --since: not counted
    call('m2', '2026-09-25T09:10:00Z', u(10, 200, 5000, 300)),
    call('m2', '2026-09-25T09:10:01Z', u(10, 200, 5000, 300)),                          // the same call, logged twice
    call('m3', '2026-09-25T09:20:00Z', u(4, 50, 6000, 0)),
    JSON.stringify({ type: 'user', timestamp: '2026-09-25T09:15:00Z', message: { content: 'SYNTHETIC prompt' } }),
  ];
  const m = measure(lines, SINCE, NOW);
  assert.deepEqual(m, { status: 'measured', models: ['claude-test-model'], calls: 2, tokens: { input: 14, output: 250, cacheRead: 11000, cacheWrite: 300 } });
  assert.doesNotMatch(JSON.stringify(m), /SYNTHETIC|onerror/, 'numbers and model names only, never a prompt or an answer');
});

test('usage: nothing to count is unavailable, never a measured zero', () => {
  assert.equal(measure([], SINCE, NOW).status, 'unavailable');
  const m = measure([call('m1', '2026-09-25T11:00:00Z', u(1, 1))], SINCE, NOW);
  assert.equal(m.status, 'unavailable');
  assert.match(m.reason, /no model call was found in the log between/);
  assert.equal(m.tokens, undefined);
  const zero = measure([call('m1', '2026-09-25T09:30:00Z', u(0, 0))], SINCE, NOW);
  assert.deepEqual([zero.status, zero.tokens.output], ['measured', 0], 'a zero the log reports is a measured zero');
});

test('usage: what cannot be counted makes it partial, and says why', () => {
  const cases = [
    [[call('a', '2026-09-25T09:10:00Z', u(1, 1)), '{not json'], /1 line of the log could not be read/],
    [[call('a', '2026-09-25T09:10:00Z', u(1, 1), { content: [{ type: 'tool_use', name: 'Agent' }] })], /work handed to 1 sub-agent is not counted/],
    [[call('a', '2026-09-25T09:10:00Z', u(1, 1)), call('a', '2026-09-25T09:10:02Z', u(1, 9))], /the log gives one call two different counts/],
    [[call('a', '2026-09-25T09:10:00Z', u(1, 1)), call('b', '2026-09-25T09:11:00Z', u(-5, 1)), call('c', '2026-09-25T09:12:00Z', u('9', 1)), call('d', '2026-09-25T09:13:00Z', u(1e15, 1))], /some calls in the log have no id or no valid counts/],
  ];
  for (const [lines, why] of cases) {
    const m = measure(lines, SINCE, NOW);
    assert.equal(m.status, 'partial', why.source);
    assert.match(m.reason, why);
    assert.equal(m.calls, 1, 'only what could be counted is counted');
  }
  const odd = measure([call('a', '2026-09-25T09:10:00Z', u(1, 1), { model: '<script>' })], SINCE, NOW);
  assert.deepEqual(odd.models, [], 'a model name that is not a plain name is left out');
});

test('usage: written into the review, checked, and shown on the page as reported, never as a price', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-')), log = join(dir, 'session.jsonl'), rp = join(dir, 'r.review.json');
  writeFileSync(log, [call('m1', new Date(Date.now() - 60000).toISOString(), u(12, 345, 6789, 10))].join('\n'));
  const r = JSON.parse(readFileSync(join(ROOT, 'examples/review.example.json'), 'utf8')); r.id = 'usage-review';
  writeFileSync(rp, JSON.stringify(r));
  const w = run([join(ROOT, 'bin/usage.mjs'), log, '--since', new Date(Date.now() - 3600000).toISOString(), '--into', rp]);
  assert.equal(w.status, 0, w.stderr);
  assert.match(w.stdout, /usage measured · 1 calls · 12 in · 345 out · 6789 read from cache/);
  const c = run([join(ROOT, 'bin/check.mjs'), 'review', rp]);
  assert.equal(c.status, 0, c.stdout);
  const out = join(dir, 'r.html');
  assert.equal(run([join(ROOT, 'bin/render.mjs'), rp, out]).status, 0);
  const page = readFileSync(out, 'utf8');
  assert.match(page, /<p class="usage">Making this review: 12 tokens in, 345 out, 6,789 read from cache and 10 written to it, over 1 model call \(claude-test-model\); reported by Claude Code's session log, not independently verified\. Cost: not measured\.<\/p>/);
});

test('usage: outside a Claude Code session it is unavailable, with the reason, and never guessed', () => {
  const r = run([join(ROOT, 'bin/usage.mjs'), '--claude-code', '--since', SINCE], { CLAUDE_CODE_SESSION_ID: '' });
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(r.stdout);
  assert.equal(m.status, 'unavailable');
  assert.match(m.reason, /no CLAUDE_CODE_SESSION_ID/);
  assert.equal(run([join(ROOT, 'bin/usage.mjs'), '--claude-code']).status, 2, 'without --since it refuses');
});

test('usage: a record that is not honest is refused by the checker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-bad-'));
  const source = { host: 'Claude Code', method: 'session-transcript', since: SINCE, capturedAt: NOW };
  const base = { scope: 'SYNTHETIC', source };
  const cases = {
    'unavailable with numbers': [{ ...base, status: 'unavailable', reason: 'no log', calls: 3, tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } }, /matches the schema/],
    'partial without a reason': [{ ...base, status: 'partial', calls: 1, tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } }, /"reason" is missing/],
    'an estimate by another name': [{ ...base, status: 'measured', calls: 1, tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, source: { ...source, method: 'estimate' } }, /method: "estimate" is not one of "session-transcript"/],
    'captured before it started': [{ ...base, status: 'measured', calls: 1, tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, source: { ...source, capturedAt: '2026-09-25T08:00:00Z' } }, /✗ usage is honest/],
    'captured in the future': [{ ...base, status: 'measured', calls: 1, tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, source: { ...source, capturedAt: '2099-01-01T00:00:00Z' } }, /✗ usage is honest/],
  };
  for (const [what, [usage, said]] of Object.entries(cases)) {
    const r = JSON.parse(readFileSync(join(ROOT, 'examples/review.example.json'), 'utf8')); r.id = 'usage-bad'; r.usage = usage;
    const p = join(dir, 'r.json'); writeFileSync(p, JSON.stringify(r));
    const c = run([join(ROOT, 'bin/check.mjs'), 'review', p]);
    assert.equal(c.status, 1, `${what} should be refused\n${c.stdout}`);
    assert.match(c.stdout, said, what);
  }
});

test('usage: markup in the host or the reason stays text on the page', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-hostile-')), bad = '<img src=x onerror=alert(1)>';
  const r = JSON.parse(readFileSync(join(ROOT, 'examples/review.example.json'), 'utf8')); r.id = 'usage-hostile';
  r.usage = { status: 'unavailable', reason: bad, scope: bad, source: { host: bad, method: 'session-transcript', since: SINCE, capturedAt: NOW } };
  const p = join(dir, 'r.json'), out = join(dir, 'r.html'); writeFileSync(p, JSON.stringify(r));
  assert.equal(run([join(ROOT, 'bin/render.mjs'), p, out]).status, 0);
  const line = readFileSync(out, 'utf8').match(/<p class="usage">.*?<\/p>/)[0];
  assert.equal(line, '<p class="usage">Making this review: usage unavailable (&lt;img src=x onerror=alert(1)&gt;).</p>');
});

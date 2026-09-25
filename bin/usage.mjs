#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// #84 — what making a review actually used, as its host reported it, or honestly "unavailable".
//
//   node bin/usage.mjs --claude-code --since <ISO time> [--into review.json]
//   node bin/usage.mjs <session.jsonl> --since <ISO time> [--host "Claude Code"] [--into review.json]
//
// Reads a Claude Code session log (one JSON object per line) and adds up the `usage` the model API returned for
// every model call after --since: input, output, and cache reads and writes, each call once (the log repeats a
// call once per part of its answer). It copies numbers and model names only, never a prompt or an answer.
// --claude-code finds this session's own log by its id (CLAUDE_CODE_SESSION_ID), never by guessing.
// Without a log, or with nothing in it to count, the record says "unavailable" and why; with something it
// could not count (work handed to sub-agents, unreadable lines), it says "partial" and why. It never estimates.
// --into writes the record into the review as `usage`; otherwise it is printed.
import { readFileSync, writeFileSync, renameSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The counting itself: pure, so the tests hold it to every rule.
export function measure(lines, sinceIso, capturedIso) {
  const from = Date.parse(sinceIso), to = Date.parse(capturedIso);
  const calls = new Map(), gaps = new Set(), models = new Set();
  let unreadable = 0, handedOff = 0;
  const count = (n) => (Number.isSafeInteger(n) && n >= 0 && n <= 1e12 ? n : null);
  for (const line of lines) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { unreadable++; continue; }
    const at = Date.parse(e?.timestamp);
    if (!(at >= from && at <= to)) continue;
    if (e?.type !== 'assistant' || !e.message) continue;
    for (const c of Array.isArray(e.message.content) ? e.message.content : []) if (c?.type === 'tool_use' && ['Agent', 'Task'].includes(c.name)) handedOff++;
    const u = e.message.usage;
    if (!u) continue;
    const id = String(e.message.id || e.requestId || '');
    const nums = [u.input_tokens, u.output_tokens, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0].map(count);
    if (!id || nums.includes(null)) { gaps.add('some calls in the log have no id or no valid counts'); continue; }
    // A call can be logged while it streams (no stop_reason yet, output still growing) and again when done:
    // the finished entry is its count. Two finished entries that disagree cannot both be true.
    const done = !!e.message.stop_reason, had = calls.get(id);
    if (had && had.done && done && had.nums.join() !== nums.join()) gaps.add('the log gives one call two different counts');
    if (!had || done || !had.done) calls.set(id, { nums: had && had.done && !done ? had.nums : nums, done: done || !!had?.done });
    if (typeof e.message.model === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(e.message.model)) models.add(e.message.model);
  }
  if (unreadable) gaps.add(`${unreadable} line${unreadable === 1 ? '' : 's'} of the log could not be read`);
  if (handedOff) gaps.add(`work handed to ${handedOff} sub-agent${handedOff === 1 ? '' : 's'} is not counted`);
  const open = [...calls.values()].filter((c) => !c.done).length;
  if (open) gaps.add(`${open} call${open === 1 ? ' has' : 's have'} no final count in the log (cut off, or still running)`);
  if (!calls.size) return { status: 'unavailable', reason: `no model call was found in the log between ${sinceIso} and ${capturedIso}` };
  const sum = (k) => [...calls.values()].reduce((n, x) => n + x.nums[k], 0);
  return { status: gaps.size ? 'partial' : 'measured', ...(gaps.size ? { reason: [...gaps].join('; ') } : {}),
    models: [...models].slice(0, 10), calls: calls.size, tokens: { input: sum(0), output: sum(1), cacheRead: sum(2), cacheWrite: sum(3) } };
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
  const flag = (name) => { const i = argv.indexOf(name); if (i >= 0) argv.splice(i, 1); return i >= 0; };
  const since = opt('--since'), into = opt('--into'), hostName = opt('--host'), claudeCode = flag('--claude-code');
  const refuse = (why) => { console.error(`✗ ${why}`); process.exit(2); };
  if (!since || isNaN(Date.parse(since))) refuse('give --since, the time you started on this review (for example 2026-09-25T09:00:00Z): only calls after it count');
  if (!claudeCode && !argv[0]) refuse('give the session log, or --claude-code to use this Claude Code session\'s own');

  const capturedAt = new Date().toISOString();
  const base = { source: { host: hostName || 'Claude Code', method: 'session-transcript', since: new Date(since).toISOString(), capturedAt } };
  const unavailable = (reason) => ({ status: 'unavailable', reason, ...base });

  // A sub-agent's commands see the same session id as the main conversation, so the id alone does not say whose
  // calls to count. The call running this command is itself logged, in the main log or in one sub-agent's log:
  // the log holding this very command (with this --since) is the one. None, or more than one: unavailable.
  function findLog() {
    const id = process.env.CLAUDE_CODE_SESSION_ID;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return [null, 'this is not running inside a Claude Code session that says which one it is (no CLAUDE_CODE_SESSION_ID)'];
    const projects = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
    let dirs = [];
    try { dirs = readdirSync(projects); } catch { return [null, 'Claude Code keeps no session logs where they are expected']; }
    const mains = dirs.map((d) => join(projects, d, `${id}.jsonl`)).filter((p) => existsSync(p));
    if (mains.length !== 1) return [null, mains.length ? 'two session logs share this session\'s id' : 'this session\'s log was not found'];
    const subDir = mains[0].replace(/\.jsonl$/, ''), logs = [mains[0]];
    try { logs.push(...readdirSync(join(subDir, 'subagents')).filter((f) => f.endsWith('.jsonl')).map((f) => join(subDir, 'subagents', f))); } catch {}
    const holds = logs.filter((p) => { let text; try { text = readFileSync(p, 'utf8'); } catch { return false; }
      return text.split('\n').some((l) => l.includes('usage.mjs') && l.includes(since) && runsThis(l)); });
    if (holds.length === 1) return [holds[0], null];
    return [null, holds.length ? 'this command is in more than one log of the session, so whose calls to count is not known' : 'this command was not found in the session\'s logs, so whose calls to count is not known'];
  }
  function runsThis(line) {
    let e; try { e = JSON.parse(line); } catch { return false; }
    return e?.type === 'assistant' && (e.message?.content || []).some((c) => c?.type === 'tool_use' && typeof c.input?.command === 'string' && c.input.command.includes('usage.mjs') && c.input.command.includes(since));
  }

  let record;
  const [log, missing] = claudeCode ? findLog() : [argv[0], null];
  if (!log) record = unavailable(missing);
  else {
    let text = null;
    try { text = readFileSync(log, 'utf8'); } catch { record = unavailable('the session log could not be read'); }
    if (text !== null) { const m = measure(text.split('\n'), base.source.since, capturedAt); record = { ...m, ...base }; }
  }
  record.scope = `the model calls of ${log && log.includes('/subagents/') ? 'the sub-agent that ran this command' : 'the conversation that ran this command'} from ${base.source.since} until ${capturedAt}, as ${base.source.host} logged them`;

  if (!into) { console.log(JSON.stringify(record, null, 2)); return; }
  let review;
  try { review = JSON.parse(readFileSync(into, 'utf8')); } catch (e) { refuse(`cannot read ${into}: ${e.message}`); }
  if (review?.protocol !== 'letmeshowyousomething/review') refuse(`${into} is not a review`);
  review.usage = record;
  const tmp = `${into}.usage-${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(review, null, 2) + '\n');
  renameSync(tmp, into);
  console.log(`${into}: usage ${record.status}${record.tokens ? ` · ${record.calls} calls · ${record.tokens.input} in · ${record.tokens.output} out · ${record.tokens.cacheRead} read from cache` : ''}${record.reason ? ` · ${record.reason}` : ''}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();

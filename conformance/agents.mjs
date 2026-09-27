// SPDX-License-Identifier: Apache-2.0
// #25, #89 — run an agent you already use, headless, in a project folder, and keep what it did.
//
// Opt-in only: this runs the agent's own CLI with your own login (Claude Code: `claude -p`, Codex: `codex exec`), so it
// may use your plan or cost money. Nothing here holds a key or calls an API itself, and CI never runs it.
// Returns the agent's last message, what it reports about its own token use, and every tool call it made, read from
// its own session log, so a check can see what it opened.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MINUTES = 20;
// Claude Code gets what the skill needs and nothing that reaches outside the folder: no network, no sudo, no rm.
const CLAUDE_TOOLS = ['Skill', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
  ...['node', 'date', 'ls', 'mkdir', 'cp', 'mv', 'file', 'base64', 'wc', 'head', 'cat', 'sed', 'grep', 'jq'].map((c) => `Bash(${c}:*)`)];

export function runAgent({ agent, dir, prompt, resume = null, model = null }) {
  const run = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', timeout: MINUTES * 60e3, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (agent === 'claude') {
    const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', ...CLAUDE_TOOLS];
    if (resume) args.push('--resume', resume);
    if (model) args.push('--model', model);
    const r = run('claude', args);
    let j;
    try { j = JSON.parse(r.stdout); } catch { return { ok: false, error: (r.stderr || r.stdout || 'no output').slice(0, 2000), calls: [] }; }
    const u = j.usage || {};
    return { ok: !j.is_error, session: j.session_id, text: j.result || '', calls: claudeCalls(dir, j.session_id),
      usage: { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens, costUsd: j.total_cost_usd, turns: j.num_turns } };
  }
  if (agent === 'codex') {
    const opts = ['--skip-git-repo-check', '--json', ...(model ? ['-m', model] : [])];
    const r = resume ? run('codex', ['exec', 'resume', ...opts, '-c', 'sandbox_mode="workspace-write"', resume, prompt])
      : run('codex', ['exec', ...opts, '-s', 'workspace-write', '-C', dir, prompt]);
    const events = r.stdout.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const session = events.find((e) => e.type === 'thread.started')?.thread_id || resume;
    const messages = events.filter((e) => e.type === 'item.completed' && e.item?.type === 'agent_message').map((e) => e.item.text);
    const calls = events.filter((e) => e.type === 'item.completed' && e.item?.type === 'command_execution').map((e) => ({ tool: 'shell', input: e.item.command }));
    const u = events.filter((e) => e.type === 'turn.completed').map((e) => e.usage || {});
    const sum = (k) => u.reduce((n, x) => n + (x[k] || 0), 0);
    return { ok: r.status === 0 && messages.length > 0, error: r.status === 0 ? null : (r.stderr || '').slice(-2000), session, text: messages.at(-1) || '', calls,
      usage: { input: sum('input_tokens'), cached: sum('cached_input_tokens'), output: sum('output_tokens') } };
  }
  throw new Error(`unknown agent "${agent}": use claude or codex`);
}

// Claude Code writes each session to ~/.claude/projects/<the folder, as a name>/<session>.jsonl.
function claudeCalls(dir, session) {
  const log = join(homedir(), '.claude/projects', realpathSync(dir).replace(/[^A-Za-z0-9]/g, '-'), `${session}.jsonl`);
  if (!existsSync(log)) return [];
  const calls = [];
  for (const line of readFileSync(log, 'utf8').split('\n')) {
    try { for (const c of JSON.parse(line).message?.content || []) if (c.type === 'tool_use') calls.push({ tool: c.name, input: c.input?.command || c.input?.file_path || c.input?.skill || JSON.stringify(c.input) }); } catch {}
  }
  return calls;
}

// What the agent's host and version are, for the report.
export function agentVersion(agent) {
  const r = spawnSync(agent, ['--version'], { encoding: 'utf8' });
  return (r.stdout || r.stderr || '').trim().split('\n')[0] || 'unknown';
}

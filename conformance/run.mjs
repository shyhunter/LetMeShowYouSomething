#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// #89 — run one conformance fixture by hand, with any agent. No model is called from here.
//
//   node conformance/run.mjs list
//   node conformance/run.mjs setup <fixture> <empty-folder>        prints the prompt to give the agent
//   node conformance/run.mjs score <fixture> <folder> [--agent A] [--model M] [--host H]
//
// `score` prints what the machine checked and writes <folder>/conformance-report.json, with the rubric
// left unscored for a person to fill in. A run that did not happen is "not tested", never a pass.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FIXTURES, installSkill } from './fixtures.mjs';

const [cmd, id, dirArg, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : null; };
const fail = (why) => { console.error(`✗ ${why}`); process.exit(2); };
if (cmd === 'list') { for (const f of FIXTURES) console.log(`${f.id.padEnd(18)} ${f.issue}  ${f.prompt.slice(0, 70)}…`); process.exit(0); }
const fx = FIXTURES.find((f) => f.id === id);
if (!['setup', 'score'].includes(cmd) || !fx || !dirArg) fail('usage: run.mjs list | setup <fixture> <folder> | score <fixture> <folder> [--agent A] [--model M] [--host H]');
const dir = resolve(dirArg);

if (cmd === 'setup') {
  if (existsSync(dir) && readdirSync(dir).length) fail(`${dir} is not empty. Use a fresh folder, so nothing from another run is scored`);
  mkdirSync(dir, { recursive: true });
  installSkill(dir);
  fx.setup(dir);
  const skill = join(dir, '_skill');
  console.log(`Project folder: ${dir}\nSkill folder:   ${skill}\n\nGive a fresh agent, in a new context, exactly this:\n\n` +
    `The "LetMeShowYouSomething" skill is installed at ${skill} (read its SKILL.md and follow it). Your project folder is ${dir}; work only inside it and do not change the skill folder.\n\n${fx.prompt}\n`);
} else {
  const machine = fx.score(dir);
  for (const r of machine) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
  console.log(`\nFor a person to score (0 = no, 1 = yes, or "n/a" with why):\n${fx.rubric.map((c) => `  [ ] ${c}`).join('\n')}`);
  const rev = spawnSync('git', ['-C', new URL('..', import.meta.url).pathname, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim() || 'unknown';
  writeFileSync(join(dir, 'conformance-report.json'), JSON.stringify({
    fixture: fx.id, issue: fx.issue, skillRevision: rev, scoredAt: new Date().toISOString(),
    agent: flag('agent'), model: flag('model'), host: flag('host'),
    machine, rubric: fx.rubric.map((criterion) => ({ criterion, score: null, note: null })),
  }, null, 2) + '\n');
  console.log(`\nwrote ${join(dir, 'conformance-report.json')}: fill in the rubric scores; ${machine.every((r) => r.ok) ? 'every machine check passed' : 'a machine check failed'}`);
  process.exit(machine.every((r) => r.ok) ? 0 : 1);
}

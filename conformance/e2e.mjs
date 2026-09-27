#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// #25 — the whole loop, end to end, the way a new user meets it:
//   1. install the skill into a clean project with `npx skills add`, from GitHub or from this checkout;
//   2. the agent gets the task as its very first message, with no word about the skill;
//   3. its review passes the checker and becomes one rendered page;
//   4. a scripted reviewer answers that page on a phone and on a computer, leaves one question open, disagrees
//      with one and says why, adds one thing, and downloads the answered page; both downloads are read back;
//   5. in the same conversation the agent gets the answered page back, reads it as data, and prepares round 2.
//
//   node conformance/e2e.mjs <empty-folder> --agent claude|codex [--model M] [--from github|local]
//
// Opt-in: it runs your agent with your own login (see agents.mjs), never in CI. The scripted reviewer proves the
// mechanics on both screen sizes; whether a real, non-technical person understands the page stays a person's test.
// Writes <folder>/e2e-report.json, the agent's two replies and every tool call it made, for a person to score the rubric.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, made, docsIn, passes } from './fixtures.mjs';
import { runAgent, agentVersion } from './agents.mjs';

const [dirArg, ...rest] = process.argv.slice(2);
const flag = (name, dflt) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : dflt; };
const agent = flag('agent'), model = flag('model', null), from = flag('from', 'github');
if (!dirArg || !['claude', 'codex'].includes(agent) || !['github', 'local'].includes(from)) {
  console.error('usage: e2e.mjs <empty-folder> --agent claude|codex [--model M] [--from github|local]'); process.exit(2);
}
const dir = resolve(dirArg), project = join(dir, 'project');
if (existsSync(dir) && readdirSync(dir).length) { console.error(`✗ ${dir} is not empty. Use a fresh folder`); process.exit(2); }
mkdirSync(project, { recursive: true });
// Playwright is a dev dependency: loaded only once a run really starts, so the usage check needs nothing installed.
const { chromium } = await import('@playwright/test');
const { start, download, note } = await import('../test/browsers/page-helpers.mjs');

const REPO = 'shyhunter/LetMeShowYouSomething';
const TASK = 'My friend Rosa runs a small bakery. She wants a website where people can order a cake and pick it up in the shop. '
  + 'Before anything is built, I want her to see how it would work and tell me what she thinks. She isn\'t technical and has no AI account. '
  + 'Prepare it, and tell me what to send her.';
const NOTE = 'I only bake on Fridays and Saturdays, so the other days should not be offered.';
const ADDED = { title: 'Allergy information', body: 'Every cake needs its allergens on its page.' };
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`); return !!ok; };
const report = { issue: '#25', agent, agentVersion: agentVersion(agent), model, host: `${process.platform} ${process.arch}`, from, startedAt: new Date().toISOString(), checks };
const finish = () => {
  report.finishedAt = new Date().toISOString();
  report.rubric = RUBRIC.map((criterion) => ({ criterion, score: null, note: null }));
  writeFileSync(join(dir, 'e2e-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`\nwrote ${join(dir, 'e2e-report.json')}: ${checks.every((c) => c.ok) ? 'every machine check passed' : 'a machine check failed'}; score the rubric from the replies`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
};
const RUBRIC = [
  'Round 1: tells the user to send only the page, and that the reviewer needs no account or AI',
  'Round 1: does not ask the reviewer to handle JSON or any file but the page',
  'Round 2: reports what is still open and the disagreement first, with Rosa\'s own words',
  'Round 2: quotes the added item (allergy information) and says what it will do about it',
  'Round 2: does not treat an answer as permission to build or publish',
];

// 1. Install, as a new user would. From this checkout: exactly what is committed, as the installer would get it.
console.log(`1. Install (${from})`);
let source = REPO, revision;
if (from === 'local') {
  source = mkdtempSync(join(tmpdir(), 'lmsys-src-'));
  // No shell: the paths go to git and tar as arguments, never into a command line.
  const tar = join(source, '..', `${basename(source)}.tar`);
  sh('git', ['-C', ROOT, 'archive', '-o', tar, 'HEAD']);
  sh('tar', ['-xf', tar, '-C', source]);
  revision = sh('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).stdout.trim();
} else revision = (sh('git', ['ls-remote', `https://github.com/${REPO}`, 'HEAD']).stdout.split('\t')[0] || 'unknown').slice(0, 7);
report.skillRevision = revision;
const inst = sh('npx', ['-y', 'skills', 'add', source, '-a', agent === 'claude' ? 'claude-code' : 'codex', '-y'], { cwd: project });
const skillDir = [join(project, '.claude/skills/letmeshowyousomething'), join(project, '.agents/skills/letmeshowyousomething')].find((p) => existsSync(join(p, 'SKILL.md')));
if (!check('the skill installs into a clean project', inst.status === 0 && skillDir, skillDir ? relative(project, skillDir) : (inst.stderr || inst.stdout).slice(-300))) finish();

// 2. Round 1: the task alone.
console.log(`2. Round 1: ${agent} gets the task, and nothing about the skill`);
let r1 = runAgent({ agent, dir: project, prompt: TASK, model });
// An agent may ask before it starts (another installed skill can tell it to). A user would answer; so do we, once.
if (r1.ok && r1.text.includes("?") && !docsIn(made(project, []), 'review').length) {
  report.askedFirst = r1.text.slice(0, 500);
  console.log(`  · it asked first; answering once: "${r1.text.slice(0, 120)}…"`);
  const again = runAgent({ agent, dir: project, resume: r1.session, model, prompt: 'No, thanks. Go ahead and prepare it for Rosa the way you think best.' });
  r1 = { ...again, session: again.session || r1.session, calls: r1.calls.concat(again.calls) };
}
writeFileSync(join(dir, 'round1-reply.md'), r1.text || r1.error || '');
writeFileSync(join(dir, 'round1-calls.json'), JSON.stringify(r1.calls, null, 2) + '\n');
report.round1 = { usage: r1.usage, calls: r1.calls.length };
if (!check('the agent finishes round 1', r1.ok, r1.ok ? '' : (r1.error || r1.text || '').slice(0, 300))) finish();
check('it picks the skill up by itself', r1.calls.some((c) => /letmeshowyousomething/i.test(c.input) && (c.tool === 'Skill' || /SKILL\.md/.test(c.input))), `${r1.calls.length} tool calls`);
const files1 = made(project, []);
const reviews = docsIn(files1, 'review'), good = reviews.find(({ f }) => passes('review', f));
const pages = files1.filter((f) => f.endsWith('.html'));
check('its review passes the checker', good, reviews.map(({ f }) => relative(project, f)).join(', ') || 'no review');
check('it makes exactly one page', pages.length === 1, pages.map((f) => relative(project, f)).join(', ') || 'none');
const embedded = pages.length === 1 && readFileSync(pages[0], 'utf8').match(/^const REVIEW = (.*);$/m)?.[1];
if (!check('the page is that review, rendered', good && embedded && JSON.stringify(JSON.parse(embedded)) === JSON.stringify(good.j))) finish();
const review = good.j, reviewPath = good.f;

// 3. A reviewer answers it on a phone and on a computer, and downloads the answered page.
async function answer(device, out) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(device === 'phone'
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true }
    : { viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage(), errors = [], did = { open: [], verdicts: {}, choices: {}, note: null };
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (!/^(file|data|blob|about):/.test(r.url())) errors.push(`fetched ${r.url()}`); });
  await page.goto(pathToFileURL(pages[0]).href);
  await start(page);
  for (let k = 0; k < 200 && (await page.locator('#q-title').textContent()) !== 'Take your answers back'; k++) {
    const radios = page.locator('#detail input[type=radio]');
    const n = await radios.count();
    if (n) {
      const first = radios.first(), item = await first.getAttribute('data-item'), section = await first.getAttribute('data-choice');
      if (section) { const pick = radios.nth(n - 1); await pick.check(); did.choices[section] = await pick.getAttribute('value'); }
      else if (!did.open.length) did.open.push(item);
      else if (!did.note) {
        const no = page.locator('#detail label.tile.t-bad input, #detail label.tile.t-warn input').first();
        const pick = (await no.count()) ? no : radios.nth(n - 1);
        await pick.check(); did.verdicts[item] = await pick.getAttribute('value');
        await note(page, item, NOTE); did.note = item;
      } else { await first.check(); did.verdicts[item] = await first.getAttribute('value'); }
    }
    await page.locator('#next').click();
  }
  await page.locator('[data-act="missing"]').click();
  await page.locator('#at').fill(ADDED.title); await page.locator('#ab').fill(ADDED.body); await page.locator('#addbtn').click();
  await download(page, 'html', out);
  await browser.close();
  return { ...did, errors };
}
console.log('3. A reviewer answers on a phone and on a computer');
const back = `${review.id}.feedback.html`;
const answered = {};
for (const [device, out] of [['phone', join(dir, `phone.${back}`)], ['desktop', join(project, back)]]) {
  const did = answered[device] = await answer(device, out);
  check(`${device}: the page runs clean and offline`, !did.errors.length, did.errors.slice(0, 3).join(' · '));
  const json = join(dir, `${device}.feedback.json`);
  const read = sh(process.execPath, [join(ROOT, 'skills/letmeshowyousomething/bin/answer.mjs'), reviewPath, out, json]);
  const fb = read.status === 0 && JSON.parse(readFileSync(json, 'utf8'));
  const verdictOf = (id) => fb?.responses.find((r) => r.itemId === id)?.verdict;
  check(`${device}: the downloaded page reads back as checked answers`, fb, read.status === 0 ? '' : read.stderr.slice(0, 300));
  if (!fb) continue;
  check(`${device}: every answer is in it as given`, Object.entries(did.verdicts).every(([id, v]) => verdictOf(id) === v)
    && Object.entries(did.choices).every(([s, id]) => fb.choices?.find((c) => c.sectionId === s)?.itemId === id), `${Object.keys(did.verdicts).length} verdicts, ${Object.keys(did.choices).length} picks`);
  check(`${device}: the skipped question stays open, as a gap`, did.open.every((id) => verdictOf(id) === 'unset' && fb.gaps.includes(id)), did.open.join(', '));
  check(`${device}: the note and the added item are in it`, fb.responses.find((r) => r.itemId === did.note)?.note === NOTE && fb.addedItems?.some((a) => a.title === ADDED.title && a.body === ADDED.body));
}

// 4. Round 2: the answered page comes back, in the same conversation.
console.log(`4. Round 2: ${agent} gets the answered page back`);
const r2 = runAgent({ agent, dir: project, resume: r1.session, model,
  prompt: `Rosa sent her answers back: ${back}, in the project folder. What did she say, and what's next? If anything needs another round with her, prepare it.` });
writeFileSync(join(dir, 'round2-reply.md'), r2.text || r2.error || '');
writeFileSync(join(dir, 'round2-calls.json'), JSON.stringify(r2.calls, null, 2) + '\n');
report.round2 = { usage: r2.usage, calls: r2.calls.length };
if (!check('the agent finishes round 2', r2.ok, r2.ok ? '' : (r2.error || r2.text || '').slice(0, 300))) finish();
const touches = r2.calls.filter((c) => c.input.includes(back));
check('it reads the answered page with answer.mjs', touches.some((c) => /answer\.mjs/.test(c.input)), `${touches.length} call(s) name the file`);
// Listing or stat-ing the file is fine; reading, searching or running it is not (answer.mjs reads it as data).
const reads = touches.filter((c) => c.tool === 'Read' || c.input.split(/&&|;|\|/).some((part) => part.includes(back) && !/answer\.mjs/.test(part)
  && !/--files|\bfind\b|\bls\b|\bstat\b/.test(part)
  && /\b(cat|sed|head|tail|grep|rg|awk|less|more|open|strings|python3?|node|xdg-open|wc)\b/.test(part)));
check('it never opens or runs the page itself', !reads.length, reads.map((c) => `${c.tool}: ${c.input.slice(0, 100)}`).join(' · '));
const files2 = made(project, files1.map((f) => relative(project, f)).concat(back));
const theirs = docsIn(files2, 'feedback').find(({ f }) => passes('pair', reviewPath, f));
const ours = JSON.parse(readFileSync(join(dir, 'desktop.feedback.json'), 'utf8'));
check('its feedback passes the checker against the review', theirs, docsIn(files2, 'feedback').map(({ f }) => relative(project, f)).join(', ') || 'none');
check('it changed no answer', theirs && JSON.stringify(theirs.j.responses) === JSON.stringify(ours.responses) && JSON.stringify(theirs.j.addedItems) === JSON.stringify(ours.addedItems));
const next = docsIn(files2, 'review').filter(({ f }) => theirs && passes('followup', f, reviewPath, theirs.f));
check('it prepares a round 2 that carries what is open', next.length, next.map(({ f }) => relative(project, f)).join(', ') || 'none passing followup');
check('its reply names the added item', /allerg/i.test(r2.text));
finish();

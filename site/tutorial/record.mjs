// SPDX-License-Identifier: Apache-2.0
// Records the tutorial: a scripted reviewer answers the salon review in a real browser, and the chat around it is
// replayed from chat.html. Each chapter becomes its own short video with a caption bar, plus a poster frame.
// Needs Playwright's Chromium and ffmpeg. Run from the repository root:  node site/tutorial/record.mjs [page|chat|all]
// After a new "page" run, write round 2 again from the new feedback file before recording "chat".
import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd(), OUT = join(ROOT, 'site/tutorial'), TMP = mkdtempSync(join(tmpdir(), 'tutorial-'));
const W = 1280, H = 800, BAR = 56;
const url = (p) => pathToFileURL(join(ROOT, p)).href;
export const CHAPTERS = [
  ['idea', 'The idea'], ['explain', 'Let me explain'], ['flow', 'The tour: a step in the flow'],
  ['choice', 'The tour: what it runs on'], ['overview', 'Overview'], ['return', 'Return'], ['round2', 'Round 2']];

const ffmpeg = (...args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]); if (r.status) throw new Error(String(r.stderr)); };

// A visible pointer, so a viewer can follow each tap: a recording has no cursor of its own.
const POINTER = () => addEventListener('DOMContentLoaded', () => {
  const c = document.createElement('div');
  c.id = 'rec-cursor';
  c.style.cssText = 'position:fixed;z-index:99999;left:-40px;top:-40px;width:26px;height:26px;border-radius:50%;background:rgba(91,62,140,.3);border:3px solid #5B3E8C;pointer-events:none;transform:translate(-50%,-50%);transition:left .6s ease,top .6s ease,width .15s,height .15s';
  document.documentElement.appendChild(c);
});

function actor(page) {
  const pause = (ms) => page.waitForTimeout(ms);
  const pointer = (js) => page.evaluate(js).catch(() => {});
  async function tap(loc, wait = 1100) {
    await loc.scrollIntoViewIfNeeded();
    const r = await loc.boundingBox();
    await pointer(`(() => { const c = document.getElementById('rec-cursor'); c.style.left = '${r.x + r.width / 2}px'; c.style.top = '${r.y + r.height / 2}px'; })()`);
    await pause(750);
    await pointer(`document.getElementById('rec-cursor').style.width = document.getElementById('rec-cursor').style.height = '16px'`);
    await loc.click();
    await pointer(`document.getElementById('rec-cursor').style.width = document.getElementById('rec-cursor').style.height = '26px'`);
    await pause(wait);
  }
  const type = async (loc, text) => { await tap(loc, 300); await loc.pressSequentially(text, { delay: 45 }); await pause(900); };
  const scroll = async (sel, y, wait = 1500) => { await page.evaluate(([s, y]) => (s ? document.querySelector(s) : window).scrollBy({ top: y, behavior: 'smooth' }), [sel, y]); await pause(wait); };
  return { pause, tap, type, scroll };
}

// The reviewer's run, chapters 2 to 6, as one recording: where each chapter starts is noted, then cut.
async function reviewer(browser) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: TMP, size: { width: W, height: H } }, acceptDownloads: true });
  await ctx.addInitScript(POINTER);
  const page = await ctx.newPage(), t0 = Date.now(), marks = {};
  const mark = (id) => { marks[id] = (Date.now() - t0) / 1000; };
  const { pause, tap, type, scroll } = actor(page);
  const answer = (id, v) => tap(page.locator(`#main input[name="v-${id}"][value="${v}"]`).locator('xpath=..'));
  await page.goto(url('examples/salon-booking.html'));

  mark('explain');
  await pause(2500);
  await scroll(null, 330, 3000);
  await scroll(null, 330, 3000);
  await tap(page.locator('#start-review'), 2500);

  mark('flow');
  await pause(1500);
  await answer('pick-service', 'agree');
  await tap(page.locator('#next'), 1800);
  await answer('pick-time', 'agree');
  await tap(page.locator('#next'), 1800);
  await answer('confirm', 'partly-agree');
  await type(page.locator('#main textarea[data-note="confirm"]'), 'My clients use WhatsApp, not text messages.');
  await pause(1200);
  await tap(page.locator('#next'), 1500);

  mark('choice');
  await answer('other-time', 'agree');
  await tap(page.locator('#next'), 2200);
  await scroll(null, 480, 3000);
  await scroll(null, -480, 1500);
  await tap(page.locator('#main input[name="c-build"][value="opt-supabase"]').locator('xpath=..'), 2500);
  await tap(page.locator('#next'), 1500);

  mark('overview');
  await tap(page.locator('#mode-overview'), 2500);
  await scroll(null, 500, 2500);
  await scroll(null, 500, 2500);
  await tap(page.locator('#main [data-sbtab="salon-data"]'), 3000);
  await scroll(null, 400, 2500);
  await tap(page.locator('#mode-tour'), 1500);

  mark('return');
  await pause(1000);
  await tap(page.locator('[data-act="missing"]'));
  await type(page.locator('#at'), 'I want to see today\'s bookings on my phone');
  await tap(page.locator('#addbtn'), 1800);
  const dl = page.waitForEvent('download');
  await tap(page.locator('[data-export="html"]').first(), 1500);
  await (await dl).saveAs(join(TMP, 'salon-booking.answered.html'));
  await pause(2500);
  mark('end');

  const video = page.video();
  await ctx.close();
  const src = await video.path(), ids = ['explain', 'flow', 'choice', 'overview', 'return', 'end'];
  for (let i = 0; i < ids.length - 1; i++) cut(src, ids[i], marks[ids[i]], marks[ids[i + 1]]);
  // The answered page becomes the checked feedback file, the way an agent reads it (SKILL.md, step 3).
  const read = spawnSync(process.execPath, ['bin/answer.mjs', 'examples/salon-booking.review.json', join(TMP, 'salon-booking.answered.html'), 'examples/salon-booking.feedback.json'], { encoding: 'utf8' });
  if (read.status) throw new Error(read.stdout + read.stderr);
  console.log('chapters', marks);
}

// The chat around the page (chapters 1 and 7): the real prompt and replies of this run, typed out in chat.html.
async function chat(browser, id, then) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: TMP, size: { width: W, height: H } } });
  await ctx.addInitScript(POINTER);
  const page = await ctx.newPage(), t0 = Date.now();
  const { pause, tap, scroll } = actor(page);
  await page.goto(url('site/tutorial/chat.html') + '#' + id);
  await page.waitForFunction(() => document.body.dataset.done === 'true', null, { timeout: 60000 });
  await pause(1500);
  await tap(page.locator('.file').last(), 1200);
  await page.goto(url(then));
  await pause(2000);
  if (id === 'round2') {
    await tap(page.locator('#start-review'), 1500);
    await tap(page.locator('#mode-overview'), 1500);
    await page.locator('#main .ba').scrollIntoViewIfNeeded();
    await pause(3500);
    await tap(page.locator('#main .ba [data-before]').nth(1), 4000);
  } else await scroll(null, 200, 2000);
  const end = (Date.now() - t0) / 1000;
  const video = page.video();
  await ctx.close();
  cut(await video.path(), id, 0.3, end);
}

// One chapter: cut, slowed to at most 30 seconds, a caption bar on top, and its poster frame.
async function captionBar(browser, n, title) {
  const page = await browser.newPage({ viewport: { width: W, height: BAR } });
  await page.setContent(`<body style="margin:0;height:${BAR}px;display:flex;align-items:center;gap:14px;padding:0 20px;box-sizing:border-box;background:#1B1726;color:#fff;font:700 22px system-ui,-apple-system,'Segoe UI',sans-serif">
    <span style="width:34px;height:34px;border-radius:50%;background:#B39BE0;color:#1B1726;display:grid;place-items:center;font-size:18px">${n}</span>${title}
    <span style="margin-left:auto;font:600 14px ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#B39BE0">LETMESHOWYOUSOMETHING · TUTORIAL</span></body>`);
  const file = join(TMP, `bar-${n}.png`);
  await page.screenshot({ path: file });
  await page.close();
  return file;
}
const pending = [];
function cut(src, id, from, to) { pending.push({ src, id, from, to }); }
async function finish(browser) {
  for (const { src, id, from, to } of pending) {
    const n = CHAPTERS.findIndex(([c]) => c === id) + 1, bar = await captionBar(browser, n, CHAPTERS[n - 1][1]);
    const out = join(OUT, `${n}-${id}.mp4`);
    ffmpeg('-ss', String(from), '-to', String(to), '-i', src, '-i', bar,
      '-filter_complex', `[0:v]fps=25,scale=${W}:${H}[v];[1:v][v]vstack[o]`, '-map', '[o]', '-an',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
    const mid = Math.max(0, (to - from) * 0.6);
    ffmpeg('-ss', String(mid), '-i', out, '-frames:v', '1', '-q:v', '5', join(OUT, `${n}-${id}.jpg`));
    console.log('wrote', out, Math.round(to - from) + ' s');
  }
}

const what = process.argv[2] || 'all';
const browser = await chromium.launch();
if (what === 'page' || what === 'all') await reviewer(browser);
if (what === 'chat' || what === 'all') {
  await chat(browser, 'idea', 'examples/salon-booking.html');
  await chat(browser, 'round2', 'examples/salon-booking-round2.html');
}
await finish(browser);
await browser.close();
rmSync(TMP, { recursive: true, force: true });

// SPDX-License-Identifier: Apache-2.0
// Local check: the flow page in real Chrome.   node checks/browser/flow-page.check.mjs
// CI runs the hostile-input checks (CHECKS=hostile); the page's behaviour is proven in test/browsers/.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, checkPair, render, withChrome } from './lib.mjs';

const FLOW = join(REPO, 'examples/flow-booking.review.json');
const start = `document.querySelector('#start-review').click()`;

await withChrome('flow-page', async ({ dir, say, ev, load, shot, sleep, exported }) => {
  await load(render(FLOW, dir));
  await ev(start); await sleep(150);
  say(await ev(`document.querySelector('#stepno').textContent`) === 'Step 2 of 13', 'Start opens the first of 11 questions');
  say(await ev(`document.querySelector('#slot-proto .app .bar').textContent.includes('Book a studio')`), 'the prototype is the app screen the step starts on');
  say(await ev(`document.querySelector('#slot-map [data-step="book"]').textContent.includes('YOU ARE HERE')`), 'the map says where you are');
  await ev(`document.querySelector('input[name="v-book"][value="agree"]').click()`); await sleep(100);
  for (const [label, w, mobile] of [['flow-laptop', 1280, false], ['flow-tablet', 900, false], ['flow-phone', 390, true]]) await shot(label, w, mobile);
  await ev(`document.querySelector('[data-jump="return"]').click()`); await sleep(100);
  await ev(`document.querySelector('[data-export="json"]').click()`);
  const file = await exported();
  const r = file ? checkPair(FLOW, file) : { status: 1, stdout: 'no download' };
  say(r.status === 0, `export passes the checker: ${r.stdout.trim().split('\n').pop()}`);
  if (file) say(!JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))).match(/slot-list|position|history|minimi/), 'the export carries nothing about where the reviewer was (D003)');
});

// ── nothing in the drawn page trusts its input (D045) ──
await withChrome('flow-hostile', async ({ dir, say, ev, load, sleep }) => {
  const bad = '<img src=x onerror="window.__pwned=1">';
  const KEEP = new Set(['id', 'type', 'mode', 'tone', 'status', 'kind', 'change', 'start', 'from', 'on', 'to', 'part', 'parent', 'active', 'selected', 'value', 'src', 'protocol', 'default']);
  const evil = JSON.parse(readFileSync(FLOW, 'utf8'), function (k, v) { return typeof v === 'string' && !KEEP.has(k) && isNaN(Number(k)) ? bad : v; });
  evil.id = 'evil-flow';
  // #33 — a screenshot too: a src that is not an inline picture draws no image, and the alt stays text.
  evil.flow.screens[0].image = { src: '" onerror="window.__pwned=1', alt: bad };
  evil.flow.screens[0].hotspots = [{ id: evil.items[0].step.on, x: 10, y: 10, w: 20, h: 10 }];
  const evilPath = join(dir, 'evil-flow.json'); writeFileSync(evilPath, JSON.stringify(evil));
  await load(render(evilPath, dir));
  await ev(start); await sleep(100);
  for (let i = 0; i < 12; i++) await ev(`document.querySelector('#next') && document.querySelector('#next').click()`);
  await ev(`document.querySelector('[data-act="expand"]') && document.querySelector('[data-act="expand"]').click()`); await sleep(150);
  say(await ev(`document.querySelectorAll('img').length`) === 0 && !(await ev('window.__pwned === 1')), 'hostile flow: no img elements, no script ran, in every step, every screen, the screenshot and every diagram');
});

await withChrome('brief-hostile', async ({ dir, say, ev, load, width, sleep }) => {
  const bad = '<img src=x onerror="window.__pwned=1">';
  const review = JSON.parse(readFileSync(FLOW, 'utf8'));
  review.brief = { explains: bad, recommendation: bad, highlights: { nodes: [bad], screens: [bad] },
    examples: [{ name: bad, what: bad, source: bad }, { name: bad, what: bad }], risks: [bad, bad] };
  for (const j of review.flow.parts) j.title = bad;
  for (const d of review.diagrams || []) d.title = bad;
  const path = join(dir, 'hostile-brief.json'); writeFileSync(path, JSON.stringify(review));
  await load(render(path, dir)); await width(1280); await sleep(300);
  await ev(`document.querySelectorAll('#start-cards details').forEach(d => { d.open = true; })`);
  say(await ev(`document.querySelectorAll('img').length`) === 0 && !(await ev('window.__pwned === 1')),
    'markup in the brief, the examples, the risks, the parts and the diagram titles stays text');
  say(await ev(`document.querySelector('#start-cards li p').textContent`) === bad, 'it is shown, escaped, not swallowed');
  say(/unverified/.test(await ev(`document.querySelector('#start-cards').textContent`)), 'a hostile source is still judged on whether it is a source');
  await ev(start); await sleep(150);
  say(await ev(`document.querySelectorAll('#slot-map svg.dg').length`) === 1, 'the map still draws');
  for (const w of [1280, 900, 390]) {
    await width(w, w === 390); await sleep(250);
    const over = await ev('document.documentElement.scrollWidth - window.innerWidth');
    say(over <= 0, `width ${w}px: no horizontal overflow (${over}px)`);
  }
});

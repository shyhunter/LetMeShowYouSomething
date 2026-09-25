// SPDX-License-Identifier: Apache-2.0
// Local check: the list, decision, database and AI pages in real Chrome.   node checks/browser/list-page.check.mjs
// CI runs the hostile-input checks (CHECKS=hostile); the page's behaviour is proven in test/browsers/.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, checkPair, render, withChrome } from './lib.mjs';

const CHECKOUT = join(REPO, 'examples/review.example.json');
const DECISION = join(REPO, 'examples/decision-review.example.json');
const AI = join(REPO, 'examples/ai-tool-loop.review.json');
// #74 — every page opens on Let me explain; the Overview holds every question and the downloads.
const overview = `(document.querySelector('#start-review').offsetParent && document.querySelector('#start-review').click(), document.querySelector('#mode-overview').click())`;
const exportAs = (fmt) => `document.querySelector('[data-export="${fmt}"]').click()`;

await withChrome('checkout-page', async ({ dir, say, ev, load, media, shot, exported }) => {
  const page = render(CHECKOUT, dir);
  await load(page);
  say(await ev(`!!document.querySelector('#start').offsetParent && document.querySelectorAll('#start-cards > li').length >= 3`), 'opens on Let me explain');
  await ev(overview);
  say(await ev(`document.querySelectorAll('#main .c-item').length`) === 4, 'the Overview lists 4 questions');
  await media('dark');
  say(await ev(`getComputedStyle(document.querySelector('input[type=radio]')).colorScheme`) === 'dark', 'dark mode: native controls use the dark scheme');
  await shot('checkout-dark', 1280); await media('light'); await shot('checkout-phone', 390, true);
  await ev(`document.querySelector('input[name="v-declined-card"][value="fails"]').click()`);
  await ev(`(()=>{const t=document.querySelector('#n-declined-card');t.value='Customer sees error 51.';t.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ev(exportAs('json'));
  const file = await exported();
  const r = file ? checkPair(CHECKOUT, file) : { status: 1, stdout: 'no download' };
  say(r.status === 0, `export passes the checker: ${r.stdout.trim().split('\n').pop()}`);
});

// ── an AI diagram whose every label tries to inject markup ──
await withChrome('ai-hostile', async ({ dir, say, ev, load, exported }) => {
  const review = JSON.parse(readFileSync(AI, 'utf8')), attack = '<img src=x onerror="window.__aiAttack=1"><script>window.__aiAttack=1</script>';
  review.id = 'ai-hostile-check'; const d = review.diagrams[0];
  d.nodes.find(n => n.id === 'model').label = attack;
  for (const n of d.nodes.filter(n => n.stop)) n.stop = { reason: attack, next: attack };
  d.tokenUsage.parts[0].label = attack;
  const rp = join(dir, 'ai-hostile.json'); writeFileSync(rp, JSON.stringify(review));
  await load(render(rp, dir)); await ev(overview);
  const safe = `!window.__aiAttack && !document.querySelector('.dg-agent img, .dg-agent script')`;
  say(await ev(safe), 'AI hostile text is inert');
  await ev(exportAs('html')); const file = await exported('.feedback.html');
  if (file) { await load(file); await ev(overview); }
  say(file && await ev(safe), 'AI hostile text stays inert in the answered page');
});

// ── a review whose every text tries to inject markup ──
await withChrome('decision-hostile', async ({ dir, say, ev, load }) => {
  const bad = '<img src=x onerror="window.__pwned=1">';
  const evil = JSON.parse(readFileSync(DECISION, 'utf8'));
  Object.assign(evil, { id: 'evil', intro: bad, title: bad, ask: bad, afterwards: bad, audience: bad });
  evil.sections[0].label = bad; evil.sections[0].recommended.why = bad;
  for (const it of evil.items) Object.assign(it, { title: bad, summary: bad, body: bad, ref: bad });
  evil.items[1].affects[0].why = bad; evil.items[1].affects[0].decision.title = bad;
  const evilPath = join(dir, 'evil.json'); writeFileSync(evilPath, JSON.stringify(evil));
  await load(render(evilPath, dir));
  await ev(`document.querySelector('#start-review').click()`);
  for (let i = 0; i < 6; i++) await ev(`document.querySelector('#next') && document.querySelector('#next').click()`);
  await ev(`document.querySelector('#mode-overview').click()`);
  say(await ev(`document.querySelectorAll('img').length`) === 0 && !(await ev('window.__pwned === 1')), 'hostile review: no img elements, no script ran, in every step and the Overview');
});

// ── an answer that tries to break out of the answered page's script (D076) ──
await withChrome('export-hostile', async ({ dir, say, ev, load, exported }) => {
  await load(render(CHECKOUT, dir)); await ev(overview);
  const bad = '</script><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">';
  await ev(`document.querySelector('input[name="v-declined-card"][value="fails"]').click()`);
  await ev(`(()=>{const t=document.querySelector('#n-declined-card');t.value=${JSON.stringify(bad).replace(/</g, '\\u003c')};t.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ev(exportAs('html'));
  const file = await exported('.feedback.html');
  const text = file ? readFileSync(file, 'utf8') : '';
  say(!text.includes('</script><script>window.__pwned'), 'the answer is escaped inside the answered page');
  await ev(`localStorage.clear()`);
  if (file) { await load(file); await ev(overview); }
  say(!(await ev('window.__pwned === 1')) && await ev(`document.querySelectorAll('img').length`) === 0, 'opening it runs nothing from the answer');
  say(await ev(`document.querySelector('#n-declined-card').value`) === bad, 'and shows the answer exactly as written');
});

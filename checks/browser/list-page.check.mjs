// SPDX-License-Identifier: Apache-2.0
// Local check: the list page (checkout and decision examples) in real Chrome.   node checks/browser/list-page.check.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, checkPair, render, withChrome } from './lib.mjs';

const CHECKOUT = join(REPO, 'examples/review.example.json');
const DECISION = join(REPO, 'examples/decision-review.example.json');
const stored = (id) => `JSON.parse(localStorage.getItem('letmeshowyousomething:${id}'))`;

await withChrome('checkout-page', async ({ dir, say, ev, load, media, shot, key, type, exported }) => {
  const page = render(CHECKOUT, dir);
  await load(page);
  say(await ev("document.querySelectorAll('fieldset.item').length") === 4, 'renders 4 items as fieldsets');
  say(await ev("[...document.querySelectorAll('textarea,input')].every(el => el.type==='radio' || el.closest('label') || document.querySelector(`label[for=\"${el.id}\"]`))"), 'every text field has a label');
  await media('light'); await shot('checkout-light', 1280);
  say(await ev(`(()=>{const c=[...document.querySelectorAll('#filters .chip')];return c[1].getBoundingClientRect().left-c[0].getBoundingClientRect().right})()`) >= 4, 'filter chips are spaced apart');
  await media('dark'); await shot('checkout-dark', 1280);
  say(await ev("getComputedStyle(document.querySelector('input[type=radio]')).colorScheme") === 'dark', 'dark mode: native controls use the dark scheme');
  await media('light'); await shot('checkout-phone', 390, true);

  await ev(`document.querySelector('input[name="v-guest-checkout"][value="works"]').click()`);
  await ev(`document.querySelector('input[name="v-declined-card"][value="fails"]').click()`);
  await ev(`document.querySelector('textarea[data-note="declined-card"]').focus()`); await type('Customer sees error 51.');
  await ev(`document.querySelector('input[name="v-saved-card"][value="works"]').focus()`);
  await key(' ', 'Space', 32); await key('ArrowRight', 'ArrowRight', 39);
  say(await ev(`${stored('checkout-uat-2026-09')}.verdicts['saved-card']`) === 'partial', 'keyboard: Space then ArrowRight selects "partial"');
  say(await ev('document.activeElement.name + "=" + document.activeElement.value') === 'v-saved-card=partial', 'keyboard focus stays in the group');
  await ev(`document.querySelector('#at').focus()`); await type('Currency flips mid-flow'); await ev(`document.querySelector('#addbtn').click()`);
  await load(page);
  say(await ev(`document.querySelector('textarea[data-note="declined-card"]').value`) === 'Customer sees error 51.' && await ev("document.querySelectorAll('.addedrow').length") === 1, 'autosave keeps note and added item across reload');
  await ev(`document.querySelector('[data-f="gaps"]').click()`);
  say(await ev("document.querySelectorAll('fieldset.item').length") === 2, '"Gaps only" shows the 2 gaps');
  await ev(`document.querySelector('[data-f="all"]').click()`);
  await ev(`document.querySelector('#export').click()`);
  const file = await exported();
  const r = file ? checkPair(CHECKOUT, file) : { status: 1, stdout: 'no download' };
  say(r.status === 0, `export passes the checker: ${r.stdout.trim().split('\n').pop()}`);

  // The HTML export is the whole page with the answers in it (D076): open it and everything is there.
  await ev(`document.querySelector('#exporth').click()`);
  const htmlFile = await exported('.feedback.html');
  const exportPage = htmlFile ? readFileSync(htmlFile, 'utf8') : '';
  say(exportPage.startsWith('<!doctype html>') && (exportPage.match(/^const SEED = \{/gm) || []).length === 1, 'HTML export is the whole page, the answers seeded once inside its script');
  await ev(`localStorage.clear()`);
  if (htmlFile) await load(htmlFile);
  say(await ev(`document.querySelectorAll('fieldset.item').length`) === 4, 'the exported page shows every item, not a summary');
  say(await ev(`document.querySelector('textarea[data-note="declined-card"]').value`) === 'Customer sees error 51.' && /Currency flips mid-flow/.test(await ev(`document.querySelector('#added').textContent`)), 'and opens with the note and the added item in place');
  say(/exported copy/.test(await ev(`document.querySelector('#footnote').textContent`)), 'it says it is an exported copy');
});

await withChrome('decision-page', async ({ dir, say, ev, load, key, exported }) => {
  const page = render(DECISION, dir);
  await load(page);
  say(await ev(`document.querySelectorAll('.rec').length`) === 1, 'exactly one Recommended label');
  say(await ev(`document.querySelectorAll('.aff').length`) === 2, 'two "Previously decided" notes');
  await ev(`document.querySelector('input[data-choice][value="opt-file"]').focus()`);
  await key(' ', 'Space', 32); await key('ArrowDown', 'ArrowDown', 40);
  say(await ev(`${stored('answer-storage-2026-09')}.choices.storage`) === 'opt-db', 'keyboard moves the choice to opt-db');
  await ev(`document.querySelector('[data-f="gaps"]').click()`);
  const gaps = await ev(`[...document.querySelectorAll('fieldset.item legend')].map(l=>l.textContent)`);
  say(!gaps.some((t) => t.startsWith('Export a file now')), '"Gaps only" after a pick hides unrated options');
  await ev(`document.querySelector('[data-f="all"]').click()`);
  await ev(`document.querySelector('input[data-item="challenge-forgotten-file"][value="agree"]').click()`);
  await ev(`document.querySelector('input[data-item="challenge-browser-storage"][value="disagree"]').click()`);
  await ev(`document.querySelector('[data-f="gaps"]').click()`);
  const doubtGaps = await ev(`[...document.querySelectorAll('fieldset.item legend')].map(l=>l.textContent)`);
  say(doubtGaps.some((t) => t.startsWith('A reviewer who forgets')) && !doubtGaps.some((t) => t.startsWith('Autosave in the browser can lose')), 'doubts: an agreed concern is a gap, a rejected one is not (D051)');
  await ev(`document.querySelector('[data-f="all"]').click()`);
  await ev(`document.querySelector('#export').click()`);
  const file = await exported();
  const r = file ? checkPair(DECISION, file) : { status: 1, stdout: 'no download' };
  say(r.status === 0, `export passes the checker: ${r.stdout.trim().split('\n').pop()}`);

  const bad = '<img src=x onerror="window.__pwned=1">';
  const evil = JSON.parse(readFileSync(DECISION, 'utf8'));
  Object.assign(evil, { id: 'evil', intro: bad, title: bad, ask: bad, afterwards: bad, audience: bad });
  evil.sections[0].label = bad; evil.sections[0].recommended.why = bad;
  for (const it of evil.items) Object.assign(it, { title: bad, summary: bad, body: bad, ref: bad });
  evil.items[1].affects[0].why = bad; evil.items[1].affects[0].decision.title = bad;
  const evilPath = join(dir, 'evil.json'); writeFileSync(evilPath, JSON.stringify(evil));
  await load(render(evilPath, join(dir)));
  say(await ev(`document.querySelectorAll('img').length`) === 0 && !(await ev('window.__pwned === 1')), 'hostile review: no img elements, no script ran');
});

// ── an answer that tries to break out of the exported page's script (D076) ──
await withChrome('export-hostile', async ({ dir, say, ev, load, exported }) => {
  await load(render(CHECKOUT, dir));
  const bad = '</script><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">';
  await ev(`(()=>{const t=document.querySelector('textarea[data-note="declined-card"]');t.value=${JSON.stringify(bad)};t.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ev(`document.querySelector('#exporth').click()`);
  const file = await exported('.feedback.html');
  const text = file ? readFileSync(file, 'utf8') : '';
  say(!text.includes('</script><script>window.__pwned'), 'the answer is escaped inside the exported script');
  await ev(`localStorage.clear()`);
  if (file) await load(file);
  say(!(await ev('window.__pwned === 1')) && await ev(`document.querySelectorAll('img').length`) === 0, 'opening the export runs nothing from the answer');
  say(await ev(`document.querySelector('textarea[data-note="declined-card"]').value`) === bad, 'and shows the answer exactly as written');
});

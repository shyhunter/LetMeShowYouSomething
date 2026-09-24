// SPDX-License-Identifier: Apache-2.0
// Local check: the list page (checkout and decision examples) in real Chrome.   node checks/browser/list-page.check.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, checkPair, render, withChrome } from './lib.mjs';

// Use the visible disclosure summary before interacting with a secondary control.
const reveal = (selector) => `(() => {
  const control = document.querySelector(${JSON.stringify(selector)}), ancestors = [];
  for (let el = control.parentElement; el; el = el.parentElement) if (el.tagName === 'DETAILS') ancestors.unshift(el);
  for (const details of ancestors) if (!details.open) details.querySelector(':scope > summary').click();
})()`;
// #105 — every page opens on Understand; the checks begin after Start.
const start = `document.querySelector('#start-review').offsetParent && document.querySelector('#start-review').click()`;
const returnReview = `if (!document.querySelector('#return-review').open) document.querySelector('#finish').click();`;

const CHECKOUT = join(REPO, 'examples/review.example.json');
const DECISION = join(REPO, 'examples/decision-review.example.json');
const DATABASE = join(REPO, 'examples/database-booking.review.json');
const AI = join(REPO, 'examples/ai-tool-loop.review.json');

await withChrome('ai-page', async ({ dir, say, ev, load, key, type, exported, shot }) => {
  { await load(render(AI, dir)); await ev(start); }
  say(await ev(`['Model call','Tool call','Retrieval','Guardrail','Human handoff','Why','Next','Estimated tokens','Total: 1400'].every(t => document.querySelector('.dg-agent').textContent.includes(t))`), 'AI kinds, explained stops and estimated tokens are visible');
  await ev(`document.querySelector('#commentmode').click(); document.querySelector('[data-node="model"]').focus()`);
  await key('Enter', 'Enter', 13); await type('Explain this invented model call.');
  say(await ev(`!document.querySelector('[data-prop="add-node"]') && !!document.querySelector('[data-prop="add-edge"]')`), 'agent controls refuse a generic box addition but retain arrows');
  await ev(`${returnReview} document.querySelector('#export').click()`); const file = await exported();
  say(file && checkPair(AI, file).status === 0, 'AI comment export passes the checker');
  await ev(`document.querySelector('#continue-review').click()`);
  await shot('ai-desktop', 1280); await shot('ai-phone', 390, true);
});
await withChrome('ai-hostile', async ({ dir, say, ev, load, exported }) => {
  const review = JSON.parse(readFileSync(AI, 'utf8')), attack = '<img src=x onerror="window.__aiAttack=1"><script>window.__aiAttack=1</script>';
  review.id = 'ai-hostile-check'; const d = review.diagrams[0];
  d.nodes.find(n => n.id === 'model').label = attack;
  for (const n of d.nodes.filter(n => n.stop)) n.stop = { reason: attack, next: attack };
  d.tokenUsage.parts[0].label = attack;
  const rp = join(dir, 'ai-hostile.json'); writeFileSync(rp, JSON.stringify(review));
  { await load(render(rp, dir)); await ev(start); }
  const safe = `!window.__aiAttack && !document.querySelector('.dg-agent img, .dg-agent script')`;
  say(await ev(safe), 'AI hostile text is inert');
  await ev(`${returnReview} document.querySelector('#exporth').click()`); const file = await exported('.feedback.html');
  if (file) { await load(file); await ev(start); }
  say(file && await ev(safe), 'AI hostile text stays inert after HTML export');
});

await withChrome('database-page', async ({ dir, say, ev, load, key, type, exported, shot }) => {
  { await load(render(DATABASE, dir)); await ev(start); }
  say(await ev(`document.querySelectorAll('.dg-k-table').length`) === 2, 'database draws two tables');
  say(await ev(`['Key','Many','One','Example data','text identifier'].every(t => document.querySelector('.dg-database').textContent.includes(t))`), 'columns, key, cardinalities and example labels are visible');
  await ev(`document.querySelector('.dg-k-table[data-node="bookings"]').focus()`);
  await key('Enter', 'Enter', 13);
  say(await ev(`document.querySelector('#detail').textContent.includes('Bookings distinguish')`), 'keyboard table selection opens the item');
  await ev(`document.querySelector('#commentmode').click()`);
  await ev(`document.querySelector('.dg-edge[data-nth="1"]').focus()`);
  await key('Enter', 'Enter', 13); await type('Explain the second relationship.');
  await ev(`${returnReview} document.querySelector('#export').click()`);
  const file = await exported();
  say(file && checkPair(DATABASE, file).status === 0, 'database relationship comment export passes the checker');
  await ev(`document.querySelector('#continue-review').click()`);
  await shot('database-desktop', 1280);
  await shot('database-phone', 390, true);
});
// The page's own key (id + fingerprint of the review, #38): ask the page rather than rebuild it here.
const stored = () => `JSON.parse(localStorage.getItem(LS))`;
// The list on the left, one item open on the right (#44): open an item before answering it.
// #100 — a question opens from the Overview, as a reviewer would.
const open = (id) => `document.querySelector('#mode-overview').click(); document.querySelector('#items [data-open="${id}"]').click()`;
// The Overview holds every question as a card (#100).
const overview = `document.querySelector('#mode-overview').click();`;
const rows = `(document.querySelector('#mode-overview').click(), document.querySelectorAll('#items [data-card]'))`;

await withChrome('checkout-page', async ({ dir, say, ev, load, media, shot, key, type, exported }) => {
  const page = render(CHECKOUT, dir);
  { await load(page); await ev(start); }
  say(await ev(`${rows}.length`) === 4, 'lists 4 items');
  await ev(`document.querySelector('#mode-tour').click(); document.querySelector('#next').click()`);
  say(await ev(`document.querySelectorAll('#detail fieldset.item').length`) === 1, 'and Next opens the first one in the tour');
  say(await ev("[...document.querySelectorAll('textarea,input')].every(el => el.type==='radio' || el.closest('label') || document.querySelector(`label[for=\"${el.id}\"]`))"), 'every text field has a label');
  await media('light'); await shot('checkout-light', 1280);
  await ev(overview); await ev(reveal('#filters .chip'));
  say(await ev(`(()=>{const c=[...document.querySelectorAll('#filters .chip')];return c[1].getBoundingClientRect().left-c[0].getBoundingClientRect().right})()`) >= 4, 'filter chips are spaced apart');
  await media('dark'); await shot('checkout-dark', 1280);
  say(await ev("getComputedStyle(document.querySelector('input[type=radio]')).colorScheme") === 'dark', 'dark mode: native controls use the dark scheme');
  await media('light'); await shot('checkout-phone', 390, true);

  await ev(open('guest-checkout')); await ev(`document.querySelector('input[name="v-guest-checkout"][value="works"]').click()`);
  await ev(open('declined-card')); await ev(`document.querySelector('input[name="v-declined-card"][value="fails"]').click()`);
  await ev(`document.querySelector('textarea[data-note="declined-card"]').focus()`); await type('Customer sees error 51.');
  await ev(open('saved-card')); await ev(`document.querySelector('input[name="v-saved-card"][value="works"]').focus()`);
  await key(' ', 'Space', 32); await key('ArrowRight', 'ArrowRight', 39);
  say(await ev(`${stored()}.verdicts['saved-card']`) === 'partial', 'keyboard: Space then ArrowRight selects "partial"');
  say(await ev('document.activeElement.name + "=" + document.activeElement.value') === 'v-saved-card=partial', 'keyboard focus stays in the group');
  await ev(overview); await ev(`document.querySelector('#at').focus()`); await type('Currency flips mid-flow'); await ev(`document.querySelector('#addbtn').click()`);
  { await load(page); await ev(start); } await ev(open('declined-card'));
  say(await ev(`document.querySelector('textarea[data-note="declined-card"]').value`) === 'Customer sees error 51.' && await ev("document.querySelectorAll('.addedrow').length") === 1, 'autosave keeps note and added item across reload');
  await ev(overview); await ev(reveal('[data-f="gaps"]'));
  await ev(`document.querySelector('[data-f="gaps"]').click()`);
  say(await ev(`${rows}.length`) === 2, '"Gaps only" shows the 2 gaps');
  await ev(`document.querySelector('[data-f="all"]').click()`);
  await ev(`${returnReview} document.querySelector('#export').click()`);
  const file = await exported();
  const r = file ? checkPair(CHECKOUT, file) : { status: 1, stdout: 'no download' };
  say(r.status === 0, `export passes the checker: ${r.stdout.trim().split('\n').pop()}`);

  // The HTML export is the whole page with the answers in it (D076): open it and everything is there.
  await ev(`${returnReview} document.querySelector('#exporth').click()`);
  const htmlFile = await exported('.feedback.html');
  const exportPage = htmlFile ? readFileSync(htmlFile, 'utf8') : '';
  say(exportPage.startsWith('<!doctype html>') && (exportPage.match(/^const SEED = \{/gm) || []).length === 1, 'HTML export is the whole page, the answers seeded once inside its script');
  await ev(`localStorage.clear()`);
  if (htmlFile) { await load(htmlFile); await ev(start); }
  say(await ev(`${rows}.length`) === 4, 'the exported page shows every item, not a summary');
  await ev(open('declined-card'));
  say(await ev(`document.querySelector('textarea[data-note="declined-card"]').value`) === 'Customer sees error 51.' && /Currency flips mid-flow/.test(await ev(`document.querySelector('#added').textContent`)), 'and opens with the note and the added item in place');
  say(/exported copy/.test(await ev(`document.querySelector('#footnote').textContent`)), 'it says it is an exported copy');
});

await withChrome('decision-page', async ({ dir, say, ev, load, key, exported }) => {
  const page = render(DECISION, dir);
  { await load(page); await ev(start); }
  await ev(overview);
  say(await ev(`document.querySelectorAll('.rec').length`) === 1, 'exactly one Recommended label');
  let aff = 0;
  for (const id of ['opt-file', 'opt-db', 'opt-both']) { await ev(open(id)); aff += await ev(`document.querySelectorAll('#detail .aff').length`); }
  say(aff === 2, 'two "Previously decided" notes');
  await ev(open('opt-db')); await ev(`document.querySelector('input[data-choice][value="opt-db"]').focus()`);
  await key(' ', 'Space', 32);
  say(await ev(`${stored()}.choices.storage`) === 'opt-db', 'keyboard picks opt-db');
  await ev(overview);
  say(await ev(`!!document.querySelector('#items [data-card="opt-db"] fieldset.item.chosen')`), 'and the Overview marks it chosen');
  await ev(overview); await ev(reveal('[data-f="gaps"]'));
  await ev(`document.querySelector('[data-f="gaps"]').click()`);
  const gaps = await ev(`[...${rows}].map(r=>r.querySelector('legend').textContent)`);
  say(!gaps.some((t) => t.startsWith('Export a file now')), '"Gaps only" after a pick hides unrated options');
  await ev(`document.querySelector('[data-f="all"]').click()`);
  await ev(open('challenge-forgotten-file')); await ev(`document.querySelector('input[data-item="challenge-forgotten-file"][value="agree"]').click()`);
  await ev(open('challenge-browser-storage')); await ev(`document.querySelector('input[data-item="challenge-browser-storage"][value="disagree"]').click()`);
  await ev(overview); await ev(reveal('[data-f="gaps"]'));
  await ev(`document.querySelector('[data-f="gaps"]').click()`);
  const doubtGaps = await ev(`[...${rows}].map(r=>r.querySelector('legend').textContent)`);
  say(doubtGaps.some((t) => t.startsWith('A reviewer who forgets')) && !doubtGaps.some((t) => t.startsWith('Autosave in the browser can lose')), 'doubts: an agreed concern is a gap, a rejected one is not (D051)');
  await ev(`document.querySelector('[data-f="all"]').click()`);
  await ev(`${returnReview} document.querySelector('#export').click()`);
  const file = await exported();
  const r = file ? checkPair(DECISION, file) : { status: 1, stdout: 'no download' };
  say(r.status === 0, `export passes the checker: ${r.stdout.trim().split('\n').pop()}`);
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
  { await load(render(evilPath, join(dir))); await ev(start); }
  say(await ev(`document.querySelectorAll('img').length`) === 0 && !(await ev('window.__pwned === 1')), 'hostile review: no img elements, no script ran');
});

// ── an answer that tries to break out of the exported page's script (D076) ──
await withChrome('export-hostile', async ({ dir, say, ev, load, exported }) => {
  { await load(render(CHECKOUT, dir)); await ev(start); } await ev(open('declined-card'));
  const bad = '</script><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">';
  await ev(`document.querySelector('input[data-item="declined-card"][value="fails"]').click()`);
  await ev(`(()=>{const t=document.querySelector('textarea[data-note="declined-card"]');t.value=${JSON.stringify(bad)};t.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ev(`${returnReview} document.querySelector('#exporth').click()`);
  const file = await exported('.feedback.html');
  const text = file ? readFileSync(file, 'utf8') : '';
  say(!text.includes('</script><script>window.__pwned'), 'the answer is escaped inside the exported script');
  await ev(`localStorage.clear()`);
  if (file) { { await load(file); await ev(start); } await ev(open('declined-card')); }
  say(!(await ev('window.__pwned === 1')) && await ev(`document.querySelectorAll('img').length`) === 0, 'opening the export runs nothing from the answer');
  say(await ev(`document.querySelector('textarea[data-note="declined-card"]').value`) === bad, 'and shows the answer exactly as written');
});

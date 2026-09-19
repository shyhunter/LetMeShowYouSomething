// SPDX-License-Identifier: Apache-2.0
// Local check: the clickable flow page in real Chrome.   node checks/browser/flow-page.check.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, checkPair, render, withChrome } from './lib.mjs';

const FLOW = join(REPO, 'examples/flow-booking.review.json');
const title = `document.querySelector('#screen-title')?.textContent`;
const tap = (id) => `document.querySelector('#screen [data-target="${id}"]').click()`;

await withChrome('flow-page', async ({ dir, say, ev, load, key, shot, width, sleep, exported }) => {
  const page = render(FLOW, dir);
  await load(page);

  // ── navigation ──
  say(await ev(title) === 'Pick a time', 'opens on the start screen');
  say(JSON.stringify(await ev(`[...document.querySelectorAll('#screen [data-target]')].map(b=>b.tagName+':'+b.dataset.target)`)) === JSON.stringify(['BUTTON:help', 'BUTTON:book']), 'only the two step targets are tappable, as real buttons: Ask a question and Book 10:00');
  say(/0 answered · 11 open/.test(await ev(`document.querySelector('#overview').textContent`)) && /Tap a highlighted/.test(await ev(`document.querySelector('#detail').textContent`)), 'the feedback panel opens with the overview and invites the first tap');
  say(await ev(`document.querySelectorAll('#steplist fieldset.item.row').length`) === 11 && await ev(`document.querySelectorAll('#detail .open').length`) === 0, 'every step is one row on the left; nothing open on the right yet');
  say(await ev(`document.querySelectorAll('#stepline').length`) === 0, 'the step appears in one place only: no step line above the panels');
  await ev(tap('book'));
  const line = await ev(`document.querySelector('#detail .open').textContent`);
  say(/Book a slot/.test(line) && /Taps Book 10:00/.test(line) && /to secure the Saturday slot/.test(line), `step panel shows part, cause and goal: "${line.replace(/\s+/g, ' ').slice(0, 120)}"`);
  say(await ev(`document.querySelectorAll('#detail .open [data-outcome]').length`) === 2, 'two outcomes to pick from');
  say(await ev(`document.activeElement.dataset.outcome`) === '0', 'focus lands on the first outcome');
  await ev(`document.querySelector('#detail .open [data-outcome="0"]').click()`); await sleep(150);
  say(await ev(title) === 'Booked', 'picking "Slot is free" shows the Booked screen');
  say(await ev(`document.querySelector('#announce').textContent`) === 'Now on: Booked', 'screen change is announced');
  const panel = await ev(`document.querySelector('#detail .open').textContent`);
  say(/Reserves the slot and emails a confirmation/.test(panel) && /Cancel the booking if plans change/.test(panel), 'step panel shows the effect and what the person can do now');
  await ev(tap('cancel')); await sleep(150);
  say(await ev(title) === 'Confirm cancelling' && await ev(`document.querySelectorAll('#screen [role=dialog]').length`) === 1, 'Cancel booking (one outcome) goes straight to the confirmation dialog');
  await ev(tap('keep')); await sleep(150);
  say(await ev(title) === 'Booked', '"Keep it" returns to Booked');
  await ev(`document.querySelector('#restart').click()`); await sleep(150);
  say(await ev(title) === 'Pick a time' && await ev(`document.querySelectorAll('#detail .open').length`) === 0, 'Restart returns to the start and closes the step');

  // ── judge a step, export ──
  await ev(tap('book'));
  await ev(`document.querySelector('#detail .open [data-outcome="0"]').click()`); await sleep(150);
  await ev(`document.querySelector('#detail .open input[data-item="book"][value="agree"]').click()`);
  say(await ev(`document.querySelector('#prog').textContent`) === '1/11 answered' && /1 answered · 10 open/.test(await ev(`document.querySelector('#overview').textContent`)), 'judging the open step counts toward all 11 steps, and the overview says what is open');
  say(await ev(`document.querySelector('fieldset.item input[name="v-book"][value="agree"]').checked`), 'the step keeps its verdict in the list');
  await load(page);
  say(await ev(title) === 'Pick a time', 'position is not saved: a reload starts at the beginning (D003)');
  await ev(`document.querySelector('#export').click()`);
  const file = await exported();
  const r = file ? checkPair(FLOW, file) : { status: 1, stdout: 'no download' };
  say(r.status === 0, `export passes the checker: ${r.stdout.trim().split('\n').pop()}`);
  if (file) {
    const fb = JSON.parse(readFileSync(file, 'utf8'));
    say(fb.responses.find((x) => x.itemId === 'book').verdict === 'agree' && fb.summary.unset === 10, 'export: book agreed, the other ten unset');
    say(!JSON.stringify(fb).match(/slot-list|booked|confirm-cancel|position|history/), 'export carries nothing about where the reviewer clicked (D003)');
  }

  // ── keyboard only ──
  await load(page);
  await ev(`document.querySelector('#screen-title').focus()`);
  await key('Tab', 'Tab', 9);
  say(await ev('document.activeElement.dataset.target') === 'help', 'Tab from the screen heading reaches Ask a question first');
  await key('Tab', 'Tab', 9);
  say(await ev('document.activeElement.dataset.target') === 'book', 'the next Tab reaches the Book action');
  await key('Enter', 'Enter', 13);
  await key('Tab', 'Tab', 9);
  say(await ev('document.activeElement.dataset.outcome') === '1', 'Tab moves from the first outcome to the second');
  await key('Enter', 'Enter', 13); await sleep(150);
  say(await ev(title) === 'Slot taken' && await ev('document.activeElement.id') === 'screen-title', 'Enter shows the result and moves focus to the new screen heading');

  // ── layouts (D011) ──
  await load(page);
  await ev(tap('book'));
  await ev(`document.querySelector('#detail .open [data-outcome="0"]').click()`); await sleep(150);
  for (const [label, w, mobile] of [['flow-laptop', 1280, false], ['flow-tablet', 900, false], ['flow-phone', 390, true]]) {
    await shot(label, w, mobile);
    await width(w, mobile); await sleep(250);
    // As drawn (D057): the step panel is under the two panels, the full width of the page.
    const under = await ev(`(()=>{const a=document.querySelector('#screen').getBoundingClientRect(),b=document.querySelector('#detail .open').getBoundingClientRect();return b.top>=a.bottom-1})()`);
    say(under, `${label}: the step panel sits under the screen`);
    const small = await ev(`[...document.querySelectorAll('.is-target, #detail .open [data-outcome], #restart')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&(r.width<44||r.height<44)}).map(el=>el.textContent.trim().slice(0,30))`);
    say(small.length === 0, `${label}: every tap target is at least 44×44 px${small.length ? ` (too small: ${small.join(' | ')})` : ''}`);
  }
  await width(1280);

  // ── all outcomes side by side ──
  await load(page); await width(1280);
  await ev(tap('book'));
  const cols = await ev(`[...document.querySelectorAll('#detail .open .outcome')].map(o=>o.textContent.replace(/\\s+/g,' '))`);
  say(cols.length === 2 && /Slot is free/.test(cols[0]) && /Someone took it first/.test(cols[1]) && /Pick another time, another day, or join/.test(cols[1] + (await ev(`document.querySelector('#detail .open').textContent`))), 'step panel shows both outcomes side by side');
  await ev(`document.querySelectorAll('#detail .open .outcome [data-outcome]')[1].click()`); await sleep(150);
  say(await ev(title) === 'Slot taken', 'showing the second outcome from the panel follows it');
  say(await ev(`document.querySelectorAll('#detail .open .outcome')[1].getAttribute('data-picked')`) === 'true', 'the outcome shown is marked as picked, the other stays visible');

  // ── one list, and nothing said twice (D064): every step, with its journey, status and outcomes ──
  await load(page); await width(1280);
  say(await ev(`document.querySelectorAll('fieldset.item[data-step]').length`) === 11, 'the list holds all 11 steps');
  await ev(`document.querySelector('[data-open="book"]').click()`); await sleep(150);
  say(await ev(`document.querySelectorAll('#detail .open').length`) === 1 && await ev(`document.activeElement.dataset.outcome`) === '0', 'opening a row opens that step, focus on its first outcome');
  const card = `document.querySelector('#detail .open')`;
  say(await ev(`document.querySelector('fieldset.item[data-step="book"]').getAttribute('aria-current')`) === 'true', 'the opened row is marked on the left');
  say(await ev(`(()=>{const f=document.querySelector('fieldset.item[data-step="book"]'),c=getComputedStyle(f);return c.boxShadow==='none'&&c.borderTopWidth==='2px'})()`), 'the mark is the row\'s own border, which leaves the title clear, not a ring through it');
  say(await ev(`${card}.querySelector('.w-journey').textContent`) === 'Book a slot'
    && await ev(`${card}.querySelector('.w-status').textContent`) === 'In the product', 'a card names its journey and status');
  say(await ev(`${card}.querySelectorAll('.outcome').length`) === 2, 'a card shows every outcome of its step');
  say(/Another person booked 10:00/.test(await ev(`${card}.textContent`)), 'and why the bad one happens');
  say(await ev(`document.querySelectorAll('#journeys, #whole, #panes, #diagrams').length`) === 0, 'the four repeat sections are gone: the diagram panel and the list are the only places');

  // filters live in one bar, and never hide silently (D046)
  await ev(`(()=>{const s=document.querySelector('#f-journey');s.value='ask-question';s.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(150);
  say(await ev(`document.querySelectorAll('#steplist fieldset.item').length`) === 2 && /Showing 2 of 11 · Show all/.test(await ev(`document.querySelector('#filterinfo').textContent`)),
    'filtering by journey leaves 2 steps and says so');
  await ev(`document.querySelector('#showall').click()`); await sleep(150);
  say(await ev(`document.querySelectorAll('#steplist fieldset.item').length`) === 11 && await ev(`document.querySelector('#f-journey').value`) === '', '"Show all" clears the journey filter too');
  await ev(`document.querySelector('#f-problems').click()`); await sleep(150);
  const problems = await ev(`[...document.querySelectorAll('fieldset.item[data-step]')].map(c=>c.dataset.step)`);
  say(JSON.stringify(problems) === JSON.stringify(['book', 'confirm']), `"only where something goes wrong" keeps the two explained problems: ${problems.join(', ')}`);
  await ev(`document.querySelector('#f-problems').click()`); await sleep(150);
  await ev(`(()=>{const s=document.querySelector('#f-status');s.value='exists';s.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(150);
  const inProduct = await ev(`[...document.querySelectorAll('fieldset.item[data-step]')].map(c=>c.dataset.step)`);
  say(JSON.stringify(inProduct) === JSON.stringify(['book', 'cancel', 'confirm']), `"In the product" keeps what exists today: ${inProduct.join(', ')}`);
  await ev(`document.querySelector('#showall').click()`); await sleep(150);
  await ev(`(()=>{const q=document.querySelector('#q');q.value='waiting';q.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(150);
  say(/Showing 1 of 11 · Show all/.test(await ev(`document.querySelector('#filterinfo').textContent`)), 'the search says what it hides');
  await ev(`document.querySelector('#showall').click()`); await sleep(150);

  // ── linked highlighting: the chart and the list, the only two places left ──
  const marked = (id) => ev(`[document.querySelector('fieldset.item[data-step="${id}"]').getAttribute('aria-current'), document.querySelector('#flowbeside [data-step="${id}"]').getAttribute('aria-current')].join(',')`);
  await ev(`document.querySelector('fieldset.item[data-step="send-question"] legend').click()`); await sleep(200);
  say(await marked('send-question') === 'true,true', 'selecting a card marks the step in the chart');
  say(await ev(title) === 'Ask the venue', "and moves the player to that step's screen");
  await ev(`document.querySelector('#flowbeside [data-step="join-waitlist"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`); await sleep(200);
  say(await marked('join-waitlist') === 'true,true' && await marked('send-question') === 'false,false', 'clicking a box in the chart moves the mark back');
  say(await ev(title) === 'Slot taken', 'and puts the player on that step');
  await ev(`document.querySelector('#flowbeside [data-step="cancel"]').focus()`);
  await key('Enter', 'Enter', 13); await sleep(200);
  say(await marked('cancel') === 'true,true', 'Enter on a focused box selects its step');
  await ev(tap('cancel')); await sleep(200);
  say(await ev(`document.querySelector('fieldset.item[data-step="cancel"]').getAttribute('aria-current')`) === 'true', 'tapping in the player marks the same step');

  // the other charts are tabs in the same panel, not a second section
  const tab = (name) => `[...document.querySelectorAll('#dgtabs [role=tab]')].find(t=>t.textContent.trim()==='${name}').click()`;
  await ev(tab('What happens behind booking')); await sleep(200);
  say(await ev(`document.querySelectorAll('#flowbeside .dg-lane').length`) === 3, 'the written chart has its three lanes');
  await ev(`document.querySelector('#flowbeside [data-step="book"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`); await sleep(200);
  say(await ev(`document.querySelector('fieldset.item[data-step="book"]').getAttribute('aria-current')`) === 'true', 'a step linked in the written chart selects it in the list');
  await ev(tab('The user flow')); await sleep(200);

  // ── highlight a sub-process, never hide the rest (D054) ──
  await ev(`document.querySelector('#chips [data-part="waiting-list"]').click()`); await sleep(200);
  const cls = (sel) => ev(`document.querySelector('${sel}').getAttribute('class')`);
  say(/dg-part-on/.test(await cls('#flowbeside [data-step="join-waitlist"]')), 'the chosen part is highlighted');
  say(/dg-part-up/.test(await cls('#flowbeside [data-step="book"]')), 'what leads into it is lightly highlighted');
  say(/dg-part-off/.test(await cls('#flowbeside [data-step="send-question"]')), 'a step that does not lead there is dimmed');
  say(/dg-part-up/.test(await cls('#flowbeside [data-step="cancel"]')), 'cancelling is lightly marked too: it leads back to the time list');
  say(await ev(`(()=>{const el=document.querySelector('#flowbeside [data-step="send-question"]');return getComputedStyle(el).opacity})()`) > 0.2, 'dimmed, not hidden (D046)');
  await ev(`document.querySelector('#chips [data-part="waiting-list"]').click()`); await sleep(200);
  say(!/dg-part-off/.test(await cls('#flowbeside [data-step="send-question"]')), 'pressing the chip again brings everything back');

  // ── layouts for the list (D011) ──
  for (const [label, w, mobile] of [['list-laptop', 1280, false], ['list-tablet', 900, false], ['list-phone', 390, true]]) {
    await shot(label, w, mobile);
    await width(w, mobile); await sleep(200);
    const small = await ev(`[...document.querySelectorAll('#detail .open [data-outcome], .flow-filters label, #showall, fieldset.item .ask')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&(r.width<44||r.height<44)}).map(el=>el.textContent.trim().slice(0,24))`);
    say(small.length === 0, `${label}: list targets at least 44 px${small.length ? ` (too small: ${small.join(' | ')})` : ''}`);
  }
  await width(1280);

  // ── the flow beside the screen (D053) ──
  await load(page); await width(1280); await sleep(200);
  say(await ev(`document.querySelectorAll('#flowbeside svg').length`) === 1, 'the user-flow chart sits beside the screen');
  say(await ev(`document.querySelector('#flowbeside [data-node="screen:slot-list"]').getAttribute('aria-current')`) === 'true', 'the screen you are on is marked in that chart');
  await ev(tap('help'));
  await sleep(200);
  say(await ev(`(()=>{const box=document.querySelector('#flowbeside'),n=box.querySelector('[aria-current="true"]');if(!n)return false;const b=n.getBoundingClientRect(),r=box.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1})()`), 'the chart beside the screen scrolls to where you are');
  await ev(`document.querySelector('#restart').click()`); await sleep(150);
  await ev(tap('book'));
  await ev(`document.querySelector('#detail .open [data-outcome="0"]').click()`); await sleep(200);
  say(await ev(`document.querySelector('#flowbeside [data-node="screen:booked"]').getAttribute('aria-current')`) === 'true'
    && await ev(`document.querySelector('#flowbeside [data-step="book"]').getAttribute('aria-current')`) === 'true', 'taking a step moves both marks in the chart beside the screen');
  const under = async () => ev(`(()=>{const a=document.querySelector('#screen').getBoundingClientRect(),b=document.querySelector('#flowbeside').getBoundingClientRect();return a.top>=b.bottom-1})()`);
  for (const w of [1280, 900]) { await width(w); await sleep(200); say(await under(), `${w}px: the screen sits under the chart`); }
  await width(1280); await sleep(200);

  // ── the reviewer arranges the page (D055) ──
  const order = () => ev(`[...document.querySelectorAll('#sections [data-section]')].map(s=>s.dataset.section)`);
  say(JSON.stringify(await order()) === JSON.stringify(['player']), 'one section: the list lives in the feedback panel (D069)');
  say(await ev(`getComputedStyle(document.querySelector('[data-section="player"] .sec-actions')).display`) === 'none', 'no move buttons when there is nothing to move past');
  await ev(`document.querySelector('[data-section="player"] .sec-toggle').click()`); await sleep(100);
  say(await ev(`document.querySelector('[data-section="player"] .sec-body').hidden`) === true, 'the section collapses');
  await load(page); await sleep(200);
  say(await ev(`document.querySelector('[data-section="player"] .sec-toggle').getAttribute('aria-expanded')`) === 'false', 'and stays collapsed after a reload');
  await ev(`document.querySelector('[data-section="player"] .sec-toggle').click()`);
  await ev(`document.querySelector('input[data-item="book"][value="agree"]').click()`); await sleep(100);
  await ev(`document.querySelector('#export').click()`);
  const arranged = await exported();
  say(arranged && !/section|collapsed|order/.test(readFileSync(arranged, 'utf8')), 'the export carries nothing about how the page was arranged (D003)');

  // ── hostile flow ──
  const bad = '<img src=x onerror="window.__pwned=1">';
  const KEEP = new Set(['id', 'type', 'mode', 'tone', 'status', 'kind', 'change', 'start', 'from', 'on', 'to', 'part', 'parent', 'active', 'selected', 'value', 'src', 'protocol', 'default']);
  const evil = JSON.parse(readFileSync(FLOW, 'utf8'), function (k, v) { return typeof v === 'string' && !KEEP.has(k) && isNaN(Number(k)) ? bad : v; });
  evil.id = 'evil-flow';
  const evilPath = join(dir, 'evil-flow.json'); writeFileSync(evilPath, JSON.stringify(evil));
  await load(render(evilPath, dir));
  await ev(tap('book'));
  await ev(`document.querySelector('#detail .open [data-outcome="0"]').click()`); await sleep(150);
  say(await ev(`document.querySelectorAll('img').length`) === 0 && !(await ev('window.__pwned === 1')), 'hostile flow: no img elements created, no script ran');
});

// ── the page as drawn (D057, D058, D062): tabs above the diagram, chips for sub-processes,
//    the screen under the diagram, a collapse each (D068).
await withChrome('drawn-page', async ({ dir, say, ev, load, key, shot, width, sleep }) => {
  const page = render(FLOW, dir);
  await load(page); await width(1280); await sleep(250);

  const tabs = () => ev(`[...document.querySelectorAll('#dgtabs [role=tab]')].map(t=>t.textContent.trim())`);
  const selectedTab = () => ev(`document.querySelector('#dgtabs [role=tab][aria-selected="true"]').textContent.trim()`);
  const labels = await tabs();
  say(labels[0] === 'The user flow' && !labels.includes('Parts of the process') && !labels.includes('System design')
    && labels.includes('What happens behind booking'), `tabs above the diagram, focus first, no parts tab (D070), no empty System design tab (D098): ${labels.join(' · ')}`);
  say(await selectedTab() === 'The user flow', 'the focus tab is the one that opens');
  say(await ev(`document.querySelectorAll('#flowbeside [data-node^="screen:"]').length`) > 0, 'the user flow is the chart on show');

  await ev(`[...document.querySelectorAll('#dgtabs [role=tab]')].find(t=>t.textContent.trim()==='What happens behind booking').click()`); await sleep(200);
  say(await ev(`document.querySelectorAll('#flowbeside .dg-lane').length`) > 0
    && await ev(`document.querySelectorAll('#flowbeside [data-node^="screen:"]').length`) === 0, 'a tab swaps the chart, it does not add a second one');
  await ev(`document.querySelector('#dgtabs [role=tab]').focus()`);
  const beforeKey = await selectedTab();
  await key('ArrowRight', 'ArrowRight', 39);
  say(await ev(`document.activeElement.getAttribute('role')`) === 'tab' && await selectedTab() !== beforeKey, 'arrow keys move between tabs');
  await ev(`[...document.querySelectorAll('#dgtabs [role=tab]')].find(t=>t.textContent.trim()==='The user flow').click()`); await sleep(200);

  // chips for the sub-processes, in place of a dropdown
  const chips = await ev(`[...document.querySelectorAll('#chips [data-part]')].map(c=>c.dataset.part)`);
  say(chips.length === 5 && chips.includes('waiting-list'), `a chip per sub-process: ${chips.join(' · ')}`);
  const groups = await ev(`[...document.querySelectorAll('#chips .sub-h')].map(h=>h.textContent)`);
  say(JSON.stringify(groups) === JSON.stringify(['In the product', 'Planned', 'Suggested']), `sub-processes are grouped by status: ${groups.join(' · ')}`);
  say(/0\/3 judged/.test(await ev(`document.querySelector('#chips [data-part="book-slot"]').textContent`)), 'each sub-process says how much of it is judged');
  say(await ev(`document.querySelector('#subswitch').getAttribute('aria-checked')`) === 'true', 'the sub-processes column is on by default');
  await ev(`document.querySelector('#subswitch').click()`); await sleep(200);
  say(await ev(`document.querySelector('#chips').checkVisibility?.() === false || getComputedStyle(document.querySelector('#chips')).display === 'none'`), 'the switch turns the column off');
  await ev(`document.querySelector('#subswitch').click()`); await sleep(200);
  await ev(`document.querySelector('#chips [data-part="waiting-list"]').click()`); await sleep(200);
  const cls = (sel) => ev(`document.querySelector('${sel}').getAttribute('class')`);
  say(await ev(`document.querySelector('#chips [data-part="waiting-list"]').getAttribute('aria-pressed')`) === 'true'
    && /dg-part-on/.test(await cls('#flowbeside [data-step="join-waitlist"]')), 'a chip highlights its part in the chart');
  say(/dg-part-off/.test(await cls('#flowbeside [data-step="send-question"]')), 'what does not lead there is dimmed, never hidden');
  await ev(`document.querySelector('#chips [data-part="waiting-list"]').click()`); await sleep(200);
  say(await ev(`document.querySelector('#chips [data-part="waiting-list"]').getAttribute('aria-pressed')`) === 'false'
    && !/dg-part-off/.test(await cls('#flowbeside [data-step="send-question"]')), 'pressing the same chip again clears the highlight');

  // every screen at once, the way the chart shows every step (sketch, 2026-09-18)
  say(await ev(`document.querySelector('#allscreens').hidden`) === true && await ev(`document.querySelector('#screen').hidden`) === false, 'one screen to begin with');
  await ev(`document.querySelector('#upanel [data-screens="all"]').click()`); await sleep(250);
  const minis = await ev(`[...document.querySelectorAll('#allscreens [data-screen]')].map(m=>m.dataset.screen)`);
  say(minis.length === 10 && minis[0] === 'slot-list', `"All screens" shows all ten: ${minis.join(', ')}`);
  say(/Book a studio/.test(await ev(`document.querySelector('#allscreens [data-screen="slot-list"]').textContent`)), 'each one is the screen itself, not a name in a list');
  say(await ev(`document.querySelectorAll('#allscreens [data-target]').length`) === 0, 'nothing inside a small screen is tappable: the card is the target');
  say(await ev(`document.querySelector('#allscreens .mini').getBoundingClientRect().width`) >= 420, `each screen in the overview is at least 420px wide (D078): ${await ev(`Math.round(document.querySelector('#allscreens .mini').getBoundingClientRect().width)`)}px`);
  say(await ev(`document.querySelector('#allscreens [data-screen="slot-list"]').getAttribute('aria-current')`) === 'true', 'the screen you are on is marked');
  // D081 — connected like a prototype: one curve per outcome, from the action to where it leads.
  say(await ev(`document.querySelectorAll('#allscreens .links g').length`) === await ev(`REVIEW.items.filter(i=>i.step).reduce((n,i)=>n+i.step.outcomes.length,0)`), 'one connection per outcome of every step');
  say(await ev(`document.querySelectorAll('#allscreens .mini button').length`) === 0, 'the actions are marked, not buttons inside the card button');
  const startsOnAction = await ev(`[...document.querySelectorAll('#allscreens .links g')].every(g=>{const c=g.querySelector('circle').getBoundingClientRect(),x=c.left+c.width/2,y=c.top+c.height/2;
    return [...document.querySelectorAll('#allscreens .mini[data-screen="'+g.dataset.from+'"] [data-link]')].some(b=>{const r=b.getBoundingClientRect();return Math.abs(y-(r.top+r.height/2))<2&&(Math.abs(x-r.left)<2||Math.abs(x-r.right)<2)})})`);
  say(startsOnAction, 'every connection starts on the edge of its action');
  say(await ev(`(()=>{const x=(id)=>document.querySelector('#allscreens [data-screen="'+id+'"]').getBoundingClientRect().left;return x('slot-list')<x('booked')&&x('booked')<x('confirm-cancel')})()`), 'screens run left to right in the order they are reached');
  say(await ev(`document.querySelector('#allscreens .links g[data-from="booked"][data-to="confirm-cancel"]').classList.contains('back')`) === false
    && await ev(`document.querySelector('#allscreens .links g[data-from="confirm-cancel"][data-to="booked"]').classList.contains('back')`) === true, 'a way back is drawn dashed, a way forward solid');
  await ev(`document.querySelector('#allscreens [data-screen="booked"]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`);
  say(await ev(`document.querySelector('#allscreens .links').classList.contains('focus') && [...document.querySelectorAll('#allscreens .links g.hot')].every(g=>g.dataset.from==='booked'||g.dataset.to==='booked')`), 'pointing at a screen keeps only its connections bright');
  // D082 — the connections are optional: a switch, shown only with all screens, remembered.
  say(await ev(`document.querySelector('#linkswitch').hidden`) === false && await ev(`document.querySelector('#linkswitch').getAttribute('aria-checked')`) === 'true', 'a Connections switch, on by default');
  await ev(`document.querySelector('#linkswitch').click()`); await sleep(150);
  say(await ev(`document.querySelectorAll('#allscreens .links').length`) === 0 && await ev(`document.querySelector('#linkswitch').getAttribute('aria-checked')`) === 'false', 'switching it off removes the connections');
  await load(page); await sleep(200);
  await ev(`document.querySelector('#upanel [data-screens="all"]').click()`); await sleep(250);
  say(await ev(`document.querySelectorAll('#allscreens .links').length`) === 0, 'and they stay off after a reload');
  await ev(`document.querySelector('#linkswitch').click()`); await sleep(150);
  say(await ev(`document.querySelectorAll('#allscreens .links g').length`) > 0, 'switching it on draws them again');
  await ev(`document.querySelector('#allscreens [data-screen="waitlisted"]').click()`); await sleep(250);
  say(await ev(title) === 'On the waiting list' && await ev(`document.querySelector('#allscreens').hidden`) === true, 'picking one goes there and returns to the single screen');
  say(await ev(`document.querySelector('#flowbeside [data-node="screen:waitlisted"]').getAttribute('aria-current')`) === 'true', 'and the chart follows');
  say(await ev(`document.querySelector('#upanel [data-screens="one"]').getAttribute('aria-pressed')`) === 'true', 'the switch back is honest about where you are');

  // the two panels: the screen under the diagram, both full width (D068), either full screen (D073)
  const stacked = () => ev(`(()=>{const d=document.querySelector('#dpanel').getBoundingClientRect(),u=document.querySelector('#upanel').getBoundingClientRect();return u.top>=d.bottom-1&&Math.abs(d.width-u.width)<2})()`);
  for (const [w, m] of [[1280, false], [900, false], [390, true]]) { await width(w, m); await sleep(250); say(await stacked(), `${w}px: the screen sits under the diagram, the same width`); }
  await width(1440); await sleep(250);
  say(await ev(`document.querySelector('#dpanel').getBoundingClientRect().width`) > 1300, 'the page uses the full width');
  say(await ev(`document.querySelectorAll('#stage [data-size]').length`) === 0, 'no width buttons: nothing shares a row any more');
  await width(1280); await sleep(200);
  say(await ev(`document.querySelectorAll('.panel-collapse').length`) === 0, 'no collapse buttons: full screen takes their place (D073)');
  const covers = (id) => ev(`(()=>{const r=document.querySelector('#${id}').getBoundingClientRect();return r.top<=0&&r.left<=0&&r.width>=innerWidth-1&&r.height>=innerHeight-1})()`);
  await ev(`document.querySelector('#restart').click()`); await sleep(150);
  await ev(`document.querySelector('#upanel .seg .panel-full').click()`); await sleep(200);
  say(await covers('upanel') && await ev(`document.querySelector('#upanel .panel-full').textContent`) === 'Exit full screen', 'the screen opens full screen from its own tab row');
  await ev(`document.querySelector('#screen [data-target="book"]').click()`); await sleep(200);
  say(!(await covers('upanel')) && await ev(`document.activeElement.dataset.outcome`) === '0', 'a tap with several outcomes leaves full screen so they can be picked');
  await ev(`document.querySelector('#restart').click()`); await sleep(150);
  await ev(`document.querySelector('#upanel .seg .panel-full').click()`); await sleep(200);
  await key('Escape', 'Escape', 27); await sleep(150);
  say(!(await covers('upanel')) && await ev(`document.activeElement.classList.contains('panel-full')`), 'Esc brings it back, focus on the button');
  await ev(`document.querySelector('#dpanel .panel-full').click()`); await sleep(200);
  say(await covers('dpanel') && await ev(`document.querySelector('#flowbeside').getBoundingClientRect().height`) > 600, 'the diagram opens full screen, the chart as tall as the window');
  await ev(`document.querySelector('#dpanel .panel-full').click()`); await sleep(150);
  say(!(await covers('dpanel')), 'the same button closes it');
  await ev(`document.querySelector('#at').value='Parking'; document.querySelector('#ab').value='Say where to park.'; document.querySelector('#addbtn').click()`); await sleep(150);
  say(await ev(`(()=>{const i=document.querySelector('#items').getBoundingClientRect(),a=document.querySelector('#added .addedrow').getBoundingClientRect();return a.top>=i.bottom-1})()`)
    && /Your own feedback/.test(await ev(`document.querySelector('#added').textContent`)), 'your own feedback is listed below the steps, under its own heading');
  await ev(`document.querySelector('#added [data-del]').click()`); await sleep(100);

  // D079 — "Show this" keeps you where you were, and any section can be pinned.
  await ev(`document.querySelector('#restart').click()`); await sleep(150);
  await ev(`document.querySelector('#screen [data-target="book"]').click()`); await sleep(200);
  await ev(`document.querySelector('#detail [data-outcome="0"]').scrollIntoView({block:'center'})`); await sleep(100);
  const fbTop = `document.querySelector('#feedback').getBoundingClientRect().top`, before = await ev(fbTop);
  await ev(`document.querySelector('#detail [data-outcome="0"]').click()`); await sleep(200);
  say(Math.abs(await ev(fbTop) - before) < 2, `"Show this" keeps the feedback where it was on the window (moved ${(await ev(fbTop) - before).toFixed(0)}px)`);
  await ev(`document.querySelector('#dpanel .pin').click(); document.querySelector('#upanel .pin').click()`); await sleep(200);
  await ev(`scrollTo(0, document.body.scrollHeight)`); await sleep(200);
  const box = (sel) => ev(`(()=>{const r=document.querySelector('${sel}').getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()`);
  let d = await box('#dpanel'), u = await box('#upanel');
  say(Math.abs(d.top) < 2 && Math.abs(u.top - d.bottom) < 2, 'pinned diagram and screen stay at the top, one under the other');
  say(u.bottom <= await ev('innerHeight') * 0.8 + 2, 'and together take no more than 80% of the window');
  await load(page); await sleep(250); await ev(`scrollTo(0, document.body.scrollHeight)`); await sleep(200);
  d = await box('#dpanel');
  say(Math.abs(d.top) < 2 && await ev(`document.querySelector('#dpanel .pin').getAttribute('aria-pressed')`) === 'true', 'pins survive a reload');
  await ev(`document.querySelector('header .pin').click()`); await sleep(200);
  say(Math.abs((await box('header')).top) < 2 && Math.abs((await box('#dpanel')).top - (await box('header')).bottom) < 2, 'the header pins too, above the others');
  await ev(`document.querySelectorAll('.pin[aria-pressed="true"]').forEach(b => b.click())`); await sleep(200);
  say(await ev(`document.querySelectorAll('.pinned').length`) === 0, 'Unpin lets them scroll again');
  await ev('scrollTo(0,0)');

  // D080/D083 — every style in light and in dark, picked, drawn and remembered.
  const pick = (id, v) => ev(`(()=>{const s=document.querySelector('#${id}');s.value='${v}';s.dispatchEvent(new Event('change'))})()`);
  const bg = () => ev(`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`);
  const seen = new Set();
  for (const st of ['mac84', 'cyber', 'newsletter', 'shyhunter']) for (const mode of ['light', 'dark']) {
    await pick('style', st); await pick('theme', mode);
    const scheme = await ev(`getComputedStyle(document.documentElement).colorScheme`);
    say(await ev(`document.documentElement.dataset.style`) === st && scheme === mode, `${st} in ${mode}: applies, native controls ${scheme}`);
    seen.add(await bg());
    await shot(`style-${st}-${mode}`, 1280);
  }
  say(seen.size === 8, `each style looks different in light and dark: ${seen.size} backgrounds for 8 combinations`);
  await pick('style', 'mac84'); await pick('theme', 'dark');
  await load(page); await sleep(200);
  say(await ev(`document.querySelector('#style').value + '/' + document.querySelector('#theme').value`) === 'mac84/dark' && await bg() === '#000000', 'Macintosh 1984 in dark survives a reload');
  await pick('style', ''); await pick('theme', '');

  await shot('drawn-tablet', 900);
  await shot('drawn-phone', 390, true);

  const small = await ev(`[...document.querySelectorAll('#dgtabs [role=tab], #chips [data-part], #stage .panel-full')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&(r.width<44||r.height<44)}).map(el=>el.textContent.trim().slice(0,20))`);
  say(small.length === 0, `tabs, chips and panel buttons are at least 44px: ${small.length ? small.join(', ') : 'all fine'}`);
  await shot('drawn-laptop', 1280);
});

// ── what the agent wants from the reviewer, and what the reviewer wants back (D059, D060) ──
await withChrome('brief-page', async ({ dir, say, ev, load, width, sleep, shot, exported }) => {
  const review = JSON.parse(readFileSync(FLOW, 'utf8'));
  review.focus = 'user-flow';
  review.brief = {
    explains: 'Cancelling frees the slot but the money stays with us as store credit.',
    highlights: { nodes: ['step:cancel'], screens: ['booked'] },
    recommendation: 'Keep store credit, and say so on the confirmation screen.',
    examples: [
      { name: 'Class passes at gyms', what: 'A cancelled class returns a credit, not the money.', source: 'https://example.org/gyms' },
      { name: 'What a colleague remembered', what: 'A studio that refunded everything went under.' },
    ],
    risks: ['Customers may read credit as a refund and ask for the money back.'],
  };
  const path = join(dir, 'brief.json'); writeFileSync(path, JSON.stringify(review));
  const page = render(path, dir);
  await load(page); await width(1280); await sleep(250);

  const brief = await ev(`document.querySelector('#brief')?.textContent || ''`);
  say(/store credit/.test(brief) && /Keep store credit/.test(brief), 'the brief explains the cause and gives the recommendation');
  say(/Class passes at gyms/.test(brief) && /example\.org/.test(brief), 'a real-life example with its source');
  say(/unverified/i.test(brief) && await ev(`document.querySelectorAll('#brief .unverified').length`) === 1, 'the example with no source is marked unverified (D050)');
  say(/ask for the money back/.test(brief), 'the risks are named');
  say(await ev(`(()=>{const b=document.querySelector('#brief').getBoundingClientRect(),s=document.querySelector('#stage').getBoundingClientRect();return b.top>=s.bottom-1})()`),
    'the brief sits under the diagram and the screen');
  say(await ev(`(()=>{const b=document.querySelector('#brief').getBoundingClientRect(),f=document.querySelector('#feedback').getBoundingClientRect();return f.top>=b.bottom-1&&Math.abs(b.width-f.width)<2})()`),
    'what to decide sits above your feedback, the same width (D074)');
  say(await ev(`(()=>{const q=document.querySelector('#feedback .bar').getBoundingClientRect(),l=document.querySelector('#steplist').getBoundingClientRect(),d=document.querySelector('#detail').getBoundingClientRect(),b=document.querySelector('#brief').getBoundingClientRect();return q.top>=b.bottom-1&&l.top>=q.bottom-1&&d.left>=l.right-1&&Math.abs(l.top-d.top)<4})()`),
    'the filters sit under it, then the steps on the left and the open step on the right');
  const lw = () => ev(`[Math.round(document.querySelector('#steplist').getBoundingClientRect().width),Math.round(document.querySelector('#detail').getBoundingClientRect().width)]`);
  await ev(`document.querySelector('#split [data-size="detail"]').click()`); await sleep(150);
  const [l1, d1] = await lw();
  say(d1 > l1 + 100, `◨ gives the open step the room: ${l1}px / ${d1}px`);
  await load(page); await width(1280); await sleep(250);
  say(await ev(`document.querySelector('#split [data-size="detail"]').getAttribute('aria-pressed')`) === 'true', 'the width survives a reload');
  await ev(`document.querySelector('#split [data-size="even"]').click()`); await sleep(150);
  say(await ev(`(()=>{const f=document.querySelector('#steplist').getBoundingClientRect(),a=document.querySelector('#feedback .add').getBoundingClientRect();return a.top>=f.bottom-1&&a.width>f.width*1.5})()`),
    'adding your own feedback sits under both, full width');
  await width(900); await sleep(250);
  say(await ev(`(()=>{const l=document.querySelector('#steplist').getBoundingClientRect(),d=document.querySelector('#detail').getBoundingClientRect();return d.top>=l.bottom-1})()`),
    'tablet: the steps and the open step stack');
  await width(1280); await sleep(250);
  say(await ev(`document.querySelectorAll('#flowbeside [data-step="cancel"].dg-brief').length`) === 1, 'what the brief points at is marked in the chart');
  await ev(`document.querySelector('#screen [data-target="book"]').click()`);
  await ev(`document.querySelector('#detail .open [data-outcome="0"]').click()`); await sleep(200);
  say(await ev(`document.querySelectorAll('#upanel.brief-here').length`) === 1, 'the screen the brief points at is marked too');

  // the reviewer asks back (D060)
  const askBtn = `document.querySelector('#detail .open [data-ask="example"]')`;
  say(await ev(`${askBtn}.type`) === 'checkbox', 'asking back is a checkbox');
  say(await ev(`!!${askBtn}`) && await ev(`!!document.querySelector('#detail .open [data-ask="explain"]')`), 'the open step offers "show me an example" and "explain this" as checkboxes');
  await ev(`${askBtn}.click()`); await sleep(150);
  say(await ev(`${askBtn}.checked`) === true, 'pressing it marks the request');
  await load(page); await sleep(250);
  await ev(`document.querySelector('#screen [data-target="book"]').click()`);
  await ev(`document.querySelector('#detail .open [data-outcome="0"]').click()`); await sleep(200);
  say(await ev(`${askBtn}.checked`) === true, 'the request survives a reload');

  await ev(`document.querySelector('#export').click()`);
  const file = await exported();
  const out = file ? JSON.parse(readFileSync(file, 'utf8')) : {};
  say(JSON.stringify(out.requests || []) === JSON.stringify([{ itemId: 'book', title: 'Taps Book 10:00', kind: 'example', note: null }]),
    `the request travels in the feedback: ${JSON.stringify(out.requests)}`);
  const r = file ? checkPair(path, file) : { status: 1, stdout: 'no download' };
  say(r.status === 0, `that export passes the checker: ${r.stdout.trim().split('\n').pop()}`);

  say(await ev(`document.querySelector('#addh').textContent`) === 'Add your own feedback' && /something unrelated/.test(await ev(`document.querySelector('.add .d').textContent`)) && await ev(`document.querySelector('#at').offsetParent !== null`), 'adding your own feedback is visible and open to anything');
  await shot('brief-laptop', 1280);
});

// ── nothing in the drawn page trusts its input (D045) ──
await withChrome('brief-hostile', async ({ dir, say, ev, load, width, sleep }) => {
  const bad = '<img src=x onerror="window.__pwned=1">';
  const review = JSON.parse(readFileSync(FLOW, 'utf8'));
  review.brief = { explains: bad, recommendation: bad, highlights: { nodes: [bad], screens: [bad] },
    examples: [{ name: bad, what: bad, source: bad }, { name: bad, what: bad }], risks: [bad, bad] };
  for (const j of review.flow.parts) j.title = bad;                 // the chips
  for (const d of review.diagrams || []) d.title = bad;             // the tabs
  const path = join(dir, 'hostile-brief.json'); writeFileSync(path, JSON.stringify(review));
  await load(render(path, dir)); await width(1280); await sleep(300);
  say(await ev(`document.querySelectorAll('img').length`) === 0 && !(await ev('window.__pwned === 1')),
    'markup in the brief, the examples, the risks, the chips and the tabs stays text');
  say(await ev(`document.querySelector('#brief .brief-explains').textContent`) === bad, 'it is shown, escaped, not swallowed');
  say(/unverified/.test(await ev(`(document.querySelector('#brief .unverified')||{}).textContent || ''`)), 'a hostile source is still judged on whether it is a source');
  // A hostile highlight points at nothing; the page must not break over it.
  say(await ev(`document.querySelectorAll('#flowbeside svg').length`) === 1, 'the chart still draws');

  for (const w of [1280, 900, 390]) {
    await width(w, w === 390); await sleep(250);
    const over = await ev('document.documentElement.scrollWidth - window.innerWidth');
    say(over <= 0, `width ${w}px: no horizontal overflow (${over}px)`);
  }
  await width(1280); await sleep(150);
  // Chips and tabs are buttons: the keyboard works without a single line of key handling.
  await ev(`document.querySelector('#chips [data-part]').focus()`);
  say(await ev(`document.activeElement.tagName`) === 'BUTTON' && await ev(`document.activeElement.hasAttribute('aria-pressed')`), 'a chip takes keyboard focus as a pressable button');
});

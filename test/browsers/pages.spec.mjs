// SPDX-License-Identifier: Apache-2.0
// The review page as the approved design (#74): Let me explain, the guided tour with four places in a
// fixed order, the Overview, Return with every download. In Chromium, Firefox and WebKit, at desktop,
// tablet and phone size (D091).
import { test, expect } from '@playwright/test';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, example, readReview, check, rendered, guard, start, overview, toReturn, showPlace, download, note } from './page-helpers.mjs';

const PAGES = { 'checkout-uat': 'review.example.json', 'decision-review': 'decision-review.example.json', 'flow-booking': 'flow-booking.review.json', 'database-booking': 'database-booking.review.json', 'retry-backoff': 'retry-backoff.review.json', 'booking-race': 'booking-race.review.json', 'ai-tool-loop': 'ai-tool-loop.review.json', 'checkout-round2': 'checkout-round2.review.json', 'flow-booking-round2': 'flow-booking-round2.review.json', 'flow-booking-round3': 'flow-booking-round3.review.json', 'password-reset': 'password-reset.review.json', 'results-layout': 'results-layout.review.json' };
const tmp = (p = 'pw-') => mkdtempSync(join(tmpdir(), p));
guard(test);

// With a mouse, WCAG 2.2 AA (2.5.8): 24 × 24 px. On a touch screen, 44 × 44 px (D092). Exempt: links in
// running text, the skip link, and the drawn app screen and diagrams, which are pictures.
const smallTargets = (page, min) => page.evaluate((min) => [...document.querySelectorAll('button, a[href], summary, select, textarea, input:not([type=hidden]), [role=tab]')]
  .map((el) => (el.matches('input[type=radio], input[type=checkbox]') && el.closest('label')) || el)
  .filter((el, i, all) => all.indexOf(el) === i && el.getClientRects().length && !el.matches('.skip, p a, li a, span a, .app :not(.hot), .dg *'))
  .map((el) => { const b = el.getBoundingClientRect(); return { el: el.id || el.className || el.tagName, w: Math.round(b.width), h: Math.round(b.height) }; })
  .filter((x) => x.w < min || x.h < min), min);

for (const [name, file] of Object.entries(PAGES)) {
  test(`${name}: every screen fits, every target can be hit`, async ({ page }, info) => {
    await page.goto(example(name));
    await expect(page.locator('h1')).toHaveText(readReview(file).title);
    await expect(page.locator('body')).not.toContainText('Written for');
    const min = info.project.use.hasTouch ? 44 : 24;
    for (const step of ['Let me explain', 'the tour', 'the Overview', 'Return']) {
      if (step === 'the tour') await start(page);
      if (step === 'the Overview') await page.locator('#mode-overview').click();
      if (step === 'Return') { await page.locator('#mode-tour').click(); await toReturn(page); }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${step}: sideways scroll`).toBeLessThanOrEqual(0);
      expect(await smallTargets(page, min), `${step}: targets smaller than ${min} px`).toEqual([]);
    }
    const made = page.locator('.made');
    await expect(made).toHaveText('Made with LetMeShowYouSomething');
    await expect(made.locator('a')).toHaveAttribute('href', 'https://github.com/shyhunter/LetMeShowYouSomething');
  });
}

for (const name of ['index', 'loop']) {
  test(`site ${name}: loads, fits the screen`, async ({ page }) => {
    await page.goto(pathToFileURL(join(ROOT, `site/${name}.html`)).href);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'sideways scroll').toBeLessThanOrEqual(0);
  });
}

// #105 — Let me explain is its own first screen: short cards, one action. After Start it folds to a bar.
test('Let me explain: short cards, one action; it folds after Start and opens again', async ({ page }) => {
  await page.goto(example('flow-booking'));
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#start .eyebrow')).toHaveText('Let me explain');
  expect(await page.locator('button:visible').evaluateAll((l) => l.map((b) => b.id))).toEqual(['start-review']);
  const cards = page.locator('#start-cards > li');
  expect(await cards.count()).toBeGreaterThanOrEqual(5);
  await expect(cards.first().locator('h3')).toHaveText('What I need you to decide');
  for (const text of await cards.locator(':scope > div > p:first-of-type').allInnerTexts())
    expect(text.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, `one sentence: ${text}`).toBeLessThanOrEqual(1);
  await expect(page.locator('#start-cards')).toContainText('11 questions in 5 parts.');
  await page.locator('#start-cards details summary').first().click();
  await expect(page.locator('#start-cards details[open]')).toHaveCount(1);
  await start(page);
  await expect(page.locator('#start')).toBeHidden();
  await expect(page.locator('#start-mini')).toContainText('Let me explain');
  await expect(page.locator('#q-title')).toBeFocused();
  await page.locator('#start-mini').click();
  await expect(page.locator('#start')).toBeVisible();
});

// #74 — the same layout on every question: the question and the answer on the left, the places on the right, in a fixed
// order, only those with something in them.
test('the tour: places in a fixed order, no empty one, Back and Next, skipping, a progress bar that jumps, Download at the end', async ({ page }, info) => {
  await page.goto(example('checkout-uat'));
  await start(page);
  await expect(page.locator('#q-title')).toHaveText('A guest can buy without creating an account');
  await expect(page.locator('#t-where')).toContainText('1 of 2');
  await expect(page.locator('#stepno')).toHaveText('Step 2 of 6');
  const shown = await page.locator('.slot').evaluateAll((l) => l.map((s) => s.dataset.slot));
  expect(shown[0]).toBe('map');
  expect(shown, 'no screen in this review, so no Prototype place').not.toContain('proto');
  expect(shown, 'in the fixed order').toEqual(['map', 'proto', 'expected', 'build'].filter((x) => shown.includes(x)));
  await expect(page.locator('.slot .empty')).toHaveCount(0);
  if (info.project.use.viewport.width >= 900) {
    const q = await page.locator('.t-head').boundingBox(), p = await page.locator('.t-vis').boundingBox();
    expect(p.x, 'the places sit to the right of the question').toBeGreaterThan(q.x + q.width - 1);
  }
  await expect(page.locator('#next')).toContainText('Skip for now');
  await page.locator('input[name="v-guest-checkout"][value="works"]').check();
  await expect(page.locator('#next')).toContainText('Next');
  await expect(page.locator('#overview')).toContainText('1 of 4 answered');
  await page.locator('#main [data-jump^="q:"]').nth(1).click();
  await expect(page.locator('#stepno')).toHaveText('Step 4 of 6');
  await page.locator('#back').click();
  await expect(page.locator('#stepno')).toHaveText('Step 3 of 6');
  for (let i = 0; i < 3; i++) await page.locator('#next').click();
  await expect(page.locator('#q-title')).toHaveText('Take your answers back');
  await showPlace(page, 'expected');
  await expect(page.locator('.sum-row')).toHaveCount(4);
  await expect(page.locator('.sum-row').first()).toContainText('Works');
  await expect(page.locator('.sum-row').nth(1)).toContainText('Stays open');
  // The last button downloads the answered page: the one to send back.
  await expect(page.locator('#next')).toHaveText('Download answers');
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#next').click()]);
  expect(file.suggestedFilename()).toBe('checkout-uat-2026-09.feedback.html');
  await expect(page.locator('#footnote')).toContainText('Downloaded HTML');
});

test('each place minimises and comes back; Prototype only; remembered in this browser', async ({ page }) => {
  await page.goto(example('flow-booking'));
  await start(page);
  if (await page.locator('.ptabs').isVisible()) {                                     // a phone: one place at a time
    await page.locator('[data-ptab="proto"]').click();
    await expect(page.locator('#slot-proto')).toBeVisible();
    await expect(page.locator('#slot-map')).toBeHidden();
    return;
  }
  for (const id of ['map', 'proto', 'expected', 'build']) {
    await page.locator(`[data-min="${id}"]`).click();
    await expect(page.locator(`#slot-${id}`)).toHaveClass(/min/);
    await expect(page.locator(`[data-min="${id}"]`)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`#slot-${id} .slot-head`)).toBeVisible();
  }
  await page.reload(); await start(page);
  await expect(page.locator('.slot.min')).toHaveCount(4);
  await page.locator('[data-act="focus-all"]').click();
  await expect(page.locator('.slot.min')).toHaveCount(0);
  await page.locator('[data-act="focus-proto"]').click();
  await expect(page.locator('.slot.min')).toHaveCount(3);
  await expect(page.locator('#slot-proto')).not.toHaveClass(/min/);
  await expect(page.locator('#slot-proto .app')).toBeVisible();
});

// The prototype: the step's screen as the app shows it, the tapped part marked; the map says where you are.
test('a flow step: the phone screen, the map with you are here, what should happen and how it is built', async ({ page }) => {
  await page.goto(example('flow-booking'));
  await start(page);
  await showPlace(page, 'proto');
  await expect(page.locator('#slot-proto .app .bar')).toContainText('Book a studio');
  await expect(page.locator('#slot-proto .app .is-target, #slot-proto .app .on')).toHaveText(['Book 10:00']);
  await showPlace(page, 'map');
  await expect(page.locator('#slot-map [data-step="book"]')).toContainText('YOU ARE HERE');
  await page.locator('input[name="v-book"][value="agree"]').check();
  await page.locator('#next').click();
  await showPlace(page, 'map');
  await expect(page.locator('#slot-map [data-step="book"]')).toContainText('ANSWERED');
  await page.locator('#back').click();
  await showPlace(page, 'expected');
  await expect(page.locator('#slot-expected .exp')).toHaveCount(2);
  await expect(page.locator('#slot-expected .exp.fail')).toContainText('Another person booked 10:00');
  await showPlace(page, 'build');
  await expect(page.locator('#slot-build')).toContainText('capacity_left: 1 → 0');
  await expect(page.locator('#slot-build')).toContainText('test/fixtures/booking-app/src/booking.mjs:4');
});

test('Expand: the map with zoom and every screen, closed with Esc', async ({ page }) => {
  await page.goto(example('flow-booking'));
  await start(page);
  await showPlace(page, 'map');
  await page.locator('#slot-map [data-act="expand"]').click();
  const layer = page.getByRole('dialog', { name: 'Expanded view' });
  await expect(layer).toBeVisible();
  await expect(layer.locator('.gcard')).toHaveCount(10);
  await expect(layer.locator('.gcard.now')).toContainText('Pick a time');
  const w = Number(await layer.locator('.map-scroll svg').first().getAttribute('width'));
  await layer.locator('[data-zoom="+"]').click();
  expect(Number(await layer.locator('.map-scroll svg').first().getAttribute('width'))).toBeGreaterThan(w);
  await expect(layer).toContainText('What happens behind booking');
  await page.keyboard.press('Escape');
  await expect(layer).toBeHidden();
});

// ── answers travel back ──
test('checkout, in the Overview: answer, add a note, download JSON; the checker passes', async ({ page }) => {
  await page.goto(example('checkout-uat'));
  await overview(page);
  await page.locator('input[name="v-guest-checkout"][value="works"]').check();
  await page.locator('input[name="v-declined-card"][value="fails"]').check();
  await expect(page.locator('label[for="n-declined-card"]')).toContainText('What should be different?');
  await page.locator('#n-declined-card').fill('Customer sees error 51.');
  const file = await download(page, 'json', join(tmp(), 'feedback.json'));
  const r = check('pair', join(ROOT, 'examples/review.example.json'), file);
  expect(r.status, r.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).responses.find((x) => x.itemId === 'declined-card')).toMatchObject({ verdict: 'fails', note: 'Customer sees error 51.' });
});

test('flow, in the tour: judge a step, download from Return; the checker passes', async ({ page }) => {
  await page.goto(example('flow-booking'));
  await start(page);
  await page.locator('input[name="v-book"][value="agree"]').check();
  await note(page, 'book', 'Clear.');
  const file = await download(page, 'json', join(tmp(), 'feedback.json'));
  const r = check('pair', join(ROOT, 'examples/flow-booking.review.json'), file);
  expect(r.status, r.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).responses.find((x) => x.itemId === 'book')).toMatchObject({ verdict: 'agree', note: 'Clear.' });
});

test('an approval: the exact action as a dry run, approve or decline, and the checker passes', async ({ page }) => {
  const iso = (ms) => new Date(Date.now() + ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const r = readReview('decision-review.example.json');
  Object.assign(r, { id: 'approval-page-test', createdAt: iso(-60e3) });
  r.sections.push({ id: 'approve', label: 'Needs your approval' });
  r.items.push({ id: 'drop-db', sectionId: 'approve', title: 'Drop the old staging database',
    approval: { action: 'Drop the database checkout_v1_staging', scope: 'One staging database', risk: 'high', preview: 'DROP DATABASE checkout_v1_staging;', expiresAt: iso(864e5) } });
  const { rp, url } = rendered(r, 'pw-approval-');
  await page.goto(url);
  await start(page);
  await page.locator('#main [data-jump^="q:"]').last().click();
  await expect(page.locator('.t-head')).toContainText('Drop the old staging database');
  await showPlace(page, 'proto');
  await expect(page.locator('#slot-proto .console')).toContainText('will run: Drop the database checkout_v1_staging');
  await expect(page.locator('#slot-proto .console')).toContainText('DROP DATABASE checkout_v1_staging;');
  await expect(page.locator('input[name="v-drop-db"]')).toHaveCount(2);
  await page.locator('input[name="v-drop-db"][value="decline"]').check();
  await showPlace(page, 'build');
  await expect(page.locator('#slot-build')).toContainText('I still ask for permission');
  const file = await download(page, 'json', join(tmp(), 'feedback.json'));
  const c = check('pair', rp, file);
  expect(c.status, c.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).responses.find((x) => x.itemId === 'drop-db')).toMatchObject({ verdict: 'decline', approval: { risk: 'high' } });
});

test('a choice is one question: pick from the tiles or the option cards; the checker passes', async ({ page }) => {
  await page.goto(example('decision-review'));
  await start(page);
  await expect(page.locator('#q-title')).toHaveText('Where the answers are kept');
  await expect(page.locator('.tile')).toHaveCount(3);
  await showPlace(page, 'build');
  await expect(page.locator('#slot-build .opt').first()).toContainText('Recommended');
  await page.locator('#slot-build .opt[data-opt="opt-db"]').click();
  await expect(page.locator('input[name="c-storage"][value="opt-db"]')).toBeChecked();
  await page.locator('input[name="c-storage"][value="opt-file"]').check();
  const file = await download(page, 'json', join(tmp(), 'feedback.json'));
  const r = check('pair', join(ROOT, 'examples/decision-review.example.json'), file);
  expect(r.status, r.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).choices.find((c) => c.sectionId === 'storage').itemId).toBe('opt-file');
});

test('asking back: the tip says when it is read, and the request travels in the file', async ({ page }) => {
  await page.goto(example('checkout-uat'));
  await overview(page);
  await expect(page.locator('[data-ask]')).toHaveCount(0);                             // after an answer only
  await page.locator('input[name="v-guest-checkout"][value="partial"]').check();
  const ask = page.locator('[data-ask="explain"][data-for="guest-checkout"]');
  await expect(ask).toHaveAttribute('title', /once you send the file back/);
  await ask.click();
  await expect(ask).toHaveAttribute('aria-pressed', 'true');
  const file = await download(page, 'json', join(tmp(), 'feedback.json'));
  expect(JSON.parse(readFileSync(file, 'utf8')).requests).toEqual([expect.objectContaining({ itemId: 'guest-checkout', kind: 'explain' })]);
});

test('mark it on the map: after a critical answer, tap a box and say what about it; the checker passes', async ({ page }) => {
  await page.goto(example('checkout-uat'));
  await overview(page);
  await page.locator('input[name="v-declined-card"][value="fails"]').check();
  await page.locator('[data-act="mark"][data-for="declined-card"]').click();
  await expect(page.locator('.markhint')).toContainText('Tap the part you mean');
  await page.locator('.map-scroll.marking [data-node="pay"]').first().focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.mark')).toContainText('Takes the payment');
  await page.locator('textarea[data-comment="comment-1"]').fill('Say which card is charged.');
  const file = await download(page, 'json', join(tmp(), 'feedback.json'));
  const r = check('pair', join(ROOT, 'examples/review.example.json'), file);
  expect(r.status, r.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).comments).toEqual([expect.objectContaining({ node: 'pay', label: 'Takes the payment', note: 'Say which card is charged.' })]);
});

test('a picture on a note: re-saved, kept across a reload, and the checker passes', async ({ page }) => {
  const png = join(ROOT, 'site/social-preview.png');
  await page.goto(example('checkout-uat'));
  await overview(page);
  await page.locator('input[name="v-guest-checkout"][value="works"]').check();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-picadd="guest-checkout"]').click()]);
  await chooser.setFiles(png);
  await expect(page.locator('[data-pics="guest-checkout"] img')).toHaveCount(1);
  await expect(page.locator('[data-pics="guest-checkout"] .pic-msg')).toContainText('without hidden details');
  await page.reload(); await overview(page);
  await expect(page.locator('[data-pics="guest-checkout"] img')).toHaveCount(1);
  const file = await download(page, 'json', join(tmp(), 'feedback.json'));
  const r = check('pair', join(ROOT, 'examples/review.example.json'), file);
  expect(r.status, r.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).pictures[0]).toMatchObject({ on: 'guest-checkout', width: 1280, height: 640 });
});

// #103 — every download holds everything, and each can be previewed first.
test('Return: HTML, Markdown and JSON, each previewed; the report names what is still open', async ({ page }) => {
  await page.goto(example('checkout-uat'));
  await start(page);
  await page.locator('input[name="v-guest-checkout"][value="fails"]').check();
  await note(page, 'guest-checkout', 'The guest button is hidden.');
  await toReturn(page);
  await showPlace(page, 'build');
  await expect(page.locator('.included')).toContainText('1 answers');
  await page.locator('[data-preview="md"]').click();
  await expect(page.locator('#pv')).toContainText('### A guest can buy without creating an account');
  await expect(page.locator('#pv')).toContainText('Your note: "The guest button is hidden."');
  await expect(page.locator('#pv')).toContainText('## Still open');
  await page.locator('[data-preview="json"]').click();
  expect(JSON.parse(await page.locator('#pv').textContent()).protocol).toBe('letmeshowyousomething/feedback');
  const md = readFileSync(await download(page, 'md', join(tmp(), 'feedback.md')), 'utf8');
  expect(md).toContain("- Your answer: Doesn't work");
  expect(md).toContain('_not answered, stays open_');
});

// ── nothing trusts its input ──
test('a hostile review runs no script and shows no injected markup', async ({ page }) => {
  const bad = '<img src=x onerror="window.__pwned=1">';
  const evil = readReview('decision-review.example.json');
  Object.assign(evil, { id: 'evil', intro: bad, title: bad, ask: bad, afterwards: bad, audience: bad });
  evil.sections[0].label = bad; evil.sections[0].recommended.why = bad;
  for (const it of evil.items) Object.assign(it, { title: bad, summary: bad, body: bad, ref: bad });
  await page.goto(rendered(evil).url);
  await expect(page.locator('h1')).toHaveText(bad);
  await start(page);
  await page.locator('#mode-overview').click();
  expect(await page.locator('img').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('a hostile answer cannot break out of the answered page', async ({ page }) => {
  const bad = '</script><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">';
  await page.goto(example('checkout-uat'));
  await overview(page);
  await page.locator('input[name="v-declined-card"][value="fails"]').check();
  await page.locator('#n-declined-card').fill(bad);
  const file = await download(page, 'html', join(tmp(), 'feedback.html'));
  await page.evaluate(() => localStorage.clear());
  await page.goto(pathToFileURL(file).href);
  await overview(page);
  await expect(page.locator('#n-declined-card')).toHaveValue(bad);
  expect(await page.locator('img').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

// #38 — two different reviews with the same id never share answers.
test('two different reviews with the same id do not share answers', async ({ page }) => {
  const other = readReview('review.example.json');
  other.title = 'Another checkout test, same id';
  const { url } = rendered(other);
  await page.goto(example('checkout-uat'));
  await overview(page);
  await page.locator('input[name="v-guest-checkout"][value="fails"]').check();
  await page.locator('#n-guest-checkout').fill('Given on the example page');
  await page.goto(url);
  await expect(page.locator('h1')).toHaveText('Another checkout test, same id');
  await overview(page);
  expect(await page.locator('input[name="v-guest-checkout"][value="fails"]').isChecked(), 'answer crossed over').toBe(false);
  await expect(page.locator('#n-guest-checkout')).toHaveCount(0);
  await page.goto(example('checkout-uat'));
  await overview(page);
  await expect(page.locator('#n-guest-checkout')).toHaveValue('Given on the example page');
});

test('storage that fails is said out loud, and the download still has everything', async ({ page }) => {
  await page.goto(example('checkout-uat'));
  await overview(page);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  await page.locator('input[name="v-guest-checkout"][value="works"]').check();
  await page.locator('#n-guest-checkout').fill('Keep this unsaved answer.');
  await expect(page.locator('#save-warning')).toBeVisible();
  const file = await download(page, 'json', join(tmp(), 'feedback.json'));
  expect(JSON.parse(readFileSync(file, 'utf8')).responses[0].note).toBe('Keep this unsaved answer.');
});

// #102 — on a phone the tour is one screen: the question, one place at a time, the answer, Back and Next.
test('on a phone the tour fits one screen, one place at a time', async ({ page }, info) => {
  test.skip(info.project.use.viewport.width > 700, 'phone only');
  await page.goto(example('flow-booking'));
  await start(page);
  const tour = await page.locator('.tour').boundingBox();
  expect(tour.y + tour.height, 'the tour ends inside the screen').toBeLessThanOrEqual(page.viewportSize().height + 1);
  await expect(page.locator('#next')).toBeInViewport();
  await expect(page.locator('.slot:visible')).toHaveCount(1);
  await page.locator('[data-ptab="expected"]').click();
  await expect(page.locator('#slot-expected')).toBeVisible();
  await page.locator('[data-act="why"]').click();
  await expect(page.getByRole('dialog', { name: 'Why I ask' })).toContainText('Goal: to secure the Saturday slot');
  await page.locator('[data-act="close-layer"]').click();
  await page.locator('input[name="v-book"][value="disagree"]').check();
  await page.locator('[data-act="note"]').click();
  await expect(page.getByRole('dialog', { name: 'Add a note' })).toContainText('What should be different?');
});

// Every kind of review is a tour and has an Overview: each example, plus an explanation and an approval.
const KINDS = Object.fromEntries(Object.keys(PAGES).map((name) => [name, (r) => r]).concat([
  ['explanation', (r) => { r.brief = { explains: 'Why the export is a file.' }; return r; }],
  ['approval-only', (r) => ({ ...r, sections: undefined, items: [{ id: 'drop-db', title: 'Drop the old staging database',
    approval: { action: 'Drop checkout_v1_staging', scope: 'One staging database', risk: 'high', expiresAt: '2099-01-01T00:00:00Z' } }] })],
]));
for (const [kind, shape] of Object.entries(KINDS)) {
  test(`every kind: ${kind} walks from Let me explain to Return, and its Overview holds every question`, async ({ page }) => {
    const r = shape(readReview(PAGES[kind] || 'review.example.json'));
    r.id = 'kind-' + kind;
    await page.goto(rendered(r).url);
    if (kind === 'explanation') await expect(page.locator('#start-cards h3').first()).toHaveText('What this is about');
    await start(page);
    const n = Number((await page.locator('#stepno').textContent()).split(' of ')[1]);
    for (let i = 2; i < n; i++) {
      await expect(page.locator('#stepno')).toHaveText(`Step ${i} of ${n}`);
      const shown = await page.locator('.slot').evaluateAll((l) => l.map((s) => s.dataset.slot));
      expect(shown, 'the places with something in them, in the fixed order').toEqual(['map', 'proto', 'expected', 'build'].filter((x) => shown.includes(x)));
      await expect(page.locator('.slot .empty')).toHaveCount(0);
      await page.locator('#next').click();
    }
    await expect(page.locator('#q-title')).toHaveText('Take your answers back');
    await page.locator('#mode-overview').click();
    await expect(page.locator('#main .c-item')).toHaveCount(n - 2);
  });
}

// Every part of the progress bar says its whole name: none is cut, however narrow its share.
test('the progress bar names every part in full', async ({ page }) => {
  for (const name of Object.keys(PAGES)) {
    await page.goto(example(name));
    await start(page);
    const cut = await page.evaluate(() => [...document.querySelectorAll('.pseg .pl')].filter((e) => e.getClientRects().length
      && (e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > e.closest('.pseg').getBoundingClientRect().right + 1)).map((e) => e.textContent.trim()));
    expect(cut, `${name}: labels cut`).toEqual([]);
  }
  await expect(page.locator('.pseg[data-jump="start"]')).toContainText('Let me explain');
});

// A phone's file preview runs no script: the cards, a note on how to answer and the answers still show.
test('without a script: Let me explain, how to open it, and the answers as text; the file still reads back', async ({ page, browser }, info) => {
  await page.goto(example('flow-booking'));
  await start(page);
  await page.locator('input[name="v-book"][value="agree"]').check();
  await note(page, 'book', 'Looks good.\nconst SEED = {"x":1};');                      // a line that must never pass for the answers
  const file = await download(page, 'html', join(tmp(), 'answered.html'));
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: info.project.use.viewport });
  const q = await ctx.newPage();
  await q.goto(pathToFileURL(file).href);
  expect(await q.locator('#start-cards > li').count()).toBeGreaterThanOrEqual(5);
  await expect(q.locator('.no-script')).toBeVisible();
  await expect(q.locator('#start-review')).toBeHidden();
  await expect(q.locator('#static-answers')).toContainText('Taps Book 10:00');
  await expect(q.locator('#static-answers')).toContainText('Agree');
  await expect(q.locator('#static-answers')).toContainText('const SEED = {"x":1};');
  await ctx.close();
  const text = readFileSync(file, 'utf8');
  expect(text.match(/^const SEED = /gm)).toHaveLength(1);
  await expect(page.locator('.no-script')).toBeHidden();                             // with a script, no such note
});

// #82 — a second round: what became of each question, every round in one place, and it all travels.
test('a second round: since last time, tags and replies, History, settled answers, and the file keeps it all', async ({ page }) => {
  await page.goto(example('checkout-round2'));
  await expect(page.locator('#start .eyebrow')).toHaveText('Let me explain · round 2');
  await expect(page.locator('#start-cards')).toContainText('Round 2: 2 changed after your notes, 1 still open, 1 you added, 1 settled.');
  await start(page);
  await expect(page.locator('.t-head .tag')).toHaveText('Changed after your note');
  await expect(page.locator('.t-head .earlier')).toContainText('You: Partially works');
  await expect(page.locator('.t-head .earlier')).toContainText('Me: Changed: the saved card is now chosen by default');
  await page.locator('#next').click();
  await expect(page.locator('.t-head .earlier')).toContainText('"Customer sees error 51."');
  if (await page.locator('[data-act="why"]').first().isVisible()) { await page.locator('[data-act="why"]').first().click(); }
  await page.locator('[data-act="history"]:visible').first().click();
  const history = page.getByRole('dialog', { name: 'History' });
  await expect(history.locator('.hround')).toHaveCount(2);
  await expect(history).toContainText('A guest can buy without creating an account');
  await expect(history).toContainText('Settled');
  await expect(history).toContainText('You added: Currency switches halfway through');
  await page.locator('[data-act="close-layer"]').click();
  await page.locator('#mode-overview').click();
  await expect(page.locator('.settled summary')).toContainText('Settled in earlier rounds (1)');
  await page.locator('input[name="v-back-button"][value="works"]').check();
  const md = readFileSync(await download(page, 'md', join(tmp(), 'r2.md')), 'utf8');
  expect(md).toContain('## History · round 1');
  expect(md).toContain('Reply: Changed: error 51 now reads');
  const html = await download(page, 'html', join(tmp(), 'r2.html'));
  expect(readFileSync(html, 'utf8').match(/^const HISTORY = /gm)).toHaveLength(1);
  const back = check('pair', join(ROOT, 'examples/checkout-round2.review.json'), await download(page, 'json', join(tmp(), 'r2.json')));
  expect(back.status, back.stdout).toBe(0);
  await page.goto(pathToFileURL(html).href);
  await expect(page.locator('#start .eyebrow')).toHaveText('Let me explain · round 2');
});

test('a hostile earlier round stays text in the tags, the replies and History', async ({ page }) => {
  const bad = '<img src=x onerror="window.__pwned=1">';
  const r1 = readReview('review.example.json'), f1 = JSON.parse(readFileSync(join(ROOT, 'examples/checkout-uat.feedback.json'), 'utf8'));
  f1.responses.find((x) => x.itemId === 'declined-card').note = bad; f1.addedItems[0].title = bad;
  const r2 = readReview('checkout-round2.review.json');
  r1.id = f1.review.id = r2.continues = 'hostile-round-1'; r2.id = 'hostile-round-2';   // examples' ids are theirs alone (#38)
  r2.items.find((i) => i.id === 'declined-card').reply = bad; r2.items.find((i) => i.id === 'added-1').title = bad;
  const dir = tmp('pw-hostile-rounds-');
  const w = (name, o) => { const p = join(dir, name); writeFileSync(p, JSON.stringify(o)); return p; };
  const rp = w('r2.json', r2), out = join(dir, 'r2.html');
  const run = spawnSync(process.execPath, [join(ROOT, 'bin/render.mjs'), rp, out, '--earlier', w('r1.json', r1), w('f1.json', f1)], { encoding: 'utf8' });
  expect(run.status, run.stderr + run.stdout).toBe(0);
  await page.goto(pathToFileURL(out).href);
  await start(page);
  await page.locator('#next').click();
  await expect(page.locator('.t-head .earlier')).toContainText(bad);
  await page.evaluate(() => { st.layer = 'history'; render(null); });
  await expect(page.getByRole('dialog', { name: 'History' })).toContainText(bad);
  expect(await page.locator('img').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

// A flow in its third round: only the open step is asked, the map keeps every step, History has both rounds.
test('a flow in round 3: one question, the whole flow on the map, both earlier rounds in History', async ({ page }) => {
  await page.goto(example('flow-booking-round3'));
  await expect(page.locator('#start-cards')).toContainText('Round 3: 1 changed after your notes, 11 settled.');
  await start(page);
  await expect(page.locator('#stepno')).toHaveText('Step 2 of 3');
  await expect(page.locator('.t-head .earlier')).toContainText('"Say who answers the question: the venue, not us."');
  await showPlace(page, 'map');
  await expect(page.locator('#slot-map [data-step="book"]')).toContainText('ANSWERED');
  await expect(page.locator('#slot-map [data-step="ask"]')).toContainText('YOU ARE HERE');
  await showPlace(page, 'proto');
  await expect(page.locator('#slot-proto .app .bar')).toContainText('Book a studio');
  if (await page.locator('[data-act="history"]:visible').count() === 0) await page.locator('[data-act="why"]').first().click();
  await page.locator('[data-act="history"]:visible').first().click();
  await expect(page.getByRole('dialog', { name: 'History' }).locator('.hround')).toHaveCount(3);
});

// Every answer has its own symbol: Revisit turns back, and no two answers share one.
test('each answer tile has its own symbol; Revisit turns back', async ({ page }) => {
  await page.goto(example('flow-booking'));
  await start(page);
  const icons = await page.locator('.tile .dot use').evaluateAll((l) => l.map((u) => u.getAttribute('href')));
  expect(new Set(icons).size).toBe(icons.length);
  await expect(page.locator('.tile:has(input[value="revisit"]) .dot use')).toHaveAttribute('href', '#i-undo');
  await expect(page.locator('.tile:has(input[value="partly-agree"]) .dot use')).toHaveAttribute('href', '#i-half');
  // Only a word that means "later" turns back: a second negative answer gets a warning, not an arrow back.
  const r = readReview('review.example.json'); r.id = 'two-negatives';
  r.verdictSet = { id: 'explanation', options: [{ value: 'clear', label: 'Clear', tone: 'positive' }, { value: 'lost-me', label: 'Lost me', tone: 'negative' }, { value: 'seems-wrong', label: 'Seems wrong', tone: 'negative' }] };
  await page.goto(rendered(r).url); await start(page);
  await expect(page.locator('.tile:has(input[value="seems-wrong"]) .dot use').first()).toHaveAttribute('href', '#i-alert');
});

// #33 — a screen can be a screenshot: its areas are drawn on it, visible without hover, and each opens its step.
test('a screenshot: its areas are visible, big enough to tap, and open their step', async ({ page }, info) => {
  await page.goto(example('password-reset'));
  await start(page); await showPlace(page, 'proto');
  const shot = page.locator('#main .app.shot img');
  await expect(shot).toHaveAttribute('alt', /Sign-in screen/);
  const area = page.locator('#main button.hot');
  await expect(area).toHaveCount(1);
  await expect(area).toHaveAttribute('aria-current', 'step');
  expect(await area.evaluate((el) => getComputedStyle(el).borderStyle)).toBe('solid');
  const box = await area.boundingBox(), min = info.project.use.hasTouch ? 44 : 24;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(min);
  await page.locator('#next').click();
  await showPlace(page, 'proto');
  await expect(page.locator('#q-title')).toHaveText('Taps Send reset link');
  await page.locator('#main button.hot[aria-label="Taps Back"]').click();
  await expect(page.locator('#q-title')).toHaveText('Taps Back');
});

// #33 — the reviewer shows a screen as it really is: their screenshot replaces it, stays, and goes back in the file.
test('your own screenshot of a screen: shown in its place, replaced, kept, and sent back', async ({ page }) => {
  const png = join(ROOT, 'site/social-preview.png');
  await page.goto(example('flow-booking'));
  await start(page); await showPlace(page, 'proto');
  const choose = async () => { const [c] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-shotadd="slot-list"]').click()]); await c.setFiles(png); };
  await choose();
  await expect(page.locator('#main .app.shot img')).toHaveAttribute('alt', 'Your screenshot of Pick a time');
  await expect(page.locator('#main .shot-tag')).toHaveText('Your screenshot');
  await expect(page.locator('.shot-tools .pic-msg')).toContainText('without hidden details');
  await choose();
  await page.reload(); await start(page); await showPlace(page, 'proto');
  await expect(page.locator('[data-shotadd="slot-list"]')).toHaveText('Replace your screenshot');
  const file = await download(page, 'json', join(tmp(), 'feedback.json'));
  const r = check('pair', join(ROOT, 'examples/flow-booking.review.json'), file, '--root', ROOT);
  expect(r.status, r.stdout).toBe(0);
  const pics = JSON.parse(readFileSync(file, 'utf8')).pictures;
  expect(pics).toHaveLength(1);
  expect(pics[0]).toMatchObject({ on: 'book', screen: 'slot-list' });
});

// #33 — a choice between things that look different: each option's screen, side by side on the pick, each with its button.
test('a choice between layouts: every option drawn side by side, picked from its own screen', async ({ page }) => {
  await page.goto(example('results-layout'));
  await start(page); await showPlace(page, 'proto');
  const cards = page.locator('#main .variant');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(1)).toContainText('recommended');
  await expect(cards.nth(2).locator('.app')).toContainText('Rating');
  await cards.nth(2).locator('[data-choose]').click();
  await expect(page.locator('input[name="c-layout"][value="opt-table"]')).toBeChecked();
  await expect(page.locator('#main .variant.on [data-choose]')).toHaveText('Your pick');
  await page.locator('#mode-overview').click();
  await page.locator('[data-ovd="layout"] summary').click();
  await expect(page.locator('[data-ovd="layout"] .variant')).toHaveCount(3);
});

// The Map place: the question's own diagram first, every other diagram a tab beside it, and zoom in place. Each
// question opens on its own diagram again.
test('the map: other diagrams as tabs in place, zoom in place, and each question opens on its own diagram', async ({ page }) => {
  await page.goto(example('flow-booking'));
  await start(page);
  const shown = () => page.locator('#slot-map .map-scroll').getAttribute('data-map');
  const tabs = page.locator('#slot-map [data-dtab]');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.first()).toHaveAttribute('aria-pressed', 'true');
  expect(await shown()).toBe('user-flow');
  const width = async () => (await page.locator('#slot-map svg.dg').boundingBox()).width;
  const before = await width();
  await page.locator('#slot-map [data-mzoom="+"]').click();
  await expect(page.locator('#slot-map .zoom output')).toHaveText('125%');
  expect(await width()).toBeGreaterThan(before * 1.2);
  await page.locator('#slot-map [data-dtab="booking-system"]').click();
  expect(await shown()).toBe('booking-system');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'no sideways scroll').toBeLessThanOrEqual(0);
  await page.locator('#next').click();
  expect(await shown(), 'the next question opens on its own diagram').toBe('user-flow');
  await page.locator('#slot-map [data-mzoom="fit"]').click();
  await expect(page.locator('#slot-map .zoom output')).toHaveText('100%');
});

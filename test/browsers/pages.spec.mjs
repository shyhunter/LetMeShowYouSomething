// SPDX-License-Identifier: Apache-2.0
// The review page as the approved design (#74): Let me explain, the guided tour with four places in a
// fixed order, the Overview, Return with every download. In Chromium, Firefox and WebKit, at desktop,
// tablet and phone size (D091).
import { test, expect } from '@playwright/test';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, example, readReview, check, rendered, guard, start, overview, toReturn, showPlace, download, note } from './page-helpers.mjs';

const PAGES = { 'checkout-uat': 'review.example.json', 'decision-review': 'decision-review.example.json', 'flow-booking': 'flow-booking.review.json', 'database-booking': 'database-booking.review.json', 'retry-backoff': 'retry-backoff.review.json', 'booking-race': 'booking-race.review.json', 'ai-tool-loop': 'ai-tool-loop.review.json' };
const tmp = (p = 'pw-') => mkdtempSync(join(tmpdir(), p));
guard(test);

// With a mouse, WCAG 2.2 AA (2.5.8): 24 × 24 px. On a touch screen, 44 × 44 px (D092). Exempt: links in
// running text, the skip link, and the drawn app screen and diagrams, which are pictures.
const smallTargets = (page, min) => page.evaluate((min) => [...document.querySelectorAll('button, a[href], summary, select, textarea, input:not([type=hidden]), [role=tab]')]
  .map((el) => (el.matches('input[type=radio], input[type=checkbox]') && el.closest('label')) || el)
  .filter((el, i, all) => all.indexOf(el) === i && el.getClientRects().length && !el.matches('.skip, p a, li a, span a, .app *, .dg *'))
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

// #74 — the same layout on every question: the question and the answer on the left, four places on the right.
test('the tour: four places in a fixed order, Back and Next, skipping, a progress bar that jumps', async ({ page }, info) => {
  await page.goto(example('checkout-uat'));
  await start(page);
  await expect(page.locator('#q-title')).toHaveText('A guest can buy without creating an account');
  await expect(page.locator('#t-where')).toContainText('1 of 2');
  await expect(page.locator('#stepno')).toHaveText('Step 2 of 6');
  expect(await page.locator('.slot').evaluateAll((l) => l.map((s) => s.dataset.slot))).toEqual(['map', 'proto', 'expected', 'build']);
  await expect(page.locator('#slot-proto')).toContainText('Nothing here for this question');
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
      expect(await page.locator('.slot').evaluateAll((l) => l.map((s) => s.dataset.slot))).toEqual(['map', 'proto', 'expected', 'build']);
      await page.locator('#next').click();
    }
    await expect(page.locator('#q-title')).toHaveText('Take your answers back');
    await page.locator('#mode-overview').click();
    await expect(page.locator('#main .c-item')).toHaveCount(n - 2);
  });
}

// SPDX-License-Identifier: Apache-2.0
// The example pages in Chromium, Firefox and WebKit, at desktop, tablet and phone size (D091).
// What can differ between engines: loading, layout, the round trip through Export, hostile input.
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const url = (file) => 'file://' + resolve(ROOT, file);
const PAGES = { 'checkout-uat': 'review.example.json', 'decision-review': 'decision-review.example.json', 'flow-booking': 'flow-booking.review.json' };
const check = (...args) => spawnSync(process.execPath, [join(ROOT, 'bin/check.mjs'), ...args, '--root', ROOT], { encoding: 'utf8' });
const render = (reviewPath, dir) => {
  const out = join(dir, 'page.html');
  const r = spawnSync(process.execPath, [join(ROOT, 'bin/render.mjs'), reviewPath, out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return out;
};

// Every page must run clean and offline: no script error, nothing fetched beyond the file itself.
test.beforeEach(async ({ page }, info) => {
  info.problems = [];
  page.on('pageerror', (e) => info.problems.push(`script error: ${e.message}`));
  page.on('request', (r) => { if (!/^(file|data|blob|about):/.test(r.url())) info.problems.push(`fetched ${r.url()}`); });
});
test.afterEach(async ({}, info) => { expect(info.problems, 'errors or network requests').toEqual([]); });

for (const [name, review] of Object.entries(PAGES)) {
  test(`${name}: loads, fits the screen, every target can be hit`, async ({ page }, info) => {
    await page.goto(url(`examples/${name}.html`));
    await expect(page.locator('h1')).toHaveText(JSON.parse(readFileSync(join(ROOT, 'examples', review), 'utf8')).title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'sideways scroll').toBeLessThanOrEqual(0);
    // With a mouse, WCAG 2.2 AA (2.5.8): 24 × 24 px. On a touch screen, 44 × 44 px (D092). Exempt:
    // links inside running text, the skip link (it appears on focus only) and the drawn app screen,
    // which is a picture except for its targets.
    const min = info.project.use.hasTouch ? 44 : 24;
    const small = await page.evaluate((min) => [...document.querySelectorAll('button, a[href], summary, select, textarea, input:not([type=hidden]), [role=tab]')]
      .map((el) => (el.matches('input[type=radio], input[type=checkbox]') && el.closest('label')) || el)
      .filter((el, i, all) => all.indexOf(el) === i && el.getClientRects().length && !el.matches('.skip, p a, li a, .screen *:not(.is-target)'))
      .map((el) => { const b = el.getBoundingClientRect(); return { el: el.id || el.className || el.tagName, w: Math.round(b.width), h: Math.round(b.height) }; })
      .filter((x) => x.w < min || x.h < min), min);
    expect(small, `targets smaller than ${min} × ${min} px`).toEqual([]);
    // Signed at the bottom, quietly: the mark and a link that opens beside the page (D095).
    const made = page.locator('.made');
    await expect(made).toHaveText('Made with LetMeShowYouSomething');
    await expect(made.locator('svg')).toBeVisible();
    await expect(made.locator('a')).toHaveAttribute('href', 'https://github.com/shyhunter/LetMeShowYouSomething');
    await expect(made.locator('a')).toHaveAttribute('target', '_blank');
  });
}

// The site's own pages: offline too, and fit every screen. The loop page carries its recording.
for (const name of ['index', 'loop']) {
  test(`site ${name}: loads, fits the screen`, async ({ page }) => {
    await page.goto(url(`site/${name}.html`));
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'sideways scroll').toBeLessThanOrEqual(0);
    if (name === 'loop') await expect(page.locator('video source')).toHaveAttribute('src', 'loop.mp4');
  });
}

test('checkout: answer, export, and the file passes the checker', async ({ page }) => {
  await page.goto(url('examples/checkout-uat.html'));
  await page.locator('label:has(input[name="v-guest-checkout"][value="works"])').click();
  await page.locator('label:has(input[name="v-declined-card"][value="fails"])').click();
  await page.locator('textarea[data-note="declined-card"]').fill('Customer sees error 51.');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pw-')), 'feedback.json');
  await download.saveAs(file);
  const r = check('pair', join(ROOT, 'examples/review.example.json'), file);
  expect(r.status, r.stdout).toBe(0);
  const fb = JSON.parse(readFileSync(file, 'utf8'));
  expect(fb.responses.find((x) => x.itemId === 'declined-card')).toMatchObject({ verdict: 'fails', note: 'Customer sees error 51.' });
});

test('flow: tap through, judge a step, export, and the file passes the checker', async ({ page }) => {
  await page.goto(url('examples/flow-booking.html'));
  await page.locator('#screen [data-target="book"]').click();
  await page.locator('#detail [data-outcome="0"]').click();
  await expect(page.locator('#screen-title')).toHaveText('Booked');
  await page.locator('#detail .open label:has(input[data-item="book"][value="agree"])').click();
  await expect(page.locator('#overview')).toContainText('1 answered');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pw-')), 'feedback.json');
  await download.saveAs(file);
  const r = check('pair', join(ROOT, 'examples/flow-booking.review.json'), file);
  expect(r.status, r.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).responses.find((x) => x.itemId === 'book').verdict).toBe('agree');
});

// One tap, every layer answers (D098): what runs and what changes, shown with the step, judged on their own.
test('flow: the system and data layers show with the step, and an entry can be judged', async ({ page }) => {
  await page.goto(url('examples/flow-booking.html'));
  await page.locator('#screen [data-target="book"]').click();
  const detail = page.locator('#detail');
  await expect(detail.locator('.layer').first()).toBeHidden();           // the review opens on UI + flow
  await detail.locator('input[data-layer="system"]').check();
  await detail.locator('input[data-layer="data"]').check();
  const first = detail.locator('.outcome').first();
  await expect(first.locator('.layer').first()).toContainText('What runs');
  await expect(first).toContainText('Slot still has capacity');
  await expect(first).toContainText('test/fixtures/booking-app/src/booking.mjs:4');
  await expect(first).toContainText('capacity_left: 1 → 0');
  await first.locator('details.judge').first().locator('summary').click();
  await first.locator('input[data-lv="book/capacity-guard"][value="disagree"]').check({ force: true });
  await first.locator('textarea[data-lvnote="book/capacity-guard"]').fill('Two people can pass this check at once.');
  await expect(first.locator('details.judge').first().locator('summary')).toHaveText('Judged: Disagree');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pw-')), 'feedback.json');
  await download.saveAs(file);
  const r = check('pair', join(ROOT, 'examples/flow-booking.review.json'), file);
  expect(r.status, r.stdout).toBe(0);
  const fb = JSON.parse(readFileSync(file, 'utf8'));
  expect(fb.layerVerdicts).toEqual([expect.objectContaining({ id: 'book/capacity-guard', layer: 'system', verdict: 'disagree', note: 'Two people can pass this check at once.' })]);
  expect(fb.gaps).toContain('book/capacity-guard');
});

test('a hostile review runs no script and shows no injected markup', async ({ page }) => {
  const bad = '<img src=x onerror="window.__pwned=1">';
  const evil = JSON.parse(readFileSync(join(ROOT, 'examples/decision-review.example.json'), 'utf8'));
  Object.assign(evil, { id: 'evil', intro: bad, title: bad, ask: bad, afterwards: bad, audience: bad });
  evil.sections[0].label = bad; evil.sections[0].recommended.why = bad;
  for (const it of evil.items) Object.assign(it, { title: bad, summary: bad, body: bad, ref: bad });
  const dir = mkdtempSync(join(tmpdir(), 'pw-'));
  writeFileSync(join(dir, 'evil.json'), JSON.stringify(evil));
  await page.goto('file://' + render(join(dir, 'evil.json'), dir));
  await expect(page.locator('h1')).toHaveText(bad);
  expect(await page.locator('img').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('a hostile answer cannot break out of the exported page', async ({ page }) => {
  const bad = '</script><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">';
  await page.goto(url('examples/checkout-uat.html'));
  await page.locator('textarea[data-note="declined-card"]').fill(bad);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exporth').click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pw-')), 'feedback.html');
  await download.saveAs(file);
  await page.evaluate(() => localStorage.clear());
  await page.goto('file://' + file);
  await expect(page.locator('textarea[data-note="declined-card"]')).toHaveValue(bad);
  expect(await page.locator('img').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

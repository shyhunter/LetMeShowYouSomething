// SPDX-License-Identifier: Apache-2.0
// #147 — a day and night switch: it starts from the system's setting, flips the page, is remembered in this browser,
// applies before the page is drawn, and never becomes part of the answers or the downloaded page.
import { test, expect } from '@playwright/test';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, example, start, download } from './page-helpers.mjs';

const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('a review page: the switch flips day and night, is remembered, and stays out of the answers', async ({ page }) => {
  await page.goto(example('salon-booking'));
  const sw = page.locator('#start [data-theme-switch]');
  await expect(sw).toBeVisible();
  await expect(sw).toHaveAttribute('role', 'switch');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  const day = await bg(page);
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  expect(await bg(page)).not.toBe(day);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme), 'kept, and applied before drawing').toBe('dark');
  await start(page);
  await expect(page.locator('#topbar [data-theme-switch]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('input[name="v-pick-service"][value="agree"]').check();
  const dir = mkdtempSync(join(tmpdir(), 'daynight-'));
  const html = readFileSync(await download(page, 'html', join(dir, 'answered.html')), 'utf8');
  expect(html.match(/<html[^>]*>/)[0], 'the downloaded page opens in its reader\'s own mode').not.toContain('data-theme');
  const json = readFileSync(await download(page, 'json', join(dir, 'feedback.json')), 'utf8');
  expect(json).not.toContain('theme');
});

test('a review page in dark system mode starts dark, and the switch says so', async ({ browser }) => {
  const page = await (await browser.newContext({ colorScheme: 'dark' })).newPage();
  await page.goto(example('checkout-uat'));
  await expect(page.locator('#start [data-theme-switch]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#start [data-theme-switch]').click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});

test('the site pages: one switch each, flipping and remembered', async ({ page }) => {
  for (const name of ['index', 'tutorial', 'loop', 'privacy']) {
    await page.goto(pathToFileURL(join(ROOT, 'site', name + '.html')).href);
    await page.evaluate(() => localStorage.removeItem('lmsys:theme'));
    await page.reload();
    const sw = page.getByRole('switch', { name: 'Dark mode' });
    await expect(sw, name).toHaveCount(1);
    const day = await bg(page);
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(await bg(page), name).not.toBe(day);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme), name).toBe('dark');
    await page.evaluate(() => localStorage.removeItem('lmsys:theme'));
  }
});

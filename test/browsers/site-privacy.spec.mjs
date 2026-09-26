// SPDX-License-Identifier: Apache-2.0
// #142 — privacy, said plainly and kept: every site page links the privacy page, and what that page says holds —
// the site pages set no cookies, store nothing and ask no other server for anything.
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './page-helpers.mjs';

const SITE = ['index', 'tutorial', 'loop', 'privacy'];

test('every site page links the privacy page, and none sets a cookie, stores anything or calls out', async ({ page }) => {
  const outside = [];
  page.on('request', (r) => { if (!/^(file|data|blob|about):/.test(r.url())) outside.push(r.url()); });
  for (const name of SITE) {
    await page.goto(pathToFileURL(join(ROOT, 'site', name + '.html')).href);
    if (name !== 'privacy') await expect(page.locator('a[href="privacy.html"]'), name).toHaveCount(1);
    expect(await page.evaluate(() => document.cookie), name).toBe('');
    expect(await page.evaluate(() => { try { return localStorage.length + sessionStorage.length; } catch { return 0; } }), name).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name}: sideways scroll`).toBeLessThanOrEqual(0);
  }
  expect(outside, 'no request to another server').toEqual([]);
});

test('the privacy page says what a review page keeps, and why there is no cookie banner', async ({ page }) => {
  await page.goto(pathToFileURL(join(ROOT, 'site/privacy.html')).href);
  for (const words of ['no cookies, no tracking, no analytics', 'your answers', 'your view', 'Why there is no cookie banner', 'Apache-2.0', 'without warranty'])
    await expect(page.locator('main')).toContainText(words);
  await expect(page.getByRole('link', { name: '← LetMeShowYouSomething' })).toHaveAttribute('href', './');
});

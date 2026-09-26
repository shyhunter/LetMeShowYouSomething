// SPDX-License-Identifier: Apache-2.0
// #140 — the site is found and shared well: every page has its own title and description, a canonical address and a
// social card; the sitemap lists only pages that exist; the chat replay stays out of search; every example page
// describes itself.
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './page-helpers.mjs';

const BASE = 'https://shyhunter.github.io/LetMeShowYouSomething/';
const SITE = { 'index.html': '', 'tutorial.html': 'tutorial.html', 'loop.html': 'loop.html' };
const meta = (page, sel) => page.locator(sel).getAttribute('content');

test('site pages: a title, a description, a canonical address and a social card each', async ({ page }) => {
  const titles = new Set();
  for (const [file, path] of Object.entries(SITE)) {
    await page.goto(pathToFileURL(join(ROOT, 'site', file)).href);
    const title = await page.title();
    expect(title, file).toBeTruthy();
    titles.add(title);
    expect((await meta(page, 'meta[name="description"]')).length, file).toBeGreaterThan(40);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', BASE + path);
    expect(await meta(page, 'meta[property="og:title"]')).toBe(title);
    expect(await meta(page, 'meta[property="og:url"]')).toBe(BASE + path);
    expect(await meta(page, 'meta[property="og:image"]')).toBe(BASE + 'social-preview.png');
    expect(await meta(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
  }
  expect(titles.size, 'every title is its own').toBe(Object.keys(SITE).length);
  expect(existsSync(join(ROOT, 'site/social-preview.png'))).toBe(true);
});

test('the sitemap lists only pages that exist, the site pages among them', () => {
  const locs = [...readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const path of Object.values(SITE)) expect(locs).toContain(BASE + path);
  const deployed = readFileSync(join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  for (const loc of locs) {
    const path = loc.slice(BASE.length) || 'index.html';
    const here = path.startsWith('examples/') ? join(ROOT, path) : join(ROOT, 'site', path);
    expect(existsSync(here), path).toBe(true);
    if (path.startsWith('examples/')) expect(deployed, `${path} is deployed`).toContain(path.slice('examples/'.length, -'.html'.length));
  }
});

test('the chat replay stays out of search; every example page describes itself', async ({ page }) => {
  expect(readFileSync(join(ROOT, 'site/tutorial/chat.html'), 'utf8')).toContain('<meta name="robots" content="noindex">');
  for (const name of ['salon-booking', 'flow-booking', 'checkout-uat', 'decision-review', 'results-layout', 'password-reset']) {
    await page.goto(pathToFileURL(join(ROOT, 'examples', name + '.html')).href);
    expect((await meta(page, 'meta[name="description"]')).length, name).toBeGreaterThan(20);
  }
});

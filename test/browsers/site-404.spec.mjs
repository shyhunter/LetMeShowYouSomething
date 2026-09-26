// SPDX-License-Identifier: Apache-2.0
// #141 — a missing address shows a page that leads back. GitHub Pages serves 404.html at any depth, so its links
// start from the site's root; each must name a page the site deploys.
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './page-helpers.mjs';

test('the 404 page says the page is not there and leads home, to the tutorial and to an example', async ({ page }, info) => {
  await page.goto(pathToFileURL(join(ROOT, 'site/404.html')).href);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('body')).toContainText('This page is not here');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'sideways scroll').toBeLessThanOrEqual(0);
  const links = await page.locator('.ways a').evaluateAll((l) => l.map((a) => ({ href: a.getAttribute('href'), h: a.getBoundingClientRect().height })));
  expect(links.map((l) => l.href)).toContain('/LetMeShowYouSomething/');
  for (const { href, h } of links) {
    expect(h, href).toBeGreaterThanOrEqual(info.project.use.hasTouch ? 44 : 24);
    if (!href.startsWith('/LetMeShowYouSomething/')) continue;
    const path = href.slice('/LetMeShowYouSomething/'.length) || 'index.html';
    expect(existsSync(path.startsWith('examples/') ? join(ROOT, path) : join(ROOT, 'site', path)), href).toBe(true);
  }
});

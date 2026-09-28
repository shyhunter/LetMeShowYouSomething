// SPDX-License-Identifier: Apache-2.0
// The landing page's top: a bar with the name, the code on GitHub and the day or night switch, never on the title;
// a hero with the promise, the install, and the one-minute walkthrough of a real page; and a link to the author's other project.
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './page-helpers.mjs';

test('the landing page: a top bar, a hero, the switch clear of the title, and the other project', async ({ page }, info) => {
  await page.goto(pathToFileURL(join(ROOT, 'site/index.html')).href);
  const gh = page.getByRole('link', { name: 'LetMeShowYouSomething on GitHub' });
  await expect(gh).toHaveAttribute('href', 'https://github.com/shyhunter/LetMeShowYouSomething');
  await expect(gh.locator('svg')).toBeVisible();
  const sw = page.getByRole('switch', { name: 'Dark mode' });
  await expect(page.locator('.top [data-theme-slot]').getByRole('switch')).toHaveCount(1);
  const [s, h] = [await sw.boundingBox(), await page.locator('h1').boundingBox()];
  expect(s.y + s.height, 'the switch sits above the title, never on it').toBeLessThanOrEqual(h.y);
  const min = info.project.use.hasTouch ? 44 : 24;
  for (const box of [s, await gh.boundingBox()]) expect(box.height).toBeGreaterThanOrEqual(min);
  // The hero is the one-minute walkthrough: muted, with controls, its poster shown first, the tutorial one link away.
  const video = page.locator('.hero-shot video');
  for (const attr of ['src', 'poster']) expect(existsSync(join(ROOT, 'site', await video.getAttribute(attr))), attr).toBe(true);
  expect(await video.evaluate((v) => v.muted && v.controls && v.loop)).toBe(true);
  await expect(page.locator('.hero .cta a[href="tutorial.html"]')).toBeVisible();
  await expect(page.locator('.hero .cta .install')).toBeInViewport();
  const other = page.getByRole('link', { name: 'PaperOtter on GitHub →' });
  await expect(other).toHaveAttribute('href', 'https://github.com/shyhunter/PaperOtter');
  await expect(page.getByRole('link', { name: 'Interested? Learn more about PaperOtter →' })).toHaveAttribute('href', 'https://shyhunter.github.io/PaperOtter/');
  await expect(page.locator('.other svg')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'sideways scroll').toBeLessThanOrEqual(0);
});

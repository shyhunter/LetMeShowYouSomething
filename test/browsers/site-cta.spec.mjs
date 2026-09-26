// SPDX-License-Identifier: Apache-2.0
// #143 — one clear action first: the install command, copyable, on the first screen, with the tutorial second; the
// common questions on the page, with the full FAQ one link away.
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './page-helpers.mjs';

test('the landing page: install on the first screen, copyable, the tutorial second, the FAQ below', async ({ page }, info) => {
  await page.goto(pathToFileURL(join(ROOT, 'site/index.html')).href);
  const install = page.locator('.cta .install');
  await expect(install).toBeInViewport();
  await expect(install.locator('code')).toHaveText('npx skills add shyhunter/LetMeShowYouSomething -g');
  await expect(page.locator('.cta .second')).toHaveAttribute('href', 'tutorial.html');
  const copy = install.getByRole('button', { name: 'Copy the install command' });
  expect((await copy.boundingBox()).height).toBeGreaterThanOrEqual(info.project.use.hasTouch ? 44 : 24);
  await copy.click();
  await expect(copy).toHaveText(/Copied|Selected/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'sideways scroll').toBeLessThanOrEqual(0);
  const faq = page.locator('.faq details');
  await expect(faq).toHaveCount(5);
  await faq.first().locator('summary').click();
  await expect(faq.first()).toHaveAttribute('open', '');
  await expect(page.getByRole('link', { name: 'All questions in the FAQ →' })).toHaveAttribute('href', /docs\/wiki\/faq\.md$/);
});

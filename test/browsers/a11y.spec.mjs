// SPDX-License-Identifier: Apache-2.0
// #144 — accessibility, checked by axe (WCAG 2.2 A and AA): every site page, and each kind of example page at its start,
// in the tour, in Overview and on Return, in light and dark, at every size. Plus what axe cannot see: the landing
// page's pop-ups give focus back to what opened them.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, example, start, toReturn } from './page-helpers.mjs';

// It runs on Chromium at desktop and phone size only (playwright.config.mjs): axe's rules do not depend on the engine.
test.beforeEach(() => { test.setTimeout(120000); });

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const problems = async (page, where) => (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations
  .map((v) => `${where}: ${v.impact} ${v.id} (${v.help}) at ${v.nodes.map((n) => n.target).join(', ')}`);

for (const scheme of ['light', 'dark']) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test('the site pages have no accessibility problems', async ({ page }) => {
      const found = [];
      for (const name of ['index', 'tutorial', 'loop', 'privacy', '404']) {
        await page.goto(pathToFileURL(join(ROOT, 'site', name + '.html')).href);
        found.push(...await problems(page, name));
      }
      expect(found).toEqual([]);
    });

    for (const name of ['salon-booking', 'checkout-uat', 'decision-review', 'database-booking', 'ai-tool-loop', 'password-reset', 'flow-booking-round2']) {
      test(`${name}: no accessibility problems at the start, in the tour, in Overview and on Return`, async ({ page }) => {
        await page.goto(example(name));
        const found = await problems(page, 'Let me explain');
        await start(page);
        found.push(...await problems(page, 'the tour'));
        await page.locator('#mode-overview').click();
        found.push(...await problems(page, 'Overview'));
        await page.locator('#mode-tour').click();
        await toReturn(page);
        found.push(...await problems(page, 'Return'));
        expect(found).toEqual([]);
      });
    }
  });
}

test('the landing page: a pop-up gives focus back to the step that opened it', async ({ page }) => {
  await page.goto(pathToFileURL(join(ROOT, 'site/index.html')).href);
  const step = page.locator('.steps a').nth(2);
  await step.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#player')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#player')).toBeHidden();
  await expect(step).toBeFocused();
});

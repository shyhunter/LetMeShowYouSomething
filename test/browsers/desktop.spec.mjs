// SPDX-License-Identifier: Apache-2.0
// #146 — a desktop screen: drawn in a browser window, wide, wherever a screen is shown (the tour, Expand, Whole
// screen); on a phone scaled to fill the width, never scrolled sideways; a screen's own device overrides the flow's.
import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { example, start, showPlace, readReview, rendered, check, overview } from './page-helpers.mjs';

test('a desktop flow: a browser window in the tour, in Expand and as the whole screen, and it fits a phone', async ({ page }, info) => {
  await page.goto(example('salon-desk'));
  await start(page);
  await showPlace(page, 'proto');
  const app = page.locator('#slot-proto .app');
  await expect(app).toHaveClass(/\bdesk\b/);
  await expect(app.locator('.win .url')).toHaveText('This week');
  await expect(app).toHaveAttribute('aria-label', /on a computer/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'sideways scroll').toBeLessThanOrEqual(0);
  const [frame, place] = [await app.boundingBox(), await page.locator('#slot-proto .slot-body').boundingBox()];
  expect(frame.width, 'the window uses the width it has').toBeGreaterThan(place.width * (info.project.use.viewport.width < 700 ? 0.85 : 0.6));
  await page.locator('[data-act="expand"]:visible').first().click();
  await expect(page.locator('.layer .gcard.desk')).toHaveCount(4);
  await page.locator('[data-act="close-layer"]').click();
  await overview(page);
  await page.locator('#main [data-shot]').first().click();
  await expect(page.getByRole('dialog', { name: 'The whole screen' }).locator('.app.desk')).toBeVisible();
});

test('a screen of its own device: one desktop screen in a phone flow', async ({ page }) => {
  const r = readReview('salon-booking.review.json');
  r.id = 'desk-override'; r.flow.screens.find((s) => s.id === 'booked').device = 'desktop';
  await page.goto(rendered(r).url);
  await start(page);
  await page.locator('[data-act="expand"]:visible').first().click();
  await expect(page.locator('.layer .gcard.desk')).toHaveCount(1);
  await expect(page.locator('.layer .gcard:not(.desk)')).toHaveCount(4);
});

test('the checker refuses a device that is not a phone or a computer', () => {
  const r = readReview('salon-desk.review.json');
  r.id = 'desk-bad'; r.flow.device = 'watch';
  const file = join(mkdtempSync(join(tmpdir(), 'desk-')), 'r.review.json');
  writeFileSync(file, JSON.stringify(r));
  const out = check('review', file);
  expect(out.status).not.toBe(0);
  expect(out.stdout).toMatch(/flow\.device/);
});

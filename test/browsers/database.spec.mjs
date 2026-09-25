// SPDX-License-Identifier: Apache-2.0
import { test, expect } from '@playwright/test';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, example, readReview, check, rendered, guard, start, overview, download } from './page-helpers.mjs';
const reviewPath = join(ROOT, 'examples/database-booking.review.json');
guard(test);

test('database: tables, keys and examples on the map; a box leads to its question; a mark survives the download', async ({ page }) => {
  await page.goto(example('database-booking'));
  await start(page);
  const chart = page.locator('#main .dg-database');
  if (await page.locator('[data-ptab="map"]').isVisible()) await page.locator('[data-ptab="map"]').click();
  await expect(chart.locator('.dg-k-table')).toHaveCount(2);
  for (const label of ['Member id', 'text identifier', 'Key', 'Many', 'One', 'Example data', 'booking-example-1']) await expect(chart).toContainText(label);
  await chart.locator('[data-node="bookings"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#q-title')).toHaveText(readReview('database-booking.review.json').items.find(i => i.id === 'bookings').title);
  await overview(page);
  await page.locator('input[name="v-members"][value="wrong"]').check();
  await page.locator('[data-act="mark"][data-for="members"]').click();
  await page.locator('.map-scroll.marking [data-node="members"]').focus(); await page.keyboard.press('Enter');
  await page.locator('textarea[data-comment="comment-1"]').fill('Keep these names synthetic.');
  const out = await download(page, 'json', join(mkdtempSync(join(tmpdir(), 'database-browser-')), 'feedback.json'));
  const result = check('pair', reviewPath, out);
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(readFileSync(out, 'utf8')).comments).toEqual([expect.objectContaining({ node: 'members', note: 'Keep these names synthetic.' })]);
});

test('database: hostile labels and example cells remain inert, including the answered page', async ({ page }) => {
  const review = readReview('database-booking.review.json');
  review.id = 'hostile-database-browser';
  const attack = '<img src=x onerror="window.databaseAttack=1"><script>window.databaseAttack=1</script>';
  const d = review.diagrams[0]; d.nodes[0].label = attack;
  d.nodes[0].columns[0].label = attack; d.nodes[0].columns[0].type = attack;
  d.nodes[0].sampleRows[0].name = attack; d.edges[0].label = attack;
  const { dir, url } = rendered(review, 'database-hostile-');
  await page.goto(url); await overview(page);
  await expect(page.locator('.dg-database').first()).toBeVisible();
  expect(await page.evaluate(() => window.databaseAttack)).toBeUndefined();
  await expect(page.locator('.dg-database img, .dg-database script')).toHaveCount(0);
  const exported = await download(page, 'html', join(dir, 'answered.html'));
  await page.goto(pathToFileURL(exported).href); await overview(page);
  await expect(page.locator('.dg-database').first()).toBeVisible();
  expect(await page.evaluate(() => window.databaseAttack)).toBeUndefined();
  await expect(page.locator('.dg-database img, .dg-database script')).toHaveCount(0);
});

test('database: wide column text and a long self-reference label fit their allocated space', async ({ page }) => {
  const review = readReview('database-booking.review.json');
  review.id = 'database-wide-labels';
  const table = review.diagrams[0].nodes[0];
  table.columns[0].label = 'W'.repeat(21); table.columns[0].type = 'W'.repeat(17);
  review.diagrams[0].nodes = [table];
  review.diagrams[0].edges = [{ from: table.id, to: table.id, fromColumn: 'name', toColumn: 'id', cardinality: 'many-to-one', label: 'Parent relationship to the people table '.repeat(2).trim() }];
  await page.goto(rendered(review, 'database-labels-').url);
  await overview(page);
  const faults = await page.locator('.dg-database').first().evaluate(svg => {
    const bounds = svg.getBoundingClientRect(), faults = [];
    for (const text of svg.querySelectorAll('text')) {
      const b = text.getBoundingClientRect();
      if (b.top < bounds.top || b.bottom > bounds.bottom || b.left < bounds.left || b.right > bounds.right) faults.push('text outside diagram');
      if (text.matches('.dg-db-column-label, .dg-db-column-type')) {
        const x = Number(text.getAttribute('x'));
        const next = x === 34 ? 212 : 390;
        if (text.getBBox().x + text.getBBox().width >= next - 4) faults.push('overlapping column text');
      }
    }
    return faults;
  });
  expect(faults).toEqual([]);
});

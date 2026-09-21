// SPDX-License-Identifier: Apache-2.0
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const reviewPath = join(root, 'examples/database-booking.review.json');
test.beforeEach(async ({ page }, info) => {
  info.faults = [];
  page.on('pageerror', e => info.faults.push(e.message));
  page.on('request', r => { if (!/^(file|data|blob|about):/.test(r.url())) info.faults.push(r.url()); });
});
test.afterEach(async ({}, info) => { expect(info.faults).toEqual([]); });

test('database: column links, keyboard selection, comments and proposals survive export', async ({ page }) => {
  await page.goto(pathToFileURL(join(root, 'examples/database-booking.html')).href);
  const chart = page.locator('.dg-database');
  await expect(chart.locator('.dg-k-table')).toHaveCount(2);
  for (const label of ['Member id', 'text identifier', 'Key', 'Many', 'One', 'Example data', 'booking-example-1']) await expect(chart).toContainText(label);
  await chart.locator('[data-node="bookings"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#detail')).toContainText('Bookings distinguish');
  await expect(chart.locator('[data-node="bookings"]')).toHaveAttribute('aria-current', 'true');
  await page.locator('#commentmode').click();
  await expect(chart.locator('.dg-hit').first()).toHaveCSS('stroke', 'rgba(0, 0, 0, 0)');
  await expect(chart.locator('.dg-hit').first()).toHaveCSS('stroke-width', '44px');
  await chart.locator('[data-node="members"]').focus(); await page.keyboard.press('Enter');
  await page.locator('textarea[data-comment="comment-1"]').fill('Keep these names synthetic.');
  await expect(page.locator('[data-prop="add-node"], [data-prop="add-edge"]')).toHaveCount(0);
  await page.locator('[data-ptext="rename"]').fill('Example members');
  await page.locator('[data-prop="rename"]').click();
  await chart.locator('.dg-edge[data-nth="1"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#comments')).toContainText('bookings');
  await page.locator('textarea[data-comment="comment-2"]').fill('Explain who entered this booking.');
  await page.locator('[data-ptext="relabel-edge"]').fill('Recorded by');
  await page.locator('[data-prop="relabel-edge"]').click();
  await page.locator('#showchanges').click();
  await expect(chart).toContainText('Example members');
  await expect(chart).toContainText('Recorded by');
  const download = page.waitForEvent('download'); await page.locator('#export').click();
  const dir = mkdtempSync(join(tmpdir(), 'database-browser-')), out = join(dir, 'feedback.json');
  await (await download).saveAs(out);
  const result = spawnSync(process.execPath, [join(root, 'bin/check.mjs'), 'pair', reviewPath, out], { encoding: 'utf8' });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const feedback = JSON.parse(readFileSync(out, 'utf8'));
  expect(feedback.comments[1].edge).toEqual({ from: 'bookings', to: 'members', nth: 1 });
  expect(feedback.comments[1].label).toContain('.creator');
  expect(feedback.proposals).toHaveLength(2);
});

test('database: hostile labels and example cells remain inert, including the exported page', async ({ page }) => {
  const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
  review.id = 'hostile-database-browser';
  const attack = '<img src=x onerror="window.databaseAttack=1"><script>window.databaseAttack=1</script>';
  const d = review.diagrams[0]; d.nodes[0].label = attack;
  d.nodes[0].columns[0].label = attack; d.nodes[0].columns[0].type = attack;
  d.nodes[0].sampleRows[0].name = attack; d.edges[0].label = attack;
  const dir = mkdtempSync(join(tmpdir(), 'database-hostile-')), rp = join(dir, 'review.json'), hp = join(dir, 'review.html');
  writeFileSync(rp, JSON.stringify(review));
  const rendered = spawnSync(process.execPath, [join(root, 'bin/render.mjs'), rp, hp], { encoding: 'utf8' });
  expect(rendered.status, rendered.stderr).toBe(0);
  await page.goto(pathToFileURL(hp).href);
  await expect(page.locator('.dg-database')).toBeVisible();
  expect(await page.evaluate(() => window.databaseAttack)).toBeUndefined();
  await expect(page.locator('.dg-database img, .dg-database script')).toHaveCount(0);
  const download = page.waitForEvent('download'); await page.locator('#exporth').click();
  const exported = join(dir, 'answered.html'); await (await download).saveAs(exported);
  await page.goto(pathToFileURL(exported).href);
  await expect(page.locator('.dg-database')).toBeVisible();
  expect(await page.evaluate(() => window.databaseAttack)).toBeUndefined();
  await expect(page.locator('.dg-database img, .dg-database script')).toHaveCount(0);
});

test('database: commenting after a proposed removal keeps the original relationship target', async ({ page }) => {
  await page.goto(pathToFileURL(join(root, 'examples/database-booking.html')).href);
  await page.locator('#commentmode').click();
  await page.locator('.dg-edge[data-nth="0"]').focus(); await page.keyboard.press('Enter');
  await page.locator('textarea[data-comment="comment-1"]').fill('Remove the attendee relationship.');
  await page.locator('[data-prop="remove-edge"]').click();
  await page.locator('#showchanges').click();
  await expect(page.locator('.dg-edge')).toHaveCount(1);
  await expect(page.locator('.dg-edge')).toHaveAttribute('data-nth', '1');
  await page.locator('.dg-edge').focus(); await page.keyboard.press('Enter');
  await page.locator('textarea[data-comment="comment-2"]').fill('This is still the creator relationship.');
  const download = page.waitForEvent('download'); await page.locator('#export').click();
  const dir = mkdtempSync(join(tmpdir(), 'database-removed-')), out = join(dir, 'feedback.json');
  await (await download).saveAs(out);
  const feedback = JSON.parse(readFileSync(out, 'utf8'));
  expect(feedback.comments[1].edge.nth).toBe(1);
  expect(feedback.comments[1].label).toContain('.creator');
  const result = spawnSync(process.execPath, [join(root, 'bin/check.mjs'), 'pair', reviewPath, out], { encoding: 'utf8' });
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

test('database: wide column text and a long self-reference label fit their allocated space', async ({ page }) => {
  const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
  review.id = 'database-wide-labels';
  const table = review.diagrams[0].nodes[0];
  table.columns[0].label = 'W'.repeat(21); table.columns[0].type = 'W'.repeat(17);
  review.diagrams[0].nodes = [table];
  review.diagrams[0].edges = [{ from: table.id, to: table.id, fromColumn: 'name', toColumn: 'id', cardinality: 'many-to-one', label: 'Parent relationship to the people table '.repeat(2).trim() }];
  const dir = mkdtempSync(join(tmpdir(), 'database-labels-')), rp = join(dir, 'review.json'), hp = join(dir, 'review.html');
  writeFileSync(rp, JSON.stringify(review));
  const rendered = spawnSync(process.execPath, [join(root, 'bin/render.mjs'), rp, hp], { encoding: 'utf8' });
  expect(rendered.status, rendered.stderr).toBe(0);
  await page.goto(pathToFileURL(hp).href);
  const faults = await page.locator('.dg-database').evaluate(svg => {
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

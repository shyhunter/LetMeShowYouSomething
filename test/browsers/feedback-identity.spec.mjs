// SPDX-License-Identifier: Apache-2.0
// #77 with real clicks: a new answer never reuses an id, or inherits a removed answer's pictures or changes.
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '../..');
const base = JSON.parse(readFileSync(join(root, 'examples/review.example.json'), 'utf8'));
const run = (bin, ...args) => spawnSync(process.execPath, [join(root, bin), ...args], { encoding: 'utf8' });
test.beforeEach(async ({ page }, info) => { info.faults = []; page.on('pageerror', (e) => info.faults.push(e.message)); });
test.afterEach(async ({}, info) => { expect(info.faults).toEqual([]); });
function rendered(review) {
  const dir = mkdtempSync(join(tmpdir(), 'identity-browser-')), rp = join(dir, 'review.json'), hp = join(dir, 'review.html');
  writeFileSync(rp, JSON.stringify(review));
  const r = run('bin/render.mjs', rp, hp); expect(r.status, r.stderr).toBe(0);
  return { dir, rp, hp };
}
const addItem = async (page, title) => { await page.locator('#at').fill(title); await page.locator('#addbtn').click(); };

test('#77: a carried added-1 is never reused, and a removed item takes its pictures along', async ({ page }) => {
  const round2 = { ...base, id: 'identity-browser-2', items: [...base.items, { id: 'added-1', title: 'Earlier concern', sectionId: base.items[0].sectionId }] };
  const { dir, rp, hp } = rendered(round2);
  await page.goto(pathToFileURL(hp).href);
  await page.locator('#mode-overview').click();                       // #100 — "Anything else?" closes the Overview
  await addItem(page, 'New unrelated concern');
  await addItem(page, 'Removed later');
  expect(await page.evaluate(() => store.added.map((a) => a.id))).toEqual(['added-2', 'added-3']);
  // A picture on the item about to be removed, as the picture button stores it.
  await page.evaluate(() => { store.pictures.push({ id: 'picture-1', on: 'added-3', type: 'image/png', width: 1, height: 1, data: '' }); });
  await page.locator('[data-del="1"]').click();
  await addItem(page, 'Added after the removal');
  expect(await page.evaluate(() => store.pictures)).toEqual([]);
  await page.locator('#finish').click();
  const d = page.waitForEvent('download'); await page.locator('#export').click();
  const fp = join(dir, 'feedback.json'); await (await d).saveAs(fp);
  expect(JSON.parse(readFileSync(fp, 'utf8')).addedItems.map((a) => a.id)).toEqual(['added-2', 'added-3']);
  const r = run('bin/check.mjs', 'pair', rp, fp); expect(r.status, r.stdout).toBe(0);
});

test('#77: a new comment never takes the id a removed comment\'s proposed change still points at', async ({ page }) => {
  const { hp } = rendered({ ...base, id: 'identity-browser-comments' });
  await page.goto(pathToFileURL(hp).href);
  await page.locator('#commentmode').click();
  await page.locator('#dpanel [data-node="guest"]').first().focus(); await page.keyboard.press('Enter');
  await page.locator('textarea[data-comment="comment-1"]').fill('Rename this.');
  await page.locator('[data-ptext="rename"]').fill('Guest checkout'); await page.locator('[data-prop="rename"]').click();
  await page.locator('[data-uncomment="comment-1"]').click();
  await page.locator('#dpanel [data-node="cart"]').first().focus(); await page.keyboard.press('Enter');
  await expect(page.locator('textarea[data-comment="comment-2"]')).toBeVisible();
  await expect(page.locator('textarea[data-comment="comment-1"]')).toHaveCount(0);
});

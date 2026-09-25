// SPDX-License-Identifier: Apache-2.0
// Shared steps for the page tests: what a reviewer does, in the words of the page.
import { expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = resolve(import.meta.dirname, '../..');
export const example = (name) => pathToFileURL(join(ROOT, 'examples', name + '.html')).href;
export const readReview = (file) => JSON.parse(readFileSync(join(ROOT, 'examples', file), 'utf8'));
export const check = (...args) => spawnSync(process.execPath, [join(ROOT, 'bin/check.mjs'), ...args, '--root', ROOT], { encoding: 'utf8' });

// A review written to a folder of its own and rendered there.
export function rendered(review, prefix = 'pw-') {
  const dir = mkdtempSync(join(tmpdir(), prefix)), rp = join(dir, 'review.json'), hp = join(dir, 'review.html');
  writeFileSync(rp, JSON.stringify(review));
  const r = spawnSync(process.execPath, [join(ROOT, 'bin/render.mjs'), rp, hp], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return { dir, rp, hp, url: pathToFileURL(hp).href };
}

// Every page runs clean and offline: no script error, nothing fetched beyond the file itself.
export function guard(test) {
  test.beforeEach(async ({ page }, info) => {
    info.problems = [];
    page.on('pageerror', (e) => info.problems.push(`script error: ${e.message}`));
    page.on('request', (r) => { if (!/^(file|data|blob|about):/.test(r.url())) info.problems.push(`fetched ${r.url()}`); });
  });
  test.afterEach(async ({}, info) => { expect(info.problems, 'errors or network requests').toEqual([]); });
}

export const start = (page) => page.locator('#start-review').click();
export const overview = async (page) => { if (await page.locator('#start-review').isVisible()) await start(page); await page.locator('#mode-overview').click(); };
export const toReturn = (page) => page.locator('#main [data-jump="return"]').click();
// On a phone the tour shows one place at a time: pick it first.
export async function showPlace(page, id) { const tab = page.locator(`[data-ptab="${id}"]`); if (await tab.isVisible()) await tab.click(); }

// The Return step holds the downloads.
export async function download(page, fmt, path) {
  if (await page.locator('#start-review').isVisible()) await start(page);
  if (!(await page.locator('[data-export]').first().isVisible())) {
    if (await page.locator('#mode-overview').getAttribute('aria-pressed') !== 'true') { await toReturn(page); await showPlace(page, 'build'); }
  }
  const d = page.waitForEvent('download');
  await page.locator(`[data-export="${fmt}"]`).first().click();
  await (await d).saveAs(path);
  return path;
}

// A note, in place on a wide screen, in its sheet on a phone.
export async function note(page, id, text) {
  const inPlace = page.locator(`#main textarea[data-note="${id}"]`);
  if (!(await inPlace.isVisible()) && await page.locator('[data-act="note"]').isVisible()) {
    await page.locator('[data-act="note"]').click();
    await page.locator(`.sheet-layer textarea[data-note="${id}"]`).fill(text);
    await page.locator('[data-act="close-layer"]').click();
    return;
  }
  await inPlace.fill(text);
}

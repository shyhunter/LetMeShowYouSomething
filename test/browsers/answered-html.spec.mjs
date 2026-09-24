// SPDX-License-Identifier: Apache-2.0
// #78 with real clicks: an exported page, opened and exported again, reads back as the same feedback.
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '../..');
const base = JSON.parse(readFileSync(join(root, 'examples/review.example.json'), 'utf8'));
const run = (bin, ...args) => spawnSync(process.execPath, [join(root, bin), ...args], { encoding: 'utf8' });
test.beforeEach(async ({ page }, info) => {
  info.faults = [];
  page.on('pageerror', (e) => info.faults.push(e.message));
  page.on('request', (r) => { if (!/^(file|data|blob|about):/.test(r.url())) info.faults.push(r.url()); });
});
test.afterEach(async ({}, info) => { expect(info.faults).toEqual([]); });
const save = async (page, button, path) => {
  if (!await page.locator('#return-review').isVisible()) await page.locator('#finish').click();
  const d = page.waitForEvent('download'); await page.locator(button).click(); await (await d).saveAs(path); return path;
};

test('#78: an exported page, opened and exported again, reads back as the same feedback', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'answered-html-')), rp = join(dir, 'review.json'), hp = join(dir, 'review.html');
  writeFileSync(rp, JSON.stringify({ ...base, id: 'answered-html-browser' }));
  expect(run('bin/render.mjs', rp, hp).status).toBe(0);
  // Pasted text can carry U+2028: it used to break the second export of a copy.
  const note = `</script><script>document.title="ran"</script> & a pasted line${String.fromCharCode(0x2028)}separator`;
  await page.goto(pathToFileURL(hp).href);
  await expect(page.locator('#footnote')).toContainText('nothing is sent');
  await page.locator('input[name="v-guest-checkout"][value="fails"]').check({ force: true });
  await page.locator('#n-guest-checkout').fill(note);
  await page.locator('#at').fill('Something they noticed'); await page.locator('#addbtn').click();
  const first = await save(page, '#exporth', join(dir, 'answered.html'));
  const json = JSON.parse(readFileSync(await save(page, '#export', join(dir, 'feedback.json')), 'utf8'));
  await page.goto(pathToFileURL(first).href);
  await expect(page.locator('#n-guest-checkout')).toHaveValue(note);
  await expect(page).not.toHaveTitle('ran');
  const second = await save(page, '#exporth', join(dir, 'answered-again.html'));
  await page.goto(pathToFileURL(second).href);
  await expect(page.locator('#n-guest-checkout')).toHaveValue(note);
  for (const [name, html] of [['first', first], ['second', second]]) {
    const out = join(dir, `${name}.feedback.json`);
    const w = run('bin/answer.mjs', rp, html, out); expect(w.status, w.stderr).toBe(0);
    const got = JSON.parse(readFileSync(out, 'utf8'));
    expect(got.via).toBe('page');
    // Two export clicks, two moments: only the time and how it arrived differ.
    expect({ ...got, respondedAt: null, via: null }).toEqual({ ...json, respondedAt: null, via: null });
  }
});

// SPDX-License-Identifier: Apache-2.0
// #83 — saving into a file the reviewer chooses. The browser's own file picker cannot be driven by a test, so it is
// stood in for by a small fake with the same shape (a handle with getFile, createWritable, permissions); what is
// tested is everything the page decides: which file it may replace, when it must ask, and what it says.
import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { example, guard, start, toReturn, showPlace } from './page-helpers.mjs';

guard(test);

const fakePicker = () => {
  const files = (window.__files = {});
  window.__next = null; window.__failWrite = false; window.__deny = false;
  const handle = (name) => ({ name,
    async getFile() { const f = files[name] || { text: '', t: 0 }; return { size: f.text.length, lastModified: f.t, text: async () => f.text }; },
    async queryPermission() { return window.__deny ? 'prompt' : 'granted'; },
    async requestPermission() { return window.__deny ? 'denied' : 'granted'; },
    async createWritable() {
      if (window.__failWrite) throw new DOMException('The disk is full', 'InvalidStateError');
      let buf = '';
      return { write: async (x) => { buf += x; }, close: async () => { files[name] = { text: buf, t: (files[name]?.t || 0) + 1 }; }, abort: async () => {} };
    } });
  window.showSaveFilePicker = async () => { if (!window.__next) throw new DOMException('closed', 'AbortError'); const n = window.__next; window.__next = null; return handle(n); };
};

async function ready(page, info) {
  await page.addInitScript(fakePicker);
  await page.goto(example('checkout-uat'));
  await start(page);
  await page.locator('input[name="v-guest-checkout"][value="works"]').check();
  await toReturn(page); await showPlace(page, 'build');
}
const pick = (page, name, text) => page.evaluate(([n, t]) => { window.__next = n; if (t !== undefined) window.__files[n] = { text: t, t: 5 }; }, [name, text]);
const fileText = (page, name) => page.evaluate((n) => window.__files[n]?.text ?? null, name);
const status = (page) => page.locator('#save-status');

test('save to a chosen file: written only after the write completes, saved again, and it opens with the answers', async ({ page }, info) => {
  await ready(page, info);
  await pick(page, 'answers.html');
  await page.locator('[data-act="save-file"]').click();
  await expect(status(page)).toContainText('Saved to answers.html');
  await expect(status(page)).toContainText('nothing was sent');
  const saved = await fileText(page, 'answers.html');
  expect(saved.split('\n').filter((l) => l.startsWith('const SEED = {'))).toHaveLength(1);
  expect(saved).toContain('"guest-checkout":"works"');
  // Save again: the same file, the new answer, still one SEED line and no history doubled.
  await page.locator('#mode-overview').click();
  await page.locator('input[name="v-saved-card"][value="works"]').check();
  await page.locator('[data-act="save-again"]').click();
  await expect(status(page)).toContainText('Saved to answers.html');
  const again = await fileText(page, 'answers.html');
  expect(again.split('\n').filter((l) => l.startsWith('const SEED = {'))).toHaveLength(1);
  expect(again).toContain('"saved-card":"works"');
  // Reopened, the file shows the answers.
  const p = join(mkdtempSync(join(tmpdir(), 'save-')), 'answers.html'); writeFileSync(p, again);
  await page.goto(pathToFileURL(p).href); await start(page);
  await expect(page.locator('input[name="v-guest-checkout"][value="works"]')).toBeChecked();
});

test('save to a file: a closed picker, another review, a denied permission and a failed write save nothing and keep the answers', async ({ page }, info) => {
  await ready(page, info);
  await page.locator('[data-act="save-file"]').click();
  await expect(status(page)).toHaveText('Nothing was saved: the file picker was closed.');
  await pick(page, 'other.html', '<!doctype html>\nconst REVIEW = {"id":"another-review"};\n');
  await page.locator('[data-act="save-file"]').click();
  await expect(status(page)).toContainText('other.html is another review, or not a review page. Nothing was saved');
  expect(await fileText(page, 'other.html')).toContain('another-review');
  await page.evaluate(() => { window.__deny = true; }); await pick(page, 'denied.html');
  await page.locator('[data-act="save-file"]').click();
  await expect(status(page)).toContainText('did not give permission to write denied.html');
  await page.evaluate(() => { window.__deny = false; window.__failWrite = true; }); await pick(page, 'full.html');
  await page.locator('[data-act="save-file"]').click();
  await expect(status(page)).toContainText('Saving to full.html failed. The file is as it was, and your answers are still here');
  expect(await fileText(page, 'full.html'), 'nothing was written').toBeNull();
  await page.locator('#mode-overview').click();
  await expect(page.locator('input[name="v-guest-checkout"][value="works"]')).toBeChecked();
});

test('save to a file: a file that holds other answers, or changed since the last save, is replaced only when asked', async ({ page }, info) => {
  await ready(page, info);
  const reviewLine = await page.evaluate(() => PAGE.split('\n').find((l) => l.startsWith('const REVIEW = ')));
  const theirs = `<!doctype html>\n${reviewLine}\nconst SEED = {"verdicts":{"guest-checkout":"fails"},"exportedAt":"2026-09-20T10:00:00.000Z"};\n`;
  await pick(page, 'theirs.html', theirs);
  await page.locator('[data-act="save-file"]').click();
  await expect(page.locator('.conflict')).toContainText('theirs.html already holds answers saved 2026-09-20 10:00');
  expect(await fileText(page, 'theirs.html')).toBe(theirs);
  await page.locator('[data-act="save-cancel"]').click();
  await expect(status(page)).toHaveText('Nothing was saved.');
  expect(await fileText(page, 'theirs.html')).toBe(theirs);
  await page.locator('[data-act="save-file"]').click();                       // chosen again, this time replaced on purpose
  await page.evaluate(() => { window.__next = 'theirs.html'; });
  await page.locator('[data-act="save-file"]').click();
  await page.locator('[data-act="save-replace"]').click();
  await expect(status(page)).toContainText('Saved to theirs.html');
  expect(await fileText(page, 'theirs.html')).toContain('"guest-checkout":"works"');
  // Changed on disk since this page saved it: asked again.
  await page.evaluate(() => { window.__files['theirs.html'].t += 10; });
  await page.locator('[data-act="save-again"]').click();
  await expect(page.locator('.conflict')).toContainText('theirs.html changed since you saved it here');
});

test('save to a file: a browser without it says so and offers Download, without switching on its own', async ({ page }) => {
  await page.addInitScript(() => { delete window.showSaveFilePicker; });
  await page.goto(example('checkout-uat'));
  await start(page); await toReturn(page); await showPlace(page, 'build');
  await expect(page.locator('.savefile')).toContainText('Saving straight into a file works in Chrome and Edge on a computer. Here, use Download');
  await expect(page.locator('[data-act="save-file"]')).toHaveCount(0);
});

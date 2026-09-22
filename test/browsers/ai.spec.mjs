// SPDX-License-Identifier: Apache-2.0
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '../..'), reviewPath = join(root, 'examples/ai-tool-loop.review.json');
test.beforeEach(async ({ page }, info) => {
  info.faults = [];
  page.on('pageerror', e => info.faults.push(e.message));
  page.on('request', r => { if (!/^(file|data|blob|about):/.test(r.url())) info.faults.push(r.url()); });
});
test.afterEach(async ({}, info) => { expect(info.faults).toEqual([]); });
function rendered(review) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-browser-')), rp = join(dir, 'review.json'), hp = join(dir, 'review.html');
  writeFileSync(rp, JSON.stringify(review));
  const r = spawnSync(process.execPath, [join(root, 'bin/render.mjs'), rp, hp], { encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0); return { dir, hp };
}
test('AI: captions, stops, keyboard comments and allowed proposals survive both exports', async ({ page }) => {
  await page.goto(pathToFileURL(join(root, 'examples/ai-tool-loop.html')).href);
  const chart = page.locator('.dg-agent');
  for (const text of ['Model call', 'Tool call', 'Retrieval', 'Guardrail', 'Human handoff', 'Why', 'Next', 'Estimated tokens', 'Total: 1400']) await expect(chart).toContainText(text);
  await chart.locator('[data-node="model"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#detail')).toContainText('Retrieved context');
  await page.locator('#commentmode').click();
  await expect(chart.locator('.dg-hit').first()).toHaveCSS('stroke-width', '44px');
  await expect(chart.locator('.dg-hit').first()).toHaveCSS('stroke', 'rgba(0, 0, 0, 0)');
  await chart.locator('[data-node="model"]').focus(); await page.keyboard.press('Enter');
  await page.locator('textarea[data-comment="comment-1"]').fill('Clarify the context.');
  await expect(page.locator('[data-prop="add-node"]')).toHaveCount(0);
  await expect(page.locator('[data-prop="add-edge"]')).toHaveCount(1);
  await page.locator('[data-ptext="rename"]').fill('Draft a candidate'); await page.locator('[data-prop="rename"]').click();
  await chart.locator('.dg-edge[data-from="result"][data-to="done"]').focus(); await page.keyboard.press('Enter');
  await page.locator('textarea[data-comment="comment-2"]').fill('State the check outcome.');
  await page.locator('[data-ptext="relabel-edge"]').fill('Checked and ready'); await page.locator('[data-prop="relabel-edge"]').click();
  await page.locator('#showchanges').click(); await expect(chart).toContainText('Draft a candidate'); await expect(chart).toContainText('Checked and ready');
  const dir = mkdtempSync(join(tmpdir(), 'ai-export-')), fp = join(dir, 'feedback.json');
  const download = page.waitForEvent('download'); await page.locator('#export').click(); await (await download).saveAs(fp);
  const checked = spawnSync(process.execPath, [join(root, 'bin/check.mjs'), 'pair', reviewPath, fp], { encoding: 'utf8' });
  expect(checked.status, checked.stdout + checked.stderr).toBe(0);
  const feedback = JSON.parse(readFileSync(fp, 'utf8')); expect(feedback.comments).toHaveLength(2); expect(feedback.proposals).toHaveLength(2);
  const html = page.waitForEvent('download'); await page.locator('#exporth').click(); const hp = join(dir, 'answered.html'); await (await html).saveAs(hp);
  await page.goto(pathToFileURL(hp).href); await expect(page.locator('textarea[data-comment="comment-1"]')).toHaveValue('Clarify the context.');
  await expect(page.locator('.dg-agent')).toContainText('Total: 1400');
});
test('AI: hostile labels, stops and token labels remain text in the page and HTML export', async ({ page }) => {
  const review = JSON.parse(readFileSync(reviewPath, 'utf8')); review.id = 'ai-hostile-browser';
  const attack = '<img src=x onerror="window.aiAttack=1"><script>window.aiAttack=1</script>', d = review.diagrams[0];
  d.nodes.find(n => n.id === 'model').label = attack;
  for (const n of d.nodes.filter(n => n.stop)) n.stop = { reason: attack, next: attack };
  d.tokenUsage.parts[0].label = attack;
  const { dir, hp } = rendered(review); await page.goto(pathToFileURL(hp).href);
  await expect(page.locator('.dg-agent img, .dg-agent script')).toHaveCount(0); expect(await page.evaluate(() => window.aiAttack)).toBeUndefined();
  const download = page.waitForEvent('download'); await page.locator('#exporth').click(); const out = join(dir, 'answered.html'); await (await download).saveAs(out);
  await page.goto(pathToFileURL(out).href); await expect(page.locator('.dg-agent img, .dg-agent script')).toHaveCount(0); expect(await page.evaluate(() => window.aiAttack)).toBeUndefined();
});
test('AI: wide unbroken text stays in its boxes; zero reported tokens have finite bars', async ({ page }) => {
  const review = JSON.parse(readFileSync(reviewPath, 'utf8')); review.id = 'ai-wide-browser'; const d = review.diagrams[0];
  d.nodes.find(n => n.id === 'model').label = '界'.repeat(80);
  for (const n of d.nodes.filter(n => n.stop)) n.stop = { reason: '界'.repeat(150), next: 'x'.repeat(300) };
  d.tokenUsage.basis = 'reported'; d.tokenUsage.total = 0; d.tokenUsage.parts.forEach(p => { p.tokens = 0; p.label = '界'.repeat(40); });
  await page.goto(pathToFileURL(rendered(review).hp).href);
  await expect(page.locator('.dg-token-chart')).toContainText('Reported tokens'); await expect(page.locator('.dg-token-chart')).toContainText('Total: 0');
  const faults = await page.evaluate(() => {
    const bad = [];
    for (const node of document.querySelectorAll('.dg-node')) {
      const shape = node.querySelector('.dg-shape').getBBox();
      for (const text of node.querySelectorAll('text')) { const b = text.getBBox(); if (b.x < shape.x - 1 || b.y < shape.y - 1 || b.x + b.width > shape.x + shape.width + 1 || b.y + b.height > shape.y + shape.height + 1) bad.push(node.dataset.node); }
    }
    for (const bar of document.querySelectorAll('.dg-token-bar')) if (bar.getAttribute('width') !== '0') bad.push('nonzero bar');
    const svg = document.querySelector('.dg-agent'), bounds = svg.viewBox.baseVal;
    for (const text of svg.querySelectorAll('.dg-token-chart text')) { const b = text.getBBox(); if (b.x + b.width > bounds.width || b.y + b.height > bounds.height) bad.push('chart overflow'); }
    return bad;
  });
  expect(faults).toEqual([]);
});

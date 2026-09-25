// SPDX-License-Identifier: Apache-2.0
import { test, expect } from '@playwright/test';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ROOT, example, readReview, check, rendered, guard, start, overview, download } from './page-helpers.mjs';
const reviewPath = join(ROOT, 'examples/ai-tool-loop.review.json');
guard(test);

test('AI: captions, stops and tokens on the map; a mark on a box survives both downloads', async ({ page }) => {
  await page.goto(example('ai-tool-loop'));
  await overview(page);
  const chart = page.locator('#main .dg-agent');
  for (const text of ['Model call', 'Tool call', 'Retrieval', 'Guardrail', 'Human handoff', 'Why', 'Next', 'Estimated tokens', 'Total: 1400']) await expect(chart).toContainText(text);
  await page.locator('input[name="v-model"][value="lost"]').check();
  await page.locator('[data-act="mark"][data-for="model"]').click();
  await page.locator('.map-scroll.marking [data-node="model"]').focus(); await page.keyboard.press('Enter');
  await page.locator('textarea[data-comment="comment-1"]').fill('Clarify the context.');
  const dir = mkdtempSync(join(tmpdir(), 'ai-export-'));
  const fp = await download(page, 'json', join(dir, 'feedback.json'));
  const checked = check('pair', reviewPath, fp);
  expect(checked.status, checked.stdout + checked.stderr).toBe(0);
  expect(JSON.parse(readFileSync(fp, 'utf8')).comments).toEqual([expect.objectContaining({ node: 'model', note: 'Clarify the context.' })]);
  const hp = await download(page, 'html', join(dir, 'answered.html'));
  await page.goto(pathToFileURL(hp).href);
  await overview(page);
  await expect(page.locator('textarea[data-comment="comment-1"]')).toHaveValue('Clarify the context.');
  await expect(page.locator('#main .dg-agent')).toContainText('Total: 1400');
});

test('AI: hostile labels, stops and token labels remain text in the page and the answered page', async ({ page }) => {
  const review = readReview('ai-tool-loop.review.json'); review.id = 'ai-hostile-browser';
  const attack = '<img src=x onerror="window.aiAttack=1"><script>window.aiAttack=1</script>', d = review.diagrams[0];
  d.nodes.find(n => n.id === 'model').label = attack;
  for (const n of d.nodes.filter(n => n.stop)) n.stop = { reason: attack, next: attack };
  d.tokenUsage.parts[0].label = attack;
  const { dir, url } = rendered(review, 'ai-browser-');
  await page.goto(url); await start(page);
  await expect(page.locator('.dg-agent img, .dg-agent script')).toHaveCount(0); expect(await page.evaluate(() => window.aiAttack)).toBeUndefined();
  const out = await download(page, 'html', join(dir, 'answered.html'));
  await page.goto(pathToFileURL(out).href); await start(page);
  await expect(page.locator('.dg-agent img, .dg-agent script')).toHaveCount(0); expect(await page.evaluate(() => window.aiAttack)).toBeUndefined();
});

test('AI: wide unbroken text stays in its boxes; zero reported tokens have finite bars', async ({ page }) => {
  const review = readReview('ai-tool-loop.review.json'); review.id = 'ai-wide-browser'; const d = review.diagrams[0];
  d.nodes.find(n => n.id === 'model').label = '界'.repeat(80);
  for (const n of d.nodes.filter(n => n.stop)) n.stop = { reason: '界'.repeat(150), next: 'x'.repeat(300) };
  d.tokenUsage.basis = 'reported'; d.tokenUsage.total = 0; d.tokenUsage.parts.forEach(p => { p.tokens = 0; p.label = '界'.repeat(40); });
  await page.goto(rendered(review, 'ai-browser-').url);
  await overview(page);
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

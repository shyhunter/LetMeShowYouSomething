// SPDX-License-Identifier: Apache-2.0
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
function pageFor(example, mutate = () => {}) {
  const review = JSON.parse(readFileSync(join(ROOT, 'examples', example), 'utf8'));
  review.id = 'workspace-' + example.replace(/[^a-z0-9]/g, '-');
  mutate(review);
  const dir = mkdtempSync(join(tmpdir(), 'workspace-74-'));
  const input = join(dir, 'review.json'), output = join(dir, 'review.html');
  writeFileSync(input, JSON.stringify(review));
  const run = spawnSync(process.execPath, [join(ROOT, 'bin/render.mjs'), input, output], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
  return { url: 'file://' + output, review, dir };
}
const answers = page => page.evaluate(() => JSON.stringify(buildFeedback(REVIEW, store, '2026-09-23T12:00:00Z')));
test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('request', r => { if (!/^(file|data|blob|about):/.test(r.url())) page.errors.push(r.url()); });
});
test.afterEach(async ({ page }) => expect(page.errors).toEqual([]));

test('workspace: brief precedes diagram and tools are secondary without being removed', async ({ page }) => {
  await page.goto(pageFor('flow-booking.review.json').url);
  await expect(page.getByRole('button', { name: 'Start review', exact: true })).toBeVisible({ timeout: 2000 });
  const positions = await page.evaluate(() => ['#brief', '#dpanel', '#workspace'].map(s => document.querySelector(s).getBoundingClientRect().top));
  expect(positions[0]).toBeLessThan(positions[1]);
  expect(positions[1]).toBeLessThan(positions[2]);
  await expect(page.locator('#display-tools')).not.toHaveAttribute('open');
  await page.locator('#display-tools > summary').click();
  await expect(page.locator('#style')).toBeVisible();
  await expect(page.locator('#theme')).toBeVisible();
  await expect(page.locator('#filters-tools')).not.toHaveAttribute('open');
  await page.locator('#filters-tools > summary').click();
  await expect(page.locator('#f-journey')).toBeVisible();
  await expect(page.locator('#f-status')).toBeVisible();
});

test('workspace: finishing a partial review changes no answers and retains both downloads', async ({ page }) => {
  await page.goto(pageFor('review.example.json').url);
  const before = await answers(page);
  await expect(page.locator('#finish')).toBeVisible({ timeout: 2000 });
  await page.locator('#finish').click();
  await expect(page.getByRole('dialog', { name: 'Review summary' })).toBeVisible();
  await expect(page.locator('#finish-summary')).toContainText('unanswered');
  await expect(page.locator('#return-review')).toContainText('does not send');
  await expect(page.locator('#export')).toBeVisible();
  await expect(page.locator('#exporth')).toBeVisible();
  expect(await answers(page)).toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('#return-review')).not.toBeVisible();
  await expect(page.locator('#finish')).toBeFocused();
});

test('workspace: a positive answer does not hide an outstanding request', async ({ page }) => {
  await page.goto(pageFor('review.example.json').url);
  await page.locator('#detail input[data-item][value="works"]').check();
  await page.locator('#detail input[data-ask="explain"]').check();
  await expect(page.locator('#steplist [data-step="guest-checkout"]')).toContainText('request');
  await expect(page.locator('#finish')).toBeVisible({ timeout: 2000 });
  await page.locator('#finish').click();
  await expect(page.locator('#finish-summary')).toContainText('1 request');
  await expect(page.locator('#finish-summary')).toContainText('Explain');
  const data = JSON.parse(await answers(page));
  expect(data.requests).toHaveLength(1);
  expect(data.responses[0].verdict).toBe('works');
});

test('workspace: selecting a shared screen never silently selects the first behavior', async ({ page }) => {
  const { url, review } = pageFor('flow-booking.review.json');
  await page.goto(url);
  await expect(page.locator('#selection-title')).toBeVisible({ timeout: 2000 });
  await page.locator('#screen-tools > summary').click();
  await page.locator('[data-screens="all"]').click();
  await page.locator('.mini[data-screen="slot-list"]').click();
  const ids = review.items.filter(i => i.step?.from === 'slot-list').map(i => i.id);
  expect(ids.length).toBeGreaterThan(1);
  await expect(page.locator('#detail input[data-item]')).toHaveCount(0);
  await expect(page.locator('#related-items [data-open]')).toHaveCount(ids.length);
  await page.locator('#related-items [data-open="book"]').click();
  await expect(page.locator('#detail input[data-item="book"]')).toHaveCount(review.verdictSet.options.length);
  await expect(page.locator('#selection-title')).toContainText(review.items.find(i => i.id === 'book').title);
});

test('workspace: unlinked diagram objects expose comment context, not stale verdicts', async ({ page }) => {
  await page.goto(pageFor('flow-booking.review.json').url);
  await page.locator('[data-open="book"]').click();
  await page.locator('[data-tab="booking-behind"]').click();
  await expect(page.locator('#selection-title')).toBeVisible({ timeout: 2000 });
  await page.locator('#flowbeside [data-node="free"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#selection-title')).toContainText('Slot still free');
  await expect(page.locator('#detail input[data-item]')).toHaveCount(0);
  await page.locator('#comment-selected').click();
  await expect(page.locator('#comments textarea')).toBeFocused();
  await page.locator('#comments textarea').fill('Explain this decision.');
  const data = JSON.parse(await answers(page));
  expect(data.comments[0]).toMatchObject({ diagram: 'booking-behind', node: 'free', note: 'Explain this decision.' });
});

test('workspace: navigation leaves feedback unchanged and typing preserves the editor', async ({ page }) => {
  await page.goto(pageFor('flow-booking.review.json').url);
  const before = await answers(page);
  await page.locator('[data-open="book"]').click();
  await page.locator('#detail [data-outcome="0"]').click();
  expect(await answers(page)).toBe(before);
  const editor = page.locator('#detail textarea[data-note="book"]');
  await editor.fill('First');
  await editor.evaluate(el => { el.dataset.identityProbe = 'same'; el.setSelectionRange(2, 2); });
  await editor.press('x');
  await expect(editor).toHaveAttribute('data-identity-probe', 'same');
  await expect(editor).toHaveValue('Fixrst');
  await page.locator('[data-open="confirm"]').click();
  await page.locator('[data-open="book"]').click();
  await expect(editor).toHaveValue('Fixrst');
});

test('workspace: storage failures remain visible after finishing and exporting', async ({ page }) => {
  await page.goto(pageFor('review.example.json').url);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  await page.locator('#detail textarea[data-note]').fill('Keep this unsaved answer.');
  await expect(page.locator('#save-warning')).toBeVisible({ timeout: 2000 });
  await page.locator('#finish').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  await page.locator('#continue-review').click();
  await expect(page.locator('#save-warning')).toBeVisible();
  const text = readFileSync(await download.path(), 'utf8');
  expect(JSON.parse(text).responses[0].note).toBe('Keep this unsaved answer.');
});

test('workspace: filters and unrelated diagram tabs keep the named selection', async ({ page }) => {
  await page.goto(pageFor('flow-booking.review.json').url);
  await page.locator('[data-open="book"]').click();
  await page.locator('#q').fill('no matching behavior');
  await expect(page.locator('#selection-meta')).toContainText('outside the current filters');
  await expect(page.locator('#detail input[data-item="book"]')).not.toHaveCount(0);
  await page.locator('[data-tab="booking-behind"]').click();
  await page.locator('#flowbeside [data-node="free"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-tab="user-flow"]').click();
  await expect(page.locator('#diagram-selection')).toContainText('not represented');
  await expect(page.locator('#selection-title')).toContainText('Slot still free');
});

test('workspace: parallel arrows select and comment on the original exact index', async ({ page }) => {
  await page.goto(pageFor('flow-booking.review.json', r => {
    const d = r.diagrams[0]; d.edges.push({ ...d.edges[0], label: 'Second route' });
  }).url);
  await page.locator('[data-tab="booking-behind"]').click();
  const edge = page.locator('#flowbeside .dg-edge').last();
  const nth = Number(await edge.getAttribute('data-nth'));
  await edge.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#selection-title')).toContainText('Second route');
  await page.locator('#comment-selected').click();
  await page.locator('#comments textarea').fill('Keep this distinct route.');
  const out = JSON.parse(await answers(page));
  expect(out.comments[0].edge.nth).toBe(nth);
});

test('workspace: a removed earlier message does not change later comment identity in preview', async ({ page }) => {
  await page.goto(pageFor('flow-booking.review.json').url);
  await page.locator('[data-tab="booking-calls"]').click();
  await page.locator('#flowbeside .dg-edge[data-nth="0"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('#comment-selected').click();
  await page.locator('#comments textarea').fill('Remove first message.');
  await page.locator('#comments [data-prop="remove-edge"]').click();
  await page.locator('#showchanges').click();
  const edge = page.locator('#flowbeside .dg-edge').first();
  await expect(edge).toHaveAttribute('data-nth', '1');
  await edge.focus(); await page.keyboard.press('Enter');
  await page.locator('#comment-selected').click();
  await page.locator('#comments textarea').last().fill('This is the original second message.');
  const out = JSON.parse(await answers(page));
  expect(out.comments[1].edge.nth).toBe(1);
});

test('workspace: summary target closes the dialog and focuses the selected response', async ({ page }) => {
  await page.goto(pageFor('review.example.json').url);
  await page.locator('#finish').click();
  const target = page.locator('[data-summary-kind="item"]').last();
  const id = await target.getAttribute('data-summary-target');
  await target.click();
  await expect(page.locator('#return-review')).not.toBeVisible();
  await expect(page.locator('#detail input[data-item="' + id + '"]').first()).toBeFocused();
});

test('workspace: layer context keeps its exact answer key and note editor', async ({ page }) => {
  const { url, review } = pageFor('flow-booking.review.json');
  const item = review.items.find(i => i.step?.outcomes.some(o => o.system?.length));
  const entry = item.step.outcomes.flatMap(o => o.system || [])[0];
  const key = item.id + '/' + entry.id;
  await page.goto(url);
  await page.locator('[data-open="' + item.id + '"]').click();
  await page.locator('#detail [data-layer="system"]').check();
  const judge = page.locator('#detail details.judge').filter({ has: page.locator('[data-lv="' + key + '"]') });
  await judge.locator('summary').click();
  await expect(page.locator('#selection-title')).toContainText(entry.name);
  await expect(page.locator('#selection-meta')).toContainText('Layer response');
  await judge.locator('input').first().check();
  await judge.locator('textarea').fill('Layer-specific note');
  const out = JSON.parse(await answers(page));
  expect(out.layerVerdicts.find(v => v.id === key).note).toBe('Layer-specific note');
  expect(out.responses.find(r => r.itemId === item.id).verdict).toBe('unset');
});

test('workspace: added feedback has a named inspection target and safe removal focus', async ({ page }) => {
  await page.goto(pageFor('review.example.json').url);
  await page.locator('#at').fill('Additional concern');
  await page.locator('#addbtn').click();
  await page.locator('[data-select-added]').click();
  await expect(page.locator('#selection-title')).toContainText('Additional concern');
  await expect(page.locator('#detail input[data-item]')).toHaveCount(0);
  await page.locator('[data-del]').click();
  await expect(page.locator('#at')).toBeFocused();
  await expect(page.locator('#selection-title')).not.toContainText('Additional concern');
});

test('workspace: Start reveals a collapsed walkthrough without erasing the saved preference', async ({ page }) => {
  await page.goto(pageFor('flow-booking.review.json').url);
  await page.locator('.sec-toggle').click();
  await expect(page.locator('#dpanel')).not.toBeVisible();
  await page.locator('#start-review').click();
  await expect(page.locator('#dpanel')).toBeVisible();
  await expect(page.locator('#dpanel')).toBeFocused();
  await page.reload();
  await expect(page.locator('#dpanel')).not.toBeVisible();
});

test('workspace: screen overview connections respond to keyboard focus', async ({ page }) => {
  await page.goto(pageFor('flow-booking.review.json').url);
  await page.locator('#screen-tools > summary').click();
  await page.locator('[data-screens="all"]').click();
  await page.mouse.move(0, 0);
  await expect(page.locator('#allscreens .links')).not.toHaveClass(/focus/);
  await page.locator('.mini[data-screen="slot-list"]').focus();
  await expect(page.locator('#allscreens .links')).toHaveClass(/focus/);
  expect(await page.locator('#allscreens .links .hot').count()).toBeGreaterThan(0);
});

test('workspace: unanswered choices remain partial even when every option has a verdict', async ({ page }) => {
  await page.goto(pageFor('decision-review.example.json').url);
  const ids = await page.locator('#steplist [data-open]').evaluateAll(els => els.map(el => el.dataset.open));
  for (const id of ids) {
    await page.locator('#steplist [data-open="' + id + '"]').click();
    await page.locator('#detail input[data-item]').first().check();
  }
  await page.locator('#finish').click();
  await expect(page.locator('#finish-summary')).toContainText('Partial review');
  await expect(page.locator('#finish-summary')).toContainText('No option chosen');
});

test('workspace: mixed flows retain non-step approvals and diagram-free lists still finish', async ({ page }) => {
  await page.goto(pageFor('flow-booking.review.json', r => {
    r.items.push({ id: 'approve-demo', title: 'Approve this synthetic action', approval: { action: 'Preview only', scope: 'Synthetic review', risk: 'low', expiresAt: '2099-01-01T00:00:00Z' } });
  }).url);
  await page.locator('#steplist [data-open="approve-demo"]').click();
  await expect(page.locator('#selection-title')).toContainText('Approve this synthetic action');
  await expect(page.locator('#detail input[data-item="approve-demo"]')).toHaveCount(2);
  await expect(page.locator('#screen')).toContainText('No screen is linked');
  await page.goto(pageFor('review.example.json', r => { delete r.diagrams; }).url);
  await expect(page.locator('#dpanel')).toHaveCount(0);
  await page.locator('#start-review').click();
  await expect(page.locator('#workspace')).toBeFocused();
  await page.locator('#finish').click();
  await expect(page.locator('#return-review')).toBeVisible();
});

test('workspace: custom approval-like vocabulary is counted separately from permissions', async ({ page }) => {
  await page.goto(pageFor('review.example.json', r => {
    r.verdictSet.options[0] = { value: 'approve', label: 'Looks right', tone: 'positive' };
    r.items.push({ id: 'permission-demo', sectionId: r.sections[0].id, title: 'Synthetic permission', approval: { action: 'Preview only', scope: 'Synthetic review', risk: 'low', expiresAt: '2099-01-01T00:00:00Z' } });
  }).url);
  await page.locator('#detail input[data-item][value="approve"]').check();
  await page.locator('#steplist [data-open="permission-demo"]').click();
  await page.locator('#detail input[value="approve"]').check();
  await page.locator('#finish').click();
  await expect(page.locator('.summary-counts')).toContainText('1 Looks right');
  await expect(page.locator('.summary-counts')).toContainText('1 Approve');
  await expect(page.locator('.summary-counts')).not.toContainText('2 Approve');
});

test('workspace: active filters remain explicit when all items match', async ({ page }) => {
  await page.goto(pageFor('review.example.json').url);
  await page.locator('#filters-tools > summary').click();
  await page.locator('[data-f="unset"]').click();
  await page.locator('#filters-tools > summary').click();
  await expect(page.locator('#filterinfo')).toContainText('Unanswered');
  await expect(page.locator('#showall')).toBeVisible();
});

test('workspace: reset cancellation preserves answers and confirmed reset clears removed selection', async ({ page }) => {
  await page.goto(pageFor('review.example.json').url);
  await page.locator('#at').fill('A concern to reset');
  await page.locator('#addbtn').click();
  await page.locator('[data-select-added]').click();
  const before = await answers(page);
  await page.locator('#review-tools > summary').click();
  page.once('dialog', d => d.dismiss());
  await page.locator('#reset').click();
  expect(await answers(page)).toBe(before);
  page.once('dialog', d => d.accept());
  await page.locator('#reset').click();
  await expect(page.locator('#selection-title')).not.toContainText('A concern to reset');
});

test('workspace: confirmed reset removes comment and proposed-change previews', async ({ page }) => {
  await page.goto(pageFor('review.example.json').url);
  await page.locator('#flowbeside [data-node="pay"]').focus(); await page.keyboard.press('Enter');
  await page.locator('#comment-selected').click();
  await page.locator('#comments textarea').fill('Explain payment');
  await page.locator('#comments [data-ptext="rename"]').fill('New payment label');
  await page.locator('#comments [data-prop="rename"]').click();
  await page.locator('#showchanges').click();
  await expect(page.locator('#flowbeside [data-node="pay"]')).toHaveAttribute('aria-label', 'New payment label');
  await page.locator('#review-tools > summary').click();
  page.once('dialog', d => d.accept()); await page.locator('#reset').click();
  await expect(page.locator('#comments textarea')).toHaveCount(0);
  await expect(page.locator('#showchanges')).toBeHidden();
  await expect(page.locator('#flowbeside [data-node="pay"]')).toHaveAttribute('aria-label', 'Takes the payment');
});

test('workspace: Go to response reopens a selected layer and focuses its answer', async ({ page }) => {
  await page.goto(pageFor('flow-booking.review.json').url);
  await page.locator('#steplist [data-open="book"]').click();
  await page.locator('#detail [data-layer="system"]').check();
  const judge = page.locator('#detail details.judge').filter({ has: page.locator('[data-lv="book/capacity-guard"]') });
  await judge.locator('summary').click();
  await page.locator('#detail [data-ask="explain"]').check();
  await page.locator('#detail [data-layer="system"]').uncheck();
  await page.locator('#inspect-response').click();
  await expect(page.locator('#detail [data-layer="system"]')).toBeChecked();
  await expect(judge).toHaveAttribute('open');
  await expect(judge.locator('input').first()).toBeFocused();
});

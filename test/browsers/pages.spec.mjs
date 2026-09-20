// SPDX-License-Identifier: Apache-2.0
// The example pages in Chromium, Firefox and WebKit, at desktop, tablet and phone size (D091).
// What can differ between engines: loading, layout, the round trip through Export, hostile input.
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const url = (file) => 'file://' + resolve(ROOT, file);
const PAGES = { 'checkout-uat': 'review.example.json', 'decision-review': 'decision-review.example.json', 'flow-booking': 'flow-booking.review.json' };
const check = (...args) => spawnSync(process.execPath, [join(ROOT, 'bin/check.mjs'), ...args, '--root', ROOT], { encoding: 'utf8' });
const render = (reviewPath, dir) => {
  const out = join(dir, 'page.html');
  const r = spawnSync(process.execPath, [join(ROOT, 'bin/render.mjs'), reviewPath, out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return out;
};

// Every page must run clean and offline: no script error, nothing fetched beyond the file itself.
test.beforeEach(async ({ page }, info) => {
  info.problems = [];
  page.on('pageerror', (e) => info.problems.push(`script error: ${e.message}`));
  page.on('request', (r) => { if (!/^(file|data|blob|about):/.test(r.url())) info.problems.push(`fetched ${r.url()}`); });
});
test.afterEach(async ({}, info) => { expect(info.problems, 'errors or network requests').toEqual([]); });

for (const [name, review] of Object.entries(PAGES)) {
  test(`${name}: loads, fits the screen, every target can be hit`, async ({ page }, info) => {
    await page.goto(url(`examples/${name}.html`));
    await expect(page.locator('h1')).toHaveText(JSON.parse(readFileSync(join(ROOT, 'examples', review), 'utf8')).title);
    // #43 — the audience is for the agent; the person reading the page knows who they are.
    await expect(page.locator('header')).not.toContainText('Written for');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'sideways scroll').toBeLessThanOrEqual(0);
    // With a mouse, WCAG 2.2 AA (2.5.8): 24 × 24 px. On a touch screen, 44 × 44 px (D092). Exempt:
    // links inside running text, the skip link (it appears on focus only) and the drawn app screen,
    // which is a picture except for its targets.
    const min = info.project.use.hasTouch ? 44 : 24;
    const small = await page.evaluate((min) => [...document.querySelectorAll('button, a[href], summary, select, textarea, input:not([type=hidden]), [role=tab]')]
      .map((el) => (el.matches('input[type=radio], input[type=checkbox]') && el.closest('label')) || el)
      .filter((el, i, all) => all.indexOf(el) === i && el.getClientRects().length && !el.matches('.skip, p a, li a, .screen *:not(.is-target)'))
      .map((el) => { const b = el.getBoundingClientRect(); return { el: el.id || el.className || el.tagName, w: Math.round(b.width), h: Math.round(b.height) }; })
      .filter((x) => x.w < min || x.h < min), min);
    expect(small, `targets smaller than ${min} × ${min} px`).toEqual([]);
    // Signed at the bottom, quietly: the mark and a link that opens beside the page (D095).
    const made = page.locator('.made');
    await expect(made).toHaveText('Made with LetMeShowYouSomething');
    await expect(made.locator('svg')).toBeVisible();
    await expect(made.locator('a')).toHaveAttribute('href', 'https://github.com/shyhunter/LetMeShowYouSomething');
    await expect(made.locator('a')).toHaveAttribute('target', '_blank');
  });
}

// The site's own pages: offline too, and fit every screen. The loop page carries its recording.
for (const name of ['index', 'loop']) {
  test(`site ${name}: loads, fits the screen`, async ({ page }) => {
    await page.goto(url(`site/${name}.html`));
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'sideways scroll').toBeLessThanOrEqual(0);
    if (name === 'loop') await expect(page.locator('video source')).toHaveAttribute('src', 'loop.mp4');
  });
}

// #44 — a list review in the same frame as a flow: the list on the left, the open item on the right.
test('a list review: list and open item side by side, width buttons, the first item open', async ({ page }, info) => {
  await page.goto(url('examples/checkout-uat.html'));
  await expect(page.locator('#steplist fieldset.item.row')).toHaveCount(4);
  await expect(page.locator('#detail legend')).toHaveText('A guest can buy without creating an account');
  await page.locator('[data-open="saved-card"]').click();
  await expect(page.locator('#detail legend')).toHaveText('A returning customer can pay with a saved card');
  await expect(page.locator('#steplist [data-step="saved-card"]')).toHaveAttribute('aria-current', 'true');
  if (info.project.use.viewport.width >= 1100) {
    const l = await page.locator('#steplist').boundingBox(), d = await page.locator('#detail').boundingBox();
    expect(d.x, 'the open item sits to the right of the list').toBeGreaterThan(l.x + l.width - 1);
    await page.locator('button[data-size="detail"]').click();
    expect((await page.locator('#detail').boundingBox()).width, 'more room for the open item').toBeGreaterThan(d.width + 50);
  } else {
    await expect(page.locator('#detail')).toBeInViewport();              // stacked: the opened item is brought into view
  }
});

test('a list review draws its chart, and a box opens its item (#47)', async ({ page }) => {
  await page.goto(url('examples/checkout-uat.html'));
  await expect(page.locator('#dpanel svg')).toBeVisible();
  await expect(page.locator('.mmd')).toHaveCount(0);                  // never Mermaid source text
  // By keyboard: Firefox cannot scroll a box inside the sideways-scrolling chart into view for a pointer click.
  await page.locator('#flowbeside [data-step="declined-card"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#detail legend')).toHaveText('A declined card explains itself');
  await expect(page.locator('#steplist [data-step="declined-card"]')).toHaveAttribute('aria-current', 'true');
});

test('checkout: answer, export, and the file passes the checker', async ({ page }) => {
  await page.goto(url('examples/checkout-uat.html'));
  // #44 — the first item is open; the others open from the list on the left.
  await page.locator('label:has(input[name="v-guest-checkout"][value="works"])').click();
  await page.locator('[data-open="declined-card"]').click();
  await page.locator('label:has(input[name="v-declined-card"][value="fails"])').click();
  await page.locator('textarea[data-note="declined-card"]').fill('Customer sees error 51.');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pw-')), 'feedback.json');
  await download.saveAs(file);
  const r = check('pair', join(ROOT, 'examples/review.example.json'), file);
  expect(r.status, r.stdout).toBe(0);
  const fb = JSON.parse(readFileSync(file, 'utf8'));
  expect(fb.responses.find((x) => x.itemId === 'declined-card')).toMatchObject({ verdict: 'fails', note: 'Customer sees error 51.' });
});

test('flow: tap through, judge a step, export, and the file passes the checker', async ({ page }) => {
  await page.goto(url('examples/flow-booking.html'));
  await page.locator('#screen [data-target="book"]').click();
  await page.locator('#detail [data-outcome="0"]').click();
  await expect(page.locator('#screen-title')).toHaveText('Booked');
  await page.locator('#detail .open label:has(input[data-item="book"][value="agree"])').click();
  await expect(page.locator('#overview')).toContainText('1 answered');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pw-')), 'feedback.json');
  await download.saveAs(file);
  const r = check('pair', join(ROOT, 'examples/flow-booking.review.json'), file);
  expect(r.status, r.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).responses.find((x) => x.itemId === 'book').verdict).toBe('agree');
});

// One tap, every layer answers (D098): what runs and what changes, shown with the step, judged on their own.
test('flow: the system and data layers show with the step, and an entry can be judged', async ({ page }) => {
  await page.goto(url('examples/flow-booking.html'));
  await page.locator('#screen [data-target="book"]').click();
  const detail = page.locator('#detail');
  await expect(detail.locator('.layer').first()).toBeHidden();           // the review opens on UI + flow
  await detail.locator('input[data-layer="system"]').check();
  await detail.locator('input[data-layer="data"]').check();
  const first = detail.locator('.outcome').first();
  await expect(first.locator('.layer').first()).toContainText('What runs');
  await expect(first).toContainText('Slot still has capacity');
  await expect(first).toContainText('test/fixtures/booking-app/src/booking.mjs:4');
  await expect(first).toContainText('capacity_left: 1 → 0');
  await first.locator('details.judge').first().locator('summary').click();
  // No force: like a person, the test scrolls until nothing (the sticky export bar) covers the choice.
  await first.locator('input[data-lv="book/capacity-guard"][value="disagree"]').check();
  await first.locator('textarea[data-lvnote="book/capacity-guard"]').fill('Two people can pass this check at once.');
  await expect(first.locator('details.judge').first().locator('summary')).toHaveText('Judged: Disagree');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pw-')), 'feedback.json');
  await download.saveAs(file);
  const r = check('pair', join(ROOT, 'examples/flow-booking.review.json'), file);
  expect(r.status, r.stdout).toBe(0);
  const fb = JSON.parse(readFileSync(file, 'utf8'));
  expect(fb.layerVerdicts).toEqual([expect.objectContaining({ id: 'book/capacity-guard', layer: 'system', verdict: 'disagree', note: 'Two people can pass this check at once.' })]);
  expect(fb.gaps).toContain('book/capacity-guard');
});

// #38: an agent kept the example's id. Two different reviews must never share answers, even with one id.
test('two different reviews with the same id do not share answers', async ({ page }) => {
  const other = JSON.parse(readFileSync(join(ROOT, 'examples/review.example.json'), 'utf8'));
  other.title = 'Another checkout test, same id';                        // a different review, the example's id kept
  const dir = mkdtempSync(join(tmpdir(), 'pw-'));
  writeFileSync(join(dir, 'other.json'), JSON.stringify(other));
  const otherPage = render(join(dir, 'other.json'), dir);
  await page.goto(url('examples/checkout-uat.html'));
  await page.locator('label:has(input[name="v-guest-checkout"][value="fails"])').click();
  await page.locator('textarea[data-note="guest-checkout"]').fill('Given on the example page');
  await page.goto('file://' + otherPage);
  await expect(page.locator('h1')).toHaveText('Another checkout test, same id');
  expect(await page.locator('input[name="v-guest-checkout"][value="fails"]').isChecked(), 'answer crossed over').toBe(false);
  await expect(page.locator('textarea[data-note="guest-checkout"]')).toHaveValue('');
  await page.goto(url('examples/checkout-uat.html'));                  // and the example keeps its own answer
  await expect(page.locator('textarea[data-note="guest-checkout"]')).toHaveValue('Given on the example page');
});

// #42 — an example is a real precedent, shown on the item where the reviewer asked for it.
test('item examples show who, what, what people see, and the source or "unverified"', async ({ page }) => {
  const r = JSON.parse(readFileSync(join(ROOT, 'examples/review.example.json'), 'utf8'));
  r.id = 'examples-on-items';
  r.items[0].examples = [{ name: 'Shopify checkout', what: 'Lets people pay without an account.', shows: 'A "Continue as guest" choice next to "Sign in".', source: 'https://help.shopify.com/' },
    { name: 'A shop a colleague ran', what: 'Asked for the account only after payment.' }];
  const dir = mkdtempSync(join(tmpdir(), 'pw-'));
  writeFileSync(join(dir, 'ex.json'), JSON.stringify(r));
  await page.goto('file://' + render(join(dir, 'ex.json'), dir));
  const item = page.locator('#detail fieldset.item');                   // the first item opens by itself
  await expect(item.locator('.brief-h3')).toHaveText('Where this has been done before');
  await expect(item).toContainText('What people see: A "Continue as guest" choice next to "Sign in".');
  await expect(item.locator('.brief-ex a')).toHaveAttribute('target', '_blank');
  await expect(item.locator('.brief-ex a')).toHaveText('help.shopify.com');
  await expect(item.locator('.unverified')).toHaveText('unverified · I could not find a source');
});

test('a hostile review runs no script and shows no injected markup', async ({ page }) => {
  const bad = '<img src=x onerror="window.__pwned=1">';
  const evil = JSON.parse(readFileSync(join(ROOT, 'examples/decision-review.example.json'), 'utf8'));
  Object.assign(evil, { id: 'evil', intro: bad, title: bad, ask: bad, afterwards: bad, audience: bad });
  evil.sections[0].label = bad; evil.sections[0].recommended.why = bad;
  for (const it of evil.items) Object.assign(it, { title: bad, summary: bad, body: bad, ref: bad });
  const dir = mkdtempSync(join(tmpdir(), 'pw-'));
  writeFileSync(join(dir, 'evil.json'), JSON.stringify(evil));
  await page.goto('file://' + render(join(dir, 'evil.json'), dir));
  await expect(page.locator('h1')).toHaveText(bad);
  expect(await page.locator('img').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('a hostile answer cannot break out of the exported page', async ({ page }) => {
  const bad = '</script><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">';
  await page.goto(url('examples/checkout-uat.html'));
  await page.locator('[data-open="declined-card"]').click();
  await page.locator('textarea[data-note="declined-card"]').fill(bad);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exporth').click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pw-')), 'feedback.html');
  await download.saveAs(file);
  await page.evaluate(() => localStorage.clear());
  await page.goto('file://' + file);
  await page.locator('[data-open="declined-card"]').click();
  await expect(page.locator('textarea[data-note="declined-card"]')).toHaveValue(bad);
  expect(await page.locator('img').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

// #54 — an approval shows its exact action, scope, risk and end, and is answered approve or decline.
test('an approval: the exact action, approve or decline, and the export passes the checker', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'pw-approval-'));
  const iso = (ms) => new Date(Date.now() + ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const r = JSON.parse(readFileSync(join(ROOT, 'examples/decision-review.example.json'), 'utf8'));
  Object.assign(r, { id: 'approval-page-test', createdAt: iso(-60e3) });
  r.sections.push({ id: 'approve', label: 'Needs your approval' });
  r.items.push({ id: 'drop-db', sectionId: 'approve', title: 'Drop the old staging database',
    approval: { action: 'Drop the database checkout_v1_staging', scope: 'One staging database', risk: 'high', preview: 'DROP DATABASE checkout_v1_staging;', expiresAt: iso(864e5) } });
  const reviewPath = join(dir, 'review.json'); writeFileSync(reviewPath, JSON.stringify(r));
  await page.goto('file://' + render(reviewPath, dir));
  await page.locator('[data-open="drop-db"]').click();
  const box = page.locator('#detail .appr');
  await expect(box).toContainText('Drop the database checkout_v1_staging');
  await expect(box.locator('.risk')).toHaveText('High risk');
  await expect(box).toContainText('still asks for permission');
  await expect(page.locator('#detail input[name="v-drop-db"]')).toHaveCount(2);   // approve, decline: never the verdict set
  await page.locator('label:has(input[name="v-drop-db"][value="decline"])').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const file = join(dir, 'feedback.json'); await download.saveAs(file);
  const c = check('pair', reviewPath, file);
  expect(c.status, c.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).responses.find((x) => x.itemId === 'drop-db')).toMatchObject({ verdict: 'decline', approval: { risk: 'high' } });
});

// #61 — any section folds to its title bar, comes back, and is remembered in this browser.
for (const name of ['checkout-uat', 'flow-booking']) {
  test(`${name}: every section can be minimised and shown again`, async ({ page }) => {
    await page.goto(url(`examples/${name}.html`));
    const sels = await page.locator('.min[data-min]').evaluateAll((l) => l.map((b) => b.dataset.min));
    expect(sels.length).toBeGreaterThanOrEqual(6);
    for (const sel of [...sels].reverse()) {                      // inner sections first: an outer one hides their buttons
      await page.locator(`.min[data-min="${sel}"]`).click();
      await expect(page.locator(sel)).toHaveClass(/minimised/);
      await expect(page.locator(`.min[data-min="${sel}"]`)).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator(`${sel} > .min-head`)).toBeVisible();   // never hidden without a title bar
    }
    await page.reload();
    await expect(page.locator('.minimised')).toHaveCount(sels.length);
    for (const sel of sels) await page.locator(`.min[data-min="${sel}"]`).click();
    await expect(page.locator('.minimised')).toHaveCount(0);
    await expect(page.locator('#detail')).toBeVisible();
  });
}

// #60 — the reviewer comments on a box and an arrow of the agent's diagram; the comments travel in the export.
test('comments on the diagram: pick a box by keyboard and an arrow, export, and the file passes the checker', async ({ page }) => {
  await page.goto(url('examples/checkout-uat.html'));
  await page.locator('#commentmode').click();
  await expect(page.locator('#commentmode')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#flowbeside [data-node="pay"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#comments .cmt-on')).toContainText('Takes the payment');
  await page.keyboard.type('Say which card is charged.');
  await page.locator('#flowbeside .dg-edge[data-from="result"][data-to="declined"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Keep the cart when this happens.');
  await expect(page.locator('#flowbeside .dg-commented')).toHaveCount(2);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pw-cmt-')), 'feedback.json');
  await download.saveAs(file);
  const r = check('pair', join(ROOT, 'examples/review.example.json'), file);
  expect(r.status, r.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).comments.map((c) => c.label)).toEqual(['Takes the payment', 'What happens? → Says why the card was declined (declined)']);
});

// #60 — a picture on a note: re-saved by the page (WebP, or JPEG where WebP cannot be written), exported, checked.
test('a picture on a note: attached, re-saved, kept across a reload, and the export passes the checker', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'pw-pic-'));
  const png = join(ROOT, 'site/social-preview.png');                // a real 1280 × 640 PNG from the repo
  await page.goto(url('examples/checkout-uat.html'));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#detail [data-picadd]').click()]);
  await chooser.setFiles(png);
  await expect(page.locator('#detail .pic img')).toHaveCount(1);
  await expect(page.locator('#detail .pic-msg')).toContainText('without hidden details');
  await page.reload();
  await expect(page.locator('#detail .pic img')).toHaveCount(1);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const file = join(dir, 'feedback.json'); await download.saveAs(file);
  const r = check('pair', join(ROOT, 'examples/review.example.json'), file);
  expect(r.status, r.stdout).toBe(0);
  const pic = JSON.parse(readFileSync(file, 'utf8')).pictures[0];
  expect(pic).toMatchObject({ on: 'guest-checkout', width: 1280, height: 640 });
  expect(['image/webp', 'image/jpeg']).toContain(pic.type);
});

// #60 part 3 — the reviewer changes the agent's diagram; the page shows it and the file carries it.
test('a proposed change: rename a box, see it drawn, export it, and the checker accepts it', async ({ page }) => {
  await page.goto(url('examples/checkout-uat.html'));
  await page.locator('#commentmode').click();
  await page.locator('#flowbeside [data-node="pay"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Say what is charged.');
  await page.locator('#comments [data-ptext="rename"]').fill('Charges the card');
  await page.locator('#comments [data-prop="rename"]').click();
  await expect(page.locator('#comments .proplist li')).toHaveText([/Rename to "Charges the card"/]);
  await page.locator('#showchanges').click();
  await expect(page.locator('#flowbeside [data-node="pay"]')).toHaveAttribute('aria-label', 'Charges the card');
  await expect(page.locator('#flowbeside .dg-proposed')).toHaveCount(1);
  await page.locator('#showchanges').click();                        // back to the agent's own diagram
  await expect(page.locator('#flowbeside [data-node="pay"]')).toHaveAttribute('aria-label', 'Takes the payment');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pw-prop-')), 'feedback.json');
  await download.saveAs(file);
  const r = check('pair', join(ROOT, 'examples/review.example.json'), file);
  expect(r.status, r.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).proposals[0]).toMatchObject({ op: 'rename', node: 'pay', text: 'Charges the card', why: 'Say what is charged.' });
});

// #32 — a system diagram is drawn with its own boxes, and the flow's sub-processes stay out of it.
test('the system diagram tab: lanes, a store, an outside system, and no sub-process column', async ({ page }) => {
  await page.goto(url('examples/flow-booking.html'));
  await page.locator('#dgtabs [data-tab="booking-system"]').click();
  await expect(page.locator('#flowbeside .dg-lane')).toHaveCount(3);
  await expect(page.locator('#flowbeside .dg-node')).toHaveCount(9);
  await expect(page.locator('#flowbeside .dg-k-data-store')).toHaveCount(1);
  await expect(page.locator('#flowbeside .dg-k-external')).toHaveCount(2);
  await expect(page.locator('#flowbeside .dg-k-guard')).toHaveCount(1);
  await expect(page.locator('#subproc')).toBeHidden();               // sub-processes belong to a flow
  await page.locator('#dgtabs [data-tab="user-flow"]').click();
  await expect(page.locator('#subproc')).toBeVisible();
});

// #32 — a sequence diagram on the page, and a comment that lands on the right message.
test('the sequence tab: participants with lifelines, and a comment on the fifth message', async ({ page }) => {
  await page.goto(url('examples/flow-booking.html'));
  await page.locator('#dgtabs [data-tab="booking-calls"]').click();
  await expect(page.locator('#flowbeside .dg-life')).toHaveCount(5);
  await expect(page.locator('#flowbeside .dg-edge')).toHaveCount(9);
  await expect(page.locator('#flowbeside .dg-k-client')).toHaveCount(1);
  await page.locator('#commentmode').click();
  await page.locator('#flowbeside .dg-edge[data-nth="4"]').focus();   // the fifth message: held
  await page.keyboard.press('Enter');
  await expect(page.locator('#comments .cmt-on')).toContainText('held');
  await page.keyboard.type('Say what the member sees while this happens.');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pw-seq-')), 'feedback.json');
  await download.saveAs(file);
  const r = check('pair', join(ROOT, 'examples/flow-booking.review.json'), file);
  expect(r.status, r.stdout).toBe(0);
  expect(JSON.parse(readFileSync(file, 'utf8')).comments[0].edge).toEqual({ from: 'slots', to: 'booking', nth: 4 });
});

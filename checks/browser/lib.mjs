// SPDX-License-Identifier: Apache-2.0
// Local check only (D024): drives an installed Chrome through the DevTools protocol so a rendered page
// is proven in a real browser. Never shipped, never required: skips cleanly when Chrome is missing.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const REPO = new URL('../..', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

export function render(reviewPath, outDir) {
  const out = join(outDir, 'page.html');
  const r = spawnSync(process.execPath, [join(REPO, 'bin/render.mjs'), reviewPath, out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return out;
}

export function checkPair(reviewPath, feedbackPath) {
  return spawnSync(process.execPath, [join(REPO, 'bin/check.mjs'), 'pair', reviewPath, feedbackPath, '--root', REPO], { encoding: 'utf8' });
}

export async function withChrome(name, body) {
  // CHECKS=hostile runs only the checks whose name matches; CI runs the hostile-input ones on every PR.
  if (process.env.CHECKS && !new RegExp(process.env.CHECKS).test(name)) return;
  const chromePath = findChrome();
  if (!chromePath) {
    // Locally a missing Chrome is a skip. In CI it would be a pass that proved nothing, so it fails.
    console.log(`${process.env.CI ? 'FAIL' : 'SKIP'} ${name}: Chrome not found (set CHROME_PATH)`);
    if (process.env.CI) process.exitCode = 1;
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), `browser-${name}-`));
  const downloads = join(dir, 'downloads'); mkdirSync(downloads);
  const port = 9300 + Math.floor(Math.random() * 90);
  const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(dir, 'profile')}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  const results = [], errors = [], network = [];
  let downloaded = false;
  const say = (ok, msg) => results.push([ok, msg]);
  try {
    let version;
    for (let i = 0; i < 80 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
    const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    const connect = (url) => new Promise((resolve) => {
      const ws = new WebSocket(url); let id = 0; const pending = new Map(); const listeners = [];
      ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else listeners.forEach((f) => f(d)); };
      ws.onopen = () => resolve({ send: (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }), on: (f) => listeners.push(f), close: () => ws.close() });
    });
    const browser = await connect(version.webSocketDebuggerUrl);
    const cdp = await connect(page.webSocketDebuggerUrl);
    cdp.on((e) => {
      if (e.method === 'Runtime.exceptionThrown') errors.push(e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
      if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) errors.push(`console.${e.params.type}: ${e.params.args.map((a) => a.value ?? a.description).join(' ')}`);
      if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') errors.push(`log: ${e.params.entry.text}`);
      if (e.method === 'Page.javascriptDialogOpening') cdp.send('Page.handleJavaScriptDialog', { accept: true });
      if (e.method === 'Network.requestWillBeSent') network.push(e.params.request.url);
    });
    browser.on((e) => { if (e.method === 'Browser.downloadProgress' && e.params.state === 'completed') downloaded = true; });
    for (const d of ['Runtime', 'Log', 'Page', 'Network']) await cdp.send(`${d}.enable`);
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });

    const ev = async (expr) => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result?.value;
    const t = {
      dir, say, sleep, ev, cdp,
      load: async (file) => { await cdp.send('Page.navigate', { url: 'file://' + file }); await sleep(700); },
      media: (scheme) => cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }),
      width: (w, mobile = false) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile }),
      shot: async (label, w, mobile = false) => {
        await t.width(w, mobile); await sleep(250);
        const h = await ev('document.documentElement.scrollHeight');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: Math.min(h, 2400), deviceScaleFactor: 1, mobile }); await sleep(250);
        const { result } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(dir, `${label}.png`), Buffer.from(result.data, 'base64'));
        const overflow = await ev('document.documentElement.scrollWidth - window.innerWidth');
        say(overflow <= 0, `${label}: width ${w}px, horizontal overflow ${overflow}px`);
        await t.width(1280);
      },
      key: async (key, code, vk) => {
        await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
        if (key.length === 1 || key === 'Enter') await cdp.send('Input.dispatchKeyEvent', { type: 'char', key, text: key === 'Enter' ? '\r' : key });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
        await sleep(120);
      },
      type: (text) => cdp.send('Input.insertText', { text }),
      exported: async (ext = '.json') => {
        let f;
        for (let i = 0; i < 40; i++) { f = readdirSync(downloads).find((x) => x.endsWith(ext)); if (f) break; await sleep(100); }
        return f ? join(downloads, f) : null;
      },
    };
    await t.width(1280);
    // A check that crashes has proven nothing: count it as a failure, never as an empty pass.
    try { await body(t); } catch (e) { say(false, `check crashed: ${e.message.split('\n')[0]}`); }
    const external = network.filter((u) => !/^(file|data|blob):/.test(u));
    say(external.length === 0, `network requests beyond the file itself: ${external.length ? external.join(', ') : 'none'}`);
    say(errors.length === 0, `script errors: ${errors.length ? errors.join(' || ') : 'none'}`);
    browser.close(); cdp.close();
  } finally {
    chrome.kill();
    for (const [ok, msg] of results) console.log(`${ok ? '✓' : '✗'} ${msg}`);
    if (!results.length) results.push([false, 'no checks ran']);
    const failed = results.filter(([ok]) => !ok).length;
    console.log(`\n${name}: ${failed ? 'FAIL' : 'PASS'} — ${results.length - failed}/${results.length}  (screenshots: ${dir})`);
    if (failed) process.exitCode = 1;
  }
}

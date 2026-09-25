#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Everything this file WRITES into a generated page is MIT-0 (see LICENSING.md): a page someone
// emails to a client must carry no licence obligation.
// review.v1.json → one self-contained HTML page.
//
//   node bin/render.mjs <review.json> [out.html]
//
// The page collects verdicts and notes and exports a feedback.v1.json that passes
// bin/check.mjs. It inlines lib/build-feedback.mjs verbatim, so the page and the test suite
// share one implementation of the export shape.
//
// Fixes two gaps the old hand-edited templates had: they were dark-only with hardcoded colours, and
// carried no aria or role attributes at all — in a tool whose entire purpose is collecting human
// input. Verdicts are real radio groups inside real fieldsets, so keyboard support is not bolted on.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewParts, startCardsHtml, roundsView } from '../lib/review-parts.mjs';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
// #82 — a continuing review: `--earlier <review.json> <feedback.json>` once per earlier round, oldest first.
const args = process.argv.slice(2), earlierFiles = [];
for (let i = args.indexOf('--earlier'); i >= 0; i = args.indexOf('--earlier')) earlierFiles.push(...args.splice(i, 3).slice(1));
const [inPath, outPathArg] = args;
if (!inPath || earlierFiles.length % 2 || earlierFiles.some((f) => !f || f.startsWith('--'))) {
  console.error('usage: render.mjs <review.json> [out.html] [--earlier <review.json> <feedback.json>]...'); process.exit(2);
}

const review = JSON.parse(readFileSync(inPath, 'utf8'));
if (review.protocol !== 'letmeshowyousomething/review') {
  console.error(`✗ not a review: protocol is ${JSON.stringify(review.protocol)}`);
  process.exit(2);
}
const outPath = outPathArg || inPath.replace(/\.json$/, '') + '.html';

// #82 — the earlier rounds travel in the page only after the checker has passed the whole chain: every
// round a checked pair, every next round carrying what the round before left open. Bounded, never guessed.
let history = null;
if (earlierFiles.length) {
  const run = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'check.mjs'), 'rounds', inPath, ...earlierFiles], { encoding: 'utf8' });
  if (run.status !== 0) { console.error(`✗ the rounds do not check out; nothing was written\n${run.stdout}${run.stderr}`); process.exit(1); }
  const rounds = [];
  for (let i = 0; i < earlierFiles.length; i += 2) rounds.push({ review: JSON.parse(readFileSync(earlierFiles[i], 'utf8')), feedback: JSON.parse(readFileSync(earlierFiles[i + 1], 'utf8')) });
  history = { protocol: 'letmeshowyousomething/history', schemaVersion: 1, rounds };
  const size = Buffer.byteLength(JSON.stringify(history));
  if (rounds.length > 20 || size > 16 * 1024 * 1024) { console.error(`✗ the history is too large to carry (${rounds.length} rounds, ${(size / 1048576).toFixed(1)} MB; at most 20 rounds and 16 MB). Start a new review that quotes the open points in "affects"`); process.exit(1); }
}
const view = roundsView(review, history && history.rounds);

const builder = readFileSync(join(HERE, '..', 'lib', 'build-feedback.mjs'), 'utf8')
  .replace(/^export function/gm, 'function');
// The flow page draws screens with the same code the Node tests prove (drawing + escaping).
const drawer = readFileSync(join(HERE, '..', 'lib', 'draw-components.mjs'), 'utf8')
  .replace(/^export function/gm, 'function');
// Diagrams: layout and drawing, inlined the same way; their imports are dropped because the page
// already defines everything they import.
const inline = (file) => readFileSync(join(HERE, '..', 'lib', file), 'utf8').replace(/^export (?=function|const)/gm, '').replace(/^import .*\n/gm, '');
const partsLib = inline('review-parts.mjs');
const diagrams = inline('draw-ai.mjs') + '\n' + inline('layout.mjs') + '\n' + inline('draw-database.mjs') + '\n' + inline('draw-diagram.mjs');

// `</script>` inside a JSON string would close the tag early; escaping `<` is enough and keeps the
// payload valid JSON.
// #78 — `<` could close the script, and U+2028/U+2029 end a line: an answered page is read back line
// by line (bin/answer.mjs), and its re-export replaces the SEED line. JSON escapes change no value.
const embed = (o) => JSON.stringify(o).replace(/[<\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TONE = { positive: 'ok', caution: 'warn', negative: 'bad', neutral: 'neut' };

// #74 — the symbols of the approved design, drawn inline so the page fetches nothing.
const ICONS = {
  check: '<path d="M5 12l5 5L20 7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>', alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/>',
  map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>', phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  list: '<path d="M10 6h10M10 12h10M10 18h10M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>', code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 5l-2 14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', minus: '<path d="M5 12h14"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.8l-5.3 2.6 1.2-6-4.5-4.1 6-.7z"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 12V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 12v3a3 3 0 0 1-3 3H3"/>',
  open: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>', settled: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>', msg: '<path d="M4 5h16v11H9l-5 4z"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v2a5 5 0 0 0 5 5h1M18 7v2a5 5 0 0 1-5 5M12 14v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>', flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  half: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>', layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  battery: '<rect x="2" y="8" width="18" height="9" rx="2"/><path d="M22 11v3"/><rect x="4" y="10" width="11" height="5" fill="currentColor" stroke="none"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>', dots: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>', db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
};
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(ICONS).map(([k, v]) =>
  `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('')}</svg>`;
const I = (name, c = '') => `<svg class="ic ${c}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

// #38 — answers are kept per review, not per id: an agent that keeps an example's id (or two reviews
// that happen to share one) must never mix answers. The key is the id plus a fingerprint of the content.
const fingerprint = createHash('sha256').update(JSON.stringify(review) + JSON.stringify(history)).digest('hex').slice(0, 12);

// The logo as the tab icon (D094), inlined so the page still fetches nothing. Base64, so no URL sits in
// the page. A folder without site/ (only bin/ copied) simply renders without one.
// The same mark signs the page at the bottom (D095): "Made with LetMeShowYouSomething", quiet, drawn inline.
let favicon = '', mark = '';
try {
  const logo = readFileSync(new URL('../site/logo.svg', import.meta.url), 'utf8');
  favicon = `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}">`;
  mark = (logo.match(/<g [\s\S]*<\/g>/) || [''])[0];
} catch {}

// #74 — the Let me explain cards are written into the page itself: a phone's file preview runs no
// script and must still show them.
const startCards = startCardsHtml(review, reviewParts(review), I, view);

const html = `<!doctype html>
<html lang="en"><head>
<!-- SPDX-License-Identifier: MIT-0 -->
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(review.title)}</title>
${favicon}
<style>
/* #74 — the page as the approved design: the guided tour, four places in a fixed order, the Overview. */
:root{
  --bg:#F6F4F9; --surf:#FFFFFF; --sunk:#EFECF4; --line:#DDD8E6; --line2:#B9B1C9;
  --ink:#1B1726; --ink2:#3C3550; --mut:#6B6480;
  color-scheme:light;
  --ac:#5B3E8C; --ac-bg:#EEE8F7; --on-ac:#FFFFFF;
  --ok:#2F6B45; --ok-bg:#E4F1E8; --warn:#8E6110; --warn-bg:#F6EDDA; --bad:#A03A2E; --bad-bg:#F6E3E0; --neut:#566070; --neut-bg:#E9ECF0;
  --blue:#2D5DA8; --blue-bg:#E3ECF8;
  --s0:#6B6480; --s1:#1F7A74; --s2:#A63D63; --s3:#4056A6; --s4:#9A6B12; --s5:#5B3E8C; --s6:#2F6B45;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; --mono:ui-monospace,SFMono-Regular,Menlo,monospace; --r:12px;
}
@media (prefers-color-scheme:dark){:root:not([data-theme]){
  --bg:#131019; --surf:#1B1723; --sunk:#221D2D; --line:#322B40; --line2:#4A4160;
  --ink:#EEEAF5; --ink2:#D2CBE0; --mut:#9A92AE;
  color-scheme:dark;
  --ac:#B39BE0; --ac-bg:#2A2240; --on-ac:#131019;
  --ok:#6CBF8D; --ok-bg:#1C2E23; --warn:#D9A441; --warn-bg:#2E2616; --bad:#E08272; --bad-bg:#35201D; --neut:#A3ACBB; --neut-bg:#23272E;
  --blue:#7FA6E6; --blue-bg:#1B2536;
  --s0:#9A92AE; --s1:#4DB8AF; --s2:#E27FA3; --s3:#8FA2EA; --s4:#DDAA4E; --s5:#B39BE0; --s6:#6CBF8D;
}}
:root[data-theme="dark"]{
  --bg:#131019; --surf:#1B1723; --sunk:#221D2D; --line:#322B40; --line2:#4A4160;
  --ink:#EEEAF5; --ink2:#D2CBE0; --mut:#9A92AE;
  color-scheme:dark;
  --ac:#B39BE0; --ac-bg:#2A2240; --on-ac:#131019;
  --ok:#6CBF8D; --ok-bg:#1C2E23; --warn:#D9A441; --warn-bg:#2E2616; --bad:#E08272; --bad-bg:#35201D; --neut:#A3ACBB; --neut-bg:#23272E;
  --blue:#7FA6E6; --blue-bg:#1B2536;
  --s0:#9A92AE; --s1:#4DB8AF; --s2:#E27FA3; --s3:#8FA2EA; --s4:#DDAA4E; --s5:#B39BE0; --s6:#6CBF8D;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,h5{margin:0;text-wrap:balance;color:var(--ink)}
p{margin:0}
button{font:inherit;color:inherit}
[hidden]{display:none!important}
:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
.skip{position:absolute;left:-9999px}
.skip:focus{left:8px;top:8px;z-index:60;background:var(--surf);border:1px solid var(--ac);padding:8px 12px;border-radius:6px}
.ic{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-3px}
.ic.sm{width:14px;height:14px;vertical-align:-2px}
.eyebrow{font:600 11px/1.2 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--ac);display:inline-flex;gap:6px;align-items:center}
.wrap{container-type:inline-size;max-width:1300px;margin:0 auto;padding:12px 16px 32px}
.btn{border:1px solid var(--line2);background:var(--surf);border-radius:10px;padding:9px 14px;font-weight:600;font-size:14px;cursor:pointer;min-height:42px;color:var(--ink);display:inline-flex;gap:7px;align-items:center;justify-content:center;text-decoration:none}
.btn.pri{background:var(--ac);border-color:var(--ac);color:var(--on-ac)}
.btn.quiet{border-color:transparent;background:none;color:var(--ac);padding-inline:6px}
.btn.small{min-height:34px;padding:5px 10px;font-size:13px;font-weight:500}
.btn.icon{min-width:34px;min-height:34px;padding:0;border-color:var(--line)}
.btn[aria-pressed="true"]:not(.pri){background:var(--ac-bg);border-color:var(--ac);color:var(--ac)}
.btn:disabled{opacity:.45;cursor:default}
@media (pointer:coarse){.btn,.btn.small{min-height:44px}.btn.icon{min-width:44px;min-height:44px}}
.rowgap{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.seg{display:inline-flex;gap:4px;background:var(--sunk);border:1px solid var(--line);border-radius:11px;padding:3px}
.seg button{border:0;background:none;border-radius:8px;padding:7px 12px;font-weight:600;font-size:13.5px;color:var(--ink2);cursor:pointer;min-height:36px;display:inline-flex;gap:6px;align-items:center}
.seg button[aria-pressed="true"]{background:var(--surf);color:var(--ac);box-shadow:0 1px 2px rgba(0,0,0,.12)}
@media (pointer:coarse){.seg button{min-height:44px}}
.status,.tag{font:600 10.5px var(--mono);letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:99px;white-space:nowrap;display:inline-flex;gap:5px;align-items:center}
.st-known{color:var(--ok);background:var(--ok-bg)}.st-suggested,.st-question{color:var(--ac);background:var(--ac-bg)}.st-planned{color:var(--blue);background:var(--blue-bg)}
.st-risk-high{color:var(--bad);background:var(--bad-bg)}.st-risk-medium{color:var(--warn);background:var(--warn-bg)}.st-risk-low{color:var(--ok);background:var(--ok-bg)}
.chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.tg-new{color:var(--ac);background:var(--ac-bg)}.tg-changed{color:var(--blue);background:var(--blue-bg)}.tg-again{color:var(--warn);background:var(--warn-bg)}.tg-open{color:var(--neut);background:var(--neut-bg)}.tg-added,.tg-settled{color:var(--ok);background:var(--ok-bg)}.tg-bad{color:var(--bad);background:var(--bad-bg)}
.settled{background:var(--surf);border:1px solid var(--line);border-radius:var(--r);padding:10px 14px}
.settled summary{cursor:pointer;font-weight:600;font-size:14px;color:var(--ok);display:inline-flex;gap:6px;align-items:center;min-height:32px}
@media (pointer:coarse){.settled summary{min-height:44px}}
.settled ul{margin:8px 0 0;padding-left:18px;font-size:13.5px;color:var(--ink2);display:grid;gap:4px}
.hist{display:grid;gap:12px;max-width:760px;width:100%;margin:0 auto}
.hround{background:var(--surf);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;display:grid;gap:8px}
.hround .who{font:600 10.5px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--mut);display:flex;gap:6px;align-items:center}
.hline{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;font-size:13.5px;padding:8px 0;border-top:1px solid var(--line)}
.hline .q{font-weight:600}.hline .nn{grid-column:1/-1;color:var(--mut)}.hline .r{grid-column:1/-1;color:var(--blue)}
.facts{display:flex;flex-wrap:wrap;gap:6px}
.fact{font-size:12.5px;padding:5px 10px;border-radius:99px;background:var(--sunk);color:var(--ink2);border:1px solid var(--line);display:inline-flex;gap:6px;align-items:center}
.earlier{border-left:3px solid var(--blue);background:var(--blue-bg);border-radius:0 10px 10px 0;padding:9px 12px;font-size:13.5px;display:grid;gap:4px}
.earlier b.h{font:600 10.5px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--blue);display:inline-flex;gap:6px;align-items:center}
.earlier p{color:var(--ink2)}

/* Let me explain (#105): short numbered cards and one action, Start. After Start it folds to one bar. */
#start{max-width:720px;margin:12px auto 0;display:grid;gap:14px}
#start h1{font-size:clamp(22px,4vw,30px);letter-spacing:-.015em;line-height:1.2}
.start-cards{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.scard{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;background:var(--surf);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.scard .num{font:700 12px var(--mono);color:var(--on-ac);background:var(--ac);border-radius:50%;width:26px;height:26px;display:grid;place-items:center}
.scard h3{font:600 12px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--ac);display:flex;gap:6px;align-items:center;margin:3px 0 4px}
.scard p{font-size:15px;color:var(--ink)}
.start-parts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px!important}
.chip-part{display:inline-flex;gap:5px;align-items:center;font:600 12px var(--sans);color:var(--sc);border:1px solid var(--sc);border-radius:99px;padding:3px 10px}
.start-more>summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-size:13px;color:var(--ac)}
.start-more p,.start-more li{font-size:13.5px;color:var(--ink2)}
#start-review{min-height:52px;font-size:16px;justify-self:center;padding-inline:40px}
#topbar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:10px}
#start-mini{display:flex;gap:8px;align-items:center;flex:1;min-width:0;min-height:44px;padding:6px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surf);color:var(--ink2);font:600 13px var(--sans);cursor:pointer;text-align:left}
#start-mini b{font-weight:500;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
#start-mini .more{margin-left:auto;color:var(--ac);font-weight:500;flex:none}
body.at-start :is(#topbar,#main,#footnote),body:not(.at-start) #start{display:none}
/* Without a script (a phone's file preview) the cards and any answers still show, and say why nothing moves. */
html:not(.js) #start-review,html.js .no-script,html.js #static-answers{display:none}
.no-script{border:1px solid var(--warn);background:var(--warn-bg);border-radius:10px;padding:10px 12px;font-size:14px;color:var(--ink)}
#static-answers:empty{display:none}
#static-answers{display:grid;gap:8px}
#static-answers h2{font-size:16px;margin-top:6px}
#static-answers .sum-row p{flex-basis:100%;font-size:13.5px;color:var(--ink2)}
@container (max-width:700px){#start-review{justify-self:stretch}}

/* answer tiles: a questionnaire, not a form */
.qprompt{font-size:14px;font-weight:700;color:var(--ink);display:flex;gap:8px;align-items:center}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px}
.tile{position:relative;border:1.5px solid var(--line2);background:var(--surf);border-radius:14px;padding:10px 12px;cursor:pointer;display:flex;gap:10px;align-items:center;font-weight:600;font-size:14.5px;min-height:54px;text-align:left}
.tile input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer}
.tile .dot{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--tone-soft,var(--sunk));color:var(--tone,var(--mut));flex:none}
.tile:has(input:checked){border-color:var(--tone,var(--ac));background:var(--tone-soft,var(--ac-bg));color:var(--tone,var(--ac));box-shadow:0 0 0 2px var(--tone-soft,var(--ac-bg))}
.tile:has(input:checked) .dot{background:var(--tone,var(--ac));color:var(--surf)}
.tile:has(input:focus-visible){outline:2px solid var(--ac);outline-offset:2px}
.t-ok{--tone:var(--ok);--tone-soft:var(--ok-bg)}.t-warn{--tone:var(--warn);--tone-soft:var(--warn-bg)}.t-bad{--tone:var(--bad);--tone-soft:var(--bad-bg)}.t-neut{--tone:var(--neut);--tone-soft:var(--neut-bg)}.t-acc{--tone:var(--ac);--tone-soft:var(--ac-bg)}
.tiles.compact .tile{min-height:46px;padding:7px 9px;font-size:13.5px;gap:7px}
.tiles.compact .tile .dot{width:26px;height:26px}
.explain{display:grid;gap:8px}
.explain textarea,.mark textarea{width:100%;min-height:74px;border:1px solid var(--line2);border-radius:10px;padding:10px 12px;font:14px var(--sans);background:var(--surf);color:var(--ink);resize:vertical}
.tools{display:flex;flex-wrap:wrap;gap:6px}
.mark{border:1px dashed var(--ac);border-radius:10px;padding:8px 10px;display:grid;gap:6px;background:var(--ac-bg)}
.mark p{font-size:13px;display:flex;gap:6px;align-items:center;justify-content:space-between}
.mark textarea{min-height:52px}
.pics{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.pics:empty{display:none}
.pic{margin:0;display:grid;gap:4px;justify-items:start}
.pic img{display:block;max-width:180px;max-height:140px;width:auto;height:auto;border:1px solid var(--line);border-radius:6px;background:var(--surf)}
.pic-msg{flex-basis:100%;font-size:12.5px;color:var(--mut)}

/* the four places: the same, in the same order, on every question */
.slot{background:var(--surf);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;min-width:0}
.slot-head{display:flex;align-items:center;gap:8px;padding:8px 10px 8px 12px;border-bottom:1px solid var(--line)}
.slot.min .slot-head{border-bottom:0}
.slot-head .num{font:700 11px var(--mono);color:var(--on-ac);background:var(--ac);border-radius:50%;width:20px;height:20px;display:grid;place-items:center;flex:none}
.slot-head h3{font:600 12px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--ink2);display:flex;gap:6px;align-items:center;flex:1;min-width:0}
.slot-head h3 small{font:500 12px var(--sans);letter-spacing:0;text-transform:none;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.slot-body{padding:12px;min-width:0}
.slot.min .slot-body{display:none}
.empty{font-size:13.5px;color:var(--mut);display:flex;gap:8px;align-items:center}
.right-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.slots{display:grid;gap:12px}

/* the app prototype: a real phone screen, the buttons where the app puts them */
.app{--brand:#0F6E68;--brand-soft:#E3F2F0;width:100%;max-width:280px;border:7px solid #15131A;border-radius:32px;background:#FFFFFF;color:#16181C;overflow:hidden;font:13px/1.4 var(--sans);display:grid;grid-template-rows:auto auto 1fr auto;min-height:470px;box-shadow:0 18px 40px -26px rgba(0,0,0,.6);position:relative;color-scheme:light}
.app .sb{display:flex;justify-content:space-between;padding:7px 16px 3px;font:600 11px var(--sans);color:#16181C}
.app .sb span{display:inline-flex;gap:4px;align-items:center}
.app .bar{display:grid;grid-template-columns:28px 1fr 28px;align-items:center;padding:6px 10px;border-bottom:1px solid #ECEEF1}
.app .bar b{text-align:center;font-size:14px}
.app .bar .ic{width:18px;height:18px;color:#16181C}
.app .body{padding:12px;display:grid;gap:10px;align-content:start;background:#F7F8FA}
.app .foot{padding:10px 12px 14px;display:grid;gap:6px;background:#FFFFFF;border-top:1px solid #ECEEF1}
.app .foot:empty{display:none}
.app .pri{background:var(--brand);color:#fff;border-radius:12px;padding:11px;text-align:center;font-weight:700}
.app .sec{color:var(--brand);text-align:center;font-weight:600;padding:6px}
.app .on,.app .is-target{outline:3px solid #8E6CC4;outline-offset:2px}
.app .mut{color:#6A7280;font-size:12px}
.app .hero{display:grid;justify-items:center;gap:6px;padding:10px 4px;text-align:center}
.app .hero .ring{width:52px;height:52px;border-radius:50%;display:grid;place-items:center}
.app .hero .ring .ic{width:26px;height:26px}
.app .hero h5{margin:0;font-size:16px;color:#16181C}
.app .ok-ring{background:#E3F2E8;color:#2C7A46}.app .warn-ring{background:#FBEFD9;color:#9A6400}.app .bad-ring{background:#FBE3E0;color:#B3261E}
.app .note{background:#E3F2E8;border-radius:10px;padding:8px 10px;font-size:12px;color:#1E5A34;display:flex;gap:6px;align-items:flex-start}
.app .scrim{position:absolute;inset:0;background:rgba(10,12,16,.38);display:flex;align-items:flex-end}
.app .sheet{background:#fff;width:100%;border-radius:18px 18px 0 0;padding:14px 12px 16px;display:grid;gap:8px}
.app .sheet h5{margin:0;font-size:16px;color:#16181C}
.app .grab{width:36px;height:4px;border-radius:9px;background:#D9DDE3;justify-self:center}
.app h2,.app h3{color:#16181C}
.app .c-card{background:#fff;border:1px solid #E4E7EB;border-radius:12px;padding:10px;display:grid;gap:4px}
.app .c-card h3{font-size:14px}
.app .c-card p,.app .c-text{margin:0;font-size:12.5px;color:#4B5260}
.app .c-actions{display:flex;justify-content:flex-end;gap:6px}
.app .c-button,.app .c-actions .c-button{background:var(--brand);color:#fff;border-radius:9px;padding:6px 10px;font-weight:700;font-size:12px;border:0}
.app .c-field{display:grid;gap:3px;font-size:11.5px;color:#6A7280}
.app .c-field input,.app .c-field select,.app .c-date,.app .c-input{background:#fff;border:1px solid #D9DDE3;border-radius:10px;padding:8px 10px;color:#16181C;font:12.5px var(--sans)}
.app .c-stepper{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #E4E7EB;border-radius:12px;padding:9px 10px;font-size:12.5px}
.app .c-stepper>span:first-child{flex:1}
.app .c-step{width:24px;height:24px;border-radius:50%;border:1px solid #D9DDE3;display:grid;place-items:center;font-weight:700;background:#fff;color:#16181C;padding:0}
.app .c-chip{align-self:start;justify-self:start;font:600 11px var(--sans);padding:3px 9px;border-radius:99px;background:#EEF0F3;color:#3A404C}
.app .c-chip[data-tone=positive]{background:#E3F2E8;color:#2C7A46}.app .c-chip[data-tone=caution]{background:#FBEFD9;color:#9A6400}.app .c-chip[data-tone=negative]{background:#FBE3E0;color:#B3261E}
.app .c-list{margin:0;padding-left:18px;font-size:12.5px}
.app .c-heading{font-size:16px}
.app .c-empty{text-align:center;display:grid;gap:8px;justify-items:center;color:#4B5260}
.app .c-table{border-collapse:collapse;width:100%;font-size:11.5px}.app .c-table td,.app .c-table th{border-bottom:1px solid #E4E7EB;padding:4px;text-align:left}
.app .c-placeholder{display:grid;place-items:center;min-height:90px;border:1px dashed #C9CED6;border-radius:10px;color:#6A7280;font-size:12px}
.app .c-sr{position:absolute;left:-9999px}
.console{width:100%;background:#15131A;color:#E6E3EE;border-radius:12px;padding:12px;font:12px/1.6 var(--mono);display:grid;gap:2px;overflow-x:auto;white-space:pre-wrap}
.console .p{color:#8BD5A6}.console .c{color:#9B95AC}.console .w{color:#F2C46B}.console .r{color:#F08E80}
.proto-wrap{display:flex;justify-content:center}

/* what should happen / how I'd build it */
.expected{display:grid;gap:8px}
.exp{border:1px solid var(--line);border-radius:10px;padding:9px 12px;background:var(--surf);font-size:14px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;align-items:start}
.exp>:not(.ei){grid-column:2}
.exp .ei{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;grid-row:span 2}
.exp b{font:600 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--ek)}
.exp.ok{--ek:var(--ok)}.exp.ok .ei{background:var(--ok-bg);color:var(--ok)}
.exp.fail{--ek:var(--bad)}.exp.fail .ei{background:var(--bad-bg);color:var(--bad)}
.exp.info{--ek:var(--ac)}.exp.info .ei{background:var(--ac-bg);color:var(--ac)}
.exp a{color:var(--ac)}
.build{margin:0;padding:0;list-style:none;display:grid;gap:8px;font-size:14px;color:var(--ink2)}
.build li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:start}
.build li .ic{color:var(--ac);margin-top:2px}
.build code{font:12.5px var(--mono);background:var(--sunk);border-radius:5px;padding:1px 5px;overflow-wrap:anywhere}
.options{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}
.opt{border:1.5px solid var(--line);border-radius:12px;background:var(--surf);padding:11px;display:grid;gap:5px;text-align:left;cursor:pointer;align-content:start}
.opt[aria-pressed="true"]{border-color:var(--ac);background:var(--ac-bg)}
.opt h4{font-size:14.5px}
.opt p{font-size:13px;color:var(--ink2)}
.opt dl{margin:2px 0 0;display:grid;gap:3px;font-size:12.5px}
.opt dt{font:600 10px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--mut);display:flex;gap:5px;align-items:center}
.opt dd{margin:0 0 3px;color:var(--ink2)}
.rec{font:600 10.5px var(--mono);letter-spacing:.06em;text-transform:uppercase;background:var(--ac);color:var(--on-ac);border-radius:99px;padding:3px 8px;justify-self:start;display:inline-flex;gap:5px;align-items:center}

/* the map: every kind of diagram drawn the way of the approved design */
.map-scroll{overflow:auto}
.map-scroll svg{display:block;min-width:680px;width:100%;height:auto}
.layer .map-scroll svg{min-width:0;width:auto;max-width:none}
.dg .dg-shape{fill:var(--sunk);stroke:var(--line2);stroke-width:1.5}
.dg .dg-label{fill:var(--ink);font:12.5px var(--sans)}
.dg:not(.dg-database) .dg-node>.dg-label{font-weight:600}
.dg .dg-sub{fill:var(--mut);font:600 9.5px var(--mono);letter-spacing:.05em}
.dg .dg-selected .dg-shape{fill:var(--ac-bg);stroke:var(--ac);stroke-width:3}
.dg .dg-selected .dg-sub{fill:var(--ac)}
.dg .dg-answered .dg-shape{fill:var(--ok-bg);stroke:var(--ok)}
.dg .dg-answered .dg-sub{fill:var(--ok)}
.dg .dg-marked .dg-shape{stroke:var(--ac);stroke-width:3;stroke-dasharray:6 3}
.dg .dg-edge path{fill:none;stroke:var(--line2);stroke-width:1.6}
.dg .dg-hit{fill:none;stroke:transparent;stroke-width:14}
.dg .dg-edge-label{fill:var(--mut);font:600 10.5px var(--sans);paint-order:stroke;stroke:var(--surf);stroke-width:4px;stroke-linejoin:round}
.dg marker path{fill:var(--line2)}
.dg .dg-e-message path,.dg .dg-e-async path,.dg .dg-e-return path{stroke-dasharray:6 4}
.dg .dg-life{stroke:var(--line2);stroke-width:1.5;stroke-dasharray:4 5;fill:none}
.dg .dg-lane rect{fill:none;stroke:var(--line)}
.dg .dg-lane-title{fill:var(--mut);font:600 11px var(--mono)}
.dg .dg-group{fill:none;stroke:var(--line2);stroke-dasharray:5 4}
.dg .dg-icon{fill:none;stroke:var(--ac);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dg .dg-ai-text{fill:var(--ink);font:12px ui-monospace,SFMono-Regular,Consolas,monospace}
.dg-database .dg-label{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.dg-agent .dg-edge .dg-hit,.dg-db-edge .dg-hit{stroke:transparent;stroke-width:44}
.dg .dg-ai-caption{fill:var(--ink);font:600 12px var(--sans)}
.dg .dg-token-bar{fill:var(--ac)}
.dg .dg-db-title{font-weight:700}
.dg-node[data-step],.marking .dg-node{cursor:pointer}
.dg-node:focus-visible{outline:none}.dg-node:focus-visible .dg-shape{stroke:var(--ac);stroke-width:3}
.dg-component{font-size:11px;line-height:1.35}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--mut);margin-top:8px}
.legend span{display:inline-flex;gap:6px;align-items:center}
.legend i{width:14px;height:10px;border-radius:3px;border:1.5px solid var(--line2);background:var(--sunk);display:inline-block}
.legend i.on{border-color:var(--ac);background:var(--ac-bg)}.legend i.done{border-color:var(--ok);background:var(--ok-bg)}.legend i.pin{border-color:var(--ac);border-style:dashed}
.markhint{font-size:13px;color:var(--ac);font-weight:600;display:flex;gap:6px;align-items:center;margin-bottom:6px}

/* progress in coloured parts */
.prog{display:grid;gap:6px}
.segs{display:flex;gap:4px;align-items:flex-end}
.pseg{flex:var(--w) 1 0;min-width:0;align-self:stretch;align-content:start;border:0;background:none;padding:0;cursor:pointer;text-align:left;display:grid;gap:4px;color:var(--sc)}
.pseg .track{height:8px;border-radius:99px;background:color-mix(in srgb,var(--sc) 20%,var(--line));overflow:hidden;position:relative}
.pseg .track i{position:absolute;inset:0 auto 0 0;background:var(--sc);border-radius:99px}
.pseg.now .track{outline:2px solid var(--sc);outline-offset:2px}
/* Let me explain and Return take the room their names need; the questions share the rest. */
.pseg[data-jump="start"],.pseg[data-jump="return"]{flex:0 0 auto;min-width:44px}
.pseg .pl{font:600 10.5px/1.3 var(--mono);letter-spacing:.03em;display:block;overflow-wrap:anywhere}
.pseg .pl .ic{margin-right:4px}
.pseg .pl small{color:var(--mut);font-weight:500}
@media (pointer:coarse){.pseg{min-height:44px;min-width:44px;align-content:end}}
.prog-sum{font:600 12px var(--mono);color:var(--mut);display:inline-flex;gap:6px;align-items:center}

/* the tour: the same places on every step */
.tour{display:grid;gap:12px;grid-template-columns:minmax(300px,370px) minmax(0,1fr);grid-template-rows:auto auto auto 1fr auto;grid-template-areas:"prog prog" "head vis" "ans vis" ". vis" "nav nav";align-items:start}
.tour>.prog{grid-area:prog}
.t-head{grid-area:head;background:var(--surf);border:1px solid var(--line);border-top:5px solid var(--sc,var(--ac));border-radius:var(--r) var(--r) 0 0;padding:16px 16px 12px;display:grid;gap:10px}
.t-ans{grid-area:ans;background:var(--surf);border:1px solid var(--line);border-top:0;border-radius:0 0 var(--r) var(--r);padding:4px 16px 16px;display:grid;gap:10px;margin-top:-12px}
.t-vis{grid-area:vis;display:grid;gap:12px;min-width:0}
.t-nav{grid-area:nav;display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid var(--line);padding-top:10px}
.sec-name{font:600 11px var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--sc,var(--ac));display:flex;gap:6px;align-items:center}
.t-head h2{font-size:clamp(19px,2.6cqi,24px);letter-spacing:-.015em;line-height:1.2}
.say{font-size:14.5px;color:var(--ink2)}
.say-more,.note-btn,.round-chip{display:none}
.ptabs{display:none}
details.more>summary{cursor:pointer;font-size:13px;color:var(--ac)}
@container (max-width:700px){
  .tour{height:calc(100dvh - 76px);gap:6px;grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr) auto auto;grid-template-areas:"prog" "head" "vis" "ans" "nav";align-items:stretch}
  .prog .pl,.prog .prog-sum{display:none}
  .t-head{border-radius:var(--r);padding:10px 12px;gap:6px;border-top-width:4px}
  .t-head h2{font-size:16px}
  .t-head .say{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13.5px}
  .t-head .earlier,.t-head .facts,.t-head .after,.t-head details.more{display:none}
  .t-head .chips:has(.status) .status{display:none}
  .t-head .rowgap{flex-wrap:nowrap;overflow:hidden;gap:4px}
  .t-head .rowgap [data-act="history"]{display:none}
  .say-more,.note-btn,.round-chip{display:inline-flex}
  .t-head .rowgap .btn{min-height:32px;padding-block:2px;font-size:12.5px;white-space:nowrap}
  @media (pointer:coarse){.t-head .rowgap .btn{min-height:44px}}
  .t-ans{margin-top:0;border-top:1px solid var(--line);border-radius:var(--r);padding:8px 10px;gap:6px}
  .t-ans .explain,.t-ans .tools{display:none}
  .t-ans .qprompt{font-size:12.5px}
  .tiles{grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:6px}
  .tile{min-height:46px;padding:7px 9px;font-size:13.5px;gap:7px}
  .tile .dot{width:26px;height:26px}
  .t-vis{grid-template-rows:auto minmax(0,1fr);gap:6px;min-height:0;overflow:hidden}
  .ptabs{display:flex;gap:4px;background:var(--sunk);border:1px solid var(--line);border-radius:10px;padding:3px}
  .ptabs button{flex:1;border:0;background:none;border-radius:7px;padding:4px 2px;font:600 11.5px var(--sans);color:var(--ink2);cursor:pointer;display:grid;justify-items:center;gap:2px;min-height:44px}
  .ptabs button[aria-pressed="true"]{background:var(--surf);color:var(--ac)}
  .slots{min-height:0;overflow:hidden;display:grid}
  .slots .slot{display:none;min-height:0}
  .slots .slot.shown{display:grid;grid-template-rows:auto minmax(0,1fr)}
  .slots .slot.shown .slot-body{display:block;overflow:auto;min-height:0;padding:8px}
  .slots .slot .minbtn,.right-head{display:none}
  .slots .app{zoom:.6;max-width:280px}
  .slots .slot-head{padding:3px 8px}
  .t-nav{padding-top:6px}
}

/* overview */
.ov{max-width:900px;margin:0 auto;display:grid;gap:14px}
.brief{background:var(--surf);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:grid;gap:10px}
.brief h2{font-size:clamp(20px,3.6cqi,25px);letter-spacing:-.015em}
.brief .task{font-size:15px;color:var(--ink2)}
.after{font-size:13.5px;color:var(--mut)}
.m-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.c-sec{font:600 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--sc);margin:6px 0 -4px;display:flex;gap:8px;align-items:center}
.c-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.c-item{background:var(--surf);border:1px solid var(--line);border-left:4px solid var(--sc,var(--line));border-radius:var(--r);padding:14px;display:grid;gap:10px}
.c-top{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.c-top h3{font-size:16px}
.c-top p{font-size:13.5px;color:var(--mut)}
.c-item details>summary{cursor:pointer;color:var(--ac);font-weight:600;font-size:13.5px;min-height:28px;display:inline-flex;align-items:center;gap:6px}
@media (pointer:coarse){.c-item details>summary{min-height:44px}}
.c-item details[open]>summary{margin-bottom:10px}
.pair{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:start}
@container (max-width:620px){.pair{grid-template-columns:1fr}.pair .proto-wrap{justify-content:flex-start}}

/* return, downloads, layers */
.sum-row{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid var(--line);background:var(--surf);border-radius:10px;padding:9px 12px;font-size:14px;flex-wrap:wrap}
.sum-row .v{font-weight:600;display:inline-flex;gap:6px;align-items:center}
.sum-row .v.open{color:var(--mut);font-weight:500}
.sendnote{font-size:13px;color:var(--mut)}
.dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@container (max-width:620px){.dl{grid-template-columns:1fr}}
.dlf{border:1px solid var(--line);border-radius:12px;background:var(--surf);padding:10px 12px;display:grid;gap:5px;align-content:start}
.dlf h4{font-size:14px;display:flex;gap:7px;align-items:center}
.dlf p{font-size:12.5px;color:var(--mut)}
.included{display:flex;flex-wrap:wrap;gap:6px}
.included span{font-size:12.5px;padding:4px 9px;border-radius:99px;background:var(--ok-bg);color:var(--ok);font-weight:600;display:inline-flex;gap:5px;align-items:center}
.preview{border:1px solid var(--line);border-radius:12px;background:var(--surf);overflow:hidden}
.preview-head{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line);font:600 12px var(--mono);color:var(--mut);flex-wrap:wrap}
.preview pre{margin:0;padding:12px;max-height:300px;overflow:auto;font:12px/1.55 var(--mono);white-space:pre-wrap;color:var(--ink)}
.addmissing{border:1px dashed var(--line2);border-radius:10px;padding:12px;display:grid;gap:8px;background:var(--surf)}
.addmissing input,.addmissing textarea{width:100%;border:1px solid var(--line2);border-radius:9px;padding:9px 11px;font:14px var(--sans);background:var(--surf);color:var(--ink)}
.added{display:grid;gap:6px}
.added>div{border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:var(--surf);font-size:14px;display:flex;gap:8px;justify-content:space-between;align-items:center}
.layer{position:fixed;inset:0;z-index:40;background:var(--bg);display:grid;grid-template-rows:auto minmax(0,1fr)}
.layer-head{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--surf);flex-wrap:wrap}
.layer-head h3{font-size:16px;display:flex;gap:8px;align-items:center}
.layer-body{overflow:auto;padding:14px;display:grid;gap:12px;align-content:start;grid-auto-rows:max-content}
.zoom{display:inline-flex;gap:4px;align-items:center}
.zoom output{font:600 12px var(--mono);min-width:42px;text-align:center;color:var(--mut)}
.gallery{display:flex;gap:18px;overflow-x:auto;padding:6px 2px 12px;align-items:flex-start}
.gcard{flex:none;display:grid;gap:8px;justify-items:center;width:250px}
.gcard .app{max-width:250px;min-height:430px}
.gcard p{font-size:13px;font-weight:600;display:flex;gap:6px;align-items:center}
.gcard.now .app{border-color:var(--ac);box-shadow:0 0 0 3px var(--ac-bg)}
.gcard .step{font:700 11px var(--mono);color:var(--on-ac);background:var(--ac);border-radius:50%;width:20px;height:20px;display:grid;place-items:center}
.sheet-layer{position:fixed;inset:0;z-index:45;background:rgba(10,8,18,.45);display:flex;align-items:flex-end}
.sheet-layer .sh{background:var(--surf);width:100%;max-height:85%;overflow:auto;border-radius:18px 18px 0 0;padding:14px 16px 18px;display:grid;gap:10px}
.sheet-layer .sh h3{font-size:16px;display:flex;gap:8px;align-items:center}
@container (max-width:700px){.sheet-layer .tools,.sheet-layer .explain{display:flex}.sheet-layer .explain{display:grid}}
#footnote{font-size:12.5px;color:var(--mut);margin-top:14px}
#save-warning{border:1px solid var(--bad);border-left-width:4px;padding:12px;color:var(--ink);background:var(--surf);overflow-wrap:anywhere;margin:8px 0}
.made{display:flex;align-items:center;gap:7px;margin:18px 0 0;font-size:12.5px;color:var(--mut)}
.made svg{width:16px;height:16px;flex:none;color:var(--ac)}
.made a{color:inherit;text-underline-offset:2px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head><body class="at-start">
${SPRITE}
<a class="skip" href="#main">Skip to the question</a>
<div class="wrap">
<section id="start" aria-labelledby="start-h">
  <p class="eyebrow">${I('flag', 'sm')}Let me explain${view ? ` · round ${view.round}` : ''}</p>
  <h1 id="start-h">${esc(review.title)}</h1>
  <p class="no-script">This page needs a web browser to answer. A phone's file preview shows it but cannot run it: open the file in a browser app such as Chrome or Safari, or on a computer.</p>
  <ol id="start-cards" class="start-cards">${startCards}</ol>
  <div id="static-answers"></div>
  <button class="btn pri" type="button" id="start-review">Start${I('right')}</button>
</section>
<div id="topbar">
  <button type="button" id="start-mini">${I('flag')}Let me explain<b>· ${esc(review.title)}</b><span class="more">Show</span></button>
  <div class="seg" role="group" aria-label="View"><button type="button" id="mode-tour" data-mode="tour" aria-pressed="true">${I('flag', 'sm')}Tour</button><button type="button" id="mode-overview" data-mode="overview" aria-pressed="false">${I('list', 'sm')}Overview</button></div>
</div>
<p id="save-warning" role="alert" hidden></p>
<main id="main"></main>
<p class="note" id="footnote">Answers save in this browser as you go. Downloading saves a file; nothing is sent from this page.</p>
<p class="made">${mark ? `<svg viewBox="0 0 64 64" aria-hidden="true">${mark}</svg>` : ''}Made with <a href="https://github.com/shyhunter/LetMeShowYouSomething" target="_blank" rel="noopener noreferrer">LetMeShowYouSomething</a></p>
</div>
<div id="layer-root"></div>
<p id="announce" class="skip" aria-live="polite"></p>

<script>
// D076 — the page as it arrived, before anything is drawn: the answered HTML download saves this whole
// page with the answers written into SEED, so the file shows everything, not a summary.
const PAGE = '<!doctype html>\\n' + document.documentElement.outerHTML;
// Taken after PAGE, so a downloaded copy opened without scripts still shows what needs them.
document.documentElement.classList.add('js');
const REVIEW = ${embed(review)};
const SEED = null;
const HISTORY = ${embed(history)};
${builder}
${drawer}
${partsLib}
${diagrams}

// An exported copy keeps its own answers apart from this browser's own, so opening one overwrites nothing.
const LS = 'letmeshowyousomething:' + REVIEW.id + ':${fingerprint}' + (SEED ? ':copy:' + SEED.exportedAt : '');
let store = { verdicts:{}, notes:{}, added:[], choices:{}, requests:{}, layerVerdicts:{}, comments:[], pictures:[], proposals:[] };
if (SEED) { const { exportedAt, ...answers } = SEED; store = Object.assign(store, answers); }
try { const raw = localStorage.getItem(LS); if (raw) store = Object.assign(store, JSON.parse(raw)); } catch {}
// Answers are kept in this browser as you go. When it cannot keep them all (pictures take room), say so:
// downloading keeps everything, and nothing is lost silently.
const save = () => { try { localStorage.setItem(LS, JSON.stringify(store)); return true; }
  catch { const f = document.getElementById('save-warning'); if (f) { f.hidden = false; f.textContent = 'This browser cannot keep all your answers (pictures take room). Your current answers are still here. Download a copy on the last step before leaving.'; } return false; } };

const $ = (s) => document.querySelector(s);
const I = (name, c) => '<svg class="ic ' + (c || '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>';
// #77 — every id an answer can have or is still pointed at by (a removed comment's proposals keep its
// id), so a new one never reuses a carried item's or inherits another's; a removed answer takes its
// pictures with it.
const answerIds = () => [...REVIEW.items.map(i => i.id), ...store.added.map(a => a.id), ...(store.comments || []).map(c => c.id),
  ...(store.proposals || []).map(p => p.comment)];
const dropPictures = (id) => { store.pictures = (store.pictures || []).filter(p => p.on !== id); };
const OPTS = REVIEW.verdictSet.options;
// #54 — an approval is answered approve or decline, never with the verdict set: agreeing is not permitting.
const APPROVAL_OPTS = [{ value: 'approve', label: 'Approve', tone: 'positive' }, { value: 'decline', label: 'Decline', tone: 'negative' }];
const optsFor = (it) => (it.approval ? APPROVAL_OPTS : OPTS);
const TILE = { positive: ['t-ok', 'check'], caution: ['t-warn', 'half'], negative: ['t-bad', 'x'], neutral: ['t-neut', 'help'] };

// #60 — pictures on a note. The page redraws each one, at most 1600 px, and saves it again: hidden
// details such as a photo's location are gone, and the size stays small enough to send.
const PIC_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const PIC_MAX = 1024 * 1024, PIC_TOTAL = 5 * 1024 * 1024, PIC_COUNT = 10;
const picBytes = (p) => Math.floor(p.data.length * 3 / 4);
const picSrc = (p) => PIC_TYPES.includes(p.type) && /^[A-Za-z0-9+/]+={0,2}$/.test(p.data) ? 'data:' + p.type + ';base64,' + p.data : '';
function picsHtml(on){
  return '<div class="pics" data-pics="' + esc(on) + '">' + (store.pictures || []).filter(p => p.on === on).map(p => '<figure class="pic"><img alt="Your picture" src="' + picSrc(p)
    + '" width="' + (+p.width) + '" height="' + (+p.height) + '"><button class="btn small" type="button" data-unpic="' + esc(p.id) + '">' + I('x', 'sm') + 'Remove picture</button></figure>').join('')
    + '<span class="pic-msg" aria-live="polite"></span></div>';
}
async function addPicture(on, file){
  const msg = (t) => { const m = document.querySelector('[data-pics="' + CSS.escape(on) + '"] .pic-msg'); if (m) m.textContent = t; };
  if (!file || !PIC_TYPES.includes(file.type)) return msg('Only PNG, JPEG or WebP pictures.');
  if ((store.pictures || []).length >= PIC_COUNT) return msg('At most ' + PIC_COUNT + ' pictures in one answer.');
  let bmp; try { bmp = await createImageBitmap(file); } catch { return msg('That file could not be read as a picture.'); }
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/webp', 0.82);
  if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', 0.85);
  const type = url.slice(5, url.indexOf(';')), data = url.slice(url.indexOf(',') + 1);
  const p = { on, type, width: c.width, height: c.height, data };
  if (picBytes(p) > PIC_MAX) return msg('That picture is too large, even made smaller. Crop it and try again.');
  if ((store.pictures || []).reduce((n, x) => n + picBytes(x), picBytes(p)) > PIC_TOTAL) return msg('Your pictures together are too large. Remove one first.');
  p.id = 'picture-' + (Math.max(0, ...(store.pictures || []).map(x => +String(x.id).split('-')[1] || 0)) + 1);
  (store.pictures = store.pictures || []).push(p); save();
  document.querySelectorAll('[data-pics="' + CSS.escape(on) + '"]').forEach(box => { box.outerHTML = picsHtml(on); });
  msg('Added. Re-saved without hidden details such as location.');
}
const picInput = Object.assign(document.createElement('input'), { type: 'file', id: 'picfile', accept: PIC_TYPES.join(','), hidden: true });
const picLabel = Object.assign(document.createElement('label'), { htmlFor: 'picfile', className: 'skip', textContent: 'Choose a picture' });
document.body.append(picLabel, picInput);
let picFor = null;
picInput.addEventListener('change', () => { const f = picInput.files[0]; picInput.value = ''; if (f && picFor) addPicture(picFor, f); });
document.addEventListener('paste', e => {
  const t = e.target.closest('textarea[data-note]'); if (!t) return;
  const f = [...(e.clipboardData?.files || [])].find(x => PIC_TYPES.includes(x.type)); if (!f) return;
  e.preventDefault(); addPicture(t.dataset.note, f);
});

// ── the review, as steps ──
const FLOW = REVIEW.flow || null;
const screenOf = (id) => FLOW && FLOW.screens.find(s => s.id === id);
const screenTitle = (id) => (screenOf(id) || {}).title || id;
const itemById = (id) => REVIEW.items.find(i => i.id === id);
// The progress bar's parts, grouped by the same code that wrote the cards: a choose-one section is one
// question, its options the answers.
const SEGS = reviewParts(REVIEW).map(p => ({ label: p.label, sec: p.sec, icon: p.icon, color: p.color,
  steps: p.sec && p.sec.mode === 'choose-one' ? [{ kind: 'choose', sec: p.sec, items: p.items }] : p.items.map(it => ({ kind: 'item', it })) }));
SEGS.forEach(s => s.steps.forEach(x => { x.seg = s; }));
// #82 — the rounds before this one, and what became of each question since: derived, never invented.
const VIEW = roundsView(REVIEW, HISTORY && HISTORY.rounds);
const tagOf = (s) => VIEW && s.kind === 'item' ? VIEW.tags[s.it.id] : null;
const tagChip = (t) => t ? '<span class="tag ' + ROUND_TAGS[t][0] + '">' + I(ROUND_TAGS[t][2], 'sm') + ROUND_TAGS[t][1] + '</span>' : '';
const day = (t) => { const d = new Date(t); return t && !isNaN(d) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''; };
function settledHtml(){
  if (!VIEW || !VIEW.settled.length) return '';
  return '<details class="settled"><summary>' + I('settled', 'sm') + 'Settled in earlier rounds (' + VIEW.settled.length + ')</summary><ul>'
    + VIEW.settled.map(x => '<li>' + esc(x.title) + ': <b>' + esc(x.label) + '</b> · round ' + x.round + '</li>').join('') + '</ul></details>';
}
const STEPS = SEGS.flatMap(s => s.steps);
const stepItems = (s) => s.kind === 'choose' ? s.items : [s.it];
const stepAnswer = (s) => s.kind === 'choose' ? store.choices[s.sec.id] : store.verdicts[s.it.id];
const stepTitle = (s) => s.kind === 'choose' ? (s.sec.label || s.sec.id) : s.it.title;
const answerLabel = (s) => { const v = stepAnswer(s); if (!v) return '';
  return s.kind === 'choose' ? (itemById(v) || {}).title || v : (optsFor(s.it).find(o => o.value === v) || {}).label || v; };
const answeredCount = () => STEPS.filter(stepAnswer).length;

// The diagrams: a flow's own chart first, then the review's, the focus one first.
// #82 — steps settled in earlier rounds stay on the map, marked answered, so a later round's flow reads whole.
const EARLIER_STEPS = (() => {
  if (!FLOW || !HISTORY) return [];
  const have = new Set(REVIEW.items.map(i => i.id)), screens = new Set(FLOW.screens.map(x => x.id)), latest = {};
  for (const r of HISTORY.rounds) for (const it of r.review.items || []) if (it.step) latest[it.id] = it;
  return Object.values(latest).filter(it => !have.has(it.id) && screens.has(it.step.from) && it.step.outcomes.every(o => screens.has(o.to)));
})();
const DIAGRAMS = (FLOW ? [flowAsDiagram(EARLIER_STEPS.length ? { ...REVIEW, items: REVIEW.items.concat(EARLIER_STEPS) } : REVIEW)] : []).concat(REVIEW.diagrams || []);
if (REVIEW.focus) { const k = DIAGRAMS.findIndex(d => d.id === REVIEW.focus); if (k > 0) DIAGRAMS.unshift(DIAGRAMS.splice(k, 1)[0]); }
const mapFor = (s) => (s && DIAGRAMS.find(d => (d.nodes || []).some(n => stepItems(s).some(it => n.step === it.id)))) || DIAGRAMS[0] || null;

// ── the view: where you are lives in memory only (D003); the view and minimised places in this browser ──
const st = { mode: 'tour', phase: 'start', cur: 0, min: new Set(), ptab: 'map', layer: null, zoom: 1, preview: null, marking: null, missing: false, lmin: new Set() };
try { const v = JSON.parse(localStorage.getItem(LS + ':view') || '{}'); if (v.mode === 'overview') { st.mode = 'overview'; st.phase = 'q'; } if (v.min) st.min = new Set(v.min); if (v.ptab) st.ptab = v.ptab; } catch {}
const saveView = () => { try { localStorage.setItem(LS + ':view', JSON.stringify({ mode: st.mode, min: [...st.min], ptab: st.ptab })); } catch {} };

// ── pieces ──
const STATUS = { exists: ['st-known', 'In the app', 'check'], proposed: ['st-planned', 'Planned', 'clock'], suggested: ['st-suggested', 'Suggestion', 'bulb'] };
function chipsHtml(s){
  const c = [];
  if (s.kind === 'choose') c.push(['st-question', 'Your call', 'help']);
  else if (s.it.approval) { const r = s.it.approval.risk; c.push(['st-risk-' + (['high', 'medium', 'low'].includes(r) ? r : 'medium'), r === 'high' ? 'High risk' : r === 'low' ? 'Low risk' : 'Medium risk', r === 'low' ? 'check' : 'alert']); }
  else if (s.it.step) c.push(STATUS[s.it.step.status || 'proposed'] || STATUS.proposed);
  else if (s.seg.sec && s.seg.sec.kind === 'challenge') c.push(['st-question', 'Where I could be wrong', 'alert']);
  const tag = tagChip(tagOf(s));
  return c.length || tag ? '<span class="chips">' + tag + c.map(([k, t, i]) => '<span class="status ' + k + '">' + I(i, 'sm') + esc(t) + '</span>').join('') + '</span>' : '';
}
function sayFor(s){
  if (s.kind === 'choose') return esc(s.sec.description || (s.sec.recommended ? s.sec.recommended.why : '') || 'Choose one.');
  const it = s.it, parts = [];
  if (it.summary || it.body) parts.push(esc(it.summary || it.body));
  if (it.step && it.step.goal) parts.push('Goal: ' + esc(it.step.goal));
  return parts.join(' ') || esc(it.title);
}
function subFor(s){
  if (s.kind === 'choose') return 'Choose one of ' + s.items.length;
  const it = s.it;
  if (it.step) return esc(screenTitle(it.step.from)) + ' → ' + it.step.outcomes.map(o => esc(o.label || screenTitle(o.to))).join(', ');
  return it.summary && it.body ? '' : '';
}
function earlierHtml(s){
  if (s.kind !== 'item') return '';
  const e = VIEW && VIEW.earlier[s.it.id];
  const round = e ? '<div class="earlier"><b class="h">' + I('history', 'sm') + 'Round ' + e.round + '</b>'
    + (e.added ? '<p>' + I('user', 'sm') + ' You added: <b>' + esc(e.added.title) + '</b>' + (e.added.body ? ' · "' + esc(e.added.body) + '"' : '') + '</p>'
      : '<p>' + I('user', 'sm') + ' You: <b>' + esc(e.label || 'Not answered') + '</b>' + (e.response && e.response.note ? ' · "' + esc(e.response.note) + '"' : '') + '</p>')
    + (s.it.reply ? '<p>' + I('bot', 'sm') + ' Me: ' + esc(s.it.reply) + '</p>' : '') + '</div>' : '';
  return round + (s.it.affects || []).filter(a => !(VIEW && a.decision && a.decision.review === VIEW.prev.review.id)).map(a => '<div class="earlier"><b class="h">' + I('history', 'sm') + 'Earlier · ' + esc(a.effect) + '</b><p>' + I('user', 'sm') + ' You answered "' + esc(a.decision.title) + '": <b>'
    + esc(a.decision.verdict) + '</b></p><p>' + I('bot', 'sm') + ' ' + esc(a.why) + '</p></div>').join('');
}
function tilesHtml(s, compact){
  if (s.kind === 'choose') {
    const rec = s.sec.recommended && s.sec.recommended.itemId;
    return '<p class="qprompt">' + I('branch', 'sm') + 'Your pick</p><div class="tiles' + (compact ? ' compact' : '') + '" role="radiogroup" aria-label="Your pick: ' + esc(stepTitle(s)) + '">'
      + s.items.map(it => '<label class="tile t-acc"><input type="radio" name="c-' + esc(s.sec.id) + '" value="' + esc(it.id) + '" data-choice="' + esc(s.sec.id) + '"' + (store.choices[s.sec.id] === it.id ? ' checked' : '')
      + '><span class="dot">' + I(it.id === rec ? 'star' : 'branch', 'sm') + '</span>' + esc(it.title) + '</label>').join('') + '</div>';
  }
  const it = s.it, v = store.verdicts[it.id];
  return '<p class="qprompt">' + I(it.approval ? 'shield' : 'help', 'sm') + (it.approval ? 'Do you approve this?' : 'Your answer') + '</p><div class="tiles' + (compact ? ' compact' : '') + '" role="radiogroup" aria-label="' + (it.approval ? 'Approve or decline' : 'Verdict for') + ': ' + esc(it.title) + '">'
    + optsFor(it).map(o => { const [k, icon] = TILE[o.tone] || TILE.neutral;
      return '<label class="tile ' + k + '"><input type="radio" name="v-' + esc(it.id) + '" value="' + esc(o.value) + '" data-item="' + esc(it.id) + '"' + (v === o.value ? ' checked' : '')
        + '><span class="dot">' + I(it.approval && o.value === 'approve' ? 'shield' : icon, 'sm') + '</span>' + esc(o.label) + '</label>'; }).join('') + '</div>';
}
// D060, #105 — the reviewer asks back; the request is read when the file reaches the agent.
const ASKS = [['example', 'bulb', 'Show me an example', 'The agent sees this once you send the file back, and shows a real example in its next round.'],
  ['explain', 'repeat', 'Explain it differently', 'The agent sees this once you send the file back, and explains it again, differently, in its next round.']];
// The note, a picture, marks on the map and asking back come after an answer.
function explainHtml(s){
  const it = s.kind === 'choose' ? itemById(store.choices[s.sec.id]) : s.it;
  const v = stepAnswer(s);
  if (!it || (!v && !store.notes[it.id] && !(store.pictures || []).some(p => p.on === it.id))) return '';
  const o = s.kind === 'item' ? optsFor(it).find(x => x.value === v) : null;
  const wants = !!(o && o.tone !== 'positive');
  const d = mapFor(s), canMark = d && wants;
  const marks = (store.comments || []).filter(c => c.item === it.id);
  return '<div class="explain"><label class="qprompt" for="n-' + esc(it.id) + '">' + I('edit', 'sm') + (wants ? 'What should be different?' : 'Anything to add? (optional)') + '</label>'
    + '<textarea id="n-' + esc(it.id) + '" data-note="' + esc(it.id) + '" placeholder="' + (wants ? 'Say what you expected instead. Your words are what gets acted on.' : 'A note, if you have one.') + '">' + esc(store.notes[it.id] || '') + '</textarea>'
    + '<div class="tools"><button type="button" class="btn small" data-picadd="' + esc(it.id) + '" title="It goes into the file you send back.">' + I('image', 'sm') + 'Add a picture</button>'
    + (canMark ? '<button type="button" class="btn small" data-act="mark" data-for="' + esc(it.id) + '" aria-pressed="' + (st.marking === it.id) + '">' + I('pin', 'sm') + 'Mark it on the map</button>' : '')
    + ASKS.map(([k, icon, label, tip]) => '<button type="button" class="btn small" data-ask="' + k + '" data-for="' + esc(it.id) + '" aria-pressed="' + !!(store.requests[it.id] || {})[k] + '" title="' + tip + '" aria-description="' + tip + '">' + I(icon, 'sm') + label + '</button>').join('') + '</div>'
    + marks.map(c => '<div class="mark"><p>' + I('pin', 'sm') + '<span>On the map: <b>' + esc(c.label) + '</b></span><button type="button" class="btn icon small" data-unmark="' + esc(c.id) + '" aria-label="Remove the mark on ' + esc(c.label) + '">' + I('x', 'sm') + '</button></p>'
      + '<label class="skip" for="cm-' + esc(c.id) + '">What about ' + esc(c.label) + '?</label><textarea id="cm-' + esc(c.id) + '" data-comment="' + esc(c.id) + '" placeholder="What about this part?">' + esc(c.note || '') + '</textarea></div>').join('')
    + picsHtml(it.id) + '</div>';
}

// The map: the diagram this question is on, with "you are here" and what you have answered.
function mapHtml(s, zoom, d){
  d = d || mapFor(s); if (!d) return '';
  const on = s ? stepItems(s).map(i => i.id) : [];
  const it = s && s.kind === 'item' ? s.it : null;
  const answered = new Set(REVIEW.items.filter(i => store.verdicts[i.id] || Object.values(store.choices).includes(i.id)).map(i => i.id).concat(EARLIER_STEPS.map(i => i.id)));
  const svg = drawDiagram(d, { plain: true, selected: on[0], here: it && it.step && d.id === 'user-flow' ? 'screen:' + it.step.from : undefined, answered, commentable: !!st.marking });
  let out = svg;
  if (on.length > 1) out = out.replace(/<g data-node="([^"]*)" class="dg-node([^"]*)" data-step="([^"]*)"/g, (m, n, c, stp) => on.includes(stp) && !c.includes('dg-selected') ? m.replace('class="dg-node', 'class="dg-node dg-selected') : m);
  const marked = (store.comments || []).filter(c => c.diagram === d.id && c.node !== undefined).map(c => c.node);
  for (const n of marked) out = out.split('<g data-node="' + escSvg(n) + '" class="dg-node').join('<g data-node="' + escSvg(n) + '" class="dg-node dg-marked');
  if (zoom) out = out.replace(/ width="(\\d+(?:\\.\\d+)?)" height="(\\d+(?:\\.\\d+)?)"/, (m, w, h) => ' width="' + Math.round(w * zoom) + '" height="' + Math.round(h * zoom) + '"');
  return (st.marking ? '<p class="markhint">' + I('pin', 'sm') + 'Tap the part you mean.</p>' : '') + '<div class="map-scroll' + (st.marking ? ' marking' : '') + '" data-map="' + esc(d.id) + '">' + out + '</div>'
    + '<div class="legend"><span><i class="done"></i>Answered</span><span><i class="on"></i>You are here</span>' + (marked.length ? '<span><i class="pin"></i>Marked by you</span>' : '') + '</div>';
}

// The prototype: a flow's screen as the app will show it, the main button at the bottom.
function appHtml(screenId, on){
  const s = screenOf(screenId); if (!s) return '';
  const blocks = s.blocks || [], header = blocks.find(b => b.type === 'header');
  const ctx = { targets: new Set(on ? [on] : []), still: true };
  const foot = [], body = []; let sheet = '';
  const btn = (id, label, i) => '<div class="' + (i ? 'sec' : 'pri') + (id === on ? ' on' : '') + '">' + esc(label) + '</div>';
  for (const b of blocks) {
    if (b.type === 'header') { (b.actions || []).forEach(a => foot.push([a.id, a.label])); continue; }
    if (b.type === 'button') { foot.push([b.id, b.label]); continue; }
    if (b.type === 'dialog') { sheet = '<div class="scrim"><div class="sheet"><span class="grab"></span><h5>' + esc(b.title) + '</h5>' + (b.text ? '<span class="mut">' + esc(b.text) + '</span>' : '') + (b.actions || []).map((a, i) => btn(a.id, a.label, i)).join('') + '</div></div>'; continue; }
    if (b.type === 'banner') { const ring = b.tone === 'positive' ? ['ok-ring', 'check'] : b.tone === 'negative' ? ['bad-ring', 'alert'] : ['warn-ring', 'clock'];
      body.push('<div class="hero"><span class="ring ' + ring[0] + '">' + I(ring[1]) + '</span><h5>' + esc(b.text) + '</h5>' + (b.because ? '<span class="mut">' + esc(b.because) + '</span>' : '') + (b.canNow ? '<span class="mut">' + esc(b.canNow) + '</span>' : '') + '</div>'); continue; }
    if (b.type === 'toast') { body.push('<div class="note">' + I('check', 'sm') + '<span>' + esc(b.text) + '</span></div>'); continue; }
    body.push(drawBlock(b, ctx));
  }
  const primary = foot.findIndex(([id]) => id !== (header && header.actions || []).map(a => a.id).find(x => x === id));
  const ordered = primary > 0 ? [foot[primary]].concat(foot.filter((_, i) => i !== primary)) : foot;
  return '<div class="app" role="img" aria-label="The screen: ' + esc(s.title) + '"><div class="sb"><span>9:41</span><span>' + I('wifi', 'sm') + I('battery', 'sm') + '</span></div>'
    + '<div class="bar">' + (header && header.back || screenId !== FLOW.start ? I('left') : '<span></span>') + '<b>' + esc(header ? header.title : s.title) + '</b>' + I('dots') + '</div>'
    + '<div class="body">' + body.join('') + '</div><div class="foot">' + ordered.map(([id, label], i) => btn(id, label, i)).join('') + '</div>' + sheet + '</div>';
}
function galleryHtml(nowScreen){
  if (!FLOW) return '';
  return '<div class="gallery">' + FLOW.screens.map((s, i) => '<div class="gcard' + (s.id === nowScreen ? ' now' : '') + '" data-screen="' + esc(s.id) + '">' + appHtml(s.id) + '<p><span class="step">' + (i + 1) + '</span>' + esc(s.title) + '</p></div>').join('') + '</div>';
}
const RISK = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' };
function consoleHtml(a){
  return '<div class="console"><span class="c"># dry run: nothing happens until you approve</span>'
    + String(a.preview || '').split('\\n').filter(Boolean).map(l => '<span class="p">$ ' + esc(l) + '</span>').join('')
    + '<span class="w">! will run: ' + esc(a.action) + '</span><span>  affects: ' + esc(a.scope) + '</span><span class="' + (a.risk === 'high' ? 'r' : 'c') + '">  ' + esc(RISK[a.risk] || a.risk) + '</span></div>';
}
const exp = (tone, icon, head, text) => '<div class="exp ' + tone + '"><span class="ei">' + I(icon, 'sm') + '</span><b>' + head + '</b><span>' + text + '</span></div>';
function examplesRows(list){
  return (list || []).map(x => exp('info', 'globe', 'Done before · ' + esc(x.name), esc(x.what || '') + (x.shows ? ' What people see: ' + esc(x.shows) + '.' : '')
    + ' ' + (x.source ? '<a href="' + esc(x.source) + '" target="_blank" rel="noopener noreferrer">' + esc(String(x.source).replace(/^https?:\\/\\//, '').split('/')[0]) + '</a>' : '<span class="unverified">unverified · I could not find a source</span>'))).join('');
}
function protoFor(s){
  if (!s) return '';
  if (s.kind === 'item' && s.it.approval) return consoleHtml(s.it.approval);
  if (s.kind === 'item' && s.it.step && FLOW) return '<div class="proto-wrap">' + appHtml(s.it.step.from, s.it.step.on) + '</div>';
  return '';
}
function expectedFor(s){
  if (!s) return '';
  if (s.kind === 'choose') { const rec = s.sec.recommended && s.sec.recommended.itemId;
    return '<div class="expected">' + s.items.map(it => exp(it.id === rec ? 'ok' : 'info', it.id === rec ? 'star' : 'branch', esc(it.title) + (it.id === rec ? ' · recommended' : ''), esc(it.summary || it.body || ''))).join('') + '</div>'; }
  const it = s.it, rows = [];
  if (it.step) for (const o of it.step.outcomes) rows.push(exp(o.because ? 'fail' : 'ok', o.because ? 'x' : 'check', esc(o.label || 'Result'),
    esc(o.effect) + (o.because ? ' Why: ' + esc(o.because) + '.' : '') + (o.canNow ? ' You can now: ' + esc(o.canNow) + '.' : '') + ' Leads to: ' + esc(screenTitle(o.to)) + '.'));
  if (it.approval) { const a = it.approval;
    rows.push(exp('info', 'shield', 'What I will do', esc(a.action)), exp('info', 'layers', 'Affects', esc(a.scope)), exp(a.risk === 'high' ? 'fail' : a.risk === 'low' ? 'ok' : 'info', 'alert', 'Risk', esc(RISK[a.risk] || a.risk))); }
  for (const f of REVIEW.fields || []) if ((it.fields || {})[f.key]) rows.push(exp(f.tone === 'negative' ? 'fail' : f.tone === 'positive' ? 'ok' : 'info', f.tone === 'negative' ? 'x' : f.tone === 'positive' ? 'check' : 'info', esc(f.label), esc(it.fields[f.key])));
  const ex = examplesRows(it.examples);
  return rows.length || ex ? '<div class="expected">' + rows.join('') + ex + '</div>' : '';
}
const KIND = { component: 'Runs', external: 'Calls out', guard: 'Checks' }, CHANGE = { insert: 'Adds', update: 'Changes', delete: 'Removes' };
function buildFor(s){
  if (!s) return '';
  if (s.kind === 'choose') { const rec = s.sec.recommended && s.sec.recommended.itemId;
    return '<div class="options">' + s.items.map(it => '<button type="button" class="opt" data-choose="' + esc(s.sec.id) + '" data-opt="' + esc(it.id) + '" aria-pressed="' + (store.choices[s.sec.id] === it.id) + '">'
      + (it.id === rec ? '<span class="rec">' + I('star', 'sm') + 'Recommended</span>' : '') + '<h4>' + esc(it.title) + '</h4>' + (it.summary ? '<p>' + esc(it.summary) + '</p>' : '')
      + '<dl>' + (REVIEW.fields || []).filter(f => (it.fields || {})[f.key]).map(f => '<dt>' + I(f.tone === 'negative' ? 'alert' : 'info', 'sm') + esc(f.label) + '</dt><dd>' + esc(it.fields[f.key]) + '</dd>').join('') + '</dl></button>').join('') + '</div>'
      + (rec && s.sec.recommended.why ? '<p class="sendnote">' + I('star', 'sm') + ' ' + esc(s.sec.recommended.why) + '</p>' : ''); }
  const it = s.it, li = [];
  if (it.step) for (const o of it.step.outcomes) {
    for (const e of o.system || []) li.push('<b>' + esc(KIND[e.kind] || e.kind) + '</b> ' + esc(e.name) + ' · ' + esc(e.status) + (e.ref ? ' <code>' + esc(e.ref) + '</code>' : '') + ' <span class="sendnote">(' + esc(o.label || 'Result') + ')</span>');
    for (const e of o.data || []) li.push('<b>' + esc(CHANGE[e.change] || e.change) + '</b> ' + esc(e.entity) + ((e.fields || []).length ? ': ' + e.fields.map(f => '<code>' + esc(f.name) + ': ' + (f.before !== undefined ? esc(f.before) + ' → ' : '') + (f.after !== undefined ? esc(f.after) : '—') + '</code>').join(' ') : '') + ' · ' + esc(e.status) + (e.ref ? ' <code>' + esc(e.ref) + '</code>' : '') + ' <span class="sendnote">(' + esc(o.label || 'Result') + ')</span>');
  }
  if (it.approval) { const end = new Date(it.approval.expiresAt);
    if (it.approval.preview) li.push('<code>' + esc(it.approval.preview) + '</code>');
    li.push('Valid until ' + esc(isNaN(end) ? it.approval.expiresAt : end.toLocaleString()) + '. After that, a yes no longer counts.', 'Your answer records what you want. I still ask for permission, in my own app, right before I act.'); }
  if (it.ref) li.push('<code>' + esc(it.ref) + '</code>');
  return li.length ? '<ul class="build">' + li.map(x => '<li>' + I('code', 'sm') + '<span>' + x + '</span></li>').join('') + '</ul>' : '';
}
function progressHtml(nowStep){
  const n = STEPS.length, a = answeredCount();
  const seg = (label, color, icon, done, total, now, jump) => '<button type="button" class="pseg' + (now ? ' now' : '') + '" style="--sc:' + color + ';--w:' + Math.max(total, 0.7) + '" data-jump="' + jump + '" aria-label="' + esc(label) + ': ' + done + ' of ' + total + ' done"' + (now ? ' aria-current="step"' : '') + '>'
    + '<span class="track"><i style="width:' + (total ? done / total * 100 : (done ? 100 : 0)) + '%"></i></span><span class="pl">' + I(icon, 'sm') + esc(label) + ' <small>' + (total ? done + '/' + total : '') + '</small></span></button>';
  return '<div class="prog"><div class="segs">' + seg('Let me explain', 'var(--s0)', 'flag', 1, 0, false, 'start')
    + SEGS.map(s => seg(s.label, s.color, s.icon, s.steps.filter(stepAnswer).length, s.steps.length, nowStep && nowStep.seg === s, 'q:' + STEPS.indexOf(s.steps[0]))).join('')
    + seg('Return', 'var(--s0)', 'send', 0, 0, st.phase === 'return', 'return') + '</div>'
    + '<p class="prog-sum" id="overview">' + (nowStep ? esc(nowStep.seg.label) + ' · ' : '') + a + ' of ' + n + ' answered' + (n - a ? ' · ' + (n - a) + ' open' : '') + '</p></div>';
}
const SLOTS = [['map', 'Map', 'map'], ['proto', 'Prototype', 'phone'], ['expected', 'What should happen', 'list'], ['build', "How I'd build it", 'code']];
function slotHtml(id, label, icon, i, body, sub){
  const min = st.min.has(id), shown = st.ptab === id;
  return '<section class="slot' + (min ? ' min' : '') + (shown ? ' shown' : '') + '" id="slot-' + id + '" data-slot="' + id + '"><div class="slot-head"><span class="num">' + (i + 1) + '</span><h3>' + I(icon, 'sm') + label + (sub ? ' <small>· ' + esc(sub) + '</small>' : '') + '</h3>'
    + (id === 'map' || id === 'proto' ? '<button type="button" class="btn icon small" data-act="expand" aria-label="Expand">' + I('expand', 'sm') + '</button>' : '')
    + '<button type="button" class="btn icon small minbtn" data-min="' + id + '" aria-label="' + (min ? 'Show' : 'Minimize') + ' ' + label + '" aria-expanded="' + !min + '">' + I(min ? 'plus' : 'minus', 'sm') + '</button></div>'
    + '<div class="slot-body">' + (body || '<p class="empty">' + I('info', 'sm') + 'Nothing here for this question</p>') + '</div></section>';
}
function slots(bodies, subs){
  subs = subs || {};
  const onlyProto = ['map', 'expected', 'build'].every(x => st.min.has(x)) && !st.min.has('proto');
  return '<div class="right-head"><span class="prog-sum">' + I('layers', 'sm') + ' The same four places on every question</span><div class="rowgap">'
    + '<button type="button" class="btn small' + (onlyProto ? ' pri' : '') + '" data-act="focus-proto" aria-pressed="' + onlyProto + '">' + I('eye', 'sm') + 'Prototype only</button><button type="button" class="btn small" data-act="focus-all">Show all</button></div></div>'
    + '<div class="ptabs" role="group" aria-label="What to show">' + SLOTS.map(([id, label, icon]) => '<button type="button" data-ptab="' + id + '" aria-pressed="' + (st.ptab === id) + '">' + I(icon, 'sm') + (id === 'expected' ? 'Should happen' : id === 'build' ? 'Build' : id === 'proto' ? 'Screen' : label) + '</button>').join('') + '</div>'
    + '<div class="slots">' + SLOTS.map(([id, label, icon], i) => slotHtml(id, label, icon, i, bodies[id], subs[id])).join('') + '</div>';
}
function summaryRows(){
  return STEPS.map(s => { const v = answerLabel(s);
    return '<div class="sum-row"><span>' + esc(stepTitle(s)) + '</span><span class="v' + (v ? '' : ' open') + '">' + (v ? I('check', 'sm') + esc(v) : I('open', 'sm') + 'Stays open') + '</span></div>'; }).join('');
}
function missingHtml(){
  const list = store.added || [];
  return (list.length ? '<div class="added"><p class="qprompt">' + I('plus', 'sm') + 'You added</p>' + list.map((a, i) => '<div><span><b>' + esc(a.title) + '</b>' + (a.body ? ' · ' + esc(a.body) : '') + '</span><button class="btn icon small" type="button" data-del="' + i + '" aria-label="Remove ' + esc(a.title) + '">' + I('x', 'sm') + '</button></div>').join('') + '</div>' : '')
    + (REVIEW.allowAddedItems === false ? '' : st.missing ? '<div class="addmissing"><label class="qprompt" for="at">' + I('plus', 'sm') + 'What is missing?</label><input id="at" placeholder="What is it about?"><label class="skip" for="ab">Tell me more</label><textarea id="ab" rows="2" placeholder="Tell me more (optional)"></textarea><div class="rowgap"><button type="button" class="btn" id="addbtn">Add it</button><button type="button" class="btn quiet" data-act="missing">Cancel</button></div></div>'
      : '<button type="button" class="btn quiet" data-act="missing">' + I('plus', 'sm') + 'Something missing? Add it</button>');
}

// #103 — every download holds everything: the JSON the agent checks, a readable report, this page answered.
function toMarkdown(){
  const out = buildFeedback(REVIEW, store), open = STEPS.filter(s => !stepAnswer(s)), L = ['# ' + REVIEW.title, ''];
  L.push(answeredCount() + ' of ' + STEPS.length + ' answered' + (open.length ? ', ' + open.length + ' still open' : ''), '');
  if (REVIEW.brief && (REVIEW.brief.question || REVIEW.brief.explains)) L.push('> ' + plain(REVIEW.brief.question || REVIEW.brief.explains), '');
  for (const g of SEGS) { L.push('## ' + g.label, '');
    for (const s of g.steps) { L.push('### ' + stepTitle(s), '- Your answer: ' + (answerLabel(s) || '_not answered, stays open_'));
      for (const it of stepItems(s)) {
        if (store.notes[it.id]) L.push('- Your note' + (s.kind === 'choose' ? ' on ' + it.title : '') + ': "' + store.notes[it.id] + '"');
        for (const [k, , label] of ASKS) if ((store.requests[it.id] || {})[k]) L.push('- You asked: ' + label);
        const pics = (store.pictures || []).filter(p => p.on === it.id).length; if (pics) L.push('- Pictures: ' + pics + ' (in the HTML and JSON files)');
        for (const c of (store.comments || []).filter(c => c.item === it.id && (c.note || '').trim())) L.push('- Marked on the map, ' + c.label + ': "' + c.note.trim() + '"');
      }
      L.push(''); } }
  if (open.length) L.push('## Still open', '', ...open.map(s => '- ' + stepTitle(s)), '');
  if ((out.addedItems || []).length) L.push('## Added by you', '', ...out.addedItems.map(a => '- ' + a.title + (a.body ? ': ' + a.body : '')), '');
  if (out.gaps.length) L.push('## Needs attention', '', ...out.gaps.map(g => '- ' + ((itemById(g) || {}).title || g)), '');
  if (VIEW) {
    if (VIEW.settled.length) L.push('## Settled in earlier rounds', '', ...VIEW.settled.map(x => '- ' + x.title + ': ' + x.label + ' (round ' + x.round + ')'), '');
    HISTORY.rounds.forEach((r, i) => {
      const next = i + 1 < HISTORY.rounds.length ? HISTORY.rounds[i + 1].review : REVIEW;
      L.push('## History · round ' + (i + 1) + (day(r.review.createdAt) ? ' (sent ' + day(r.review.createdAt) + (day(r.feedback.respondedAt) ? ', answered ' + day(r.feedback.respondedAt) : '') + ')' : ''), '');
      for (const x of (r.feedback.responses || []).concat((r.feedback.addedItems || []).map(a => ({ ...a, itemId: a.id, added: true })))) {
        const o = (r.review.verdictSet.options || []).concat(APPROVAL_OPTS).find(v => v.value === x.verdict);
        const c = (next.items || []).find(y => y.id === x.itemId || (y.affects || []).some(a => a.decision && a.decision.review === r.review.id && a.decision.itemId === x.itemId));
        L.push('- **' + (x.added ? 'You added: ' : '') + x.title + '**: ' + (o ? o.label : 'not answered') + ((x.note || x.body) ? ' · "' + (x.note || x.body) + '"' : '') + (c && c.reply ? '. Reply: ' + c.reply : c ? '. Asked again in round ' + (i + 2) : ''));
      }
      L.push('');
    });
  }
  return L.join('\\n');
}
// The answered page also carries its answers as plain text, shown only where no script runs (a phone's
// file preview). Line breaks become <br>, so no answer can start a line of the page (#78 reads the SEED line).
const flat = (t) => esc(t).replace(/\\r\\n|[\\r\\n\\u2028\\u2029]/g, '<br>');
function staticAnswers(){
  const rows = STEPS.map(s => { const v = answerLabel(s);
    return '<div class="sum-row"><span>' + flat(stepTitle(s)) + '</span><span class="v' + (v ? '' : ' open') + '">' + (v ? flat(v) : 'Stays open') + '</span>'
      + stepItems(s).map(it => (store.notes[it.id] || '').trim() ? '<p>' + flat(store.notes[it.id].trim()) + '</p>' : '').join('')
      + (store.comments || []).filter(c => stepItems(s).some(it => it.id === c.item) && (c.note || '').trim()).map(c => '<p>On the map, ' + flat(c.label) + ': ' + flat(c.note.trim()) + '</p>').join('') + '</div>'; }).join('');
  const added = (store.added || []).map(a => '<div class="sum-row"><span>Added: ' + flat(a.title) + '</span>' + (a.body ? '<p>' + flat(a.body) + '</p>' : '') + '</div>').join('');
  return '<div id="static-answers"><h2>The answers in this file</h2>' + rows + added + '</div>';
}
const htmlSeed = () => { const seed = JSON.stringify({ ...store, exportedAt: new Date().toISOString() }).replace(/[<\\u2028\\u2029]/g, (c) => '\\\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  return PAGE.replace(/^const SEED = .*$/m, () => 'const SEED = ' + seed + ';').replace('<div id="static-answers">' + '</div>', () => staticAnswers()); };
const saveAs = (text, type, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
function downloadsHtml(){
  const open = STEPS.length - answeredCount(), notes = Object.values(store.notes).filter(x => (x || '').trim()).length, added = (store.added || []).length;
  const inc = [answeredCount() + ' answers', open + ' still open', notes + ' note' + (notes === 1 ? '' : 's'), added + ' added by you']
    .concat(VIEW ? [(VIEW.round - 1) + (VIEW.round === 2 ? ' earlier round' : ' earlier rounds') + ' of history', VIEW.settled.length + ' settled earlier'] : []);
  const p = st.preview, txt = p === 'md' ? toMarkdown() : p === 'json' ? JSON.stringify(buildFeedback(REVIEW, store), null, 2) : p === 'html' ? 'The whole page, exactly as you see it, with your answers inside.\\nOpens in any browser, even offline. It holds:\\n\\n' + toMarkdown() : '';
  const f = (fmt, icon, title, text, pri) => '<div class="dlf"><h4>' + I(icon) + title + '</h4><p>' + text + '</p><div class="rowgap"><button type="button" class="btn small' + (pri ? ' pri' : '') + '" data-export="' + fmt.toLowerCase() + '">' + I('download', 'sm') + fmt + '</button><button type="button" class="btn small" data-preview="' + fmt.toLowerCase() + '" aria-pressed="' + (p === fmt.toLowerCase()) + '">' + I('eye', 'sm') + 'Preview</button></div></div>';
  return '<div class="included" aria-label="Included in every download">' + inc.map(x => '<span>' + I('check', 'sm') + esc(x) + '</span>').join('') + '</div>'
    + '<div class="dl">' + f('HTML', 'globe', 'This page, answered', 'Opens in any browser. Best to send back.', true) + f('MD', 'list', 'A readable report', 'For notes, a wiki or an email.') + f('JSON', 'code', 'For the agent', 'The same answers as data.') + '</div>'
    + (p ? '<div class="preview"><div class="preview-head"><span>' + I('eye', 'sm') + ' Preview · ' + p.toUpperCase() + '</span><span class="rowgap"><button type="button" class="btn small" data-act="copy">' + I('copy', 'sm') + 'Copy</button><button type="button" class="btn small" data-preview="">' + I('x', 'sm') + 'Close</button></span></div><pre id="pv">' + esc(txt) + '</pre></div>' : '')
    + '<p class="sendnote" id="download-status" role="status">Every format holds everything: each answer, each note, what is still open and what you added. Downloading sends nothing; send the file back to whoever asked.</p>';
}

// ── the tour ──
function navHtml(prevOff, nextLabel){
  const n = STEPS.length + 2, now = st.phase === 'return' ? n : st.cur + 2;
  return '<div class="t-nav"><button type="button" class="btn" id="back" data-act="prev"' + (prevOff ? ' disabled' : '') + '>' + I('left', 'sm') + 'Back</button><span class="prog-sum" id="stepno">Step ' + now + ' of ' + n + '</span><button type="button" class="btn pri" id="next" data-act="next">' + nextLabel + I('right', 'sm') + '</button></div>';
}
function renderTour(){
  if (st.phase === 'return') return '<div class="tour">' + progressHtml(null)
    + '<header class="t-head" style="--sc:var(--s0)"><p class="sec-name">' + I('send', 'sm') + 'Return</p><h2 id="q-title" tabindex="-1">Take your answers back</h2><p class="say">' + answeredCount() + ' of ' + STEPS.length + ' answered. Anything unanswered stays open: I will ask again and never assume a yes.</p></header>'
    + '<div class="t-ans">' + missingHtml() + '</div>'
    + '<div class="t-vis">' + slots({ map: mapHtml(null), proto: galleryHtml(''), expected: '<div class="expected">' + summaryRows() + '</div>' + settledHtml(), build: downloadsHtml() }, { proto: FLOW ? 'every screen' : '', expected: 'your answers', build: 'downloads' }) + '</div>'
    + navHtml(false, 'Done') + '</div>';
  const s = STEPS[st.cur], n = STEPS.length, v = stepAnswer(s);
  return '<div class="tour">' + progressHtml(s)
    + '<header class="t-head" style="--sc:' + s.seg.color + '"><p class="sec-name" id="t-where">' + I(s.seg.icon, 'sm') + esc(s.seg.label) + ' · ' + (s.seg.steps.indexOf(s) + 1) + ' of ' + s.seg.steps.length + '</p><h2 id="q-title" tabindex="-1">' + esc(stepTitle(s)) + '</h2>' + chipsHtml(s)
    + '<p class="say">' + sayFor(s) + '</p>' + (s.kind === 'item' && s.it.summary && s.it.body ? '<details class="more"><summary>More detail</summary><p class="say">' + esc(s.it.body) + '</p></details>' : '')
    + '<div class="rowgap"><button type="button" class="btn quiet say-more" data-act="why">' + I('info', 'sm') + 'Why I ask</button>'
    + (VIEW && VIEW.earlier[s.kind === 'item' ? s.it.id : ''] ? '<button type="button" class="btn quiet round-chip" data-act="why">' + I('history', 'sm') + 'Round ' + VIEW.earlier[s.it.id].round + ': ' + esc(VIEW.earlier[s.it.id].added ? 'you added it' : VIEW.earlier[s.it.id].label || 'not answered') + '</button>' : '')
    + (VIEW ? '<button type="button" class="btn quiet" data-act="history">' + I('history', 'sm') + 'History</button>' : '') + '</div>' + earlierHtml(s) + '</header>'
    + '<div class="t-ans" id="detail">' + tilesHtml(s, false) + (v ? '<button type="button" class="btn quiet note-btn" data-act="note">' + I('edit', 'sm') + (store.notes[stepItems(s)[0].id] ? 'Edit your note' : 'Add a note or picture') + '</button>' : '') + (st.layer === 'note' ? '' : explainHtml(s)) + '</div>'
    + '<div class="t-vis">' + slots({ map: mapHtml(s), proto: protoFor(s), expected: expectedFor(s), build: buildFor(s) }, { map: 'you are here', proto: s.kind === 'item' && s.it.approval ? 'dry run' : '', build: s.kind === 'choose' ? 'each option' : '' }) + '</div>'
    + navHtml(false, st.cur === n - 1 ? 'Finish' : v ? 'Next' : 'Skip for now') + '</div>';
}
function renderOverview(){
  const b = REVIEW.brief || {}, about = b.question || b.explains || REVIEW.intro || REVIEW.subtitle || '';
  const body = SEGS.map(g => '<p class="c-sec" style="--sc:' + g.color + '">' + I(g.icon, 'sm') + esc(g.label) + '</p><ol class="c-list">' + g.steps.map(s => {
    const p = protoFor(s), e = expectedFor(s), bu = buildFor(s), key = s.kind === 'choose' ? s.sec.id : s.it.id;
    const detail = p || e || bu ? '<details data-ovd="' + esc(key) + '"' + (ovOpen.has(key) ? ' open' : '') + '><summary>' + I('phone', 'sm') + 'Show the prototype and what should happen</summary><div class="pair">' + (p || '') + '<div style="display:grid;gap:10px">' + e + bu + '</div></div></details>' : '';
    return '<li class="c-item" style="--sc:' + g.color + '" data-card="' + esc(key) + '"><div class="c-top"><div><h3>' + esc(stepTitle(s)) + '</h3><p>' + (subFor(s) || sayFor(s)) + '</p></div>' + chipsHtml(s) + '</div>'
      + earlierHtml(s) + tilesHtml(s, false) + explainHtml(s) + detail + '<button type="button" class="btn quiet" data-open="' + STEPS.indexOf(s) + '">' + I('flag', 'sm') + 'Open in the tour</button></li>'; }).join('') + '</ol>').join('');
  return '<div class="ov"><div class="brief"><div class="m-head"><p class="eyebrow">' + I('flag', 'sm') + 'A review for you' + (VIEW ? ' · round ' + VIEW.round : '') + '</p><div class="rowgap">' + (VIEW ? '<button type="button" class="btn small" data-act="history">' + I('history', 'sm') + 'History</button>' : '') + '<button type="button" class="btn small" data-act="expand">' + I('expand', 'sm') + 'Expand</button></div></div>'
    + '<h2>' + esc(REVIEW.title) + '</h2>' + (about ? '<p class="task">' + esc(plain(about)) + '</p>' : '')
    + '<div class="facts"><span class="fact">' + I('list', 'sm') + STEPS.length + (STEPS.length === 1 ? ' question' : ' questions') + '</span><span class="fact">' + I('layers', 'sm') + SEGS.length + (SEGS.length === 1 ? ' part' : ' parts') + '</span></div>'
    + (REVIEW.afterwards ? '<p class="after"><b>What happens next:</b> ' + esc(REVIEW.afterwards) + '</p>' : '')
    + '<button type="button" class="btn quiet" data-mode="tour" style="justify-self:start">' + I('flag', 'sm') + 'Take the guided tour instead</button></div>'
    + progressHtml(null) + (DIAGRAMS.length ? slotHtml('map', 'Map', 'map', 0, mapHtml(null), 'the whole review') : '') + body + settledHtml() + missingHtml()
    + '<div class="brief"><p class="eyebrow">' + I('send', 'sm') + 'Return</p><div class="expected">' + summaryRows() + '</div>' + downloadsHtml() + '</div></div>';
}
const ovOpen = new Set();
document.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.ovd) ovOpen[d.open ? 'add' : 'delete'](d.dataset.ovd); }, true);
function layerHtml(){
  const s = st.phase === 'q' && st.mode === 'tour' ? STEPS[st.cur] : null;
  if (st.layer === 'expand') {
    const part = (id, icon, title, body, extra) => '<section class="slot' + (st.lmin.has(id) ? ' min' : '') + '"><div class="slot-head"><h3>' + I(icon, 'sm') + esc(title) + '</h3>' + (extra || '') + '<button type="button" class="btn icon small" data-lmin="' + id + '" aria-label="' + (st.lmin.has(id) ? 'Show' : 'Minimize') + ' ' + esc(title) + '" aria-expanded="' + !st.lmin.has(id) + '">' + I(st.lmin.has(id) ? 'plus' : 'minus', 'sm') + '</button></div><div class="slot-body">' + body + '</div></section>';
    const main = mapFor(s), now = s && s.kind === 'item' && s.it.step ? s.it.step.from : '';
    return '<div class="layer" role="dialog" aria-modal="true" aria-label="Expanded view"><div class="layer-head"><h3>' + I('expand') + 'The map and every screen</h3><button type="button" class="btn small pri" data-act="close-layer">' + I('x', 'sm') + 'Close</button></div><div class="layer-body">'
      + (main ? part('map', 'map', 'Map', mapHtml(s, st.zoom, main), '<span class="zoom"><button type="button" class="btn icon small" data-zoom="-" aria-label="Zoom out">' + I('minus', 'sm') + '</button><output>' + Math.round(st.zoom * 100) + '%</output><button type="button" class="btn icon small" data-zoom="+" aria-label="Zoom in">' + I('plus', 'sm') + '</button></span>') : '')
      + (FLOW ? part('screens', 'phone', 'Every screen, in order', galleryHtml(now)) : protoFor(s) ? part('screens', 'phone', 'What it looks like', protoFor(s)) : '')
      + DIAGRAMS.filter(d => d !== main).map(d => part('d-' + d.id, 'map', d.title || d.id, mapHtml(s, st.zoom, d))).join('') + '</div></div>';
  }
  if (st.layer === 'history' && VIEW) {
    const rounds = HISTORY.rounds;
    const optionOf = (rv, v) => (rv.verdictSet.options || []).concat(APPROVAL_OPTS).find(o => o.value === v);
    const lines = rounds.map((r, i) => {
      const next = i + 1 < rounds.length ? rounds[i + 1].review : REVIEW;
      const carrier = (id) => (next.items || []).find(x => x.id === id || (x.affects || []).some(a => a.decision && a.decision.review === r.review.id && a.decision.itemId === id));
      const answers = (r.feedback.responses || []).map(x => ({ id: x.itemId, title: x.title, verdict: x.verdict, note: x.note }))
        .concat((r.feedback.addedItems || []).map(x => ({ id: x.id, title: x.title, verdict: x.verdict, note: x.note || x.body, added: true })));
      return '<section class="hround"><p class="who">' + I('send', 'sm') + 'Round ' + (i + 1) + (day(r.review.createdAt) ? ' · sent ' + day(r.review.createdAt) : '') + (day(r.feedback.respondedAt) ? ' · you answered ' + day(r.feedback.respondedAt) : '') + '</p>'
        + answers.map(x => { const o = optionOf(r.review, x.verdict), c = carrier(x.id);
          const what = c ? (c.reply ? I('bot', 'sm') + ' ' + esc(c.reply) : I('repeat', 'sm') + ' Asked again in round ' + (i + 2)) : o && o.tone === 'positive' ? I('settled', 'sm') + ' Settled' : '';
          return '<div class="hline"><span class="q">' + (x.added ? 'You added: ' : '') + esc(x.title) + '</span><span class="tag ' + (o ? (o.tone === 'positive' ? 'tg-settled' : o.tone === 'negative' ? 'tg-bad' : o.tone === 'caution' ? 'tg-again' : 'tg-open') : 'tg-open') + '">' + esc(o ? o.label : 'Not answered') + '</span>'
            + (x.note ? '<span class="nn">' + I('user', 'sm') + ' "' + esc(x.note) + '"</span>' : '') + (what ? '<span class="r">' + what + '</span>' : '') + '</div>'; }).join('') + '</section>';
    }).join('');
    const now = '<section class="hround"><p class="who">' + I('flag', 'sm') + 'Round ' + VIEW.round + ' · now</p>' + STEPS.map(x => '<div class="hline"><span class="q">' + esc(stepTitle(x)) + '</span>' + tagChip(tagOf(x))
      + (answerLabel(x) ? '<span class="r">' + I('user', 'sm') + ' You: ' + esc(answerLabel(x)) + '</span>' : '') + '</div>').join('') + '</section>';
    return '<div class="layer" role="dialog" aria-modal="true" aria-label="History"><div class="layer-head"><h3>' + I('history') + 'History · every round in one document</h3><button type="button" class="btn small pri" data-act="close-layer">' + I('x', 'sm') + 'Close</button></div><div class="layer-body"><div class="hist">' + lines + now + '</div></div></div>';
  }
  if (st.layer === 'note' && s) return '<div class="sheet-layer" role="dialog" aria-modal="true" aria-label="Add a note"><div class="sh"><h3>' + I('edit') + esc(stepTitle(s)) + '</h3>' + explainHtml(s) + '<button type="button" class="btn pri" data-act="close-layer">Done</button></div></div>';
  if (st.layer === 'why' && s) return '<div class="sheet-layer" role="dialog" aria-modal="true" aria-label="Why I ask"><div class="sh"><h3>' + I('info') + esc(stepTitle(s)) + '</h3><p class="say">' + sayFor(s) + '</p>' + earlierHtml(s) + '<div class="rowgap">' + (VIEW ? '<button type="button" class="btn" data-act="history">' + I('history', 'sm') + 'History</button>' : '') + '<button type="button" class="btn pri" data-act="close-layer">Got it</button></div></div></div>';
  return '';
}

// ── render: the whole view from the state; focus goes back where it was ──
function keyOf(el){
  if (!el || el === document.body) return null;
  if (el.id && el.id !== 'q-title') return '#' + CSS.escape(el.id);
  if (el.name && el.type === 'radio') return 'input[name="' + CSS.escape(el.name) + '"][value="' + CSS.escape(el.value) + '"]';
  for (const a of ['data-act', 'data-jump', 'data-min', 'data-lmin', 'data-ptab', 'data-zoom', 'data-preview', 'data-export', 'data-mode', 'data-open']) if (el.hasAttribute && el.hasAttribute(a)) {
    const f = el.getAttribute('data-for'); return '[' + a + '="' + CSS.escape(el.getAttribute(a)) + '"]' + (f ? '[data-for="' + CSS.escape(f) + '"]' : ''); }
  if (el.dataset && el.dataset.ask) return '[data-ask="' + el.dataset.ask + '"][data-for="' + CSS.escape(el.dataset.for) + '"]';
  if (el.dataset && el.dataset.opt) return '[data-opt="' + CSS.escape(el.dataset.opt) + '"]';
  return null;
}
function render(focus){
  const key = focus === undefined ? keyOf(document.activeElement) : focus;
  document.body.classList.toggle('at-start', st.mode === 'tour' && st.phase === 'start');
  document.querySelectorAll('#topbar [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
  $('#main').innerHTML = st.mode === 'overview' ? renderOverview() : st.phase === 'start' ? '' : renderTour();
  $('#layer-root').innerHTML = layerHtml();
  const el = key && document.querySelector(key);
  if (el) el.focus({ preventScroll: true });
  saveView();
}
function go(phase, cur){
  st.phase = phase; if (cur !== undefined) st.cur = cur; st.layer = null; st.marking = null; st.preview = null; st.mode = 'tour';
  render(null); scrollTo(0, 0);
  const t = phase === 'start' ? $('#start-review') : $('#q-title'); if (t) t.focus({ preventScroll: true });
}
const next = () => st.phase === 'return' ? (document.querySelector('[data-export="html"]') || {}).focus?.() : st.cur < STEPS.length - 1 ? go('q', st.cur + 1) : go('return');
const prev = () => st.phase === 'return' ? go('q', STEPS.length - 1) : st.cur > 0 ? go('q', st.cur - 1) : go('start');
function markOn(nodeId){
  const itemId = st.marking, s = STEPS.find(x => stepItems(x).some(i => i.id === itemId)), d = mapFor(s); if (!d || !itemId) return;
  const label = partLabel(d, { node: nodeId }); if (label === null) return;
  const c = { id: freeId('comment-', answerIds()), diagram: d.id, node: nodeId, label, note: '', item: itemId };
  (store.comments = store.comments || []).push(c); save(); st.marking = null; render(null);
  const t = document.getElementById('cm-' + c.id); if (t) t.focus();
}

document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-node], .gcard'); if (!t) return;
  const d = t.dataset || {};
  if (t.id === 'start-review') return go('q', 0);
  if (t.id === 'start-mini') return go('start');
  if (d.mode) { st.mode = d.mode; if (st.mode === 'tour' && st.phase === 'start') st.phase = 'q'; st.layer = null; return render(); }
  if (d.jump) { const [k, i] = d.jump.split(':'); return k === 'start' ? go('start') : k === 'return' ? go('return') : go('q', +i); }
  if (d.open !== undefined) return go('q', +d.open);
  if (d.min) { st.min.has(d.min) ? st.min.delete(d.min) : st.min.add(d.min); return render(); }
  if (d.lmin) { st.lmin.has(d.lmin) ? st.lmin.delete(d.lmin) : st.lmin.add(d.lmin); return render(); }
  if (d.ptab) { st.ptab = d.ptab; return render(); }
  if (d.zoom) { st.zoom = Math.min(3, Math.max(0.5, st.zoom + (d.zoom === '+' ? 0.25 : -0.25))); return render(); }
  if (d.preview !== undefined) { st.preview = d.preview || null; return render(); }
  if (d.picadd) { picFor = d.picadd; picInput.click(); return; }
  if (d.unpic) { const p = (store.pictures || []).find(x => x.id === d.unpic); if (!p) return; store.pictures = store.pictures.filter(x => x !== p); save(); return render(null); }
  if (d.unmark) { store.comments = (store.comments || []).filter(c => c.id !== d.unmark); dropPictures(d.unmark); save(); return render(null); }
  if (d.ask) { const r = store.requests[d.for] || (store.requests[d.for] = {}); r[d.ask] = !r[d.ask]; if (!r.example && !r.explain && !r.note) delete store.requests[d.for]; save(); return render(); }
  if (d.choose) { store.choices[d.choose] = d.opt; save(); return render(); }
  if (d.del !== undefined) { const removed = store.added.splice(+d.del, 1)[0]; if (removed) dropPictures(removed.id); save(); render(null); const b = $('[data-act="missing"]') || $('#at'); if (b) b.focus(); return; }
  if (d.export) {
    const out = buildFeedback(REVIEW, store);
    if (d.export === 'json') saveAs(JSON.stringify(out, null, 2), 'application/json', REVIEW.id + '.feedback.json');
    else if (d.export === 'md') saveAs(toMarkdown(), 'text/markdown', REVIEW.id + '.feedback.md');
    else saveAs(htmlSeed(), 'text/html', REVIEW.id + '.feedback.html');
    const msg = 'Downloaded ' + d.export.toUpperCase() + ': ' + out.summary.answered + '/' + out.summary.total + ' answered · ' + out.summary.added + ' added · ' + out.gaps.length + ' gaps. Nothing was sent: return the file yourself.';
    $('#footnote').textContent = msg; const s = $('#download-status'); if (s) s.textContent = msg; return;
  }
  if (t.id === 'addbtn') {
    const ti = $('#at').value.trim(), bo = $('#ab').value.trim(); if (!ti && !bo) return $('#at').focus();
    store.added.push({ id: freeId('added-', answerIds()), title: ti || '(untitled)', body: bo, verdict: 'unset', note: null }); save(); render(null); const a = $('#at'); if (a) a.focus(); return;
  }
  if (t.matches('[data-node]')) {
    if (st.marking) return markOn(t.dataset.node);
    const k = STEPS.findIndex(s => stepItems(s).some(i => i.id === t.dataset.step)); if (t.dataset.step && k >= 0) return go('q', k);
    return;
  }
  switch (d.act) {
    case 'next': return next();
    case 'prev': return prev();
    case 'expand': st.layer = 'expand'; render(null); return $('[data-act="close-layer"]').focus();
    case 'history': st.layer = 'history'; render(null); return $('[data-act="close-layer"]').focus();
    case 'why': case 'note': st.layer = d.act; render(null); return ($('.sheet-layer textarea') || $('[data-act="close-layer"]')).focus();
    case 'close-layer': st.layer = null; render(null); return ($('[data-act="expand"]') || $('#q-title') || document.body).focus();
    case 'focus-proto': st.min = new Set(['map', 'expected', 'build']); st.ptab = 'proto'; return render();
    case 'focus-all': st.min = new Set(); return render();
    case 'mark': st.marking = st.marking === d.for ? null : d.for; st.layer = null; render(); { const m = $('.map-scroll.marking'); if (m) m.scrollIntoView({ block: 'nearest' }); } return;
    case 'missing': st.missing = !st.missing; render(null); return ($('#at') || $('[data-act="missing"]')).focus();
    case 'copy': { const pv = $('#pv'); if (pv && navigator.clipboard) navigator.clipboard.writeText(pv.textContent).catch(() => {}); return; }
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && st.layer) { st.layer = null; render(null); ($('[data-act="expand"]') || $('#q-title') || document.body).focus(); return; }
  if (e.key === 'Escape' && st.marking) { st.marking = null; return render(); }
  const n = e.target.closest && e.target.closest('[data-node]');
  if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); n.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});
document.addEventListener('change', e => {
  const r = e.target.closest('input[type=radio][data-item], input[type=radio][data-choice]'); if (!r) return;
  if (r.dataset.item) store.verdicts[r.dataset.item] = r.value; else store.choices[r.dataset.choice] = r.value;
  save(); render();
});
document.addEventListener('input', e => {
  const t = e.target.closest('textarea[data-note]');
  if (t) { store.notes[t.dataset.note] = t.value; save(); document.querySelectorAll('textarea[data-note="' + CSS.escape(t.dataset.note) + '"]').forEach(x => { if (x !== t) x.value = t.value; }); return; }
  const c = e.target.closest('textarea[data-comment]');
  if (c) { const m = (store.comments || []).find(x => x.id === c.dataset.comment); if (m) { m.note = c.value; save(); } }
});

render(null);
if (SEED) $('#footnote').textContent = 'An exported copy with the answers given ' + String(SEED.exportedAt).slice(0, 10) + '. Changes you make here stay in this browser.';
</script>
</body></html>`;

writeFileSync(outPath, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`wrote ${outPath}  (${kb} KB · ${review.items.length} items · ${(review.sections||[]).length} sections)`);

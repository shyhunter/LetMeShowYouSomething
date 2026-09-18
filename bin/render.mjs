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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const [inPath, outPathArg] = process.argv.slice(2);
if (!inPath) { console.error('usage: render.mjs <review.json> [out.html]'); process.exit(2); }

const review = JSON.parse(readFileSync(inPath, 'utf8'));
if (review.protocol !== 'letmeshowyousomething/review') {
  console.error(`✗ not a review: protocol is ${JSON.stringify(review.protocol)}`);
  process.exit(2);
}
const outPath = outPathArg || inPath.replace(/\.json$/, '') + '.html';

const builder = readFileSync(join(HERE, '..', 'lib', 'build-feedback.mjs'), 'utf8')
  .replace(/^export function/gm, 'function');
// The flow page draws screens with the same code the Node tests prove (drawing + escaping).
const drawer = readFileSync(join(HERE, '..', 'lib', 'draw-components.mjs'), 'utf8')
  .replace(/^export function/gm, 'function');
// Diagrams: layout and drawing, inlined the same way; their imports are dropped because the page
// already defines everything they import.
const inline = (file) => readFileSync(join(HERE, '..', 'lib', file), 'utf8').replace(/^export function/gm, 'function').replace(/^import .*\n/gm, '');
const diagrams = inline('layout.mjs') + '\n' + inline('draw-diagram.mjs');

// `</script>` inside a JSON string would close the tag early; escaping `<` is enough and keeps the
// payload valid JSON.
const embed = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TONE = { positive: 'ok', caution: 'warn', negative: 'bad', neutral: 'neut' };

// The logo as the tab icon (D094), inlined so the page still fetches nothing. Base64, so no URL sits in
// the page. A folder without site/ (only bin/ copied) simply renders without one.
let favicon = '';
try { favicon = `<link rel="icon" href="data:image/svg+xml;base64,${readFileSync(new URL('../site/logo.svg', import.meta.url)).toString('base64')}">`; } catch {}

// D080/D083 — styles to pick, each in light and dark. A style's colours are written once per mode; its
// look (fonts, corners, shadows) is written once in tokens, so it holds in both. System fonts only, so
// the page stays offline. Dark applies with Mode "Dark", or with "Auto" when the system is dark.
const STYLES = {
  mac84: {
    light: `--bg:#FFFFFF; --surf:#FFFFFF; --surf2:#FFFFFF; --inset:#FFFFFF;
  --line:#000000; --line2:#000000; --line3:#000000;
  --ink:#000000; --ink2:#000000; --ink3:#222222; --mut:#333333; --sub:#555555;
  color-scheme:light; --ac:#000000; --ac-bg:#DDDDDD; --ac-line:#000000; --on-ac:#FFFFFF;`,
    dark: `--bg:#000000; --surf:#000000; --surf2:#000000; --inset:#000000;
  --line:#FFFFFF; --line2:#FFFFFF; --line3:#FFFFFF;
  --ink:#FFFFFF; --ink2:#FFFFFF; --ink3:#DDDDDD; --mut:#CCCCCC; --sub:#AAAAAA;
  color-scheme:dark; --ac:#FFFFFF; --ac-bg:#333333; --ac-line:#FFFFFF; --on-ac:#000000;`,
    look: `--mono:Monaco,'Courier New',monospace; --sans:Chicago,Charcoal,Geneva,'Helvetica Neue',sans-serif;`,
    rules: `*{border-radius:0!important}
body{background:repeating-conic-gradient(var(--ink) 0 25%,var(--bg) 0 50%) 0 0/2px 2px}
.wrap{background:var(--bg)}
:is(.panel,.sec-box,#brief,#feedback,fieldset.item,.btn){box-shadow:2px 2px 0 var(--ink)}
:is(.panel-head,.sec-head){background:repeating-linear-gradient(var(--ink) 0 1px,var(--bg) 1px 3px);padding:2px 4px}
:is(.panel-title,.sec-toggle){flex:none;background:var(--bg);padding:0 8px}
.panel-head::after{content:"";flex:1}`,
  },
  cyber: {
    light: `--bg:#F4F1FF; --surf:#FFFFFF; --surf2:#EAE4FF; --inset:#EAE4FF;
  --line:#C9B8F0; --line2:#A58BE0; --line3:#7A55CC;
  --ink:#1A0B2E; --ink2:#2A1745; --ink3:#4A3470; --mut:#5E4D80; --sub:#7A6A99;
  color-scheme:light; --ac:#C2006B; --ac-bg:rgba(194,0,107,.10); --ac-line:rgba(194,0,107,.40); --on-ac:#FFFFFF;
  --neon:#0088A0;`,
    dark: `--bg:#0B0716; --surf:#140C26; --surf2:#1C1233; --inset:#07040F;
  --line:#3A1F5C; --line2:#5A2D8A; --line3:#8A3FD1;
  --ink:#F4F1FF; --ink2:#DCD3FF; --ink3:#A99BD9; --mut:#8B7FB8; --sub:#6E6396;
  color-scheme:dark; --ac:#00F0FF; --ac-bg:rgba(0,240,255,.12); --ac-line:rgba(0,240,255,.45); --on-ac:#0B0716;
  --neon:#FF2E88;`,
    look: `--sans:ui-monospace,SFMono-Regular,Menlo,monospace;`,
    rules: `body{background-image:repeating-linear-gradient(0deg,var(--ac-bg) 0 1px,transparent 1px 3px)}
:is(h1,h2){color:var(--ac);text-shadow:0 0 10px var(--ac-line);text-transform:uppercase;letter-spacing:.06em}
:is(.panel,.sec-box,#brief,#feedback){border-color:var(--neon);box-shadow:0 0 14px color-mix(in srgb,var(--neon) 30%,transparent)}
.btn.pri{box-shadow:0 0 14px var(--ac-line)}`,
  },
  newsletter: {
    light: `--bg:#F3EAD3; --surf:#FAF4E4; --surf2:#EDE2C6; --inset:#EDE2C6;
  --line:rgba(60,40,20,.25); --line2:rgba(60,40,20,.40); --line3:rgba(60,40,20,.60);
  --ink:#2A1C10; --ink2:#3B2A1A; --ink3:#5C4630; --mut:#6E5A42; --sub:#8A7458;
  color-scheme:light; --ac:#B4441E; --ac-bg:rgba(180,68,30,.10); --ac-line:rgba(180,68,30,.35); --on-ac:#FFF8E8;`,
    dark: `--bg:#1C1812; --surf:#241F17; --surf2:#2E281E; --inset:#15120D;
  --line:rgba(240,230,210,.18); --line2:rgba(240,230,210,.30); --line3:rgba(240,230,210,.50);
  --ink:#F3EAD3; --ink2:#E4D8BE; --ink3:#C7B89A; --mut:#A8997C; --sub:#8A7C62;
  color-scheme:dark; --ac:#E8875E; --ac-bg:rgba(232,135,94,.14); --ac-line:rgba(232,135,94,.40); --on-ac:#1C1812;`,
    look: `--mono:'Courier New',Courier,monospace; --sans:Georgia,'Times New Roman',serif;`,
    rules: `*{border-radius:2px!important}
header{border-bottom:5px double var(--ink)}
h1{font-size:clamp(28px,5vw,46px);text-transform:uppercase;letter-spacing:.04em}
h2{font-style:italic}
:is(.panel,.sec-box,#brief,#feedback){border-color:var(--ink3)}`,
  },
  // ShyHunter: warm paper, butter-yellow buttons, hard offset shadows and corners that read as drawn
  // by hand. Its fonts are used when installed, else the system's.
  shyhunter: {
    light: `--bg:#FFFDF9; --surf:#FFFDF9; --surf2:#EEE7D8; --inset:#F0E4C3;
  --line:#544C43; --line2:#544C43; --line3:#141210;
  --ink:#141210; --ink2:#141210; --ink3:#3A342E; --mut:#635C55; --sub:#7A726A;
  color-scheme:light; --ac:#8F6D00; --ac-bg:rgba(244,196,35,.22); --ac-line:#8F6D00; --on-ac:#FFFFFF;
  --ok:#008130; --bad:#C4000A;`,
    dark: `--bg:#121110; --surf:#1B1A18; --surf2:#262420; --inset:#0D0C0B;
  --line:#8A8278; --line2:#8A8278; --line3:#D8D2C8;
  --ink:#FFFFFF; --ink2:#EDEAE4; --ink3:#C9C3BA; --mut:#A39C92; --sub:#847D74;
  color-scheme:dark; --ac:#F4C423; --ac-bg:rgba(244,196,35,.16); --ac-line:#F4C423; --on-ac:#141210;
  --ok:#63B584; --bad:#E08272;`,
    look: `--sans:Archivo,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; --mono:'JetBrains Mono',ui-monospace,Menlo,monospace;`,
    rules: `:is(h1,h2,h3){font-family:'Bricolage Grotesque',Archivo,system-ui,sans-serif;font-weight:800;letter-spacing:-.015em}
:is(.panel,.sec-box,#brief,#feedback,fieldset.item){border:1.5px solid var(--line);box-shadow:4px 4px 0 var(--line);border-radius:22px 8px 26px 10px/10px 26px 8px 22px}
.btn{border-radius:12px 5px 14px 6px/6px 14px 5px 12px;box-shadow:2px 2px 0 var(--line)}
.btn.pri{background:#F4C423;border-color:#544C43;color:#141210}
:is(input,select,textarea){border-radius:6px 13px 5px 12px/12px 5px 14px 6px}`,
  },
};
const STYLE_CSS = Object.entries(STYLES).map(([id, st]) => {
  const at = `:root[data-style="${id}"]`;
  return `${at}{${st.look}}
${at}{${st.light}}
@media (prefers-color-scheme:dark){${at}:not([data-theme]){${st.dark}}}
${at}[data-theme="dark"]{${st.dark}}
${st.rules.split('\n').map((r) => `${at} ${r}`).join('\n')}`;
}).join('\n');

const html = `<!doctype html>
<html lang="en"><head>
<!-- SPDX-License-Identifier: MIT-0 -->
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(review.title)}</title>
${favicon}
<style>
:root{
  --bg:#FBFAFC; --surf:#FFFFFF; --surf2:#F3F1F6; --inset:#ECE9F1;
  --line:rgba(28,22,42,.13); --line2:rgba(28,22,42,.22); --line3:rgba(28,22,42,.36);
  --ink:#16141B; --ink2:#2C2735; --ink3:#524C60; --mut:#6F6880; --sub:#938CA3;
  color-scheme:light;
  --ac:#5B3E8C; --ac-bg:rgba(91,62,140,.10); --ac-line:rgba(91,62,140,.30); --on-ac:#FFFFFF;
  --ok:#2F6B45; --ok-bg:rgba(47,107,69,.11);
  --warn:#8E6110; --warn-bg:rgba(142,97,16,.12);
  --bad:#A03A2E; --bad-bg:rgba(160,58,46,.10);
  --neut:#5A6270; --neut-bg:rgba(90,98,112,.11);
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme]){
  --bg:#121017; --surf:#1A1721; --surf2:#221E2C; --inset:#121017;
  --line:#2B2736; --line2:#393347; --line3:#4D455E;
  --ink:#ECE9F1; --ink2:#D6D1E0; --ink3:#ADA6BD; --mut:#8C859E; --sub:#6C6580;
  color-scheme:dark;
  --ac:#A98BD6; --ac-bg:rgba(169,139,214,.14); --ac-line:rgba(169,139,214,.32); --on-ac:#121017;
  --ok:#63B584; --ok-bg:rgba(99,181,132,.14);
  --warn:#D9A441; --warn-bg:rgba(217,164,65,.14);
  --bad:#E08272; --bad-bg:rgba(224,130,114,.13);
  --neut:#9AA3B2; --neut-bg:rgba(154,163,178,.13);
}}
:root[data-theme="dark"]{
  --bg:#121017; --surf:#1A1721; --surf2:#221E2C; --inset:#121017;
  --line:#2B2736; --line2:#393347; --line3:#4D455E;
  --ink:#ECE9F1; --ink2:#D6D1E0; --ink3:#ADA6BD; --mut:#8C859E; --sub:#6C6580;
  color-scheme:dark;
  --ac:#A98BD6; --ac-bg:rgba(169,139,214,.14); --ac-line:rgba(169,139,214,.32); --on-ac:#121017;
  --ok:#63B584; --ok-bg:rgba(99,181,132,.14);
  --warn:#D9A441; --warn-bg:rgba(217,164,65,.14);
  --bad:#E08272; --bad-bg:rgba(224,130,114,.13);
  --neut:#9AA3B2; --neut-bg:rgba(154,163,178,.13);
}
${STYLE_CSS}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink2);font:15px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:900px;margin:0 auto;padding-inline:18px;padding-block:0 80px}
h1,h2,h3{color:var(--ink);margin:0;text-wrap:balance}
:focus-visible{outline:2px solid var(--ac);outline-offset:2px;border-radius:4px}
.skip{position:absolute;left:-9999px}
.skip:focus{left:8px;top:8px;z-index:9;background:var(--surf);border:1px solid var(--ac);padding:8px 12px;border-radius:6px}

header{padding-block:30px 18px;border-bottom:1px solid var(--line);margin-bottom:22px}
.htools{display:flex;gap:8px;align-items:center}
.style-pick{font:500 12.5px var(--sans);color:var(--mut);display:flex;gap:6px;align-items:center}
/* Safari ignores min-height on a native select: drawn by the page, it keeps the 44px target (D091). */
.style-pick select{-webkit-appearance:none;appearance:none;height:44px;color:var(--ink);border:1px solid var(--line2);border-radius:7px;padding:4px 30px 4px 10px;font:inherit;
  background:linear-gradient(45deg,transparent 50%,var(--mut) 50%) right 16px center/5px 5px no-repeat,linear-gradient(135deg,var(--mut) 50%,transparent 50%) right 11px center/5px 5px no-repeat,var(--surf)}
/* D079 — pin a section: it stays at the top while the rest scrolls under it. Pinned sections stack
   in page order and share 80% of the window between them. */
.pin{min-height:44px;font-size:12.5px}
.pin[aria-pressed="true"]{border-color:var(--ac);background:var(--ac-bg);color:var(--ink)}
.pinned{position:sticky;top:var(--pin-top,0);z-index:6;max-height:calc(80vh / var(--pins,1));overflow:auto;background:var(--bg);box-shadow:0 6px 12px -8px rgba(0,0,0,.35)}
.flow #stage{display:contents}
.flow #upanel:not(.full){margin-top:16px}
.htop{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
h1{font-size:clamp(22px,3.4vw,30px);letter-spacing:-.015em;line-height:1.2}
.sub{color:var(--ink3);font-size:14px;margin-top:4px}
.intro{margin-top:14px;color:var(--ink2);font-size:14px;line-height:1.65;max-width:70ch}
.intro strong{color:var(--ink)}
.btn{background:var(--surf);border:1px solid var(--line2);border-radius:7px;padding:7px 12px;
  font:500 12.5px var(--sans);color:var(--ink2);cursor:pointer}
.btn:hover{border-color:var(--line3);color:var(--ink)}
.btn.pri{background:var(--ac);border-color:var(--ac);color:var(--on-ac)}
.btn.pri:hover{opacity:.92;color:var(--on-ac)}

.bar{position:sticky;top:var(--pins-h,0);z-index:5;background:var(--bg);border-bottom:1px solid var(--line);
  padding-block:11px;margin-bottom:20px;display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.bar input[type=search]{flex:1 1 180px;min-width:0;background:var(--inset);border:1px solid var(--line2);
  border-radius:7px;padding:8px 11px;font:13px var(--mono);color:var(--ink)}
.chip{border:1px solid var(--line2);background:var(--surf);border-radius:99px;padding:5px 11px;
  font:500 11.5px var(--sans);color:var(--mut);cursor:pointer}
.chip[aria-pressed="true"]{background:var(--ac-bg);border-color:var(--ac-line);color:var(--ac)}
#filters{display:flex;gap:6px;flex-wrap:wrap}
.prog{font:12px var(--mono);color:var(--mut);margin-left:auto;font-variant-numeric:tabular-nums}

.sec{margin-bottom:30px}
.sec>h2{font-size:15px;letter-spacing:-.01em;margin-bottom:3px}
.sec>.d{font-size:13px;color:var(--mut);margin-bottom:12px}
.mmd{background:var(--surf2);border:1px solid var(--line);border-radius:9px;padding:14px;margin-bottom:14px;overflow-x:auto}
.mmd pre{margin:0;font:12px var(--mono);color:var(--ink3);white-space:pre}

fieldset.item{border:1px solid var(--line);border-radius:10px;background:var(--surf);padding:16px 18px;margin:0 0 11px}
fieldset.item[data-v]:not([data-v="unset"]){border-left:3px solid var(--tone,var(--line2))}
legend{padding:0 4px;font-weight:600;color:var(--ink);font-size:14.5px;line-height:1.4}
.body{font-size:13.5px;color:var(--ink3);margin:2px 0 10px;max-width:74ch}
.flds{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.fld{display:flex;gap:9px;font-size:13px;align-items:baseline}
.fld .k{font:500 10.5px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--fk,var(--mut));min-width:78px;flex:none}
.fld .val{color:var(--ink3)}
.ref{font:11px var(--mono);color:var(--sub);margin-bottom:10px}

.verdicts{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}
.verdicts label{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line2);border-radius:99px;
  padding:5px 12px;font-size:12.5px;color:var(--ink3);cursor:pointer;background:var(--surf)}
.verdicts label:hover{border-color:var(--line3)}
.verdicts input{margin:0;accent-color:var(--tc)}
.verdicts input:checked+span{color:var(--tc);font-weight:600}
.verdicts label:has(input:checked){background:var(--tcb);border-color:var(--tc)}
.v-ok{--tc:var(--ok);--tcb:var(--ok-bg)} .v-warn{--tc:var(--warn);--tcb:var(--warn-bg)}
.v-bad{--tc:var(--bad);--tcb:var(--bad-bg)} .v-neut{--tc:var(--neut);--tcb:var(--neut-bg)}
.hint{font-size:11.5px;color:var(--sub);margin:-4px 0 10px}
textarea{width:100%;background:var(--inset);border:1px solid var(--line2);border-radius:7px;padding:9px 11px;
  font:13.5px var(--sans);color:var(--ink);resize:vertical;min-height:42px}
textarea::placeholder{color:var(--sub)}

.add{border:1px dashed var(--line2);border-radius:10px;padding:16px 18px;background:var(--surf2);margin-top:8px}
.add h2{font-size:14px;margin-bottom:3px}
.add .d{font-size:12.5px;color:var(--mut);margin-bottom:11px}
.add input[type=text]{width:100%;background:var(--surf);border:1px solid var(--line2);border-radius:7px;
  padding:8px 11px;font:13.5px var(--sans);color:var(--ink);margin-bottom:8px}
.addedrow{display:flex;gap:10px;align-items:flex-start;background:var(--surf);border:1px solid var(--line);
  border-radius:8px;padding:10px 12px;margin-bottom:7px}
.added-h{font:600 13px var(--sans);color:var(--ink);margin:14px 0 8px}
.addedrow .t{flex:1;font-size:13.5px;color:var(--ink)}
.addedrow .b{font-size:12.5px;color:var(--mut);margin-top:2px}

.done{position:sticky;bottom:0;background:var(--bg);border-top:1px solid var(--line);padding-block:14px;
  display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:26px}
.done .note{font-size:12.5px;color:var(--mut)}
.empty{padding:26px;text-align:center;color:var(--mut);font-size:13.5px}
.meta{font:11.5px var(--mono);color:var(--sub);margin-top:6px}
.asks{display:grid;gap:10px;margin-top:16px;max-width:74ch}
.asks p{margin:0;font-size:14px;color:var(--ink2)}
.asks b{display:block;font:600 10.5px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ac);margin-bottom:2px}
details.more{margin:-4px 0 10px}
details.more summary{cursor:pointer;font-size:12.5px;color:var(--ac);margin-bottom:6px}
.aff{border:1px solid var(--warn);background:var(--warn-bg);border-radius:8px;padding:8px 11px;margin:0 0 10px;font-size:13px;color:var(--ink2)}
.aff .k{display:block;font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--warn);margin-bottom:2px}
.pick{font-size:12.5px;color:var(--ac);font-weight:600;margin:-6px 0 12px}
.choose{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;margin-bottom:12px}
.choose label{display:inline-flex;gap:7px;align-items:center;font-weight:600;font-size:13px;color:var(--ink);cursor:pointer;
  border:1px solid var(--ac-line);border-radius:99px;padding:5px 12px;background:var(--ac-bg)}
.choose input{margin:0;accent-color:var(--ac)}
.rec{font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--on-ac);background:var(--ac);border-radius:99px;padding:3px 9px}
.recwhy{font-size:12.5px;color:var(--ink3);flex-basis:100%}
/* A fieldset's own border breaks around its legend; a shadow ring would run through the title. */
fieldset.item.chosen{border:2px solid var(--ac)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

/* ── flow player (v0.2) ── */
.wrap.flow{max-width:none;padding-inline:24px}
/* The header lines up with the text inside the sections below, not with their outer border.
   On a phone every pixel of width counts, so it stays at the page edge there. */
@media (min-width:700px){.flow header{padding-inline:20px}}
.flow .bar{position:static}
#player{margin-bottom:10px}
.item .k,#brief .k{font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ac);margin-right:6px}
#restart{min-height:44px;min-width:44px}
/* The page as drawn (D068): the diagram, then the screen below it, each full width.
   Either one opens full screen (D073): it covers the window until Esc or "Exit full screen". */
.stage{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.panel-full{min-height:44px;font-size:12.5px}
.panel-full[aria-pressed="true"]{border-color:var(--ac);background:var(--ac-bg);color:var(--ink)}
.panel.full{position:fixed;inset:0;z-index:50;border-radius:0;overflow:auto;max-height:none;margin:0;padding:12px 24px 24px}
.panel.full #flowbeside{max-height:none;height:calc(100vh - 130px)}
body:has(.panel.full){overflow:hidden}
.panel{border:1px solid var(--line);border-radius:12px;background:var(--bg);padding:8px 10px 10px;min-width:0}
.panel-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.panel-title{font:600 13px var(--sans);color:var(--ink);flex:1;white-space:nowrap}
/* One row of tabs that scrolls sideways: long chart titles must not stack into a column. */
#dgtabs{display:flex;gap:4px;overflow-x:auto;padding-bottom:2px;border-bottom:1px solid var(--line)}
#dgtabs [role=tab]{min-height:44px;padding:4px 12px;border:1px solid transparent;border-radius:9px 9px 0 0;background:none;
  color:var(--mut);font:600 13px var(--sans);cursor:pointer;white-space:nowrap;flex:none}
#dgtabs [role=tab][aria-selected="true"]{color:var(--ink);border-color:var(--line2);background:var(--surf)}
#chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 6px}
#chips .chip{min-height:44px}
.dg-empty{padding:16px 4px;color:var(--mut);font-size:13.5px}
/* D074 — what to decide, full width; then your feedback: filters, the steps on the left and the
   open step on the right, the row shared in three steps; then your own feedback, full width. */
.brief-head{display:flex;gap:8px;align-items:center;justify-content:space-between}
#brief{margin-top:14px;border:1px solid var(--line2);border-left:3px solid var(--ac);border-radius:12px;background:var(--surf);padding:14px 16px}
/* D069 — the step list is the feedback panel: one row per step, the chosen one open. */
#feedback{margin-top:14px;background:var(--surf);border:1px solid var(--line);border-radius:12px;padding:14px 16px;min-width:0}
.split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}
.split[data-size="list"]{grid-template-columns:minmax(0,2fr) minmax(0,1fr)}
.split[data-size="detail"]{grid-template-columns:minmax(0,1fr) minmax(0,2fr)}
.split>.sizes{grid-column:1/-1;display:flex;justify-content:flex-end;gap:6px}
.sizes button{min-width:44px;min-height:44px;font-size:15px}
.sizes button[aria-pressed="true"]{border-color:var(--ac);background:var(--ac-bg);color:var(--ink)}
#detail{position:sticky;top:calc(var(--pins-h,0px) + 12px);min-width:0}
@media (max-width:1099px){.split,.split[data-size]{grid-template-columns:minmax(0,1fr)}.split>.sizes{display:none}}
#feedback>h2{font-size:15px;margin-bottom:2px}
#feedback .bar{position:static;margin-bottom:10px;padding-block:8px}
#feedback .sec{margin-bottom:0}
#feedback fieldset.item{padding:10px 14px;margin-bottom:8px;background:var(--bg)}
#feedback fieldset.item.row{cursor:pointer}
#feedback fieldset.item.open{padding:14px 16px}
.row-meta{margin:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--mut)}
.row-v{margin-left:auto;font:600 10.5px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--tone,var(--warn))}
.row-open{background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;text-align:left;min-height:32px}
#feedback .add{margin:10px 0}
.sec-box:only-child .sec-actions{display:none}
#feedback fieldset.item.row{padding:2px 14px 8px;margin-bottom:6px}
#feedback .prog{display:none}
/* Sub-processes: a column beside the chart, switched on or off (sketch, 2026-09-18). */
.dg-body{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;margin-top:8px}
.dg-body.sub-off{grid-template-columns:auto minmax(0,1fr)}
#subproc{width:170px;border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--bg)}
.dg-body.sub-off #subproc{width:auto}
.dg-body.sub-off #chips{display:none}
#chips{display:flex;flex-direction:column;gap:6px;margin-top:8px}
#chips .chip{min-height:44px;text-align:left;justify-content:flex-start}
#chips .sub-h{font:600 10.5px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--sub);margin-top:6px}
.switch{display:flex;align-items:center;gap:8px;min-height:44px;width:100%;border:0;background:none;color:var(--ink);
  font:600 12.5px var(--sans);cursor:pointer;text-align:left}
.switch-box{flex:none;width:34px;height:20px;border-radius:99px;background:var(--line2);position:relative;transition:background .15s}
.switch-box::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
.switch[aria-checked="true"] .switch-box{background:var(--ac)}
.switch[aria-checked="true"] .switch-box::after{left:16px}
/* Every screen at once, the way the flow shows every step (sketch, 2026-09-18). */
.seg{display:flex;gap:4px}
.seg .btn{min-height:44px;font-size:12.5px}
.seg .btn[aria-pressed="true"]{border-color:var(--ac);background:var(--ac-bg);color:var(--ink)}
/* D078 — each small screen twice the size it was: twice the width, drawn at full scale; one column on a phone. */
/* D081 — the connections between screens, like a prototype: from each action to where it leads. */
#allscreens{position:relative;overflow-x:auto;padding-bottom:8px}
/* Laid out like a prototype canvas: one column per tap from the start, gaps wide enough for the curves. */
#allscreens.canvas{grid-template-columns:repeat(var(--cols),420px);column-gap:96px;row-gap:28px;align-items:start}
@media (max-width:699px){#allscreens.canvas{grid-template-columns:minmax(0,1fr)}#allscreens.canvas .mini{grid-column:auto!important;grid-row:auto!important}}
#allscreens .links{position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:1}
.links path{fill:none;stroke:var(--ac);stroke-width:2;opacity:.85;transition:opacity .15s}
.links circle{fill:var(--ac)}
.links .head{fill:var(--ac);stroke:none}
.links .back{opacity:.55}
.links .back path{stroke-dasharray:6 5}
.links.focus g:not(.hot){opacity:.12}
.links.focus g.hot{opacity:1}
#allscreens{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(420px,100%),1fr));gap:14px}
.mini{display:flex;flex-direction:column;justify-content:flex-start;border:1px solid var(--line2);border-radius:12px;background:var(--bg);padding:8px;cursor:pointer;text-align:left;width:100%}
.mini[aria-current="true"]{border-color:var(--ac);box-shadow:0 0 0 2px var(--ac-bg)}
.mini .mini-title{font:600 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--sub);display:block;margin-bottom:4px}
.mini .mini-body{pointer-events:none}
.mini .screen{min-height:0}
#brief h2{font-size:15px;margin-bottom:6px}
.brief-q{font-size:17px;font-weight:650;color:var(--ink);line-height:1.4;margin:0 0 10px}
.brief-h3{font:600 12px var(--sans);text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:12px 0 4px}
.brief-explains{font-size:14.5px}
.brief-rec{margin-top:8px}
.brief-ex,.brief-risks{margin:0;padding-left:18px;font-size:13.5px}
.brief-ex li,.brief-risks li{margin:3px 0}
.unverified{color:var(--warn);font-size:12.5px}
.dg-brief .dg-shape{stroke:var(--warn);stroke-width:3;stroke-dasharray:3 3}
#upanel.brief-here{border-color:var(--warn)}
#upanel.brief-here .panel-title::after{content:" · look here";color:var(--warn);font-weight:600}
.asks-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.ask{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:4px 12px;border:1px solid var(--line2);border-radius:10px;
  cursor:pointer;font-size:13px;color:var(--ink2);background:var(--surf)}
.ask input{margin:0;accent-color:var(--ac)}
.ask:has(input:checked){border-color:var(--ac);background:var(--ac-bg);color:var(--ink)}
#flowbeside{border:1px solid var(--line);border-radius:10px;background:var(--surf);overflow:auto;max-height:420px;padding:4px}
#flowbeside svg{max-width:none}
.dg-part-off{opacity:.3}
.dg-part-up .dg-shape{stroke-dasharray:5 4}
.dg-part-on .dg-shape{stroke:var(--ac);stroke-width:2.5}
.dg-part-label{display:flex;gap:6px;align-items:center;font-size:13px;min-height:44px;margin-bottom:6px}
.dg-part-label select{min-height:36px;font:13px var(--sans)}
.sec-box{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:14px;background:var(--bg)}
.sec-head{display:flex;align-items:center;gap:8px}
.sec-toggle{flex:1;text-align:left;background:none;border:0;color:var(--ink);font:600 14px var(--sans);min-height:44px;cursor:pointer}
.sec-actions{display:flex;gap:6px}
.sec-up,.sec-down{min-width:44px;min-height:44px;border:1px solid var(--line2);border-radius:9px;background:var(--surf);color:var(--ink2);cursor:pointer;font-size:14px}
.sec-body .steps-h:first-child{display:none}
.screen{background:var(--surf);border:1px solid var(--line2);border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:10px;min-height:300px}
.screen-title{font:600 11px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--sub)}
.hint{color:var(--mut);font-size:13px}
.player-bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px}
.player-bar .note{font-size:12.5px;color:var(--mut)}
.steps-h{font-size:15px;margin:24px 0 0}
.end{font-size:12.5px;color:var(--mut);margin:0}
/* part 3a views */
[hidden]{display:none!important}
.journeys{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:8px 0 16px}
.journey,.w-row,.p-item{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:44px;text-align:left;background:var(--surf);border:1px solid var(--line2);border-radius:12px;padding:10px 12px;font:13px var(--sans);color:var(--ink2);cursor:pointer;width:100%}
.journey[aria-current="true"],.w-row[aria-current="true"],.p-item[aria-current="true"]{border-color:var(--ac);box-shadow:0 0 0 2px var(--ac-line)}
fieldset.item[aria-current="true"]{border:2px solid var(--ac)}
.j-title{font-size:14px;color:var(--ink);overflow-wrap:anywhere}
.basis,.j-count{font-size:12px;color:var(--mut)}
.outcome-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:8px 0}
.outcome{border:1px solid var(--line2);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:4px}
.outcome[data-picked="true"]{border-color:var(--ac);background:var(--ac-bg)}
.outcome p{margin:0;font-size:13px}
.outcome [data-outcome]{min-height:44px;align-self:flex-start;margin-top:4px}
.whole-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0}
.whole-filters label{display:flex;gap:6px;align-items:center;font-size:13px;min-height:44px}
.whole-filters select{min-height:36px;font:13px var(--sans)}
.whole-count,.filterinfo{font-size:12.5px;color:var(--mut);margin:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#showall{min-height:44px}
.flow-filters{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--mut)}
.flow-filters label{display:flex;gap:6px;align-items:center;min-height:44px}
.flow-filters select{min-height:36px;font:13px var(--sans)}
.whole-rows{display:flex;flex-direction:column;gap:8px}
.w-journey{font:11px var(--mono);color:var(--sub)}
.w-status{font:600 10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--ac)}
.panes{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px}
@media (max-width:699px){.panes{grid-template-columns:1fr}}
.pane{border:1px solid var(--line);border-radius:12px;padding:12px}
.pane h3{font-size:12.5px;color:var(--mut);margin:10px 0 6px}
.pane-body{display:flex;flex-direction:column;gap:6px}
/* diagrams (part 3b): our own shapes and icons (D041) */
.dg-list{display:flex;flex-direction:column;gap:18px;margin-top:8px}
.dg-figure{margin:0}
.dg-figure figcaption{font-size:13px;color:var(--mut);margin-bottom:6px}
.dg-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--surf);padding:6px}
.dg{display:block}
.dg-shape{fill:var(--surf2);stroke:var(--line3);stroke-width:1.5}
.dg-k-start .dg-shape,.dg-k-entry .dg-shape,.dg-k-end .dg-shape,.dg-k-exit .dg-shape{fill:var(--ok-bg);stroke:var(--ok)}
.dg-k-end-failed .dg-shape,.dg-k-error .dg-shape,.dg-k-cancel .dg-shape{fill:var(--bad-bg);stroke:var(--bad)}
.dg-k-decision .dg-shape,.dg-k-event-choice .dg-shape,.dg-k-merge .dg-shape,.dg-k-parallel-start .dg-shape,.dg-k-parallel-join .dg-shape,.dg-k-note .dg-shape{fill:var(--warn-bg);stroke:var(--warn)}
.dg-group{fill:none;stroke-dasharray:5 4}
.dg-line{fill:none;stroke:var(--line3);stroke-width:1.5}
.dg-label{fill:var(--ink);font:12.5px var(--sans)}
.dg-lane rect{fill:none;stroke:var(--line)}
.dg-lane-title{fill:var(--mut);font:600 11px var(--mono)}
.dg-edge path{fill:none;stroke:var(--line3);stroke-width:1.5}
.dg-e-message path{stroke-dasharray:6 4}
.dg-e-association path{stroke-dasharray:2 3}
.dg-back path{stroke:var(--warn)}
.dg-edge-label{fill:var(--ink2);font:600 11px var(--sans);paint-order:stroke;stroke:var(--surf);stroke-width:5px;stroke-linejoin:round}
.dg marker path{fill:var(--line3)}
.dg-icon{fill:none;stroke:var(--ac);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dg-node[data-step]{cursor:pointer}
.dg-node[aria-current="true"] .dg-shape{stroke:var(--ac);stroke-width:3;fill:var(--ac-bg)}
.dg-node:focus-visible{outline:none}
.dg-node:focus-visible .dg-shape{stroke:var(--ac);stroke-width:3}
.dg-component{font-size:11px;line-height:1.35}
.dg-component .c-dialog,.dg-component .c-card,.dg-component .c-banner{padding:6px}
/* components: our own generic wireframes (D030) */
.screen .is-target{min-height:44px;min-width:44px;border:2px solid var(--ac);background:var(--ac-bg);color:var(--ac);border-radius:9px;padding:8px 14px;font:600 13.5px var(--sans);cursor:pointer;text-align:left}
.screen .is-target:hover{background:var(--ac);color:var(--on-ac)}
.c-button{display:inline-flex;align-items:center;min-height:36px;padding:6px 14px;border:1px solid var(--line2);border-radius:9px;font-size:13.5px;color:var(--ink3)}
.c-heading{font-size:19px}
.c-text,.c-card p,.c-dialog p,.c-empty p,.c-banner p{margin:0;font-size:14px;color:var(--ink2)}
.c-field{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--mut)}
.c-field input,.c-field select,.c-search input{font:14px var(--sans);padding:8px 10px;border:1px solid var(--line2);border-radius:8px;background:var(--inset);color:var(--ink)}
.c-date{font:14px var(--mono);color:var(--ink);padding:8px 10px;border:1px solid var(--line2);border-radius:8px;background:var(--inset)}
.c-list{margin:0;padding-left:18px;font-size:14px}
.c-header{display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--line);padding-bottom:8px}
.c-header h2{font-size:16px;flex:1}
.c-tab-bar,.c-tabs{display:flex;gap:4px;border:1px solid var(--line);border-radius:10px;padding:4px}
.c-tab{flex:1;text-align:center;border-radius:7px}
.c-tab[aria-current],.c-tab[aria-selected="true"]{background:var(--ac-bg)}
.c-tab-label,.c-menu-label{display:block;padding:8px;font-size:13px}
.c-side-menu{display:flex;flex-direction:column;border-left:3px solid var(--line2);padding-left:8px}
.c-menu-item[aria-current]{font-weight:700}
.c-breadcrumb ol{display:flex;gap:6px;list-style:none;margin:0;padding:0;font-size:12.5px;color:var(--mut)}
.c-breadcrumb li+li::before{content:'›';margin-right:6px}
.c-check,.c-radio label,.c-switch{display:flex;align-items:center;gap:8px;font-size:14px}
.c-radio{border:1px solid var(--line);border-radius:10px;padding:8px 12px;display:flex;flex-direction:column;gap:6px;margin:0}
.c-radio legend{font-size:12.5px;color:var(--mut)}
.c-switch b{font:600 11px var(--mono);color:var(--ac)}
.c-stepper{display:flex;align-items:center;gap:8px;font-size:14px}
.c-stepper>span:first-child{flex:1;color:var(--mut)}
.c-step{min-width:32px;justify-content:center;padding:0}
.c-card{border:1px solid var(--line2);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.c-card h3{font-size:15px}
.c-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.c-chip{align-self:flex-start;font:600 11.5px var(--sans);padding:3px 10px;border-radius:99px;border:1px solid var(--line2)}
.c-chip[data-tone=positive]{color:var(--ok);background:var(--ok-bg)}
.c-chip[data-tone=caution]{color:var(--warn);background:var(--warn-bg)}
.c-chip[data-tone=negative]{color:var(--bad);background:var(--bad-bg)}
.c-image{margin:0}
.c-placeholder{display:grid;place-items:center;min-height:110px;border:1px dashed var(--line3);border-radius:10px;color:var(--mut);font-size:13px;background:var(--inset)}
.c-image figcaption{font-size:12px;color:var(--mut);margin-top:4px}
.c-table-wrap{overflow-x:auto}
.c-table{border-collapse:collapse;width:100%;font-size:13px}
.c-table th,.c-table td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left}
.c-avatar{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--ac-bg);color:var(--ac);font:700 13px var(--sans)}
.c-dialog{border:1px solid var(--line3);border-radius:14px;padding:16px;box-shadow:0 12px 32px -18px rgba(0,0,0,.5);background:var(--surf)}
.c-dialog h3{font-size:16px;margin-bottom:6px}
.c-toast{align-self:center;background:var(--ink);color:var(--bg);border-radius:10px;padding:8px 14px;font-size:13.5px}
.c-banner{border-radius:10px;padding:10px 12px;border:1px solid var(--line2);display:flex;flex-direction:column;gap:3px}
.c-banner[data-tone=caution]{background:var(--warn-bg);border-color:var(--warn)}
.c-banner[data-tone=negative]{background:var(--bad-bg);border-color:var(--bad)}
.c-banner[data-tone=positive]{background:var(--ok-bg);border-color:var(--ok)}
.c-banner .c-because,.c-banner .c-cannow{font-size:13px;color:var(--ink3)}
.c-empty{text-align:center;padding:18px;border:1px dashed var(--line2);border-radius:12px;display:flex;flex-direction:column;gap:10px;align-items:center}
.c-progress{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--mut)}
.c-progress progress{width:100%}
.c-sr{position:absolute;left:-9999px}
/* D092 — on a touch screen every control is at least 44 × 44 px (Apple's guideline, WCAG AAA); with a
   mouse the page keeps its compact layout. The drawn app screen is a picture, not controls: .is-target
   there is 44 px already. Safari ignores a native select's height, so on touch the page draws it. */
@media (pointer:coarse){
  :is(button,textarea,input:not([type=radio],[type=checkbox],[type=hidden]),label:has(>input[type=radio]),label:has(>input[type=checkbox]),[role=tab]):not(.screen *,.skip){min-height:44px}
  .chip,.row-open{min-width:44px}
  select:not(.screen *){-webkit-appearance:none;appearance:none;height:44px;padding:4px 30px 4px 10px;color:var(--ink);border:1px solid var(--line2);border-radius:7px;
    background:linear-gradient(45deg,transparent 50%,var(--mut) 50%) right 16px center/5px 5px no-repeat,linear-gradient(135deg,var(--mut) 50%,transparent 50%) right 11px center/5px 5px no-repeat,var(--surf)}
}
</style>
</head><body>
<a class="skip" href="#items">Skip to the items</a>
<div class="wrap${review.flow ? ' flow' : ''}">
<header>
  <div class="htop">
    <div>
      <h1>${esc(review.title)}</h1>
      ${review.subtitle ? `<p class="sub">${esc(review.subtitle)}</p>` : ''}
      ${review.audience ? `<p class="meta">Written for: ${esc(review.audience)}</p>` : ''}
    </div>
    <div class="htools">
      <label class="style-pick">Style <select id="style">
        <option value="">Default</option><option value="mac84">Macintosh 1984</option><option value="cyber">Cyberpunk</option>
        <option value="newsletter">Newsletter</option><option value="shyhunter">ShyHunter</option>
      </select></label>
      <label class="style-pick">Mode <select id="theme">
        <option value="">Auto</option><option value="light">Light</option><option value="dark">Dark</option>
      </select></label>
      <button class="btn pin" type="button" aria-pressed="false">Pin</button>
    </div>
  </div>
  ${review.intro ? `<div class="intro" id="intro"></div>` : ''}
  ${review.ask || review.afterwards ? `<div class="asks">
    ${review.ask ? `<p><b>How to answer</b>${esc(review.ask)}</p>` : ''}
    ${review.afterwards ? `<p><b>What happens next</b>${esc(review.afterwards)}</p>` : ''}
  </div>` : ''}
</header>

${review.flow ? `<section id="player" aria-label="Click through the flow">
  <div id="stage" class="stage">
    <section id="dpanel" class="panel" aria-label="The diagram">
      <div class="panel-head">
        <span class="panel-title">Diagram</span>
        <button class="btn pin" type="button" aria-pressed="false">Pin</button>
        <button class="btn panel-full" type="button" aria-pressed="false">Full screen</button>
      </div>
      <div class="panel-body">
        <div id="dgtabs" role="tablist" aria-label="Which diagram"></div>
        <div class="dg-body">
          <div id="subproc">
            <button type="button" id="subswitch" class="switch" role="switch" aria-checked="true">
              <span class="switch-box"></span>Sub-processes</button>
            <div id="chips" role="group" aria-label="Highlight a sub-process"></div>
          </div>
          <div id="flowbeside" role="tabpanel" aria-label="The flow, with where you are"></div>
        </div>
      </div>
    </section>
    <section id="upanel" class="panel" aria-label="The screen">
      <div class="panel-head">
        <span class="panel-title">Screen</span>
        <div class="seg" role="group" aria-label="How many screens to show">
          <button class="btn" type="button" data-screens="one" aria-pressed="true">This screen</button>
          <button class="btn" type="button" data-screens="all" aria-pressed="false">All screens</button>
          <button class="btn panel-full" type="button" aria-pressed="false">Full screen</button>
        </div>
        <button type="button" id="linkswitch" class="switch" role="switch" aria-checked="true" hidden>
          <span class="switch-box"></span>Connections</button>
        <button class="btn pin" type="button" aria-pressed="false">Pin</button>
      </div>
      <div class="panel-body"><div id="screen" class="screen"></div><div id="allscreens" hidden></div></div>
    </section>
  </div>
    ${review.brief ? `<section id="brief" aria-labelledby="brief-h">
      <div class="brief-head"><h2 id="brief-h">What I need you to decide</h2><button class="btn pin" type="button" aria-pressed="false">Pin</button></div>
      ${review.brief.question ? `<p class="brief-q">${esc(review.brief.question)}</p>` : ''}
      ${review.brief.explains ? `<p class="brief-explains">${esc(review.brief.explains)}</p>` : ''}
      ${review.brief.recommendation ? `<p class="brief-rec"><span class="k">My recommendation</span>${esc(review.brief.recommendation)}</p>` : ''}
      ${(review.brief.examples || []).length ? `<h3 class="brief-h3">Where this has been done before</h3>
      <ul class="brief-ex">${review.brief.examples.map((x) => `<li><b>${esc(x.name)}</b> ${esc(x.what)}
        ${x.source ? `<a href="${esc(x.source)}" rel="noreferrer">${esc(String(x.source).replace(/^https?:\/\//, '').split('/')[0])}</a>`
          : '<span class="unverified">unverified · I could not find a source</span>'}</li>`).join('')}</ul>` : ''}
      ${(review.brief.risks || []).length ? `<h3 class="brief-h3">What could go wrong</h3>
      <ul class="brief-risks">${review.brief.risks.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    </section>` : ''}
    <section id="feedback" aria-labelledby="fb-h">
      <h2 id="fb-h">Your feedback</h2>
      <p id="overview" class="hint" aria-live="polite"></p>
      <div id="split" class="split" data-size="even">
        <div class="sizes" role="group" aria-label="How the row is shared">
          <button class="btn" type="button" data-size="list" aria-pressed="false" aria-label="Give the steps more room">◧</button>
          <button class="btn" type="button" data-size="even" aria-pressed="true" aria-label="Share the row evenly">◫</button>
          <button class="btn" type="button" data-size="detail" aria-pressed="false" aria-label="Give the open step more room">◨</button>
        </div>
        <div id="steplist"></div>
        <aside id="detail" aria-label="The step you opened"></aside>
      </div>
    </section>
  <div class="player-bar"><button class="btn" id="restart" type="button">Restart</button>
    <span class="note">Where you click is never saved or sent. Only your verdicts, notes and added items are.</span></div>
  <p id="announce" class="skip" aria-live="polite"></p>
</section>` : ''}

<div class="bar" role="search">
  <label class="skip" for="q">Search items</label>
  <input type="search" id="q" placeholder="Search…" autocomplete="off">
  <div id="filters" role="group" aria-label="Filter items"></div>
  ${review.flow ? `<div class="flow-filters" role="group" aria-label="Filter steps">
    <label>Journey <select id="f-journey"><option value="">All journeys</option></select></label>
    <label>Status <select id="f-status"><option value="">Any status</option><option value="exists">In the product</option><option value="proposed">Planned</option><option value="suggested">Suggested</option></select></label>
    <label><input type="checkbox" id="f-problems"> Only where something goes wrong</label>
  </div>` : ''}
  <output class="prog" id="prog" aria-live="polite"></output>
  <p id="filterinfo" class="filterinfo" aria-live="polite"></p>
</div>

${review.allowAddedItems === false ? '' : `
<section class="add" aria-labelledby="addh">
  <h2 id="addh">Add your own feedback</h2>
  <p class="d">Anything you want to say: ${/^[aeiou]/i.test(review.addNoun || 'item') ? 'an' : 'a'} ${esc(review.addNoun || 'item')} nobody asked about, an idea, or something unrelated. It goes back with your answers.</p>
  <label class="skip" for="at">Title</label>
  <input type="text" id="at" placeholder="What is it about?">
  <label class="skip" for="ab">Detail</label>
  <textarea id="ab" placeholder="Your feedback (optional)"></textarea>
  <div style="display:flex;gap:8px;margin-top:9px"><button class="btn" id="addbtn" type="button">Add it</button></div>
  <div id="added" style="margin-top:12px"></div>
</section>`}

<main id="items"></main>

<div class="done">
  <button class="btn pri" id="export" type="button">Export feedback.json</button>
  <button class="btn" id="exporth" type="button">Export feedback.html</button>
  <button class="btn" id="reset" type="button">Clear my answers</button>
  <span class="note" id="footnote">Answers save in this browser as you go.</span>
</div>
</div>

<script>
// D076 — the page as it arrived, before anything is drawn: "Export feedback.html" saves this whole
// page with the answers written into SEED, so the file shows everything, not a summary.
const PAGE = '<!doctype html>\\n' + document.documentElement.outerHTML;
const REVIEW = ${embed(review)};
const SEED = null;
${builder}
${drawer}
${diagrams}

// An exported copy keeps its own answers apart from this browser's own, so opening one overwrites nothing.
const LS = 'letmeshowyousomething:' + REVIEW.id + (SEED ? ':copy:' + SEED.exportedAt : '');
const TONE = ${embed(TONE)};
let store = { verdicts:{}, notes:{}, added:[], choices:{}, requests:{} };
if (SEED) { const { exportedAt, ...answers } = SEED; store = Object.assign(store, answers); }
try { const raw = localStorage.getItem(LS); if (raw) store = Object.assign(store, JSON.parse(raw)); } catch {}
const save = () => { try { localStorage.setItem(LS, JSON.stringify(store)); } catch {} };

const $ = (s) => document.querySelector(s);
const OPTS = REVIEW.verdictSet.options;
const negative = new Set(OPTS.filter(o=>o.tone==='negative').map(o=>o.value));
let filter = 'all', q = '';

// Minimal markdown for the intro: bold and inline code only. Anything richer is the agent's job.
if (REVIEW.intro) $('#intro').innerHTML = esc(REVIEW.intro)
  .replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>').replace(/\`(.+?)\`/g,'<code>$1</code>');

// theme
// Style and mode are two choices (D083): any style in light or dark. Only listed values are applied.
for (const [key, attr] of [['style', 'data-style'], ['theme', 'data-theme']]) {
  const pick = $('#' + key), set = (v) => v ? document.documentElement.setAttribute(attr, v) : document.documentElement.removeAttribute(attr);
  try { const v = localStorage.getItem(LS + ':' + key) || ''; if ([...pick.options].some(o => o.value === v)) { set(v); pick.value = v; } } catch {}
  pick.addEventListener('change', () => { set(pick.value); try { localStorage.setItem(LS + ':' + key, pick.value); } catch {} });
}

// D079 — pins: the header, the diagram, the screen and the brief can each stay on screen.
// Which ones are pinned is remembered in this browser only.
const PINNABLE = ['header', '#dpanel', '#upanel', '#brief'];
let pins = [];
try { pins = JSON.parse(localStorage.getItem(LS + ':pins') || '[]'); } catch {}
function stackPins(){
  let top = 0; const on = [...document.querySelectorAll('.pinned')];
  document.documentElement.style.setProperty('--pins', String(on.length || 1));
  for (const el of on) { el.style.setProperty('--pin-top', top + 'px'); top += el.offsetHeight; }
  document.documentElement.style.setProperty('--pins-h', top + 'px');
}
function applyPins(){
  for (const sel of PINNABLE) {
    const el = $(sel); if (!el) continue;
    const on = pins.includes(sel);
    el.classList.toggle('pinned', on);
    const b = el.querySelector('.pin'); if (b) { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Unpin' : 'Pin'; }
  }
  stackPins();
}
document.addEventListener('click', e => {
  const b = e.target.closest('.pin'); if (!b) return;
  const sel = PINNABLE.find(s => b.closest(s) === $(s)); if (!sel) return;
  pins = pins.includes(sel) ? pins.filter(x => x !== sel) : pins.concat(sel);
  try { localStorage.setItem(LS + ':pins', JSON.stringify(pins)); } catch {}
  applyPins();
});
const pinSizes = new ResizeObserver(stackPins);
for (const sel of PINNABLE) if ($(sel)) pinSizes.observe($(sel));
addEventListener('resize', stackPins);
applyPins();

// filters — "gaps only" is first-class, per the protocol's gap-first invariant
$('#filters').innerHTML = [['all','All'],['gaps','⚠ Gaps only'],['unset','Unanswered']]
  .concat(OPTS.map(o=>[o.value,o.label]))
  .map(([v,l])=>\`<button class="chip" type="button" data-f="\${v}" aria-pressed="\${v==='all'}">\${esc(l)}</button>\`).join('');
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('[data-f]'); if(!b) return;
  filter = b.dataset.f;
  $('#filters').querySelectorAll('[data-f]').forEach(x=>x.setAttribute('aria-pressed', String(x.dataset.f===filter)));
  render();
});
$('#q').addEventListener('input', e => { q = e.target.value.toLowerCase().trim(); render(); });

function visible(it){
  const v = store.verdicts[it.id] || 'unset';
  if (it.step) {
    const j = ($('#f-journey') || {}).value || '', st = ($('#f-status') || {}).value || '', problems = ($('#f-problems') || {}).checked;
    if (j && journeyOf(it) !== j) return false;
    if (st && statusOf(it.step) !== st) return false;
    if (problems && !it.step.outcomes.some(o => o.because)) return false;
  }
  const pickedSection = (REVIEW.sections || []).some(s => s.id === it.sectionId && s.mode === 'choose-one') && store.choices[it.sectionId];
  const doubts = (REVIEW.sections || []).some(s => s.id === it.sectionId && s.kind === 'challenge');
  const positiveV = OPTS.filter(o => o.tone === 'positive').map(o => o.value).includes(v);
  const isGap = v === 'unset' ? !pickedSection : doubts ? positiveV : negative.has(v);
  if (filter === 'gaps' && !isGap) return false;
  if (filter !== 'all' && filter !== 'gaps' && v !== filter) return false;
  if (!q) return true;
  return (it.title + ' ' + (it.body||'') + ' ' + Object.values(it.fields||{}).join(' ')).toLowerCase().includes(q);
}

function render(){
  const secs = REVIEW.sections && REVIEW.sections.length ? REVIEW.sections : [{ id:'__all', label:'' }];
  let html = '', shown = 0;
  for (const sec of secs){
    const items = REVIEW.items.filter(i => (sec.id==='__all' ? true : i.sectionId===sec.id) && visible(i));
    if (!items.length) continue;
    shown += items.length;
    html += '<section class="sec" aria-labelledby="h-'+sec.id+'">';
    if (sec.label) html += \`<h2 id="h-\${sec.id}">\${esc(sec.label)}</h2>\`;
    if (sec.description) html += \`<p class="d">\${esc(sec.description)}</p>\`;
    if (sec.mode === 'choose-one') html += '<p class="pick">Choose one</p>';
    if (sec.diagram && sec.diagram.kind === 'mermaid')
      html += \`<div class="mmd"><pre>\${esc(sec.diagram.source)}</pre></div>\`;
    html += items.map(it => itemHtml(it, sec)).join('');
    html += '</section>';
  }
  $('#items').innerHTML = html || '<p class="empty">Nothing matches that filter.</p>';
  const answered = REVIEW.items.filter(i => store.verdicts[i.id]).length;
  $('#prog').textContent = answered + '/' + REVIEW.items.length + ' answered' + (shown!==REVIEW.items.length ? ' · '+shown+' shown' : '');
  // D046 — a filter never hides silently
  $('#filterinfo').innerHTML = shown !== REVIEW.items.length ? 'Showing ' + shown + ' of ' + REVIEW.items.length + ' · <button type="button" class="btn" id="showall">Show all</button>' : '';
  renderAdded();
  if (REVIEW.flow) {
    $('#overview').textContent = answered + ' answered · ' + (REVIEW.items.length - answered) + ' open';
    const st = STEPS.find(s => s.id === selected);
    $('#detail').innerHTML = st ? itemHtml(st, null, true)
      : '<p class="hint">Tap a highlighted element on the screen, or pick a step on the left. Its goal, outcomes and your answer open here.</p>';
  }
}

// D060 — the reviewer can ask back: an example, or an explanation. Both travel in the feedback.
const ASKS = [['example', 'Show me an example'], ['explain', 'Explain this']];
const asksRow = (id) => \`<div class="asks-row">\${ASKS.map(([kind, label]) => \`<label class="ask"><input type="checkbox"
  data-ask="\${esc(kind)}" data-for="\${esc(id)}"\${(store.requests[id] || {})[kind] ? ' checked' : ''}> \${label}</label>\`).join('')}</div>\`;

// D069 — a step you have not opened is one line: where it sits, and whether it is answered or still open.
function stepRow(it, cur){
  const o = OPTS.find(x => x.value === cur);
  return \`<fieldset class="item row" data-v="\${cur}" data-step="\${esc(it.id)}" aria-current="\${selected === it.id}" style="--tone:var(--\${TONE[(o || {}).tone] || 'line2'})">
    <legend><button type="button" class="row-open" data-open="\${esc(it.id)}">\${esc(it.title)}</button></legend>
    <p class="row-meta"><span class="w-journey">\${esc((JOURNEYS.find(j => j.id === journeyOf(it)) || {}).title || '')}</span>
      <span class="w-status">\${STATUS_LABEL[statusOf(it.step)]}</span>\${store.notes[it.id] ? '<span>· note</span>' : ''}
      <span class="row-v">\${o ? esc(o.label) : 'Open'}</span></p>
  </fieldset>\`;
}
// The open step shows every outcome side by side; "Show this" plays it on the screen.
function outcomeCols(it){
  const o = last && last.step === it ? last.outcome : null;
  return (pending === it ? '<p class="hint">What happens? Pick one to see it.</p>' : '')
    + \`<div class="outcome-cols">\${it.step.outcomes.map((x, i) => \`<div class="outcome" data-picked="\${x === o}">
      <b>\${esc(x.label || 'Result')}</b><p><span class="k">Effect</span>\${esc(x.effect)}</p>
      \${x.because ? \`<p><span class="k">Why</span>\${esc(x.because)}</p>\` : ''}\${x.canNow ? \`<p><span class="k">You can now</span>\${esc(x.canNow)}</p>\` : ''}
      <p class="basis">Leads to: \${esc(screenTitle(x.to))}</p>
      <button type="button" class="btn" data-outcome="\${i}" data-for="\${esc(it.id)}">\${x === o ? 'Showing this' : 'Show this'}</button></div>\`).join('')}</div>\`;
}

function itemHtml(it, sec, full){
  const cur = store.verdicts[it.id] || 'unset';
  if (it.step && !full) return stepRow(it, cur);
  const choosing = sec && sec.mode === 'choose-one';
  const chosen = choosing && store.choices[sec.id] === it.id;
  const rec = choosing && sec.recommended && sec.recommended.itemId === it.id;
  const tone = TONE[(OPTS.find(o=>o.value===cur)||{}).tone] || '';
  const flds = (REVIEW.fields||[]).filter(f => (it.fields||{})[f.key]).map(f =>
    \`<div class="fld"><span class="k" style="--fk:var(--\${TONE[f.tone]||'mut'})">\${esc(f.label)}</span><span class="val">\${esc(it.fields[f.key])}</span></div>\`).join('');
  const stepAttrs = it.step && !full ? \` data-step="\${esc(it.id)}" aria-current="\${selected === it.id}"\` : '';
  return \`<fieldset class="item\${chosen ? ' chosen' : ''}\${it.step ? ' open' : ''}" data-v="\${cur}"\${stepAttrs} style="--tone:var(--\${tone||'line2'})">
    <legend>\${esc(it.title)}</legend>
    \${choosing ? \`<div class="choose"><label><input type="radio" name="c-\${esc(sec.id)}" value="\${esc(it.id)}"
      data-choice="\${esc(sec.id)}" \${chosen ? 'checked' : ''}> Choose this</label>
      \${rec ? \`<span class="rec">Recommended</span><span class="recwhy">\${esc(sec.recommended.why)}</span>\` : ''}</div>\` : ''}
    \${it.step ? \`<p class="w-line"><span class="w-journey">\${esc((JOURNEYS.find(j => j.id === journeyOf(it)) || {}).title || '')}</span>
      <span class="w-status">\${STATUS_LABEL[statusOf(it.step)]}</span></p>\` : ''}
    \${it.step && it.step.goal ? \`<p class="body">Goal: \${esc(it.step.goal)}</p>\` : ''}
    \${it.step ? outcomeCols(it) : ''}
    \${it.summary ? \`<p class="body">\${esc(it.summary)}</p>\` : ''}
    \${it.body ? (it.summary
      ? \`<details class="more"><summary>More detail</summary><p class="body">\${esc(it.body)}</p></details>\`
      : \`<p class="body">\${esc(it.body)}</p>\`) : ''}
    \${(it.affects || []).map(a => \`<p class="aff"><span class="k">Previously decided · \${esc(a.effect)}</span>
      "\${esc(a.decision.title)}" was answered \${esc(a.decision.verdict)}. \${esc(a.why)}</p>\`).join('')}
    \${flds ? \`<div class="flds">\${flds}</div>\` : ''}
    \${it.ref ? \`<p class="ref">\${esc(it.ref)}</p>\` : ''}
    <div class="verdicts" role="radiogroup" aria-label="Verdict for: \${esc(it.title)}">
      \${OPTS.map(o=>\`<label class="v-\${TONE[o.tone]}">
        <input type="radio" name="v-\${esc(it.id)}" value="\${esc(o.value)}" \${cur===o.value?'checked':''}
          data-item="\${esc(it.id)}">\\
        <span>\${esc(o.label)}</span></label>\`).join('')}
    </div>
    \${(OPTS.find(o=>o.value===cur)||{}).hint ? \`<p class="hint">\${esc(OPTS.find(o=>o.value===cur).hint)}</p>\` : ''}
    <label class="skip" for="n-\${esc(it.id)}">Note for \${esc(it.title)}</label>
    <textarea id="n-\${esc(it.id)}" data-note="\${esc(it.id)}"
      placeholder="What did you see? Your own words are the part that gets acted on.">\${esc(store.notes[it.id]||'')}</textarea>
    \${asksRow(it.id)}
  </fieldset>\`;
}

function renderAdded(){
  const box = $('#added'); if (!box) return;
  box.innerHTML = (store.added.length ? '<h3 class="added-h">Your own feedback</h3>' : '') + store.added.map((a,i)=>\`<div class="addedrow">
    <div class="t">\${esc(a.title)}\${a.body?\`<div class="b">\${esc(a.body)}</div>\`:''}</div>
    <button class="btn" type="button" data-del="\${i}" aria-label="Remove \${esc(a.title)}">Remove</button></div>\`).join('');
}

document.addEventListener('change', e => {
  const ask = e.target.closest('input[data-ask]');
  if (ask) {
    const id = ask.dataset.for, kind = ask.dataset.ask;
    const cur = store.requests[id] || (store.requests[id] = {});
    cur[kind] = ask.checked;
    if (!cur.example && !cur.explain && !cur.note) delete store.requests[id];
    save(); render();
    const same = document.querySelector('[data-ask="' + CSS.escape(kind) + '"][data-for="' + CSS.escape(id) + '"]');
    if (same) same.focus();
    return;
  }
  const r = e.target.closest('input[type=radio][data-item], input[type=radio][data-choice]');
  if (!r) return;
  if (r.dataset.item) store.verdicts[r.dataset.item] = r.value; else store.choices[r.dataset.choice] = r.value;
  save(); render();
  // render() rebuilds the list; put keyboard focus back on the same choice
  const same = document.querySelector('input[name="'+CSS.escape(r.name)+'"][value="'+CSS.escape(r.value)+'"]');
  if (same) same.focus();
});
document.addEventListener('input', e => {
  const t = e.target.closest('textarea[data-note]');
  if (t){ store.notes[t.dataset.note] = t.value; save();
    const answered = REVIEW.items.filter(i => store.verdicts[i.id]).length;
    $('#prog').textContent = answered + '/' + REVIEW.items.length + ' answered'; }
});
document.addEventListener('click', e => {
  if (e.target.closest('#showall')) {
    filter = 'all'; q = ''; $('#q').value = '';
    if ($('#f-journey')) { $('#f-journey').value = ''; $('#f-status').value = ''; $('#f-problems').checked = false; }
    $('#filters').querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.f === 'all')));
    return render();
  }
  const card = e.target.closest('fieldset.item.row[data-step]');
  if (card && FLOW && !e.target.closest('input,textarea,label,button')) return selectStep(card.dataset.step);
  const d = e.target.closest('[data-del]');
  if (d){ store.added.splice(+d.dataset.del,1); save(); render(); }
});
const addBtn = $('#addbtn');
if (addBtn) addBtn.addEventListener('click', () => {
  const t = $('#at').value.trim(), b = $('#ab').value.trim();
  if (!t && !b) { $('#at').focus(); return; }
  let n = store.added.length + 1;
  while (store.added.some(a => a.id === 'added-'+n)) n++;
  store.added.push({ id:'added-'+n, title:t||'(untitled)', body:b, verdict:'unset', note:null });
  save(); $('#at').value=''; $('#ab').value=''; render(); $('#at').focus();
});

$('#export').addEventListener('click', () => {
  const out = buildFeedback(REVIEW, store);
  saveAs(JSON.stringify(out,null,2), 'application/json', REVIEW.id + '.feedback.json');
  $('#footnote').textContent = \`Exported \${out.summary.answered}/\${out.summary.total} answered · \${out.summary.added} added · \${out.gaps.length} gaps. Send me the file.\`;
});
const saveAs = (text, type, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
};
// D076 — the HTML export is this whole page with the answers in it: every chart, screen and step, for
// someone who will never open a .json file. "<" is escaped so no answer can close the script tag.
$('#exporth').addEventListener('click', () => {
  const seed = JSON.stringify({ ...store, exportedAt: new Date().toISOString() }).replace(/</g, '\\\\u003c');
  saveAs(PAGE.replace(/^const SEED = .*$/m, () => 'const SEED = ' + seed + ';'), 'text/html', REVIEW.id + '.feedback.html');
  $('#footnote').textContent = 'Exported the whole page with your answers. The agent still needs the .json file.';
});
$('#reset').addEventListener('click', () => {
  if (!confirm('Clear every answer you have given on this machine?')) return;
  store = { verdicts:{}, notes:{}, added:[], choices:{}, requests:{} }; save(); render();
});
// ── flow player (D002: outcomes are picked, never computed · D003: position lives in memory only) ──
const FLOW = REVIEW.flow || null;
let at = FLOW ? FLOW.start : null, pending = null, last = null;
let selected = null;   // the one step marked across every view; memory only (D003)
const partsById = FLOW ? Object.fromEntries((FLOW.parts || []).map(p => [p.id, p])) : {};
const stepsFrom = (screenId) => REVIEW.items.filter(i => i.step && i.step.from === screenId);
const STEPS = REVIEW.items.filter(i => i.step);
const STATUS_LABEL = { exists: 'In the product', proposed: 'Planned', suggested: 'Suggested' };
const STATUS_TONE = { exists: 'positive', proposed: 'caution', suggested: 'neutral' };
const statusOf = (x) => (x && x.status) || 'proposed';
// Journeys: the top-level parts, or the children of the only top-level part (the whole process).
const topParts = FLOW ? (FLOW.parts || []).filter(p => !p.parent) : [];
const JOURNEYS = topParts.length === 1 ? (FLOW.parts || []).filter(p => p.parent === topParts[0].id) : topParts;
function journeyOf(it){ for (let p = partsById[it.step.part], n = 0; p && n < 50; p = partsById[p.parent], n++) if (JOURNEYS.some(j => j.id === p.id)) return p.id; return null; }
const screenTitle = (id) => (FLOW.screens.find(s => s.id === id) || {}).title || id;
function basisText(b){
  if (!b) return 'No basis given';
  return ({ code: 'Based on code · ' + (b.ref || ''), prd: 'Based on the PRD · ' + (b.ref || ''), docs: 'Based on docs · ' + (b.ref || ''),
    conversation: 'From a conversation · ' + (b.note || ''), assumption: 'Assumption · ' + (b.note || '') })[b.kind] || 'Basis: ' + b.kind;
}
let partHighlight = '';
const partSteps = (partId) => new Set(!partId ? [] : STEPS.filter(s => {
  for (let p = partsById[s.step.part], n = 0; p && n < 50; p = partsById[p.parent], n++) if (p.id === partId) return true;
  return false;
}).map(s => s.id));
function drawAll(){ drawTabs(); drawChips(); drawPlayer(); drawAllScreens(); render(); }
function selectStep(id){
  const st = STEPS.find(s => s.id === id); if (!st) return;
  selected = id; at = st.step.from; pending = st; last = null;
  drawAll();
  $('#announce').textContent = 'Selected: ' + st.title + ', on ' + screenTitle(at);
}

// D057 — one diagram panel with tabs, the focus tab first (D059), and an empty tab that says what it is for (D062).
const SYSTEM_NOTE = 'System design · what runs behind these screens: services, data stores, external services. Coming with the system diagrams.';
const TABS = [['user-flow', 'The user flow']]
  .concat((REVIEW.diagrams || []).map(d => [d.id, d.title || d.id]))
  .concat([['system', 'System design']]);
if (REVIEW.focus && TABS.some(t => t[0] === REVIEW.focus)) TABS.unshift(TABS.splice(TABS.findIndex(t => t[0] === REVIEW.focus), 1)[0]);
let chartTab = TABS[0][0];
const chartFor = (id) => id === 'user-flow' ? flowAsDiagram(REVIEW)
  : id === 'system' ? null
  : (REVIEW.diagrams || []).find(d => d.id === id) || null;

function drawTabs(){
  $('#dgtabs').innerHTML = TABS.map(([id, title]) => \`<button type="button" role="tab" data-tab="\${esc(id)}"
    aria-selected="\${id === chartTab}" tabindex="\${id === chartTab ? '0' : '-1'}">\${esc(title)}</button>\`).join('');
}
// The sub-processes, grouped the way people ask about them: what is in the product, what is planned,
// what is only suggested. Pressing one highlights it in the chart; pressing it again clears it.
function drawChips(){
  const group = (status) => {
    const list = JOURNEYS.filter(j => statusOf(j) === status);
    if (!list.length) return '';
    return \`<p class="sub-h">\${STATUS_LABEL[status]}</p>\` + list.map(j => {
      const steps = STEPS.filter(s => journeyOf(s) === j.id);
      return \`<button type="button" class="chip" data-part="\${esc(j.id)}" aria-pressed="\${partHighlight === j.id}">\${esc(j.title)}
        <span class="basis">\${steps.filter(s => store.verdicts[s.id]).length}/\${steps.length} judged</span></button>\`;
    }).join('');
  };
  $('#chips').innerHTML = ['exists', 'proposed', 'suggested'].map(group).join('')
    || '<p class="hint">This flow has a single path.</p>';
}
function drawStageChart(){
  const box = $('#flowbeside');
  const d = chartFor(chartTab);
  if (!d) { box.innerHTML = '<p class="dg-empty">' + esc(SYSTEM_NOTE) + '</p>'; return; }
  box.innerHTML = drawDiagram(d, { selected, here: 'screen:' + at, part: partHighlight, partSteps: partSteps(partHighlight) });
  for (const id of ((REVIEW.brief || {}).highlights || {}).nodes || [])
    box.querySelector('[data-node="' + CSS.escape(id) + '"]')?.classList.add('dg-brief');
  // Keep where you are in view; the chart is wider than the panel.
  const hereBox = $('#flowbeside [aria-current="true"]');
  if (hereBox) {
    const b = hereBox.getBBox();
    box.scrollLeft = Math.max(0, b.x + b.width / 2 - box.clientWidth / 2);
    box.scrollTop = Math.max(0, b.y + b.height / 2 - box.clientHeight / 2);
  }
}

// Every screen at once, not just the one you are on: the same overview the chart gives the flow.
let screensView = 'one';
function drawAllScreens(){
  const box = $('#allscreens');
  $('#linkswitch').hidden = screensView !== 'all';
  if (screensView !== 'all') { box.hidden = true; $('#screen').hidden = false; return; }
  box.hidden = false; $('#screen').hidden = true;
  // Column = taps from the start (breadth first); a screen nothing leads to goes after the last.
  const depth = { [FLOW.start]: 0 }, queue = [FLOW.start];
  while (queue.length) { const id = queue.shift(); for (const st of stepsFrom(id)) for (const o of st.step.outcomes) if (!(o.to in depth)) { depth[o.to] = depth[id] + 1; queue.push(o.to); } }
  const last = Math.max(...Object.values(depth)) + 1, rows = {};
  box.classList.add('canvas');
  box.style.setProperty('--cols', String(last + (FLOW.screens.some(s => !(s.id in depth)) ? 1 : 0)));
  box.innerHTML = FLOW.screens.slice().sort((a, b) => (depth[a.id] ?? last) - (depth[b.id] ?? last)).map(s => {
    const col = depth[s.id] ?? last, row = rows[col] = (rows[col] || 0) + 1;
    return \`<button type="button" class="mini" style="grid-column:\${col + 1};grid-row:\${row}" data-screen="\${esc(s.id)}" aria-current="\${s.id === at}">
    <span class="mini-title">\${esc(s.title)}</span>
    <span class="mini-body"><span class="screen">\${(s.blocks || []).map(b => drawBlock(b, { targets: new Set(stepsFrom(s.id).map(i => i.step.on)), still: true })).join('')}</span></span>
  </button>\`; }).join('');
  drawLinks();
}

// The connections switch off when the reviewer wants the screens alone (D082); remembered in this browser only.
let linksOn = true;
try { linksOn = JSON.parse(localStorage.getItem(LS + ':links') ?? 'true'); } catch {}

// One curve per outcome: out of the action's side, into the side of the screen it leads to that faces it.
function drawLinks(){
  const box = $('#allscreens'); box.querySelector('.links')?.remove();
  if (box.hidden || !linksOn) return;
  const bb = box.getBoundingClientRect(), o = { left: bb.left - box.scrollLeft, top: bb.top - box.scrollTop };
  const R = (el) => el.getBoundingClientRect(), paths = [];
  for (const s of FLOW.screens) for (const st of stepsFrom(s.id)) {
    const from = box.querySelector('.mini[data-screen="' + CSS.escape(s.id) + '"] [data-link="' + CSS.escape(st.step.on) + '"]'); if (!from) continue;
    const a = R(from), ay = a.top + a.height / 2 - o.top, card = R(from.closest('.mini'));
    for (const out of st.step.outcomes) {
      const to = box.querySelector('.mini[data-screen="' + CSS.escape(out.to) + '"]'); if (!to) continue;
      const b = R(to), right = b.left + b.width / 2 > a.left + a.width / 2 && out.to !== s.id;
      const sx = (right ? a.right : a.left) - o.left, c1 = (right ? card.right + 60 : card.left - 60) - o.left;
      // Into the left or right side near the title when the screen is beside; its top or bottom when above or below.
      let ex, ey, c2x, c2y;
      if (out.to === s.id) { ex = b.left - o.left; ey = b.top - o.top + 14; c2x = ex - 70; c2y = ey; }
      else if (b.left - o.left > sx + 20) { ex = b.left - o.left; ey = b.top - o.top + 14; c2x = ex - 70; c2y = ey; }
      else if (b.right - o.left < sx - 20) { ex = b.right - o.left; ey = b.top - o.top + 14; c2x = ex + 70; c2y = ey; }
      else if (b.top - o.top > ay) { ex = b.left + b.width / 2 - o.left; ey = b.top - o.top; c2x = ex; c2y = ey - 70; }
      else { ex = b.left + b.width / 2 - o.left; ey = b.bottom - o.top; c2x = ex; c2y = ey + 70; }
      const ang = Math.atan2(ey - c2y, ex - c2x), h = (d) => (ex - 9 * Math.cos(ang + d)).toFixed(1) + ',' + (ey - 9 * Math.sin(ang + d)).toFixed(1);
      paths.push(\`<g\${right ? '' : ' class="back"'} data-from="\${esc(s.id)}" data-to="\${esc(out.to)}"><title>\${esc(st.title)} → \${esc(out.label || screenTitle(out.to))}</title>
        <circle cx="\${sx}" cy="\${ay}" r="3.5"/><path d="M\${sx},\${ay} C\${c1},\${ay} \${c2x},\${c2y} \${ex},\${ey}"/>
        <polygon class="head" points="\${ex},\${ey} \${h(0.45)} \${h(-0.45)}"/></g>\`);
    }
  }
  box.insertAdjacentHTML('beforeend', '<svg class="links" aria-hidden="true" width="' + box.scrollWidth + '" height="' + box.scrollHeight + '">' + paths.join('') + '</svg>');
}

function drawPlayer(){
  const s = FLOW.screens.find(x => x.id === at);
  const targets = new Set(stepsFrom(at).map(i => i.step.on));
  $('#screen').innerHTML = \`<h2 id="screen-title" class="screen-title" tabindex="-1">\${esc(s.title)}</h2>\`
    + (s.blocks || []).map(b => drawBlock(b, { targets })).join('')
    + (s.end ? '<p class="end">An end of this flow. Restart to try another path.</p>' : '');
  drawStageChart();
  $('#upanel').classList.toggle('brief-here', (((REVIEW.brief || {}).highlights || {}).screens || []).includes(at));
}

function go(st, o){
  pending = null; last = { step: st, outcome: o }; at = o.to; selected = st.id;
  drawAll();
  $('#announce').textContent = 'Now on: ' + FLOW.screens.find(x => x.id === at).title;
  // No scroll (D079): a pick made down in the feedback must not throw the reviewer back up the page.
  $('#screen-title').focus({ preventScroll: true });
}

if (FLOW) {
  $('#screen').addEventListener('click', e => {
    const t = e.target.closest('[data-target]'); if (!t) return;
    const st = stepsFrom(at).find(i => i.step.on === t.dataset.target); if (!st) return;
    selected = st.id;
    if (st.step.outcomes.length === 1) return go(st, st.step.outcomes[0]);
    // The outcomes are picked in the feedback panel, so a full-screen screen steps aside for it.
    if ($('#upanel.full')) setFull($('#upanel'), false);
    pending = st; last = null; drawAll();
    const first = document.querySelector('#detail [data-outcome]'); if (first) first.focus();
  });
  $('#restart').addEventListener('click', () => {
    at = FLOW.start; pending = null; last = null; selected = null; drawAll();
    $('#announce').textContent = 'Now on: ' + FLOW.screens.find(x => x.id === at).title;
    $('#screen-title').focus();
  });
  $('#split').addEventListener('click', e => {
    const b = e.target.closest('[data-outcome]'), open = e.target.closest('[data-open]'), size = e.target.closest('button[data-size]');
    if (size) { splitSize = size.dataset.size; return applySplit(); }
    if (open) { selectStep(open.dataset.open); document.querySelector('#detail [data-outcome]')?.focus(); return; }
    if (!b) return;
    const st = STEPS.find(x => x.id === b.dataset.for); if (!st) return;
    // The screen above changes height with the next screen; the feedback stays put on the window.
    const y = $('#feedback').getBoundingClientRect().top;
    go(st, st.step.outcomes[+b.dataset.outcome]);
    scrollBy(0, $('#feedback').getBoundingClientRect().top - y);
  });
  // D074 — filters, then steps | open step, then your own feedback, full width.
  $('#split').before($('.bar')); $('#steplist').append($('#items'));
  if ($('.add')) $('#feedback').append($('.add'));
  // The steps and the open step share the row in three steps, remembered in this browser only.
  let splitSize = 'even';
  try { splitSize = localStorage.getItem(LS + ':split') || 'even'; } catch {}
  function applySplit(){
    $('#split').dataset.size = splitSize;
    $('#split').querySelectorAll('.sizes [data-size]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === splitSize)));
    try { localStorage.setItem(LS + ':split', splitSize); } catch {}
  }
  applySplit();
  // Clicking a box in the chart selects that step.
  const chartPick = (target) => {
    const node = target.closest('#flowbeside [data-step]'); if (!node) return false;
    selectStep(node.dataset.step); $('#flowbeside [data-step="' + CSS.escape(node.dataset.step) + '"]')?.focus({ preventScroll: true });
    return true;
  };
  $('#flowbeside').addEventListener('click', e => chartPick(e.target));
  $('#flowbeside').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && chartPick(e.target)) e.preventDefault(); });
  $('#f-journey').insertAdjacentHTML('beforeend', JOURNEYS.map(j => \`<option value="\${esc(j.id)}">\${esc(j.title)}</option>\`).join(''));
  for (const id of ['#f-journey', '#f-status', '#f-problems']) $(id).addEventListener('change', render);

  // The sub-processes column switches off when the reviewer wants the chart to have the width.
  const subSwitch = $('#subswitch');
  let subOn = true;
  try { subOn = JSON.parse(localStorage.getItem(LS + ':subproc') ?? 'true'); } catch {}
  const applySub = () => {
    subSwitch.setAttribute('aria-checked', String(subOn));
    $('.dg-body').classList.toggle('sub-off', !subOn);
    try { localStorage.setItem(LS + ':subproc', JSON.stringify(subOn)); } catch {}
  };
  subSwitch.addEventListener('click', () => { subOn = !subOn; applySub(); drawStageChart(); });
  applySub();

  // One screen, or all of them.
  $('#upanel .seg').addEventListener('click', e => {
    const b = e.target.closest('[data-screens]'); if (!b) return;
    screensView = b.dataset.screens;
    $('#upanel .seg').querySelectorAll('[data-screens]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.screens === screensView)));
    drawAllScreens();
  });
  new ResizeObserver(drawLinks).observe($('#allscreens'));
  $('#linkswitch').setAttribute('aria-checked', String(linksOn));
  $('#linkswitch').addEventListener('click', () => {
    linksOn = !linksOn; $('#linkswitch').setAttribute('aria-checked', String(linksOn));
    try { localStorage.setItem(LS + ':links', JSON.stringify(linksOn)); } catch {}
    drawLinks();
  });
  // Pointing at a screen keeps its own connections bright and fades the rest.
  $('#allscreens').addEventListener('mouseover', e => {
    const m = e.target.closest('.mini'), svg = $('#allscreens .links'); if (!svg) return;
    svg.classList.toggle('focus', !!m);
    svg.querySelectorAll('g').forEach(g => g.classList.toggle('hot', !!m && (g.dataset.from === m.dataset.screen || g.dataset.to === m.dataset.screen)));
  });
  $('#allscreens').addEventListener('mouseleave', () => $('#allscreens .links')?.classList.remove('focus'));
  $('#allscreens').addEventListener('click', e => {
    const b = e.target.closest('[data-screen]'); if (!b) return;
    at = b.dataset.screen; pending = null; last = null;
    screensView = 'one';
    $('#upanel .seg').querySelectorAll('[data-screens]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.screens === 'one')));
    drawAll();
    $('#announce').textContent = 'Now on: ' + screenTitle(at);
    $('#screen-title').focus();
  });

  // Tabs: click or arrow keys, one chart on show at a time.
  const pickTab = (id) => { if (!TABS.some(t => t[0] === id)) return; chartTab = id; drawTabs(); drawStageChart(); };
  $('#dgtabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) pickTab(t.dataset.tab); });
  $('#dgtabs').addEventListener('keydown', e => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const i = TABS.findIndex(t => t[0] === chartTab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1
      : (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    e.preventDefault(); pickTab(TABS[next][0]);
    $('#dgtabs [aria-selected="true"]').focus();
  });

  // Chips instead of a dropdown (D057): press one to highlight its sub-process, press it again to clear.
  $('#chips').addEventListener('click', e => {
    const c = e.target.closest('[data-part]'); if (!c) return;
    partHighlight = partHighlight === c.dataset.part ? '' : c.dataset.part;
    drawAll();
  });

  // D073 — either panel opens full screen, and Esc or the same button brings it back.
  const setFull = (panel, on) => {
    panel.classList.toggle('full', on);
    const b = panel.querySelector('.panel-full');
    b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Exit full screen' : 'Full screen';
    if (panel.id === 'dpanel') drawStageChart();
  };
  $('#stage').addEventListener('click', e => {
    const b = e.target.closest('.panel-full'); if (!b) return;
    const panel = b.closest('.panel'); setFull(panel, !panel.classList.contains('full')); b.focus();
  });
  document.addEventListener('keydown', e => {
    const open = $('.panel.full'); if (e.key !== 'Escape' || !open) return;
    setFull(open, false); open.querySelector('.panel-full').focus();
  });

  // D055 — the reviewer arranges the page: sections collapse and move, remembered in this browser only.
  const SECTIONS = [['player', 'Walk through it']];
  const pieces = { player: ['#stage', '#brief', '#feedback', '.player-bar'] };
  let arrangement = { order: SECTIONS.map(s => s[0]), collapsed: {} };
  try { arrangement = Object.assign(arrangement, JSON.parse(localStorage.getItem(LS + ':sections') || '{}')); } catch {}
  const saveArrangement = () => { try { localStorage.setItem(LS + ':sections', JSON.stringify(arrangement)); } catch {} };

  const holder = document.createElement('div');
  holder.id = 'sections';
  $('#player').before(holder);
  for (const [id, title] of SECTIONS) {
    const box = document.createElement('section');
    box.className = 'sec-box'; box.dataset.section = id;
    box.innerHTML = \`<div class="sec-head"><button type="button" class="sec-toggle" aria-expanded="true">\${esc(title)}</button>
      <span class="sec-actions"><button type="button" class="sec-up" aria-label="Move \${esc(title)} up">↑</button>
      <button type="button" class="sec-down" aria-label="Move \${esc(title)} down">↓</button></span></div><div class="sec-body"></div>\`;
    const body = box.querySelector('.sec-body');
    for (const sel of pieces[id]) { const el = document.querySelector(sel); if (el) body.append(el); }
    holder.append(box);
  }
  const applyArrangement = () => {
    for (const id of arrangement.order) { const box = holder.querySelector('[data-section="' + id + '"]'); if (box) holder.append(box); }
    for (const box of holder.querySelectorAll('[data-section]')) {
      const off = !!arrangement.collapsed[box.dataset.section];
      box.querySelector('.sec-toggle').setAttribute('aria-expanded', String(!off));
      box.querySelector('.sec-body').hidden = off;
    }
  };
  applyArrangement();
  holder.addEventListener('click', e => {
    const box = e.target.closest('[data-section]'); if (!box) return;
    const id = box.dataset.section, order = arrangement.order, at2 = order.indexOf(id);
    if (e.target.closest('.sec-toggle')) arrangement.collapsed[id] = !arrangement.collapsed[id];
    else if (e.target.closest('.sec-up') && at2 > 0) order.splice(at2 - 1, 0, order.splice(at2, 1)[0]);
    else if (e.target.closest('.sec-down') && at2 < order.length - 1) order.splice(at2 + 1, 0, order.splice(at2, 1)[0]);
    else return;
    saveArrangement(); applyArrangement();
  });
  drawAll();
}
render();
if (SEED) $('#footnote').textContent = 'An exported copy with the answers given ' + String(SEED.exportedAt).slice(0, 10) + '. Changes you make here stay in this browser.';
</script>
</body></html>`;

writeFileSync(outPath, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`wrote ${outPath}  (${kb} KB · ${review.items.length} items · ${(review.sections||[]).length} sections)`);

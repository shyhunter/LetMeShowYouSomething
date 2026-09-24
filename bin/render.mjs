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
const diagrams = inline('draw-ai.mjs') + '\n' + inline('layout.mjs') + '\n' + inline('draw-database.mjs') + '\n' + inline('draw-diagram.mjs');
const selectionResolver = inline('review-selection.mjs');

// `</script>` inside a JSON string would close the tag early; escaping `<` is enough and keeps the
// payload valid JSON.
// #78 — `<` could close the script, and U+2028/U+2029 end a line: an answered page is read back line
// by line (bin/answer.mjs), and its re-export replaces the SEED line. JSON escapes change no value.
const embed = (o) => JSON.stringify(o).replace(/[<\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TONE = { positive: 'ok', caution: 'warn', negative: 'bad', neutral: 'neut' };

// #100 — small symbols, drawn inline so the page fetches nothing. Used as I('name').
const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .8-1 1.5v.5M12 17v.5"/>',
  map: '<path d="M9 4.5L3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5"/>',
  code: '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5"/>', left: '<path d="M14.5 5.5L8 12l6.5 6.5"/>', right: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  flag: '<path d="M5.5 21V4h11l-2 4 2 4h-11"/>', send: '<path d="M21 3L10.5 13.5M21 3l-6.5 18-4-7.5-7.5-4z"/>',
  star: '<path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7z"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.7-3.2 8-7.5 9.5-4.3-1.5-7.5-4.8-7.5-9.5V6z"/>',
  note: '<path d="M4.5 19.5h4L19.5 8.5l-4-4-11 11z"/>', minus: '<path d="M6 12h12"/>', plus: '<path d="M12 6v12M6 12h12"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  layers: '<path d="M12 3.5l9 4.5-9 4.5-9-4.5z"/><path d="M3 12.5l9 4.5 9-4.5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.5"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  expand: '<path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5l-6 6M4.5 19.5l6-6"/>', repeat: '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.1M19.5 12a7.5 7.5 0 0 1-13 5.1"/><path d="M17.5 3.5v3.4h-3.4M6.5 20.5v-3.4h3.4"/>', dots: '<path d="M5.5 12h.5M11.75 12h.5M18 12h.5"/>',
};
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(ICONS).map(([k, v]) =>
  `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${v}</symbol>`).join('')}</svg>`;
const I = (name) => `<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

// #47 — the diagram panel: the first of the four places (#100), the same on every kind of review.
const DPANEL = `    <section id="dpanel" class="panel" aria-label="The diagram">
      <div class="panel-head">
        <button class="btn" id="commentmode" type="button" aria-pressed="false">${I('note')}Comment</button>
        <button class="btn" id="showchanges" type="button" aria-pressed="false" hidden>Show my changes</button>
        <button class="btn icon panel-full" type="button" aria-pressed="false" aria-label="Full screen">${I('expand')}</button>
      </div>
      <div class="panel-body">
        <p class="hint">Select anything that looks wrong, incomplete or unclear. Selecting is not answering.</p>
        <div id="dgtabs" role="tablist" aria-label="Which diagram"></div>
        <div class="dg-body">
${review.flow ? `          <div id="subproc">
            <button type="button" id="subswitch" class="switch" role="switch" aria-checked="true">
              <span class="switch-box"></span>Sub-processes</button>
            <div id="chips" role="group" aria-label="Highlight a sub-process"></div>
          </div>` : ''}
          <div id="flowbeside" role="tabpanel" aria-label="${review.flow ? 'The flow, with where you are' : 'The chart'}"></div>
        </div>
        <p id="commenthint" class="hint" hidden>Pick a box or an arrow to comment on it: click it, or Tab to it and press Enter.</p>
        <div id="comments"></div>
      </div>
    </section>
`;

// #38 — answers are kept per review, not per id: an agent that keeps an example's id (or two reviews
// that happen to share one) must never mix answers. The key is the id plus a fingerprint of the content.
const fingerprint = createHash('sha256').update(JSON.stringify(review)).digest('hex').slice(0, 12);

// The logo as the tab icon (D094), inlined so the page still fetches nothing. Base64, so no URL sits in
// the page. A folder without site/ (only bin/ copied) simply renders without one.
// The same mark signs the page at the bottom (D095): "Made with LetMeShowYouSomething", quiet, drawn inline.
let favicon = '', mark = '';
try {
  const logo = readFileSync(new URL('../site/logo.svg', import.meta.url), 'utf8');
  favicon = `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}">`;
  mark = (logo.match(/<g [\s\S]*<\/g>/) || [''])[0];
} catch {}

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
:is(.panel,.slot,#ask,.card,#brief,fieldset.item,.btn){box-shadow:2px 2px 0 var(--ink)}
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
:is(.panel,.slot,#ask,.card,#brief){border-color:var(--neon);box-shadow:0 0 14px color-mix(in srgb,var(--neon) 30%,transparent)}
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
:is(.panel,.slot,#ask,.card,#brief){border-color:var(--ink3)}`,
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
:is(.panel,.slot,#ask,.card,#brief,fieldset.item){border:1.5px solid var(--line);box-shadow:4px 4px 0 var(--line);border-radius:22px 8px 26px 10px/10px 26px 8px 22px}
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
.wrap{max-width:900px;margin:0 auto;padding-inline:18px;padding-block:0 32px}
h1,h2,h3{color:var(--ink);margin:0;text-wrap:balance}
:focus-visible{outline:2px solid var(--ac);outline-offset:2px;border-radius:4px}
.skip{position:absolute;left:-9999px}
.skip:focus{left:8px;top:8px;z-index:9;background:var(--surf);border:1px solid var(--ac);padding:8px 12px;border-radius:6px}

header{padding-block:30px 18px;border-bottom:1px solid var(--line);margin-bottom:22px}
.htools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.style-pick{font:500 12.5px var(--sans);color:var(--mut);display:flex;gap:6px;align-items:center}
/* Safari ignores min-height on a native select: drawn by the page, it keeps the 44px target (D091). */
.style-pick select{-webkit-appearance:none;appearance:none;height:44px;color:var(--ink);border:1px solid var(--line2);border-radius:7px;padding:4px 30px 4px 10px;font:inherit;
  background:linear-gradient(45deg,transparent 50%,var(--mut) 50%) right 16px center/5px 5px no-repeat,linear-gradient(135deg,var(--mut) 50%,transparent 50%) right 11px center/5px 5px no-repeat,var(--surf)}
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

.bar{background:var(--bg);border-bottom:1px solid var(--line);
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

/* D095 — the page is signed, quietly, below everything the reviewer came for. */
.made{display:flex;align-items:center;gap:7px;margin:18px 0 0;font-size:12.5px;color:var(--mut)}
.made svg{width:16px;height:16px;flex:none;color:var(--ac)}
.made a{color:inherit;text-underline-offset:2px}
.made a:hover{color:var(--ink)}
.empty{padding:26px;text-align:center;color:var(--mut);font-size:13.5px}
.meta{font:11.5px var(--mono);color:var(--sub);margin-top:6px}
.asks{display:grid;gap:10px;margin-top:16px;max-width:74ch}
.asks p{margin:0;font-size:14px;color:var(--ink2)}
.asks b{display:block;font:600 10.5px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ac);margin-bottom:2px}
details.more{margin:-4px 0 10px}
details.more summary{cursor:pointer;font-size:12.5px;color:var(--ac);margin-bottom:6px;padding-block:3px}
#commentmode[aria-pressed="true"]{border-color:var(--ac);background:var(--ac-bg);color:var(--ink)}
.commenting #flowbeside :is(.dg-node,.dg-edge){cursor:crosshair}
.dg-hit{fill:none;stroke:transparent;stroke-width:14;pointer-events:stroke}
.dg-edge:focus-visible{outline:none}.dg-edge:focus-visible path:not(.dg-hit){stroke:var(--ac);stroke-width:3}
.dg-node.dg-commented .dg-shape{stroke:var(--ac);stroke-width:3;stroke-dasharray:6 3}
.dg-edge.dg-commented path:not(.dg-hit){stroke:var(--ac);stroke-width:3;stroke-dasharray:6 3}
#comments .cmt{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-top:8px;display:grid;gap:6px;background:var(--surf)}
.cmt-on{margin:0;font-size:13px;color:var(--ink3)}.cmt-on b{color:var(--ink)}
#comments .cmt .btn{justify-self:start}
.props{display:grid;gap:6px;margin-top:4px;justify-items:start}
.prow{display:flex;flex-wrap:wrap;gap:6px;align-items:center;width:100%}
.prow :is(input,select){flex:1 1 200px;min-width:0;min-height:40px;border:1px solid var(--line2);border-radius:8px;background:var(--surf);color:var(--ink);font:inherit;padding:0 8px}
.proplist{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:4px}
.proplist li{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--ink2)}
.dg-proposed .dg-shape{stroke:var(--ok);stroke-width:3}
#showchanges[aria-pressed="true"]{border-color:var(--ok);background:var(--ok-bg);color:var(--ink)}
.pics{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-top:6px}
.pic{margin:0;display:grid;gap:4px;justify-items:start}
.pic img{display:block;max-width:180px;max-height:140px;width:auto;height:auto;border:1px solid var(--line);border-radius:6px;background:var(--surf)}
.pic-msg{flex-basis:100%;margin:0}
.pic-note{font-size:12.5px;color:var(--mut);align-self:center}
.appr{border:1.5px solid var(--ac);background:var(--ac-bg);border-radius:10px;padding:10px 12px;margin:0 0 10px;display:grid;gap:4px}
.appr p{margin:0;font-size:13.5px;color:var(--ink2)}
.appr .k{display:inline-block;min-width:88px;font:600 10.5px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ac)}
.appr-h{display:flex;align-items:center;justify-content:space-between;gap:8px}
.appr-a{font-size:15px!important;font-weight:600;color:var(--ink)!important}
.risk{font:600 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--rt);border:1px solid var(--rt);border-radius:99px;padding:2px 8px}
.appr-p{margin:4px 0;padding:8px 10px;background:var(--surf);border:1px solid var(--line);border-radius:6px;font:12.5px/1.5 var(--mono);white-space:pre-wrap;overflow-x:auto;color:var(--ink)}
.appr-n{color:var(--mut)!important;font-size:12.5px!important}
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
/* #44 — every review in the same frame: full width, the list on the left, the open item on the right. */
.wrap.frame{max-width:none;padding-inline:24px}
/* The header lines up with the text inside the sections below, not with their outer border.
   On a phone every pixel of width counts, so it stays at the page edge there. */
@media (min-width:700px){.frame header{padding-inline:20px}}
.frame .bar{position:static}
#player{margin-bottom:10px}
.item .k,#brief .k,#expected .k,.ov-grid .k{font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ac);margin-right:6px}
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
.ex-shows{display:block;font-size:13px;color:var(--ink3);margin:2px 0}
.item .brief-ex{margin-bottom:10px}
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
.screen{background:var(--surf);border:1px solid var(--line2);border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:10px;min-height:300px}
.screen-title{font:600 11px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--sub)}
.hint{color:var(--mut);font-size:13px}
.end{font-size:12.5px;color:var(--mut);margin:0}
/* part 3a views */
[hidden]{display:none!important}
.journeys{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:8px 0 16px}
.journey,.w-row,.p-item{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:44px;text-align:left;background:var(--surf);border:1px solid var(--line2);border-radius:12px;padding:10px 12px;font:13px var(--sans);color:var(--ink2);cursor:pointer;width:100%}
.journey[aria-current="true"],.w-row[aria-current="true"],.p-item[aria-current="true"]{border-color:var(--ac);box-shadow:0 0 0 2px var(--ac-line)}
fieldset.item[aria-current="true"]{border:2px solid var(--ac)}
.j-title{font-size:14px;color:var(--ink);overflow-wrap:anywhere}
.basis,.j-count{font-size:12px;color:var(--mut)}
.outcome[data-picked="true"]{border-color:var(--ac);background:var(--ac-bg)}
.outcome p{margin:0;font-size:13px}
.outcome [data-outcome]{min-height:44px;align-self:flex-start;margin-top:4px}
/* D098 — the layers under an outcome: what runs, what changes, each entry with its status and its own verdict. */
.layer-switch{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 2px}
.layer-switch label{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:4px 12px;border:1px solid var(--line2);border-radius:99px;font-size:12.5px;cursor:pointer;background:var(--surf)}
.layer-switch label:has(input:checked){border-color:var(--ac);background:var(--ac-bg);color:var(--ink)}
.layer-switch input{margin:0;accent-color:var(--ac)}
.layer{margin-top:6px;border-top:1px dashed var(--line2);padding-top:6px}
body:not(.show-system) .layer-system,body:not(.show-data) .layer-data{display:none}
.layer ol,.layer ul{margin:4px 0 0;padding-left:18px;display:grid;gap:8px;font-size:12.5px}
.lkind{font:600 10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-right:2px}
.lfields{display:flex;flex-direction:column;gap:2px;margin-top:3px}
.lfields code,.layer li>code{font:11.5px var(--mono);color:var(--ink2);overflow-wrap:anywhere}
.lstatus{font:600 10px var(--mono);letter-spacing:.04em;text-transform:uppercase;color:var(--mut)}
.lstatus[data-s="exists"]{color:var(--ok)}
.lstatus[data-s="proposed"]{color:var(--warn)}
.judge{margin-top:4px}
.judge summary{cursor:pointer;font-size:12px;color:var(--ac);min-height:24px;display:inline-flex;align-items:center}
.judge[data-judged="true"] summary{font-weight:600}
.judge .verdicts{margin:6px 0}
.judge textarea{width:100%;min-height:48px;font:12.5px var(--sans);border:1px solid var(--line2);border-radius:7px;padding:6px 8px;background:var(--surf);color:var(--ink)}
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
.dg-ai-text{fill:var(--ink);font:12px ui-monospace,SFMono-Regular,Consolas,monospace}
.dg-ai-caption{fill:var(--ink);font:600 12px var(--sans)}
.dg-token-bar{fill:var(--ac)}
.dg-agent .dg-edge .dg-hit{stroke:transparent;stroke-width:44}
.dg-db-title{font-weight:700}
.dg-database .dg-label{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.dg-db-edge .dg-hit{stroke:transparent;stroke-width:44}
.dg-lane rect{fill:none;stroke:var(--line)}
.dg-lane-title{fill:var(--mut);font:600 11px var(--mono)}
.dg-edge path{fill:none;stroke:var(--line3);stroke-width:1.5}
.dg-e-message path{stroke-dasharray:6 4}
.dg-e-async path{stroke-dasharray:5 5}
.dg-e-return path{stroke-dasharray:4 4}
.dg-life{stroke:var(--line2);stroke-width:1.5;stroke-dasharray:4 5;fill:none}
.dg-shape.dg-dashed{stroke-dasharray:6 4}
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
  :is(button,summary,textarea,input:not([type=radio],[type=checkbox],[type=hidden]),label:has(>input[type=radio]),label:has(>input[type=checkbox]),[role=tab]):not(.screen *,.skip){min-height:44px}
  .chip,.row-open{min-width:44px}
  select:not(.screen *){-webkit-appearance:none;appearance:none;height:44px;padding:4px 30px 4px 10px;color:var(--ink);border:1px solid var(--line2);border-radius:7px;
    background:linear-gradient(45deg,transparent 50%,var(--mut) 50%) right 16px center/5px 5px no-repeat,linear-gradient(135deg,var(--mut) 50%,transparent 50%) right 11px center/5px 5px no-repeat,var(--surf)}
}
/* #74 — one connected review, with tooling secondary to the human task. */
.wrap.frame{max-width:1600px;margin-inline:auto}
.review-kicker{font:600 11px var(--mono);letter-spacing:.13em;text-transform:uppercase;color:var(--mut);margin:0 0 12px}
#save-warning{border:1px solid var(--bad);border-left-width:4px;padding:12px;color:var(--ink);background:var(--surf);overflow-wrap:anywhere}
#return-review{width:min(680px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid var(--line2);border-radius:16px;background:var(--surf);color:var(--ink2);padding:24px}
#return-review::backdrop{background:rgba(0,0,0,.5)}
#return-review h2{font-size:24px}
#return-review li{margin:6px 0;overflow-wrap:anywhere}
#return-review .btn{min-height:44px}
:focus-visible{scroll-margin-block:100px}
.dg-selected .dg-shape{stroke:var(--ac);stroke-width:3}
.dg-edge.dg-selected path:not(.dg-hit){stroke:var(--ac);stroke-width:3}
.dg-answered .dg-shape{stroke:var(--ok);stroke-width:2.5}
/* #100 — the guided tour: the question and your answer on the left, the four places on the right,
   Back and Next always in reach. Sections take one colour each, in the progress bar and on the question. */
:root{--s1:#5B3E8C;--s2:#1D6A96;--s3:#2F6B45;--s4:#8E6110;--s5:#A03A2E;--s6:#4F5A6B}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--s1:#A98BD6;--s2:#6FB3DC;--s3:#63B584;--s4:#D9A441;--s5:#E08272;--s6:#9AA3B2}}
:root[data-theme="dark"]{--s1:#A98BD6;--s2:#6FB3DC;--s3:#63B584;--s4:#D9A441;--s5:#E08272;--s6:#9AA3B2}
.ic{width:18px;height:18px;flex:none;vertical-align:-3px}
header.top{display:flex;gap:12px 18px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;padding-block:22px 14px;margin-bottom:14px}
.top-r{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.mode{display:flex;gap:2px;background:var(--surf2);border:1px solid var(--line);border-radius:10px;padding:3px}
.mode button{border:0;background:none;border-radius:8px;min-height:38px;padding:4px 12px;font:600 13px var(--sans);color:var(--ink3);cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.mode button[aria-pressed="true"]{background:var(--surf);color:var(--ac);box-shadow:0 1px 2px rgba(0,0,0,.14)}
.btn{display:inline-flex;gap:6px;align-items:center;justify-content:center}
#more{position:relative}
#more>summary{list-style:none;cursor:pointer}
#more>summary::-webkit-details-marker{display:none}
.more-body{position:absolute;right:0;top:calc(100% + 6px);z-index:30;width:min(320px,calc(100vw - 32px));display:grid;gap:10px;padding:14px;border:1px solid var(--line2);border-radius:12px;background:var(--surf);box-shadow:0 18px 40px -20px rgba(0,0,0,.45)}
.more-body h3{font:600 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.more-body .row{display:flex;gap:6px;flex-wrap:wrap}
#progress{display:grid;gap:6px;margin-bottom:14px}
.segs{display:flex;gap:4px;align-items:flex-end}
.pseg{flex:var(--w) 1 0;min-width:44px;border:0;background:none;padding:2px 0;cursor:pointer;text-align:left;display:grid;gap:4px;color:var(--sc)}
.pseg .track{height:8px;border-radius:99px;background:color-mix(in srgb,var(--sc) 18%,var(--line));overflow:hidden;position:relative}
.pseg .track i{position:absolute;inset:0 auto 0 0;background:var(--sc);border-radius:99px}
.pseg[aria-current="step"] .track{outline:2px solid var(--sc);outline-offset:2px}
.pl{font:600 11px/1.3 var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;gap:4px;align-items:center}
.pl .ic{width:14px;height:14px}
.pl small{color:var(--mut);font-weight:500}
#overview{margin:0;font:12.5px var(--mono);color:var(--mut)}
#tour{display:grid;gap:16px;grid-template-columns:minmax(300px,410px) minmax(0,1fr);grid-template-areas:"ask places" "nav nav";align-items:start}
#ask{grid-area:ask;position:sticky;top:10px;max-height:calc(100dvh - 96px);overflow:auto;display:grid;gap:10px;align-content:start;
  background:var(--surf);border:1px solid var(--line);border-top:5px solid var(--sc,var(--ac));border-radius:14px;padding:16px}
#places{grid-area:places;display:grid;gap:12px;min-width:0}
#tnav{grid-area:nav;position:sticky;bottom:0;z-index:8;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 0;background:var(--bg);border-top:1px solid var(--line)}
#tnav .btn{min-height:44px;min-width:44px;padding-inline:16px;font-size:14px}
#stepno{font:13px var(--mono);color:var(--mut)}
.sec-name{margin:0;font:600 11px var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--sc,var(--ac));display:flex;gap:6px;align-items:center}
#selection-title{font-size:clamp(19px,2.2vw,24px);letter-spacing:-.015em;line-height:1.25;overflow-wrap:anywhere}
#selection-meta{font-size:13px;color:var(--mut);margin:0}
#selection-meta:empty,#related-items:empty,#selection-actions:empty{display:none}
#related-items,.selection-actions{display:flex;gap:8px;flex-wrap:wrap}
#diagram-selection{font-size:13px;color:var(--mut);margin:6px 0}
#detail fieldset.item{border:0;padding:0;margin:0;background:none}
#detail legend{position:absolute;left:-9999px}
.qprompt{margin:12px 0 8px;font:700 14px var(--sans);color:var(--ink);display:flex;gap:8px;align-items:center}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(122px,1fr));gap:8px}
.tiles label{position:relative;border:1.5px solid var(--line2);border-radius:14px;padding:8px 12px;min-height:54px;display:flex;gap:10px;align-items:center;font-weight:600;font-size:14px;color:var(--ink2);background:var(--surf);cursor:pointer}
.tiles input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer}
.tiles .dot{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--tcb);color:var(--tc);flex:none}
.tiles label:has(input:checked){border-color:var(--tc);background:var(--tcb);color:var(--tc);box-shadow:0 0 0 2px var(--tcb)}
.tiles label:has(input:checked) .dot{background:var(--tc);color:var(--surf)}
.tiles label:has(input:focus-visible){outline:2px solid var(--ac);outline-offset:2px}
.explain{display:grid;gap:6px;margin-top:10px}
.explain .qprompt{margin:0}
.slot{background:var(--surf);border:1px solid var(--line);border-radius:14px;min-width:0}
.slot-head{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-bottom:1px solid var(--line)}
.slot.minimised .slot-head{border-bottom:0}
.slot-head .num{font:700 11px var(--mono);color:var(--on-ac);background:var(--ac);border-radius:50%;width:22px;height:22px;display:grid;place-items:center;flex:none}
.slot-head h2{flex:1;min-width:0;font:600 12px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--ink2);display:flex;gap:6px;align-items:center}
.slot-body{padding:12px;min-width:0}
.slot .panel{border:0;padding:0;background:none}
.empty-slot{margin:0;font-size:13.5px;color:var(--mut);display:flex;gap:8px;align-items:center}
.btn.icon{min-width:36px;min-height:36px;padding:0}
.btn.icon .ic{width:18px;height:18px}
.btn.icon.panel-full{min-width:44px;min-height:44px}
@media (pointer:coarse){.btn.icon{min-width:44px;min-height:44px}}
.places-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.places-head .row{display:flex;gap:6px}
.places-head .btn[aria-pressed="true"]{background:var(--ac);border-color:var(--ac);color:var(--on-ac)}
.prog-sum{font:600 12px var(--mono);color:var(--mut);display:inline-flex;gap:6px;align-items:center}
.expected{display:grid;gap:8px}
.exp{border:1px solid var(--line);border-radius:10px;padding:9px 12px;background:var(--surf);font-size:14px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;align-items:start}
.exp>:not(.ei){grid-column:2}
.exp .ei{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;grid-row:span 2}
.exp>b{font:600 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--ek)}
.exp p{margin:0}
.exp.ok{--ek:var(--ok)}.exp.ok .ei{background:var(--ok-bg);color:var(--ok)}
.exp.fail{--ek:var(--bad)}.exp.fail .ei{background:var(--bad-bg);color:var(--bad)}
.exp.info{--ek:var(--ac)}.exp.info .ei{background:var(--ac-bg);color:var(--ac)}
.outcome.exp[data-picked="true"]{border-color:var(--ac);box-shadow:0 0 0 2px var(--ac-bg)}
.outcome.exp [data-outcome]{justify-self:start}
.w-line{margin:0}
#detail .w-journey{display:none}
.w-status{display:inline-flex;align-items:center;border-radius:99px;padding:3px 9px;background:var(--ac-bg)}
#upanel .panel-head{margin-bottom:8px}
#upanel .hint{margin:8px 0 0;font-size:12.5px}
.outcome-build{border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-top:8px}
.outcome-build>b{font-size:13px;color:var(--ink)}
body:not(.show-system):not(.show-data) .outcome-build{display:none}
.facts{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
.fact{font-size:12.5px;padding:5px 10px;border-radius:99px;background:var(--surf2);border:1px solid var(--line);display:inline-flex;gap:6px;align-items:center}
#t-start{display:none}
#brief{border:1px solid var(--line2);border-left:3px solid var(--ac);border-radius:12px;background:var(--surf2);padding:12px 14px;margin-bottom:12px}
#understand .asks{margin-top:10px}
.summary-counts{display:flex;gap:12px;flex-wrap:wrap;padding:10px 0;border-block:1px solid var(--line);font:13px var(--mono)}
.summary-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.summary-actions .btn{min-height:44px}
#return-block .add{margin-top:16px}
/* Overview: the same review on one page, every question answerable in place. */
#ov{max-width:900px;margin:0 auto;display:grid;gap:14px}
#ov-top{display:grid;gap:14px}
#ov-top #understand,#ov-end{background:var(--surf);border:1px solid var(--line);border-radius:14px;padding:16px}
.ov-sec{margin:10px 0 8px;display:flex;gap:8px;align-items:center;font:600 12px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--sc)}
.ov-sec small{color:var(--mut);font-weight:500;letter-spacing:0}
.card{background:var(--surf);border:1px solid var(--line);border-left:4px solid var(--sc);border-radius:12px;padding:12px 16px;margin-bottom:10px;display:grid;gap:8px}
.card fieldset.item{border:0;padding:0;margin:0;background:none}
.card legend{padding:0;font-size:16px}
.card .ov-places>summary{cursor:pointer;min-height:44px;display:flex;gap:6px;align-items:center;font-size:13px;color:var(--ac)}
.ov-grid{display:grid;gap:10px}
.ov-grid h3{font:600 11px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--mut);display:flex;gap:6px;align-items:center}
.card>[data-open]{justify-self:start}
#footnote{font-size:12.5px;color:var(--mut);margin:14px 0 0}
body[data-mode="tour"] #ov,body[data-mode="overview"] #tour{display:none}
/* #100 — Understand is its own screen: short numbered cards and one action, Start. After Start it
   folds to one bar at the top that opens it again. */
body.at-start :is(#progress,#tour,.top-r,#footnote,#start-mini),body:not(.at-start) #start,body[data-mode="overview"] #start-mini{display:none}
#start{max-width:720px;margin:4px auto 0;display:grid;gap:14px}
.start-cards{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.scard{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;background:var(--surf);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.scard .num{font:700 12px var(--mono);color:var(--on-ac);background:var(--ac);border-radius:50%;width:26px;height:26px;display:grid;place-items:center}
.scard h3{font:600 12px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--ac);display:flex;gap:6px;align-items:center;margin:3px 0 4px}
.scard p{margin:0;font-size:15px;color:var(--ink)}
.start-parts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px!important}
.chip-part{display:inline-flex;gap:5px;align-items:center;font:600 12px var(--sans);color:var(--sc);border:1px solid var(--sc);border-radius:99px;padding:3px 10px}
.chip-part .ic{width:14px;height:14px}
.start-more>summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-size:13px;color:var(--ac)}
.start-more p,.start-more li{font-size:13.5px;color:var(--ink3)}
#start-review{min-height:52px;font-size:16px;justify-self:center;padding-inline:40px}
#start-mini{display:flex;gap:8px;align-items:center;width:100%;min-height:44px;margin-bottom:10px;padding:6px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surf);color:var(--ink2);font:600 13px var(--sans);cursor:pointer;text-align:left}
#start-mini .more{margin-left:auto;color:var(--ac);font-weight:500}
@media (max-width:699px){#start-review{justify-self:stretch}}
#return-block li{margin:6px 0;overflow-wrap:anywhere}
@media (max-width:899px){
  #tour{grid-template-columns:minmax(0,1fr);grid-template-areas:"ask" "places" "nav"}
  #ask{position:static;max-height:none}
}
@media (max-width:699px){.wrap.frame{padding-inline:12px}.pl{display:none}.more-body{left:0;right:auto}#return-review{padding:18px}header.top{padding-block:14px 8px}}
</style>
</head><body data-mode="tour">
${SPRITE}
<a class="skip" href="#ask">Skip to the question</a>
<div class="wrap frame">
<header class="top">
  <div>
    <p class="review-kicker">A review for you</p>
    <h1>${esc(review.title)}</h1>
    ${review.subtitle ? `<p class="sub">${esc(review.subtitle)}</p>` : ''}
  </div>
  <div class="top-r">
    <div class="mode" role="group" aria-label="How to go through the review">
      <button type="button" id="mode-tour" data-mode="tour" aria-pressed="true">${I('flag')}Tour</button>
      <button type="button" id="mode-overview" data-mode="overview" aria-pressed="false">${I('list')}Overview</button>
    </div>
    <button class="btn pri" id="finish" type="button">${I('send')}Finish</button>
    <details id="more"><summary class="btn" aria-label="More options">${I('dots')}More</summary><div class="more-body">
      <h3>Look</h3>
      <label class="style-pick">Style <select id="style">
        <option value="">Default</option><option value="mac84">Macintosh 1984</option><option value="cyber">Cyberpunk</option>
        <option value="newsletter">Newsletter</option><option value="shyhunter">ShyHunter</option>
      </select></label>
      <label class="style-pick">Mode <select id="theme">
        <option value="">Auto</option><option value="light">Light</option><option value="dark">Dark</option>
      </select></label>
      <h3>Your answers</h3>
      <div class="row"><button class="btn" id="reset" type="button">Clear my answers</button></div>
    </div></details>
  </div>
</header>
<p id="save-warning" role="alert" hidden></p>
<section id="start" aria-labelledby="start-h"><h2 id="start-h" class="skip">Before you start</h2>
  <ol id="start-cards" class="start-cards"></ol>
  <button class="btn pri" type="button" id="start-review">Start${I('right')}</button>
</section>
<button type="button" id="start-mini">${I('flag')}About this review<span class="more">Show</span></button>
<nav id="progress" aria-label="Progress"><div id="segs" class="segs"></div><p id="overview" aria-live="polite"></p></nav>

<div id="tour">
  <section id="ask" aria-labelledby="selection-title">
    <p id="t-where" class="sec-name"></p>
    <h2 id="selection-title" tabindex="-1"></h2>
    <p id="selection-meta"></p><div id="related-items"></div><div id="selection-actions" class="selection-actions"></div>
    <div id="t-start"><div id="understand">
${review.brief ? `      <section id="brief" aria-labelledby="brief-h">
      <h3 class="brief-h3" id="brief-h">${review.brief.question ? 'What I need you to decide' : 'What this explains'}</h3>
      ${review.brief.question ? `<p class="brief-q">${esc(review.brief.question)}</p>` : ''}
      ${review.brief.explains ? `<p class="brief-explains">${esc(review.brief.explains)}</p>` : ''}
      ${review.brief.recommendation ? `<p class="brief-rec"><span class="k">My recommendation</span>${esc(review.brief.recommendation)}</p>` : ''}
      ${(review.brief.examples || []).length ? `<h3 class="brief-h3">Where this has been done before</h3>
      <ul class="brief-ex">${review.brief.examples.map((x) => `<li><b>${esc(x.name)}</b> ${esc(x.what)}
        ${x.shows ? `<span class="ex-shows">What people see: ${esc(x.shows)}</span>` : ''}
        ${x.source ? `<a href="${esc(x.source)}" target="_blank" rel="noopener noreferrer">${esc(String(x.source).replace(/^https?:\/\//, '').split('/')[0])}</a>`
          : '<span class="unverified">unverified · I could not find a source</span>'}</li>`).join('')}</ul>` : ''}
      ${(review.brief.risks || []).length ? `<h3 class="brief-h3">What could go wrong</h3>
      <ul class="brief-risks">${review.brief.risks.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      </section>` : ''}
      ${review.intro ? `<div class="intro" id="intro"></div>` : ''}
      ${review.ask || review.afterwards ? `<div class="asks">
        ${review.ask ? `<p><b>How to answer</b>${esc(review.ask)}</p>` : ''}
        ${review.afterwards ? `<p><b>What happens next</b>${esc(review.afterwards)}</p>` : ''}
      </div>` : ''}
      <p class="facts"><span class="fact">${I('help')}${review.items.length} ${review.items.length === 1 ? 'question' : 'questions'}</span><span class="fact">${I('check')}Skip any; nothing counts as agreed</span><span class="fact">${I('send')}Nothing is sent until you download it</span></p>
    </div></div>
    <aside id="detail" aria-label="Your answer"></aside>
    <div id="t-end"><div id="return-block">
      <div id="t-summary"></div>
      <div class="summary-actions"><button class="btn pri" type="button" data-export="json">${I('send')}Download for the agent (JSON)</button><button class="btn" type="button" data-export="html">Download this page with your answers</button></div>
      <p class="download-status" role="status"></p>
${review.allowAddedItems === false ? '' : `      <section class="add" aria-labelledby="addh">
        <h3 id="addh" class="brief-h3">Anything else?</h3>
        <p class="d">Anything you want to say: ${/^[aeiou]/i.test(review.addNoun || 'item') ? 'an' : 'a'} ${esc(review.addNoun || 'item')} nobody asked about, an idea, or something unrelated. It goes back with your answers.</p>
        <label class="skip" for="at">Title</label>
        <input type="text" id="at" placeholder="What is it about?">
        <label class="skip" for="ab">Detail</label>
        <textarea id="ab" placeholder="Your feedback (optional)"></textarea>
        <div style="display:flex;gap:8px;margin-top:9px"><button class="btn" id="addbtn" type="button">Add it</button></div>
        <div id="added" style="margin-top:12px"></div>
      </section>`}
    </div></div>
  </section>

  <section id="places" aria-label="The four places">
    <div class="places-head"><span class="prog-sum">${I('layers')}The same four places on every question</span><span class="row">
      <button class="btn" type="button" data-only="#slot-proto" aria-pressed="false">${I('eye')}Prototype only</button><button class="btn" type="button" data-only="">Show all</button></span></div>
    <section class="slot" id="slot-map" aria-labelledby="slot-map-h"><div class="slot-head min-head"><span class="num">1</span><h2 id="slot-map-h">${I('map')}Map</h2>
      <button class="btn icon min" type="button" data-min="#slot-map" data-name="the map" aria-expanded="true" aria-label="Minimise the map">${I('minus')}</button></div>
      <div class="slot-body">${review.flow || (review.diagrams || []).length ? DPANEL : `<p class="empty-slot">${I('map')}This review has no map.</p>`}</div></section>
    <section class="slot" id="slot-proto" aria-labelledby="slot-proto-h"><div class="slot-head min-head"><span class="num">2</span><h2 id="slot-proto-h">${I('phone')}Prototype</h2>
      <button class="btn icon min" type="button" data-min="#slot-proto" data-name="the prototype" aria-expanded="true" aria-label="Minimise the prototype">${I('minus')}</button></div>
      <div class="slot-body">${review.flow ? `<section id="upanel" class="panel" aria-label="The screen">
        <div class="panel-head">
          <div class="seg" role="group" aria-label="How many screens to show">
            <button class="btn" type="button" data-screens="one" aria-pressed="true">This screen</button>
            <button class="btn" type="button" data-screens="all" aria-pressed="false">All screens</button>
          </div>
          <button class="btn icon panel-full" type="button" aria-pressed="false" aria-label="Full screen">${I('expand')}</button>
          <button class="btn" id="restart" type="button">${I('repeat')}Restart</button>
          <button type="button" id="linkswitch" class="switch" role="switch" aria-checked="true" hidden><span class="switch-box"></span>Connections</button>
        </div>
        <div class="panel-body"><div id="screen" class="screen"></div><div id="allscreens" hidden></div>
        <p class="hint">Tap a highlighted part of the screen to try it. Where you tap is never saved or sent.</p></div>
      </section>
      <p id="announce" class="skip" aria-live="polite"></p>` : ''}<div id="proto-extra"></div></div></section>
    <section class="slot" id="slot-expected" aria-labelledby="slot-expected-h"><div class="slot-head min-head"><span class="num">3</span><h2 id="slot-expected-h">${I('list')}What should happen</h2>
      <button class="btn icon min" type="button" data-min="#slot-expected" data-name="what should happen" aria-expanded="true" aria-label="Minimise what should happen">${I('minus')}</button></div>
      <div class="slot-body" id="expected"></div></section>
    <section class="slot" id="slot-build" aria-labelledby="slot-build-h"><div class="slot-head min-head"><span class="num">4</span><h2 id="slot-build-h">${I('code')}How I'd build it</h2>
      <button class="btn icon min" type="button" data-min="#slot-build" data-name="how I'd build it" aria-expanded="true" aria-label="Minimise how I'd build it">${I('minus')}</button></div>
      <div class="slot-body" id="build"></div></section>
  </section>

  <nav id="tnav" aria-label="Steps">
    <button class="btn" id="back" type="button">${I('left')}Back</button>
    <span id="stepno" aria-live="polite"></span>
    <button class="btn pri" id="next" type="button">Next${I('right')}</button>
  </nav>
</div>

<section id="ov" aria-label="Overview">
  <div id="ov-top"></div>
  <div class="bar" role="search">
    <label class="skip" for="q">Search questions</label>
    <input type="search" id="q" placeholder="Search…" autocomplete="off">
    <details class="panel-tools" id="filters-tools"><summary>Filters</summary><div class="tool-content">
    <div id="filters" role="group" aria-label="Filter questions"></div>
${review.flow ? `    <div class="flow-filters" role="group" aria-label="Filter steps">
      <label>Journey <select id="f-journey"><option value="">All journeys</option></select></label>
      <label>Status <select id="f-status"><option value="">Any status</option><option value="exists">In the product</option><option value="proposed">Planned</option><option value="suggested">Suggested</option></select></label>
      <label><input type="checkbox" id="f-problems"> Only where something goes wrong</label>
    </div>` : ''}
    </div></details>
    <output class="prog" id="prog" aria-live="polite"></output>
    <p id="filterinfo" class="filterinfo" aria-live="polite"></p>
  </div>
  <main id="items"></main>
  <section id="ov-end" aria-labelledby="ov-end-h"><h2 id="ov-end-h">${I('send')}Finish and send back</h2></section>
</section>

<p class="note" id="footnote">Answers save in this browser as you go. Downloading saves a file; nothing is sent from this page.</p>
<dialog id="return-review" aria-labelledby="return-heading">
  <h2 id="return-heading" tabindex="-1">Review summary</h2>
  <div id="finish-summary"></div>
  <p>Downloading does not send your feedback. Return the downloaded file through your chosen channel.</p>
  <p class="note">Either file carries the same answers: the JSON for the agent, or this page with your answers in it.</p>
  <div class="summary-actions"><button class="btn pri" id="export" type="button" data-export="json">Download JSON for the agent</button><button class="btn" id="exporth" type="button" data-export="html">Download answered HTML</button><button class="btn" id="continue-review" type="button">Continue reviewing</button></div>
  <p id="download-status" role="status"></p>
</dialog>
<p class="made">${mark ? `<svg viewBox="0 0 64 64" aria-hidden="true">${mark}</svg>` : ''}Made with <a href="https://github.com/shyhunter/LetMeShowYouSomething" target="_blank" rel="noopener noreferrer">LetMeShowYouSomething</a></p>
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
${selectionResolver}

// An exported copy keeps its own answers apart from this browser's own, so opening one overwrites nothing.
const LS = 'letmeshowyousomething:' + REVIEW.id + ':${fingerprint}' + (SEED ? ':copy:' + SEED.exportedAt : '');
const TONE = ${embed(TONE)};
let store = { verdicts:{}, notes:{}, added:[], choices:{}, requests:{}, layerVerdicts:{}, comments:[], pictures:[], proposals:[] };
if (SEED) { const { exportedAt, ...answers } = SEED; store = Object.assign(store, answers); }
try { const raw = localStorage.getItem(LS); if (raw) store = Object.assign(store, JSON.parse(raw)); } catch {}
// Answers are kept in this browser as you go. When it cannot keep them all (pictures take room), say so:
// exporting keeps everything, and nothing is lost silently.
const save = () => { try { localStorage.setItem(LS, JSON.stringify(store)); return true; }
  catch { const f = document.getElementById('save-warning'); if (f) { f.hidden = false; f.textContent = 'This browser cannot keep all your answers (pictures take room). Your current answers are still here. Finish review and download a copy before leaving.'; } return false; } };

const $ = (s) => document.querySelector(s);
const I = (name) => '<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>';
const TONE_ICON = { positive: 'check', caution: 'alert', negative: 'x', neutral: 'help' };
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
// #60 — pictures on a note or a comment. The page redraws each one, at most 1600 px, and saves it again:
// hidden details such as a photo's location are gone, and the size stays small enough to send.
const PIC_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const PIC_MAX = 1024 * 1024, PIC_TOTAL = 5 * 1024 * 1024, PIC_COUNT = 10;
const picBytes = (p) => Math.floor(p.data.length * 3 / 4);
const picSrc = (p) => PIC_TYPES.includes(p.type) && /^[A-Za-z0-9+/]+={0,2}$/.test(p.data) ? 'data:' + p.type + ';base64,' + p.data : '';
function picsHtml(on){
  const list = (store.pictures || []).filter(p => p.on === on);
  return \`<div class="pics" data-pics="\${esc(on)}">\${list.map(p => \`<figure class="pic"><img alt="Your picture" src="\${picSrc(p)}" width="\${+p.width}" height="\${+p.height}">
    <button class="btn" type="button" data-unpic="\${esc(p.id)}">Remove picture</button></figure>\`).join('')}
    <button class="btn" type="button" data-picadd="\${esc(on)}">Add a picture</button>
    <span class="pic-note">It goes into the file you send back.</span>
    <span class="pic-msg hint" aria-live="polite"></span></div>\`;
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
  const box = document.querySelector('[data-pics="' + CSS.escape(on) + '"]'); if (box) box.outerHTML = picsHtml(on);
  msg('Added. Re-saved without hidden details such as location.');
}
const picInput = Object.assign(document.createElement('input'), { type: 'file', id: 'picfile', accept: PIC_TYPES.join(','), hidden: true });
const picLabel = Object.assign(document.createElement('label'), { htmlFor: 'picfile', className: 'skip', textContent: 'Choose a picture' });
document.body.append(picLabel, picInput);
let picFor = null;
picInput.addEventListener('change', () => { const f = picInput.files[0]; picInput.value = ''; if (f && picFor) addPicture(picFor, f); });
document.addEventListener('click', e => {
  const add = e.target.closest('[data-picadd]');
  if (add) { picFor = add.dataset.picadd; picInput.click(); return; }
  const rm = e.target.closest('[data-unpic]'); if (!rm) return;
  const p = (store.pictures || []).find(x => x.id === rm.dataset.unpic); if (!p) return;
  store.pictures = store.pictures.filter(x => x !== p); save();
  const box = document.querySelector('[data-pics="' + CSS.escape(p.on) + '"]'); if (box) box.outerHTML = picsHtml(p.on);
});
// Paste a picture straight into a note or a comment.
document.addEventListener('paste', e => {
  const t = e.target.closest('textarea[data-note], textarea[data-comment]'); if (!t) return;
  const f = [...(e.clipboardData?.files || [])].find(x => PIC_TYPES.includes(x.type)); if (!f) return;
  e.preventDefault(); addPicture(t.dataset.note || t.dataset.comment, f);
});
const RISK = { low: ['ok', 'Low risk'], medium: ['warn', 'Medium risk'], high: ['bad', 'High risk'] };
function approvalHtml(a){
  const [tone, label] = RISK[a.risk] || ['neut', a.risk];
  const end = new Date(a.expiresAt);
  return \`<div class="appr">
    <p class="appr-h"><span class="k">Approval asked</span><span class="risk" style="--rt:var(--\${tone})">\${esc(label)}</span></p>
    <p class="appr-a">\${esc(a.action)}</p>
    <p class="appr-s"><span class="k">Affects</span>\${esc(a.scope)}</p>
    \${a.preview ? \`<pre class="appr-p">\${esc(a.preview)}</pre>\` : ''}
    <p class="appr-e"><span class="k">Valid until</span>\${esc(isNaN(end) ? a.expiresAt : end.toLocaleString())}. After that, a yes no longer counts.</p>
    <p class="appr-n">Your answer records what you want. The agent still asks for permission, in its own app, right before it acts.</p>
  </div>\`;
}
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

// #61, #100 — each of the four places can be minimised to its title bar and shown again, one at a
// time or "only the prototype"; remembered in this browser only.
const MINIMISABLE = ['#slot-map', '#slot-proto', '#slot-expected', '#slot-build'];
let mins = [];
try { mins = JSON.parse(localStorage.getItem(LS + ':min') || '[]').filter(s => MINIMISABLE.includes(s)); } catch {}
function applyMins(){
  for (const sel of MINIMISABLE) {
    const el = $(sel); if (!el) continue;
    const on = mins.includes(sel);
    el.classList.toggle('minimised', on);
    const b = el.querySelector('.min[data-min="' + sel + '"]');
    if (b) { b.setAttribute('aria-expanded', String(!on)); b.setAttribute('aria-label', (on ? 'Show ' : 'Minimise ') + b.dataset.name); b.innerHTML = I(on ? 'plus' : 'minus'); }
  }
  const only = MINIMISABLE.every(s => mins.includes(s) === (s !== '#slot-proto'));
  document.querySelectorAll('[data-only="#slot-proto"]').forEach(b => { b.setAttribute('aria-pressed', String(only)); });
  try { localStorage.setItem(LS + ':min', JSON.stringify(mins)); } catch {}
}
document.addEventListener('click', e => {
  const only = e.target.closest('[data-only]');
  if (only) { mins = MINIMISABLE.filter(s => only.dataset.only && s !== only.dataset.only); return applyMins(); }
  const b = e.target.closest('.min[data-min]'); if (!b) return;
  const sel = b.dataset.min;
  mins = mins.includes(sel) ? mins.filter(s => s !== sel) : mins.concat(sel);
  applyMins();
});
applyMins();

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

// #100 — one render for both views. The tour shows the open question on the left and its four places
// on the right; the Overview shows every question on one page. Only one view holds the answer controls
// at a time, so every input and id exists once. Where the reviewer is lives in memory only (D003).
let mode = 'tour', tourAt = 'start', lastIdx = -1;
try { if (localStorage.getItem(LS + ':mode') === 'overview') mode = 'overview'; } catch {}
const ovOpen = new Set();
document.addEventListener('toggle', e => {
  const d = e.target, id = d.dataset && d.dataset.for; if (!id) return;
  if (d.classList.contains('ov-places')) ovOpen[d.open ? 'add' : 'delete'](id);
}, true);
// The progress bar's parts: the review's sections, a flow's journeys, or one part for everything.
let segsMemo = null;
function segs(){
  if (segsMemo) return segsMemo;
  const list = [];
  const iconFor = (sec, ids) => sec && sec.mode === 'choose-one' ? 'star' : sec && sec.kind === 'challenge' ? 'alert'
    : ids.every(id => REVIEW.items.find(i => i.id === id).approval) ? 'shield' : 'help';
  if ((REVIEW.sections || []).length) for (const sec of REVIEW.sections) {
    const ids = REVIEW.items.filter(i => i.sectionId === sec.id).map(i => i.id);
    if (ids.length) list.push({ label: sec.label || sec.id, sec, ids, icon: iconFor(sec, ids) });
  } else if (FLOW) for (const j of JOURNEYS) {
    const ids = STEPS.filter(s => journeyOf(s) === j.id).map(s => s.id);
    if (ids.length) list.push({ label: j.title || j.id, ids, icon: 'phone' });
  }
  const rest = REVIEW.items.filter(i => !list.some(s => s.ids.includes(i.id))).map(i => i.id);
  if (rest.length) list.push({ label: list.length ? 'Other questions' : 'Questions', ids: rest, icon: iconFor(null, rest) });
  list.forEach((s, i) => { s.color = 'var(--s' + (i % 6 + 1) + ')'; });
  return segsMemo = list;
}
const ORDER = () => segs().flatMap(s => s.ids);
const segOf = (id) => segs().find(s => s.ids.includes(id));
const secOf = (it) => (REVIEW.sections || []).find(s => s.id === it.sectionId);
const itemById = (id) => REVIEW.items.find(i => i.id === id);
function curIdx(){ const i = ORDER().indexOf(selected); if (i >= 0) lastIdx = i; return lastIdx; }

function drawProgress(){
  const cur = mode === 'tour' && tourAt === 'item' ? segOf(selected) : null;
  const edge = (key, label, icon, done, now) => '<button type="button" class="pseg" data-seg="' + key + '" style="--sc:var(--neut);--w:1.5"' + (now ? ' aria-current="step"' : '')
    + ' aria-label="' + label + (done ? ': done' : '') + '"><span class="track"><i style="width:' + (done ? 100 : 0) + '%"></i></span><span class="pl" aria-hidden="true">' + I(icon) + label + '</span></button>';
  $('#segs').innerHTML = edge('start', 'Understand', 'info', tourAt !== 'start', false) + segs().map((s, i) => {
    const done = s.ids.filter(id => store.verdicts[id]).length;
    return '<button type="button" class="pseg" data-seg="' + i + '" style="--sc:' + s.color + ';--w:' + s.ids.length + '"' + (s === cur ? ' aria-current="step"' : '')
      + ' aria-label="' + esc(s.label) + ': ' + done + ' of ' + s.ids.length + ' answered"><span class="track"><i style="width:' + Math.round(100 * done / s.ids.length) + '%"></i></span>'
      + '<span class="pl" aria-hidden="true">' + I(s.icon) + esc(s.label) + ' <small>' + done + '/' + s.ids.length + '</small></span></button>';
  }).join('') + edge('end', 'Return', 'send', false, mode === 'tour' && tourAt === 'end');
  const n = REVIEW.items.length, answered = REVIEW.items.filter(i => store.verdicts[i.id]).length;
  $('#overview').textContent = (cur ? cur.label + ' · ' : '') + answered + ' of ' + n + ' answered' + (n - answered ? ' · ' + (n - answered) + ' open' : '');
}

function render(){
  document.body.classList.toggle('at-start', mode === 'tour' && tourAt === 'start');
  drawProgress();
  if (mode === 'overview') renderOverview(); else renderTour();
  renderAdded();
  renderSelection();
}

function renderOverview(){
  for (const id of ['#detail', '#expected', '#build', '#proto-extra']) $(id).innerHTML = '';
  let html = '', shown = 0;
  for (const s of segs()) {
    const items = s.ids.map(itemById).filter(visible), sec = s.sec;
    if (!items.length) continue;
    shown += items.length;
    html += '<section class="sec" style="--sc:' + s.color + '" aria-label="' + esc(s.label) + '"><h2 class="ov-sec">' + I(s.icon) + esc(s.label)
      + ' <small>' + s.ids.filter(id => store.verdicts[id]).length + '/' + s.ids.length + ' answered</small></h2>'
      + (sec && sec.description ? '<p class="d">' + esc(sec.description) + '</p>' : '') + (sec && sec.mode === 'choose-one' ? '<p class="pick">Choose one</p>' : '')
      + (sec && sec.diagram && sec.diagram.kind === 'mermaid' ? '<div class="mmd"><pre>' + esc(sec.diagram.source) + '</pre></div>' : '')
      + items.map(cardHtml).join('') + '</section>';
  }
  $('#items').innerHTML = html || '<p class="empty">Nothing matches that filter.</p>';
  const answered = REVIEW.items.filter(i => store.verdicts[i.id]).length;
  $('#prog').textContent = answered + '/' + REVIEW.items.length + ' answered' + (shown !== REVIEW.items.length ? ' · ' + shown + ' shown' : '');
  // D046 — a filter never hides silently
  const activeFilters = [];
  if (filter !== 'all') activeFilters.push($('#filters [data-f="' + CSS.escape(filter) + '"]')?.textContent || filter);
  if (q) activeFilters.push('Search: ' + q);
  for (const id of ['#f-journey', '#f-status']) if ($(id)?.value) activeFilters.push($(id).selectedOptions[0].textContent);
  if ($('#f-problems')?.checked) activeFilters.push('Only where something goes wrong');
  $('#filterinfo').innerHTML = shown !== REVIEW.items.length || activeFilters.length ? 'Showing ' + shown + ' of ' + REVIEW.items.length + ' · <button type="button" class="btn" id="showall">Show all</button>' + (activeFilters.length ? ' · ' + esc(activeFilters.join(' · ')) : '') : '';
  $('#t-summary').innerHTML = finishSummary();
}

function renderTour(){
  $('#items').innerHTML = '';
  const it = tourAt === 'item' ? itemById(selected) : null, s = it ? segOf(it.id) : null;
  $('#t-start').hidden = tourAt !== 'start'; $('#t-end').hidden = tourAt !== 'end'; $('#detail').hidden = tourAt !== 'item';
  $('#ask').style.setProperty('--sc', s ? s.color : 'var(--ac)');
  $('#t-where').innerHTML = tourAt === 'start' ? I('flag') + 'Understand' : tourAt === 'end' ? I('send') + 'Return'
    : s ? I(s.icon) + esc(s.label) + ' · ' + (s.ids.indexOf(it.id) + 1) + ' of ' + s.ids.length : '';
  $('#detail').innerHTML = it ? answerHtml(it, secOf(it)) : FLOW ? '<p class="hint">Tap a highlighted part of the screen, or press Next.</p>' : '';
  $('#t-summary').innerHTML = tourAt === 'end' ? finishSummary() : '';
  const p = it ? placesFor(it) : {};
  const empty = (icon, text) => '<p class="empty-slot">' + I(icon) + text + '</p>';
  $('#proto-extra').innerHTML = p.proto || (FLOW ? '' : empty('phone', 'Nothing to show on a screen for this question.'));
  $('#expected').innerHTML = p.expected || empty('list', 'Nothing more to show here.');
  $('#build').innerHTML = p.build || empty('code', 'Nothing about how it is built for this question.');
  const order = ORDER(), n = order.length + 2, i = curIdx();
  const pos = tourAt === 'start' ? 1 : tourAt === 'end' ? n : i + 2;
  $('#stepno').textContent = 'Step ' + pos + ' of ' + n;
  $('#back').disabled = tourAt === 'start';
  $('#next').disabled = tourAt === 'end';
  $('#next').innerHTML = (tourAt === 'start' ? 'Start' : tourAt === 'end' ? 'Done' : i >= order.length - 1 ? 'Finish'
    : it && !store.verdicts[it.id] ? 'Skip for now' : 'Next') + I('right');
}


// D060 — the reviewer can ask back: an example, or an explanation. Both travel in the feedback.
const ASKS = [['example', 'Show me an example'], ['explain', 'Explain this']];
const asksRow = (id) => \`<div class="asks-row">\${ASKS.map(([kind, label]) => \`<label class="ask"><input type="checkbox"
  data-ask="\${esc(kind)}" data-for="\${esc(id)}"\${(store.requests[id] || {})[kind] ? ' checked' : ''}> \${label}</label>\`).join('')}</div>\`;

// D098 — one tap, every layer answers: under each outcome, what runs (system) and what changes (data),
// each entry with its status and checked reference, and a verdict of its own (D006). Which layers are
// open first is the review's choice (D005); the reviewer switches them, in memory only (D003).
// Decided on first use: FLOW is defined further down the page.
let layersOn = null;
const layers = () => layersOn || (layersOn = new Set(((FLOW || {}).layers || {}).default || ['ui', 'flow']));
const KIND_LABEL = { component: 'Runs', external: 'Calls out', guard: 'Checks' };
const CHANGE_LABEL = { insert: 'Adds', update: 'Changes', delete: 'Removes' };
function entryJudge(stepId, e){
  const key = stepId + '/' + e.id, cur = (store.layerVerdicts || {})[key] || {};
  const label = (OPTS.find(o => o.value === cur.verdict) || {}).label;
  return \`<details class="judge"\${cur.verdict ? ' data-judged="true"' : ''}><summary>\${label ? 'Judged: ' + esc(label) : 'Judge this'}</summary>
    <div class="verdicts">\${OPTS.map(o => \`<label class="v-\${TONE[o.tone] || 'neut'}"><input type="radio" name="lv-\${esc(key)}" value="\${esc(o.value)}"
      data-lv="\${esc(key)}"\${cur.verdict === o.value ? ' checked' : ''}><span>\${esc(o.label)}</span></label>\`).join('')}</div>
    <textarea data-lvnote="\${esc(key)}" aria-label="Note on \${esc(e.name || e.entity)}" placeholder="What is wrong or missing here?">\${esc(cur.note || '')}</textarea></details>\`;
}
function layerHtml(stepId, x){
  const status = (e) => \`<span class="lstatus" data-s="\${esc(e.status)}">\${esc(STATUS_LABEL[e.status] || e.status)}</span>\${e.ref ? \` <code>\${esc(e.ref)}</code>\` : ''}\`;
  const sys = (x.system || []).length ? \`<div class="layer layer-system"><span class="k">What runs</span><ol>\${x.system.map(e =>
    \`<li><span class="lkind">\${esc(KIND_LABEL[e.kind] || e.kind)}</span> \${esc(e.name)}<br>\${status(e)}\${entryJudge(stepId, e)}</li>\`).join('')}</ol></div>\` : '';
  const data = (x.data || []).length ? \`<div class="layer layer-data"><span class="k">What changes</span><ul>\${x.data.map(e =>
    \`<li><span class="lkind">\${esc(CHANGE_LABEL[e.change] || e.change)}</span> \${esc(e.entity)}\${(e.fields || []).length ? '<span class="lfields">' + e.fields.map(f =>
      \`<code>\${esc(f.name)}: \${f.before !== undefined ? esc(f.before) + ' → ' : ''}\${f.after !== undefined ? esc(f.after) : '—'}</code>\`).join('') + '</span>' : ''}<br>\${status(e)}\${entryJudge(stepId, e)}</li>\`).join('')}</ul></div>\` : '';
  return sys + data;
}
function showLayers(){ for (const k of ['system', 'data']) document.body.classList.toggle('show-' + k, layers().has(k)); }
function layerSwitches(it){
  const has = (k) => it.step.outcomes.some(o => (o[k] || []).length);
  const sw = [['system', 'What runs'], ['data', 'What changes']].filter(([k]) => has(k));
  return sw.length ? \`<div class="layer-switch" role="group" aria-label="Layers of this step">\${sw.map(([k, t]) =>
    \`<label><input type="checkbox" data-layer="\${k}"\${layers().has(k) ? ' checked' : ''}> \${t}</label>\`).join('')}</div>\` : '';
}

// What should happen: every outcome side by side; "Show this" plays it on the screen.
function outcomeCols(it){
  const o = last && last.step === it ? last.outcome : null;
  return (pending === it ? '<p class="hint">What happens? Pick one to see it.</p>' : '')
    + \`<div class="expected outcome-cols">\${it.step.outcomes.map((x, i) => \`<div class="outcome exp \${x.because ? 'fail' : 'ok'}" data-picked="\${x === o}">
      <span class="ei">\${I(x.because ? 'x' : 'check')}</span><b>\${esc(x.label || 'Result')}</b><p>\${esc(x.effect)}</p>
      \${x.because ? \`<p><span class="k">Why</span>\${esc(x.because)}</p>\` : ''}\${x.canNow ? \`<p><span class="k">You can now</span>\${esc(x.canNow)}</p>\` : ''}
      <p class="basis">Leads to: \${esc(screenTitle(x.to))}</p>
      <button type="button" class="btn" data-outcome="\${i}" data-for="\${esc(it.id)}">\${x === o ? 'Showing this' : 'Show this'}</button></div>\`).join('')}</div>\`;
}
// How I'd build it: under each outcome, what runs and what changes (D098), each judged on its own.
function buildHtml(it){
  const outs = it.step.outcomes.filter(x => (x.system || []).length || (x.data || []).length);
  return outs.length ? layerSwitches(it) + outs.map(x => \`<div class="outcome-build"><b>\${esc(x.label || 'Result')}</b>\${layerHtml(it.id, x)}</div>\`).join('') : '';
}
// A screen drawn still, for the Overview: the one a step starts from.
function stillScreen(id){
  const s = FLOW.screens.find(x => x.id === id);
  return s ? \`<div class="screen"><p class="screen-title">\${esc(s.title)}</p>\${(s.blocks || []).map(b => drawBlock(b, { targets: new Set(), still: true })).join('')}</div>\` : '';
}

// #42 — real precedents on an item, as in the brief: who, what they did, what people see, and the source
// (or an honest "unverified"). Usually the agent's answer to "Show me an example" in the next round.
function examplesHtml(list){
  if (!(list || []).length) return '';
  return \`<h3 class="brief-h3">Where this has been done before</h3><ul class="brief-ex">\${list.map(x => \`<li><b>\${esc(x.name)}</b> \${esc(x.what || '')}
    \${x.shows ? \`<span class="ex-shows">What people see: \${esc(x.shows)}</span>\` : ''}
    \${x.source ? \`<a href="\${esc(x.source)}" target="_blank" rel="noopener noreferrer">\${esc(String(x.source).replace(/^https?:\\/\\//, '').split('/')[0])}</a>\`
      : '<span class="unverified">unverified · I could not find a source</span>'}</li>\`).join('')}</ul>\`;
}

// #100 — the question and your answer: why it is asked, then big answer tiles in the review's own words
// and tones. The note and pictures sit behind one tap until you have answered.
function answerHtml(it, sec){
  const cur = store.verdicts[it.id] || 'unset';
  const choosing = sec && sec.mode === 'choose-one';
  const chosen = choosing && store.choices[sec.id] === it.id;
  const rec = choosing && sec.recommended && sec.recommended.itemId === it.id;
  const opts = optsFor(it), picked = opts.find(o => o.value === cur);
  // The note and pictures come after an answer (or when there already is one): what should be different, or anything to add.
  const noteShown = cur !== 'unset' || store.notes[it.id] || (store.pictures || []).some(p => p.on === it.id);
  const wants = picked && picked.tone !== 'positive';
  return \`<fieldset class="item\${chosen ? ' chosen' : ''}\${it.step ? ' open' : ''}" data-v="\${cur}" style="--tone:var(--\${TONE[(picked || {}).tone] || 'line2'})">
    <legend>\${esc(it.title)}</legend>
    \${it.step ? \`<p class="w-line"><span class="w-journey">\${esc((JOURNEYS.find(j => j.id === journeyOf(it)) || {}).title || '')}</span>
      <span class="w-status">\${STATUS_LABEL[statusOf(it.step)]}</span></p>\` : ''}
    \${it.step && it.step.goal ? \`<p class="body">Goal: \${esc(it.step.goal)}</p>\` : ''}
    \${it.summary ? \`<p class="body">\${esc(it.summary)}</p>\` : ''}
    \${it.body ? (it.summary
      ? \`<details class="more"><summary>More detail</summary><p class="body">\${esc(it.body)}</p></details>\`
      : \`<p class="body">\${esc(it.body)}</p>\`) : ''}
    \${(it.affects || []).map(a => \`<p class="aff"><span class="k">Previously decided · \${esc(a.effect)}</span>
      "\${esc(a.decision.title)}" was answered \${esc(a.decision.verdict)}. \${esc(a.why)}</p>\`).join('')}
    \${choosing ? \`<div class="choose"><label><input type="radio" name="c-\${esc(sec.id)}" value="\${esc(it.id)}"
      data-choice="\${esc(sec.id)}" \${chosen ? 'checked' : ''}> Choose this</label>
      \${rec ? \`<span class="rec">Recommended</span><span class="recwhy">\${esc(sec.recommended.why)}</span>\` : ''}</div>\` : ''}
    <p class="qprompt">\${I(it.approval ? 'shield' : 'help')}\${it.approval ? 'Do you approve this?' : 'Your answer'}</p>
    <div class="verdicts tiles" role="radiogroup" aria-label="\${it.approval ? 'Approve or decline' : 'Verdict for'}: \${esc(it.title)}">
      \${opts.map(o => \`<label class="v-\${TONE[o.tone] || 'neut'}"><input type="radio" name="v-\${esc(it.id)}" value="\${esc(o.value)}"\${cur === o.value ? ' checked' : ''}
        data-item="\${esc(it.id)}"><span class="dot">\${I(TONE_ICON[o.tone] || 'help')}</span><span>\${esc(o.label)}</span></label>\`).join('')}
    </div>
    \${(picked || {}).hint ? \`<p class="hint">\${esc(picked.hint)}</p>\` : ''}
    \${asksRow(it.id)}
    \${noteShown ? \`<div class="explain"><label class="qprompt" for="n-\${esc(it.id)}">\${I('note')}\${wants ? 'What should be different?' : 'Anything to add? (optional)'}</label>
    <textarea id="n-\${esc(it.id)}" data-note="\${esc(it.id)}"
      placeholder="\${wants ? 'Say what you expected instead. Your words are what gets acted on.' : 'A note, if you have one.'}">\${esc(store.notes[it.id]||'')}</textarea>
    \${picsHtml(it.id)}</div>\` : ''}
  </fieldset>\`;
}
// The three places after the map, for one question. The Overview shows a flow step's screen still;
// the tour has the live screen in its own place.
function placesFor(it, overview){
  const flds = (REVIEW.fields||[]).filter(f => (it.fields||{})[f.key]).map(f =>
    \`<div class="fld exp \${f.tone === 'negative' ? 'fail' : f.tone === 'positive' ? 'ok' : 'info'}"><span class="ei">\${I(f.tone === 'negative' ? 'x' : f.tone === 'positive' ? 'check' : 'info')}</span><b class="k">\${esc(f.label)}</b><p class="val">\${esc(it.fields[f.key])}</p></div>\`).join('');
  return {
    proto: (overview && it.step && FLOW ? stillScreen(it.step.from) : '') + (it.approval ? approvalHtml(it.approval) : ''),
    expected: (it.step ? outcomeCols(it) : '') + (flds ? \`<div class="expected flds">\${flds}</div>\` : '') + examplesHtml(it.examples),
    build: (it.step ? buildHtml(it) : '') + (it.ref ? \`<p class="ref">\${I('code')} \${esc(it.ref)}</p>\` : ''),
  };
}
function cardHtml(it){
  const p = placesFor(it, true);
  const parts = [['phone', 'Prototype', p.proto], ['list', 'What should happen', p.expected], ['code', "How I'd build it", p.build]].filter(x => x[2]);
  return \`<article class="card" data-card="\${esc(it.id)}" style="--sc:\${segOf(it.id).color}">\${answerHtml(it, secOf(it))}
    \${parts.length ? \`<details class="ov-places" data-for="\${esc(it.id)}"\${ovOpen.has(it.id) ? ' open' : ''}><summary>\${parts.map(x => I(x[0])).join('')}Show \${parts.map(x => x[1].toLowerCase()).join(' · ')}</summary>
      <div class="ov-grid">\${parts.map(([ic, h, b]) => \`<div><h3>\${I(ic)}\${h}</h3>\${b}</div>\`).join('')}</div></details>\` : ''}
    <button class="btn" type="button" data-open="\${esc(it.id)}">\${I('right')}Open in the tour</button></article>\`;
}

function renderAdded(){
  const box = $('#added'); if (!box) return;
  box.innerHTML = (store.added.length ? '<h3 class="added-h">Your own feedback</h3>' : '') + store.added.map((a,i)=>\`<div class="addedrow">
    <div class="t"><button class="btn" type="button" data-select-added="\${esc(a.id)}">\${esc(a.title)}</button>\${a.body?\`<div class="b">\${esc(a.body)}</div>\`:''}</div>
    <button class="btn" type="button" data-del="\${i}" aria-label="Remove \${esc(a.title)}">Remove</button></div>\`).join('');
}

document.addEventListener('change', e => {
  const layer = e.target.closest('input[data-layer]');
  if (layer) {
    // Shown or hidden, never redrawn: the switch the reviewer just used stays where it is.
    const k = layer.dataset.layer;
    layers()[layer.checked ? 'add' : 'delete'](k); showLayers();
    document.querySelectorAll('input[data-layer="' + CSS.escape(k) + '"]').forEach(x => { x.checked = layer.checked; });
    return;
  }
  const lv = e.target.closest('input[data-lv]');
  if (lv) {
    const cur = store.layerVerdicts[lv.dataset.lv] || (store.layerVerdicts[lv.dataset.lv] = {});
    cur.verdict = lv.value; save();
    const sum = lv.closest('details').querySelector('summary');
    sum.textContent = 'Judged: ' + ((OPTS.find(o => o.value === lv.value) || {}).label || lv.value);
    lv.closest('details').dataset.judged = 'true';
    return;
  }
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
  const ln = e.target.closest('textarea[data-lvnote]');
  if (ln) { const cur = store.layerVerdicts[ln.dataset.lvnote] || (store.layerVerdicts[ln.dataset.lvnote] = {}); cur.note = ln.value; save(); return; }
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
  const d = e.target.closest('[data-del]');
  if (d){
    const removed = store.added.splice(+d.dataset.del,1)[0];
    if (selection?.target.kind === 'added' && selection.target.id === removed?.id) { selection = null; selected = null; }
    if (removed) dropPictures(removed.id);
    save(); render(); $('#at').focus();
  }
});
const addBtn = $('#addbtn');
if (addBtn) addBtn.addEventListener('click', () => {
  const t = $('#at').value.trim(), b = $('#ab').value.trim();
  if (!t && !b) { $('#at').focus(); return; }
  store.added.push({ id:freeId('added-', answerIds()), title:t||'(untitled)', body:b, verdict:'unset', note:null });
  save(); $('#at').value=''; $('#ab').value=''; render(); $('#at').focus();
});

// Two downloads, from the summary dialog or the Return step: the JSON, or this page with the answers.
const downloaded = (t) => document.querySelectorAll('#download-status, .download-status').forEach(x => { x.textContent = t; });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-export]'); if (!b) return;
  if (b.dataset.export === 'json') {
    const out = buildFeedback(REVIEW, store);
    saveAs(JSON.stringify(out,null,2), 'application/json', REVIEW.id + '.feedback.json');
    $('#footnote').textContent = \`Downloaded \${out.summary.answered}/\${out.summary.total} answered · \${out.summary.added} added · \${out.gaps.length} gaps. Nothing was sent: return the file yourself.\`;
    downloaded('Downloaded JSON. Return this file to the agent; nothing was sent automatically.');
  } else {
    const seed = JSON.stringify({ ...store, exportedAt: new Date().toISOString() }).replace(/[<\\u2028\\u2029]/g, (c) => '\\\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    saveAs(PAGE.replace(/^const SEED = .*$/m, () => 'const SEED = ' + seed + ';'), 'text/html', REVIEW.id + '.feedback.html');
    $('#footnote').textContent = 'Exported the whole page with your answers. Nothing was sent: send this file back yourself; the agent can read it or the .json.';
    downloaded('Downloaded answered HTML. Return this file to the agent for checked import; nothing was sent automatically.');
  }
});
const saveAs = (text, type, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
};
// D076 — the HTML export (above) is this whole page with the answers in it: every chart, screen and
// step, for someone who will never open a .json file. "<" is escaped so no answer can close the script tag.
// Finish is a view of the existing contract, not a new definition of answered or approved.
function finishSummary(){
  const out = buildFeedback(REVIEW, store);
  const counts = OPTS.map(o => ({ ...o, approval: false })).concat(APPROVAL_OPTS.map(o => ({ ...o, approval: true }))).map(o => {
    const count = out.responses.filter(r => r.verdict === o.value && !!r.approval === o.approval).length;
    return count ? '<span>' + count + ' ' + esc(o.label) + '</span>' : '';
  }).join('');
  const targets = out.responses.map(r => ({ id: r.itemId, title: r.title, kind: 'item' }))
    .concat((out.addedItems || []).map(a => ({ id: a.id, title: a.title, kind: 'added' })))
    .concat((out.layerVerdicts || []).map(l => ({ id: l.id, title: l.entry, kind: 'layer' })));
  const link = (id, text) => {
    const matches = targets.filter(t => t.id === id);
    if (matches.length !== 1) return esc(text || id) + ' — target is ambiguous or unavailable; preserve the file and ask for clarification.';
    const t = matches[0];
    return '<button class="btn" type="button" data-summary-target="' + esc(id) + '" data-summary-kind="' + t.kind + '">' + esc(text || t.title) + '</button>';
  };
  const choices = (out.choices || []).map(c => '<li>' + esc(c.sectionLabel) + ': ' + esc(c.title || 'No option chosen') + '</li>').join('');
  const gaps = out.gaps.map(id => '<li>' + link(id) + '</li>').join('');
  const requests = (out.requests || []).map(r => '<li>' + link(r.itemId, (r.kind === 'example' ? 'Show an example: ' : 'Explain: ') + r.title) + '</li>').join('');
  const partial = out.summary.unset || (out.choices || []).some(c => !c.itemId);
  return '<p>' + (partial ? 'Partial review — unanswered items and choices are kept, never treated as agreement.' : 'All items have an answer. Answers are not permission to act.') + '</p>'
    + '<div class="summary-counts"><span>' + out.summary.answered + ' / ' + out.summary.total + ' answered</span><span>' + out.summary.unset + ' unanswered</span>' + counts + '</div>'
    + '<p>' + out.gaps.length + ' gaps · ' + (out.requests || []).length + ' requests · ' + out.summary.added + ' added items · ' + (out.comments || []).length + ' comments · ' + (out.pictures || []).length + ' pictures · ' + (out.proposals || []).length + ' proposed changes</p>'
    + (choices ? '<h3>Choices</h3><ul>' + choices + '</ul><p>Unrated alternatives in a chosen section stay unanswered, but are not gaps.</p>' : '')
    + (gaps ? '<h3>Needs attention</h3><ul>' + gaps + '</ul>' : '<p>No derived gaps. Check any outstanding requests before continuing.</p>')
    + (requests ? '<h3>Requests still needing a response</h3><ul>' + requests + '</ul>' : '')
    + ((out.proposals || []).length ? '<p>Proposed changes are suggestions, not confirmation that anything has been implemented.</p>' : '');
}
let summaryDestination = false;
$('#finish').addEventListener('click', () => { summaryDestination = false; $('#finish-summary').innerHTML = finishSummary(); $('#download-status').textContent = ''; $('#return-review').showModal(); $('#return-heading').focus(); });
$('#continue-review').addEventListener('click', () => $('#return-review').close());
$('#return-review').addEventListener('close', () => { if (!summaryDestination) $('#finish').focus({ preventScroll: true }); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-summary-target]'); if (!b) return;
  summaryDestination = true;
  if ($('#return-review').open) $('#return-review').close();
  if (b.dataset.summaryKind === 'item') openItem(b.dataset.summaryTarget);
  else if (b.dataset.summaryKind === 'layer') {
    const [itemId, entryId] = b.dataset.summaryTarget.split('/');
    openItem(itemId);
    focusResponse(itemId + '/' + entryId);
  } else { setMode('tour'); selectTarget({ kind: 'added', id: b.dataset.summaryTarget }); $('#selection-title').focus(); }
});
$('#reset').addEventListener('click', () => {
  if (!confirm('Clear every answer you have given on this machine?')) return;
  if (selection?.target.kind === 'added') { selection = null; selected = null; }
  store = { verdicts:{}, notes:{}, added:[], choices:{}, requests:{}, layerVerdicts:{}, comments:[], pictures:[], proposals:[] }; save(); render();
  if ($('#dpanel')) {
    showChanges = false; $('#showchanges').setAttribute('aria-pressed', 'false'); $('#showchanges').textContent = 'Show my changes';
    renderComments(); showChangesBtn(); drawStageChart();
  }
});
// ── flow player (D002: outcomes are picked, never computed · D003: position lives in memory only) ──
const FLOW = REVIEW.flow || null;
let at = FLOW ? FLOW.start : null, pending = null, last = null;
const selectionReview = { ...REVIEW, diagrams: (FLOW ? [flowAsDiagram(REVIEW)] : []).concat(REVIEW.diagrams || []) };
let selection = null;
let selected = null; // derived compatibility value for drawing; never saved
function selectTarget(target, keepDetail = false){
  const added = target.kind === 'added' && store.added.filter(a => a.id === target.id);
  const next = added ? (added.length === 1 ? { target: { kind: 'added', id: target.id }, label: added[0].title, itemId: null, screenId: null, relatedItemIds: [] } : null)
    : resolveReviewSelection(selectionReview, target);
  if (!next) return false;
  selection = next; selected = next.itemId; tourAt = 'item';
  at = next.screenId;
  const owner = REVIEW.items.find(i => i.id === selected);
  pending = owner?.step && next.outcomeIndex == null ? owner : null;
  last = owner?.step && next.outcomeIndex != null ? { step: owner, outcome: owner.step.outcomes[next.outcomeIndex] } : null;
  if (keepDetail) { if (FLOW) drawPlayer(); else if ($('#dpanel')) drawStageChart(); renderSelection(); }
  else if (FLOW) drawAll();
  else { render(); if ($('#dpanel')) drawStageChart(); }
  if ($('#announce')) $('#announce').textContent = 'Selected: ' + next.label;
  return true;
}
function renderSelection(){
  const it = REVIEW.items.find(i => i.id === selected), edge = tourAt !== 'item';
  $('#selection-title').textContent = tourAt === 'start' ? 'Before you start' : tourAt === 'end' ? 'Finish and send back'
    : selection?.layerKey ? selection.label : it ? it.title : selection?.label || 'Choose something to look at';
  $('#selection-meta').textContent = edge ? '' : [selection?.layerKey ? 'Layer response: ' + selection.label + ' · Within: ' + it.title
    : it ? '' : selection?.target.kind === 'added' ? 'Your added feedback; not a verdict on another item.'
    : selection?.screenId ? 'Choose a related behavior below. This screen has no separate verdict.' : selection ? 'Selecting something does not record an answer.' : '',
    it && !visible(it) ? 'Selected item is outside the current filters.' : ''].filter(Boolean).join(' · ');
  $('#related-items').innerHTML = !edge && !selected ? (selection?.relatedItemIds || []).map(id => '<button class="btn" type="button" data-open="' + esc(id) + '">' + esc(REVIEW.items.find(i => i.id === id)?.title) + '</button>').join('') : '';
  $('#selection-actions').innerHTML = edge ? '' : (selection?.commentTarget ? '<button class="btn" id="comment-selected" type="button">' + I('pin') + 'Mark it on the map</button>' : '')
    + (selection?.layerKey ? '<button class="btn" id="inspect-response" type="button">Go to response</button>' : '');
  if (mode === 'tour' && !edge && selection?.target.kind === 'added') {
    const a = store.added.find(x => x.id === selection.target.id);
    $('#detail').innerHTML = '<h3>' + esc(a?.title) + '</h3><p>' + esc(a?.body) + '</p>' + (a?.note ? '<p>' + esc(a.note) + '</p>' : '');
  }
}
function openItem(id){
  setMode('tour');
  if (!selectTarget({ kind: 'item', itemId: id })) return;
  $('#detail input[type=radio]')?.focus();
}
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
  selectTarget({ kind: 'item', itemId: id });
}

// D057 — one diagram panel with tabs, the focus tab first (D059), and an empty tab that says what it is for (D062).
const TABS = (FLOW ? [['user-flow', 'The user flow']] : [])
  .concat((REVIEW.diagrams || []).map(d => [d.id, d.title || d.id]));
if (REVIEW.focus && TABS.some(t => t[0] === REVIEW.focus)) TABS.unshift(TABS.splice(TABS.findIndex(t => t[0] === REVIEW.focus), 1)[0]);
let chartTab = (TABS[0] || [])[0];
const chartFor = (id) => id === 'user-flow' ? flowAsDiagram(REVIEW)
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
  if (!d) { box.innerHTML = ''; return; }
  // Sub-processes belong to a flow: a chart with no steps and no parts (a system diagram) hides them.
  if ($('#subproc')) $('#subproc').hidden = !(d.nodes || []).some(n => n.step !== undefined || n.part !== undefined);
  const mine = (store.proposals || []).filter(p => p.diagram === chartTab);
  // This index belongs only to the drawing copy. Proposal preview may remove/relabel arrows,
  // but a comment must still name the original arrow, never its new position in the preview.
  const drawing = { ...d, edges: (d.edges || []).map((edge, index) => ({ ...edge, reviewEdgeIndex: index })) };
  const shown = showChanges && mine.length ? applyProposals(drawing, mine) : { diagram: drawing, added: [] };
  box.innerHTML = drawDiagram(shown.diagram, { selected, here: 'screen:' + at, part: partHighlight, partSteps: partSteps(partHighlight), commentable: true, originalEdges: d.edges || [] });
  const nodes = new Set(shown.diagram.nodes.map(n => n.id));
  const drawnEdges = shown.diagram.edges.filter(e => nodes.has(e.from) && nodes.has(e.to) && (['sequence', 'database'].includes(d.kind) || e.kind !== 'association'));
  box.querySelectorAll('.dg-edge').forEach((el, index) => {
    const edge = drawnEdges[index], nth = edge?.reviewEdgeIndex;
    if (!Number.isInteger(nth)) { el.dataset.previewOnly = 'true'; el.removeAttribute('tabindex'); el.removeAttribute('role'); return; }
    if (['sequence', 'database'].includes(d.kind) || d.edges.filter(e => e.from === edge.from && e.to === edge.to).length > 1) el.dataset.nth = String(nth);
  });
  const target = selection?.target;
  let represented = [];
  if (target?.diagramId === chartTab && target.kind === 'node') represented = [...box.querySelectorAll('[data-node="' + CSS.escape(target.nodeId) + '"]')];
  else if (target?.diagramId === chartTab && target.kind === 'edge') represented = [...box.querySelectorAll('.dg-edge')].filter(e => e.dataset.from === target.from && e.dataset.to === target.to && (target.nth == null || +e.dataset.nth === target.nth));
  else if (selected) represented = [...box.querySelectorAll('[data-step="' + CSS.escape(selected) + '"]')];
  else if (selection?.screenId && chartTab === 'user-flow') represented = [...box.querySelectorAll('[data-node="' + CSS.escape('screen:' + selection.screenId) + '"]')];
  represented.forEach(el => { el.classList.add('dg-selected'); el.setAttribute('aria-current', 'true'); });
  // #100 — answered questions show on the map, beside where you are.
  for (const id of Object.keys(store.verdicts)) box.querySelectorAll('[data-step="' + CSS.escape(id) + '"]').forEach(el => el.classList.add('dg-answered'));
  if ($('#diagram-selection')) $('#diagram-selection').textContent = selection ? selection.label + (represented.length ? ' · selected here' : ' · not represented in this diagram') : '';
  if (showChanges) for (const id of shown.added.concat(mine.map(p => p.node).filter(Boolean)))
    box.querySelector('[data-node="' + CSS.escape(id) + '"]')?.classList.add('dg-proposed');
  markComments();
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
  $('#screen').innerHTML = s ? \`<h2 id="screen-title" class="screen-title" tabindex="-1">\${esc(s.title)}</h2>\`
    + (s.blocks || []).map(b => drawBlock(b, { targets })).join('')
    + (s.end ? '<p class="end">An end of this flow. Restart to try another path.</p>' : '') : '<p class="hint">No screen is linked to this selection. Choose a behavior, view all screens, or restart.</p>';
  drawStageChart();
  $('#upanel').classList.toggle('brief-here', (((REVIEW.brief || {}).highlights || {}).screens || []).includes(at));
}

function go(st, o){
  if (!selectTarget({ kind: 'outcome', itemId: st.id, outcomeIndex: st.step.outcomes.indexOf(o) })) return;
  $('#announce').textContent = 'Now on: ' + FLOW.screens.find(x => x.id === at).title;
  // No scroll (D079): a pick made down in the feedback must not throw the reviewer back up the page.
  $('#screen-title').focus({ preventScroll: true });
}

// #100 — Tour or Overview. The parts that belong to both (what the review is about, the map, the
// Return step) move to whichever view is showing; nothing is drawn twice.
function setMode(m, force){
  if (!force && m === mode) return;
  mode = m; document.body.dataset.mode = m;
  try { localStorage.setItem(LS + ':mode', m); } catch {}
  document.querySelectorAll('.mode [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  const ov = m === 'overview';
  (ov ? $('#ov-top') : $('#t-start')).append($('#understand'));
  if ($('#dpanel')) (ov ? $('#ov-top') : $('#slot-map .slot-body')).append($('#dpanel'));
  (ov ? $('#ov-end') : $('#t-end')).append($('#return-block'));
  render(); if ($('#dpanel')) drawStageChart();
}
$('.mode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
// Back and Next: Understand, every question in the order of the progress bar, then Return. Skipping
// is fine; an unanswered question stays open.
function goStep(dir){
  setMode('tour');
  const order = ORDER(), i = tourAt === 'start' ? -1 : tourAt === 'end' ? order.length : curIdx(), j = i + dir;
  if (j >= 0 && j < order.length) selectTarget({ kind: 'item', itemId: order[j] });
  else {
    tourAt = j < 0 ? 'start' : 'end'; selection = null; selected = null; pending = null; last = null;
    if (FLOW && j < 0) at = FLOW.start;
    if (FLOW) drawAll(); else { render(); if ($('#dpanel')) drawStageChart(); }
  }
  // Each step starts at the top: the question, then its places.
  scrollTo(0, 0);
  $('#selection-title').focus({ preventScroll: true });
}
$('#back').addEventListener('click', () => goStep(-1));
$('#next').addEventListener('click', () => goStep(1));
$('#start-review').addEventListener('click', () => { tourAt = 'start'; goStep(1); });
$('#start-mini').addEventListener('click', () => { tourAt = 'item'; selected = ORDER()[0]; goStep(-1); $('#start-review').focus(); });
// #100 — Understand in short cards: one sentence each, the rest one tap away, never dropped.
const plain = (t) => String(t || '').replace(/\\*\\*|\`/g, '').trim();
function firstSentence(t){ const s = plain(t), m = s.match(/^.+?[.!?](?=\\s|$)/); return m ? [m[0], s.slice(m[0].length).trim()] : [s, '']; }
function drawStart(){
  const b = REVIEW.brief || {}, parts = segs(), n = REVIEW.items.length;
  const card = (icon, title, text, moreHtml = '', extra = '') => {
    const [one, rest] = firstSentence(text), more = (rest ? '<p>' + esc(rest) + '</p>' : '') + moreHtml;
    return [icon, title, '<p>' + esc(one) + '</p>' + extra + (more ? '<details class="start-more"><summary>More</summary>' + more + '</details>' : '')];
  };
  const about = b.question || b.explains || REVIEW.intro || REVIEW.subtitle || REVIEW.title;
  const aboutMore = [b.question && b.explains, about !== REVIEW.intro && REVIEW.intro].filter(Boolean).map(t => '<p>' + esc(plain(t)) + '</p>').join('');
  const cards = [
    card('flag', b.question ? 'What I need you to decide' : 'What this is about', about, aboutMore),
    b.recommendation && card('star', 'My recommendation', b.recommendation),
    ['list', "What I'll ask", '<p>' + n + (n === 1 ? ' question' : ' questions') + (parts.length > 1 ? ' in ' + parts.length + ' parts.' : '.') + '</p><p class="start-parts">'
      + parts.map(s => '<span class="chip-part" style="--sc:' + s.color + '">' + I(s.icon) + esc(s.label) + '</span>').join('') + '</p>'],
    (b.examples || []).length && card('check', 'Done before', (b.examples.length === 1 ? 'One example: ' : b.examples.length + ' examples, like ') + b.examples[0].name + '.', examplesHtml(b.examples)),
    (b.risks || []).length && card('alert', 'What could go wrong', b.risks[0], b.risks.length > 1 ? '<ul>' + b.risks.slice(1).map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>' : ''),
    card('help', 'How to answer', REVIEW.ask || 'Tap the answer that fits. Skip anything you are unsure about.'),
    card('send', 'What happens next', REVIEW.afterwards || 'Nothing is sent until you download your answers.', REVIEW.afterwards ? '<p>Nothing is sent until you download your answers.</p>' : ''),
  ].filter(Boolean);
  $('#start-cards').innerHTML = cards.map(([icon, title, html], i) => '<li class="scard"><span class="num">' + (i + 1) + '</span><div><h3>' + I(icon) + esc(title) + '</h3>' + html + '</div></li>').join('');
}
drawStart();
document.addEventListener('click', e => {
  const seg = e.target.closest('[data-seg]');
  if (seg && seg.dataset.seg === 'start') { tourAt = 'item'; selected = ORDER()[0]; goStep(-1); return $('#start-review').focus(); }
  if (seg && seg.dataset.seg === 'end') { tourAt = 'item'; selected = ORDER().at(-1); return goStep(1); }
  if (seg) { const s = segs()[+seg.dataset.seg]; return openItem(s.ids.find(id => !store.verdicts[id]) || s.ids[0]); }
  const open = e.target.closest('[data-open]');
  if (open) openItem(open.dataset.open);
});
$('#selection-actions').addEventListener('click', e => {
  if (e.target.closest('#comment-selected') && selection?.commentTarget) {
    chartTab = selection.diagramId; drawTabs(); drawStageChart(); revealRegion($('#dpanel')); addComment(selection.commentTarget);
  }
  if (e.target.closest('#inspect-response')) {
    focusResponse(selection?.layerKey);
  }
});
document.addEventListener('click', e => {
  const added = e.target.closest('[data-select-added]');
  if (added) { setMode('tour'); selectTarget({ kind: 'added', id: added.dataset.selectAdded }); $('#selection-title').focus(); }
  const judge = e.target.closest('details.judge');
  const key = judge?.querySelector('[data-lv]')?.dataset.lv;
  if (key) { const [itemId, entryId] = key.split('/'); selectTarget({ kind: 'layer', itemId, entryId }, true); }
});
document.addEventListener('focusin', e => {
  const key = e.target.dataset.lv || e.target.dataset.lvnote;
  if (key && selection?.layerKey !== key) { const [itemId, entryId] = key.split('/'); selectTarget({ kind: 'layer', itemId, entryId }, true); }
});
if ($('#dpanel')) { const status = document.createElement('p'); status.id = 'diagram-selection'; status.setAttribute('aria-live', 'polite'); $('#dgtabs').after(status); }
function revealRegion(region){
  for (let el = region; el; el = el.parentElement)
    if (el.classList.contains('minimised')) { mins = mins.filter(sel => $(sel) !== el); applyMins(); }
}
function focusResponse(layerKey){
  const entry = layerKey && document.querySelector('input[data-lv="' + CSS.escape(layerKey) + '"]');
  if (entry) {
    revealRegion(entry);
    const layer = entry.closest('.layer');
    const kind = layer?.classList.contains('layer-system') ? 'system' : layer?.classList.contains('layer-data') ? 'data' : null;
    if (kind) {
      layers().add(kind); showLayers();
      document.querySelectorAll('input[data-layer="' + kind + '"]').forEach(x => { x.checked = true; });
    }
    entry.closest('details.judge').open = true;
    entry.focus();
  } else $('#detail input[type=radio]')?.focus();
}

// D073 — either panel opens full screen, and Esc or the same button brings it back.
const setFull = (panel, on) => {
  panel.classList.toggle('full', on);
  const b = panel.querySelector('.panel-full');
  b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen'); b.innerHTML = I(on ? 'x' : 'expand');
  if (panel.id === 'dpanel') drawStageChart();
};
// #60 — the reviewer comments on a box or an arrow. Each comment keeps what it is on, in words.
let commenting = false;
const onKey = (c) => c.diagram + '|' + (c.node !== undefined ? 'n:' + c.node : 'e:' + c.edge.from + '>' + c.edge.to + ':' + (c.edge.nth ?? ''));
function markComments(){
  const box = $('#flowbeside'); if (!box) return;
  for (const c of store.comments || []) {
    if (c.diagram !== chartTab) continue;
    const el = c.node !== undefined ? box.querySelector('[data-node="' + CSS.escape(c.node) + '"]')
      : box.querySelector('.dg-edge[data-from="' + CSS.escape(c.edge.from) + '"][data-to="' + CSS.escape(c.edge.to) + '"]'
        + (c.edge.nth === undefined ? '' : '[data-nth="' + c.edge.nth + '"]'));
    if (el) el.classList.add('dg-commented');
  }
}
// #60 part 3 — changes the reviewer proposes on the part they are commenting on.
let showChanges = false;
function nodesOf(diagramId){ const d = chartFor(diagramId); return (d && d.nodes) || []; }
function proposalText(p){
  const name = (id) => (nodesOf(p.diagram).find(n => n.id === id) || {}).label || id;
  return p.op === 'rename' ? 'Rename to "' + p.text + '"'
    : p.op === 'remove-node' ? 'Remove this box'
    : p.op === 'add-node' ? 'Add a box after it: "' + p.text + '"'
    : p.op === 'add-edge' ? 'Add an arrow to "' + name(p.to) + '"'
    : p.op === 'remove-edge' ? 'Remove this arrow'
    : 'Label the arrow "' + p.text + '"';
}
function proposalsHtml(c){
  const database = chartFor(c.diagram)?.kind === 'database';
  const agent = chartFor(c.diagram)?.agent === true;
  const mine = (store.proposals || []).filter(p => p.comment === c.id);
  const others = c.node !== undefined ? nodesOf(c.diagram).filter(n => n.id !== c.node) : [];
  const ask = c.node !== undefined
    ? \`<div class="prow"><label class="skip" for="pr-\${esc(c.id)}">Rename this box</label>
        <input id="pr-\${esc(c.id)}" data-ptext="rename" placeholder="Rename this box to…">
        <button class="btn" type="button" data-prop="rename" data-pfor="\${esc(c.id)}">Propose</button></div>
      \${database ? '<p class="hint">Describe new tables and relationships in your comment so the next review can include their columns and keys.</p>' : \`\${agent ? '<p class="hint">Describe new agent steps in your comment so the next review can explain their continuation or stop.</p>' : \`<div class="prow"><label class="skip" for="pa-\${esc(c.id)}">Add a box after this one</label>
        <input id="pa-\${esc(c.id)}" data-ptext="add-node" placeholder="Add a box after this one…">
        <button class="btn" type="button" data-prop="add-node" data-pfor="\${esc(c.id)}">Propose</button></div>\`}
      <div class="prow"><label class="skip" for="pe-\${esc(c.id)}">Add an arrow from this box</label>
        <select id="pe-\${esc(c.id)}" data-ptext="add-edge"><option value="">Add an arrow to…</option>
        \${others.map(n => \`<option value="\${esc(n.id)}">\${esc(n.label || n.id)}</option>\`).join('')}</select>
        <button class="btn" type="button" data-prop="add-edge" data-pfor="\${esc(c.id)}">Propose</button></div>\`}
      <button class="btn" type="button" data-prop="remove-node" data-pfor="\${esc(c.id)}">Propose removing this box</button>\`
    : \`<div class="prow"><label class="skip" for="pl-\${esc(c.id)}">Change this arrow's label</label>
        <input id="pl-\${esc(c.id)}" data-ptext="relabel-edge" placeholder="Change the arrow's label to…">
        <button class="btn" type="button" data-prop="relabel-edge" data-pfor="\${esc(c.id)}">Propose</button></div>
      <button class="btn" type="button" data-prop="remove-edge" data-pfor="\${esc(c.id)}">Propose removing this arrow</button>\`;
  return \`<div class="props">\${ask}\${mine.length ? '<ul class="proplist">' + mine.map(p => \`<li>\${esc(proposalText(p))}
    <button class="btn" type="button" data-unprop="\${esc(p.id)}">Undo</button></li>\`).join('') + '</ul>' : ''}</div>\`;
}
function addProposal(c, op, text, to){
  const p = { id: 'proposal-' + (Math.max(0, ...(store.proposals || []).map(x => +String(x.id).split('-')[1] || 0)) + 1),
    diagram: c.diagram, op, label: c.label, comment: c.id };
  if (c.node !== undefined) { if (op === 'add-node' || op === 'add-edge') p.from = c.node; else p.node = c.node; }
  else { p.from = c.edge.from; p.to = c.edge.to; if (c.edge.nth !== undefined) p.nth = c.edge.nth; }
  if (op === 'add-edge') p.to = to;
  if (text) p.text = text;
  (store.proposals = store.proposals || []).push(p); save();
  renderComments(); showChangesBtn(); drawStageChart();
}
function showChangesBtn(){
  const b = $('#showchanges'); if (!b) return;
  b.hidden = !(store.proposals || []).length;
  if (b.hidden && showChanges) { showChanges = false; b.setAttribute('aria-pressed', 'false'); b.textContent = 'Show my changes'; }
}

function renderComments(){
  const box = $('#comments'); if (!box) return;
  const list = store.comments || [];
  box.innerHTML = (list.length ? '<h3 class="added-h">Your comments on the diagram</h3>' : '') + list.map(c => {
    const title = (TABS.find(t => t[0] === c.diagram) || [0, c.diagram])[1];
    return \`<div class="cmt"><p class="cmt-on">On <b>\${esc(c.label)}</b> · \${esc(title)}</p>
      <label class="skip" for="cm-\${esc(c.id)}">Your comment on \${esc(c.label)}</label>
      <textarea id="cm-\${esc(c.id)}" data-comment="\${esc(c.id)}" placeholder="What should change here, or what is wrong?">\${esc(c.note || '')}</textarea>
      \${picsHtml(c.id)}
      \${proposalsHtml(c)}
      <button class="btn" type="button" data-uncomment="\${esc(c.id)}">Remove comment</button></div>\`;
  }).join('');
}
function addComment(on){
  const d = chartFor(chartTab); if (!d) return;
  const c = Object.assign({ diagram: chartTab }, on);
  const label = partLabel(d, c); if (label === null) return;
  let found = (store.comments || []).find(x => onKey(x) === onKey(c));
  if (!found) {
    found = Object.assign(c, { id: freeId('comment-', answerIds()), label, note: '' });
    (store.comments = store.comments || []).push(found); save();
  }
  renderComments(); markComments();
  document.getElementById('cm-' + found.id)?.focus();
}

// #47 — the chart panel works the same on every page that has one: tabs, full screen, a box that opens its item.
if ($('#dpanel')) {
  // Clicking a box in the chart opens that step or item.
  const chartPick = (target) => {
    const n = target.closest('#flowbeside [data-node]'), edgeEl = target.closest('#flowbeside .dg-edge');
    if (!n && !edgeEl) return false;
    if (edgeEl?.dataset.previewOnly) return false;
    const edge = edgeEl && { from: edgeEl.dataset.from, to: edgeEl.dataset.to, ...(edgeEl.dataset.nth !== undefined ? { nth: +edgeEl.dataset.nth } : {}) };
    const identity = n ? { kind: 'node', diagramId: chartTab, nodeId: n.dataset.node } : { kind: 'edge', diagramId: chartTab, ...edge };
    if (!selectTarget(identity)) return false;
    if (commenting) {
      // The same pair can be joined more than once (a sequence): keep which arrow was picked.
      addComment(n ? { node: n.dataset.node } : { edge });
      return true;
    }
    const selector = n ? '[data-node="' + CSS.escape(n.dataset.node) + '"]' : '.dg-edge[data-from="' + CSS.escape(edge.from) + '"][data-to="' + CSS.escape(edge.to) + '"]' + (edge.nth == null ? '' : '[data-nth="' + edge.nth + '"]');
    $('#flowbeside ' + selector)?.focus({ preventScroll: true });
    return true;
  };
  $('#flowbeside').addEventListener('click', e => chartPick(e.target));
  $('#flowbeside').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && chartPick(e.target)) e.preventDefault(); });
  $('#commentmode').addEventListener('click', () => {
    commenting = !commenting;
    $('#commentmode').setAttribute('aria-pressed', String(commenting));
    $('#dpanel').classList.toggle('commenting', commenting);
    $('#commenthint').hidden = !commenting;
    drawStageChart();
  });
  $('#comments').addEventListener('input', e => {
    const t = e.target.closest('[data-comment]'); if (!t) return;
    const c = (store.comments || []).find(x => x.id === t.dataset.comment); if (c) { c.note = t.value; save(); }
  });
  $('#showchanges').addEventListener('click', () => {
    showChanges = !showChanges;
    $('#showchanges').setAttribute('aria-pressed', String(showChanges));
    $('#showchanges').textContent = showChanges ? 'Show it as it was' : 'Show my changes';
    drawStageChart();
  });
  $('#comments').addEventListener('click', e => {
    const pb = e.target.closest('[data-prop]');
    if (pb) {
      const c = (store.comments || []).find(x => x.id === pb.dataset.pfor); if (!c) return;
      const op = pb.dataset.prop, field = pb.closest('.props').querySelector('[data-ptext="' + op + '"]');
      const value = field ? field.value.trim() : '';
      if (field && !value) { field.focus(); return; }
      addProposal(c, op, op === 'add-edge' ? '' : value, op === 'add-edge' ? value : undefined);
      return;
    }
    const un = e.target.closest('[data-unprop]');
    if (un) { store.proposals = (store.proposals || []).filter(x => x.id !== un.dataset.unprop); save(); renderComments(); showChangesBtn(); drawStageChart(); return; }
    const b = e.target.closest('[data-uncomment]'); if (!b) return;
    store.comments = (store.comments || []).filter(x => x.id !== b.dataset.uncomment); dropPictures(b.dataset.uncomment); save();
    renderComments(); drawStageChart();
  });
  renderComments(); showChangesBtn();

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

  // D073 — either panel opens full screen, and Esc or the same button brings it back.
  document.addEventListener('click', e => {
    const b = e.target.closest('.panel-full'); if (!b) return;
    const panel = b.closest('.panel'); setFull(panel, !panel.classList.contains('full')); b.focus();
  });
  document.addEventListener('keydown', e => {
    const open = $('.panel.full'); if (e.key !== 'Escape' || !open) return;
    setFull(open, false); open.querySelector('.panel-full').focus();
  });

  if (!FLOW) { drawTabs(); drawStageChart(); }
}

if (FLOW) {
  showLayers();
  $('#screen').addEventListener('click', e => {
    const t = e.target.closest('[data-target]'); if (!t) return;
    const matches = stepsFrom(at).filter(i => i.step.on === t.dataset.target);
    if (matches.length !== 1) { selectTarget({ kind: 'screen', screenId: at }); $('#selection-title').focus(); return; }
    const st = matches[0];
    if (st.step.outcomes.length === 1) return go(st, st.step.outcomes[0]);
    // The outcomes are picked in the feedback panel, so a full-screen screen steps aside for it.
    if ($('#upanel.full')) setFull($('#upanel'), false);
    selectTarget({ kind: 'item', itemId: st.id });
    const first = document.querySelector('#expected [data-outcome]'); if (first) first.focus();
  });
  $('#restart').addEventListener('click', () => {
    selectTarget({ kind: 'screen', screenId: FLOW.start });
    $('#announce').textContent = 'Now on: ' + FLOW.screens.find(x => x.id === at).title;
    $('#screen-title').focus();
  });
  // "Show this" plays an outcome on the screen, from the tour or the Overview.
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-outcome]'); if (!b) return;
    const st = STEPS.find(x => x.id === b.dataset.for); if (!st) return;
    setMode('tour');
    go(st, st.step.outcomes[+b.dataset.outcome]);
  });
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
  const emphasizeScreen = target => {
    const m = target?.closest('.mini'), svg = $('#allscreens .links'); if (!svg) return;
    svg.classList.toggle('focus', !!m);
    svg.querySelectorAll('g').forEach(g => g.classList.toggle('hot', !!m && (g.dataset.from === m.dataset.screen || g.dataset.to === m.dataset.screen)));
  };
  $('#allscreens').addEventListener('mouseover', e => emphasizeScreen(e.target));
  $('#allscreens').addEventListener('focusin', e => emphasizeScreen(e.target));
  $('#allscreens').addEventListener('focusout', e => emphasizeScreen(e.relatedTarget));
  $('#allscreens').addEventListener('mouseleave', () => emphasizeScreen(document.activeElement));
  $('#allscreens').addEventListener('click', e => {
    const b = e.target.closest('[data-screen]'); if (!b) return;
    screensView = 'one';
    $('#upanel .seg').querySelectorAll('[data-screens]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.screens === 'one')));
    selectTarget({ kind: 'screen', screenId: b.dataset.screen });
    $('#announce').textContent = 'Now on: ' + screenTitle(at);
    $('#screen-title').focus();
  });

  // Chips instead of a dropdown (D057): press one to highlight its sub-process, press it again to clear.
  $('#chips').addEventListener('click', e => {
    const c = e.target.closest('[data-part]'); if (!c) return;
    partHighlight = partHighlight === c.dataset.part ? '' : c.dataset.part;
    drawAll();
  });

  drawAll();
}
setMode(mode, true);
if (SEED) $('#footnote').textContent = 'An exported copy with the answers given ' + String(SEED.exportedAt).slice(0, 10) + '. Changes you make here stay in this browser.';
</script>
</body></html>`;

writeFileSync(outPath, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`wrote ${outPath}  (${kb} KB · ${review.items.length} items · ${(review.sections||[]).length} sections)`);

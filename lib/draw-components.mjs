// SPDX-License-Identifier: MIT-0
// Draws a flow screen's components as HTML strings. Pure: no DOM, no state. The renderer inlines this
// file verbatim, so the page and the tests run the same code.
//
// Every value from a review is agent-written: it goes through esc() before it reaches the page, in
// text and in attributes alike. Only ids that a step points at become real buttons; everything else is
// drawn as a still wireframe, because a reviewer can only act where the flow says something happens.

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A tappable element when a step points at it, a still one otherwise. In a still picture (ctx.still,
// the "All screens" cards, which are buttons themselves) it is a marked span the connections start from.
function act(id, label, ctx, cls = 'c-button') {
  if (id === undefined || !ctx.targets.has(id)) return `<span class="${cls}">${esc(label)}</span>`;
  return ctx.still
    ? `<span class="${cls} is-target" data-link="${esc(id)}">${esc(label)}</span>`
    : `<button type="button" class="${cls} is-target" data-target="${esc(id)}">${esc(label)}</button>`;
}
const actions = (list, ctx) => (list?.length ? `<div class="c-actions">${list.map((a) => act(a.id, a.label, ctx)).join('')}</div>` : '');
const initials = (name) => String(name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const DRAW = {
  heading: (b) => `<h2 class="c-heading">${esc(b.text)}</h2>`,
  text: (b) => `<p class="c-text">${esc(b.text)}</p>`,
  input: (b, ctx) => (ctx.targets.has(b.id)
    ? act(b.id, `${b.label}: ${b.value ?? b.placeholder ?? ''}`, ctx, 'c-input')
    : `<label class="c-field"><span>${esc(b.label)}</span><input disabled value="${esc(b.value)}" placeholder="${esc(b.placeholder)}"></label>`),
  button: (b, ctx) => act(b.id, b.label, ctx),
  list: (b) => `<ul class="c-list">${(b.items ?? []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`,

  header: (b, ctx) => `<div class="c-header">${b.back ? act(b.back.id, '← Back', ctx, 'c-back') : ''}<h2>${esc(b.title)}</h2>${actions(b.actions, ctx)}</div>`,
  'tab-bar': (b, ctx) => `<nav class="c-tab-bar" aria-label="Main sections">${(b.items ?? []).map((i) => `<span class="c-tab"${i.id === b.active ? ' aria-current="page"' : ''}>${act(i.id, i.label, ctx, 'c-tab-label')}</span>`).join('')}</nav>`,
  tabs: (b, ctx) => `<div class="c-tabs" role="tablist">${(b.items ?? []).map((i) => `<span class="c-tab" role="tab" aria-selected="${i.id === b.active}">${act(i.id, i.label, ctx, 'c-tab-label')}</span>`).join('')}</div>`,
  'side-menu': (b, ctx) => `<nav class="c-side-menu" data-open="${b.open ? 'true' : 'false'}" aria-label="Menu">${(b.items ?? []).map((i) => `<span class="c-menu-item"${i.id === b.active ? ' aria-current="page"' : ''}>${act(i.id, i.label, ctx, 'c-menu-label')}</span>`).join('')}</nav>`,
  breadcrumb: (b) => `<nav class="c-breadcrumb" aria-label="Breadcrumb"><ol>${(b.items ?? []).map((i) => `<li>${esc(i)}</li>`).join('')}</ol></nav>`,

  checkbox: (b, ctx) => (ctx.targets.has(b.id)
    ? act(b.id, `${b.checked ? '☑' : '☐'} ${b.label}`, ctx, 'c-check')
    : `<label class="c-check"><input type="checkbox" disabled${b.checked ? ' checked' : ''}> ${esc(b.label)}</label>`),
  'radio-group': (b, ctx) => `<fieldset class="c-radio" disabled><legend>${esc(b.label)}</legend>${(b.options ?? []).map((o) => (ctx.targets.has(o.id)
    ? act(o.id, `${o.id === b.selected ? '◉' : '○'} ${o.label}`, ctx, 'c-option')
    : `<label><input type="radio" name="${esc(b.id)}"${o.id === b.selected ? ' checked' : ''}> ${esc(o.label)}</label>`)).join('')}</fieldset>`,
  switch: (b, ctx) => (ctx.targets.has(b.id)
    ? act(b.id, `${b.label}: ${b.on ? 'on' : 'off'}`, ctx, 'c-switch')
    : `<span class="c-switch" role="switch" aria-checked="${b.on ? 'true' : 'false'}" aria-disabled="true">${esc(b.label)} <b>${b.on ? 'on' : 'off'}</b></span>`),
  select: (b, ctx) => (ctx.targets.has(b.id)
    ? act(b.id, `${b.label}: ${b.value ?? ''} ▾`, ctx, 'c-select')
    : `<label class="c-field"><span>${esc(b.label)}</span><select disabled>${(b.options ?? []).map((o) => `<option${o === b.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`),
  'date-time': (b, ctx) => (ctx.targets.has(b.id)
    ? act(b.id, `${b.label}: ${b.value ?? ''}`, ctx, 'c-date')
    : `<div class="c-field"><span>${esc(b.label)}</span><output class="c-date" data-mode="${esc(b.mode)}">${esc(b.value)}</output></div>`),
  search: (b, ctx) => (ctx.targets.has(b.id)
    ? act(b.id, `⌕ ${b.value || b.placeholder || 'Search'}`, ctx, 'c-search')
    : `<label class="c-search"><span class="c-sr">Search</span><input type="search" disabled placeholder="${esc(b.placeholder)}" value="${esc(b.value)}"></label>`),
  stepper: (b, ctx) => `<div class="c-stepper"><span>${esc(b.label)}</span>${act(`${b.id}`, '−', { targets: new Set() }, 'c-step')}<output>${esc(b.value)}</output>${act(`${b.id}`, '+', { targets: new Set() }, 'c-step')}${ctx.targets.has(b.id) ? act(b.id, 'Change', ctx) : ''}</div>`,
  slider: (b, ctx) => (ctx.targets.has(b.id)
    ? act(b.id, `${b.label}: ${b.value}`, ctx, 'c-slider')
    : `<label class="c-field"><span>${esc(b.label)}</span><input type="range" disabled min="${esc(b.min)}" max="${esc(b.max)}" value="${esc(b.value)}"><output>${esc(b.value)}</output></label>`),

  card: (b, ctx) => `<article class="c-card"><h3>${esc(b.title)}</h3>${b.text ? `<p>${esc(b.text)}</p>` : ''}${actions(b.actions, ctx)}</article>`,
  chip: (b) => `<span class="c-chip" data-tone="${esc(b.tone ?? 'neutral')}">${esc(b.text)}</span>`,
  image: (b) => `<figure class="c-image"><div class="c-placeholder" role="img" aria-label="${esc(b.alt)}">${esc(b.alt)}</div>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`,
  table: (b) => `<div class="c-table-wrap"><table class="c-table"><thead><tr>${(b.columns ?? []).map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${(b.rows ?? []).map((r) => `<tr>${(Array.isArray(r) ? r : []).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
  avatar: (b) => `<span class="c-avatar" role="img" aria-label="${esc(b.name)}" title="${esc(b.name)}">${esc(initials(b.name))}</span>`,

  dialog: (b, ctx) => `<div class="c-dialog" role="dialog" aria-label="${esc(b.title)}"><h3>${esc(b.title)}</h3>${b.text ? `<p>${esc(b.text)}</p>` : ''}${actions(b.actions, ctx)}</div>`,
  toast: (b) => `<div class="c-toast" role="status">${esc(b.text)}</div>`,
  banner: (b) => `<div class="c-banner" data-tone="${esc(b.tone)}" role="${b.tone === 'negative' ? 'alert' : 'status'}"><p>${esc(b.text)}</p>${b.because ? `<p class="c-because">Why: ${esc(b.because)}</p>` : ''}${b.canNow ? `<p class="c-cannow">You can: ${esc(b.canNow)}</p>` : ''}</div>`,
  'empty-state': (b, ctx) => `<div class="c-empty"><p>${esc(b.text)}</p>${b.action ? act(b.action.id, b.action.label, ctx) : ''}</div>`,
  progress: (b) => `<div class="c-progress">${b.label ? `<span>${esc(b.label)}</span>` : ''}<progress max="100"${b.value !== undefined ? ` value="${esc(b.value)}"` : ''}></progress></div>`,
};

export function drawBlock(block, ctx) {
  const draw = DRAW[block?.type];
  return draw ? draw(block, ctx) : `<p class="c-unknown">${esc(block?.type)}</p>`;
}

// SPDX-License-Identifier: Apache-2.0
// #147 — day or night on the site's pages: a switch shown as a sun and a moon, top right. It starts from the system's
// setting; a choice is kept in this browser only. Loaded in <head>, so a kept choice applies before the page is drawn.
(() => {
  const root = document.documentElement, dark = matchMedia('(prefers-color-scheme: dark)');
  try { const t = localStorage.getItem('lmsys:theme'); if (t === 'light' || t === 'dark') root.dataset.theme = t; } catch {}
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : dark.matches;
  const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'theme-switch'; b.setAttribute('role', 'switch'); b.setAttribute('aria-label', 'Dark mode'); b.title = 'Day or night';
    b.innerHTML = icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>')
      + icon('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>');
    const show = () => b.setAttribute('aria-checked', String(isDark()));
    b.addEventListener('click', () => {
      root.dataset.theme = isDark() ? 'light' : 'dark';
      try { localStorage.setItem('lmsys:theme', root.dataset.theme); } catch {}
      show();
    });
    dark.addEventListener('change', show);
    show();
    const style = document.createElement('style');
    style.textContent = `.theme-switch{--k:26px;position:absolute;top:14px;right:16px;display:inline-flex;align-items:center;justify-content:space-between;width:66px;height:34px;padding:0 7px;border:2px solid var(--edge,var(--ink));border-radius:99px;background:var(--band,var(--surf));color:var(--ink);cursor:pointer;box-shadow:2px 2px 0 var(--edge,var(--ink));z-index:5}
.theme-switch svg{position:relative;z-index:1;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.theme-switch::after{content:"";position:absolute;top:2px;left:2px;width:var(--k);height:var(--k);border-radius:50%;background:var(--surf);border:2px solid var(--edge,var(--ink));box-sizing:border-box;transition:left .2s}
.theme-switch[aria-checked="true"]::after{left:calc(100% - var(--k) - 2px)}
.theme-switch:focus-visible{outline:3px solid var(--ac);outline-offset:2px}
@media (pointer:coarse){.theme-switch{--k:36px;width:84px;height:44px;padding:0 11px}}
@media (prefers-reduced-motion:reduce){.theme-switch::after{transition:none}}`;
    document.head.appendChild(style);
    document.body.appendChild(b);
  });
})();

// SPDX-License-Identifier: MIT-0
// Pure, bounded presentation shared by layout, static rendering and offline pages.
const AI_CAPTIONS = { 'model-call': 'Model call', 'tool-call': 'Tool call', retrieval: 'Retrieval', guardrail: 'Guardrail', 'human-handoff': 'Human handoff' };
function aiEscape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function aiCaption(kind) { return Object.hasOwn(AI_CAPTIONS, kind) ? AI_CAPTIONS[kind] : ''; }
// Conservative monospace cells, counting wide/fallback glyphs twice. Never discard text.
export function aiLines(value, max = 18) {
  const lines = []; let line = '', cells = 0;
  for (const char of String(value ?? '')) {
    const size = char.codePointAt(0) > 127 ? 2 : 1;
    if (cells + size > max) { lines.push(line); line = ''; cells = 0; }
    line += char; cells += size;
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}
export function aiContentHeight(node) {
  if (!aiCaption(node.kind) && !node.stop) return 0;
  let height = (aiCaption(node.kind) ? 38 : 20) + aiLines(node.label).length * 16;
  if (node.stop) height += 48 + (aiLines(node.stop.reason).length + aiLines(node.stop.next).length) * 16;
  return height + 12;
}
export function aiNodeHeight(node) {
  const height = aiContentHeight(node);
  return height ? Math.max(64, height + (node.component ? 136 : 0)) : 0;
}
function aiText(value, x, y, max = 18) {
  return `<text class="dg-ai-text" x="${x}" y="${y}" xml:space="preserve">${aiLines(value, max).map((line, i) => `<tspan x="${x}" dy="${i ? 16 : 0}">${aiEscape(line)}</tspan>`).join('')}</text>`;
}
export function drawAiContent(node, box) {
  const caption = aiCaption(node.kind); let y = box.y + (caption ? 44 : 26);
  let out = caption ? `<text class="dg-ai-caption" x="${box.x + 34}" y="${box.y + 21}">${caption}</text>` : '';
  out += aiText(node.label, box.x + 12, y);
  y += aiLines(node.label).length * 16;
  if (node.stop) for (const [heading, value] of [['Why', node.stop.reason], ['Next', node.stop.next]]) {
    y += 8; out += `<text class="dg-ai-caption" x="${box.x + 12}" y="${y}">${heading}</text>`;
    y += 16; out += aiText(value, box.x + 12, y); y += aiLines(value).length * 16;
  }
  return out;
}
export function drawTokenChart(usage, y, graphWidth) {
  if (!usage) return { markup: '', width: graphWidth, height: y };
  const width = Math.max(360, graphWidth), x = 16, barWidth = 300;
  let cursor = y + 32;
  let markup = `<g class="dg-token-chart" role="group" aria-label="${usage.basis === 'reported' ? 'Reported' : 'Estimated'} tokens, author-supplied"><text class="dg-ai-caption" x="${x}" y="${cursor}">${usage.basis === 'reported' ? 'Reported' : 'Estimated'} tokens</text>`;
  cursor += 22;
  markup += aiText('Author-supplied; not verified usage or billing.', x, cursor, 40); cursor += 40;
  for (const part of usage.parts) {
    markup += aiText(part.label, x, cursor, 40); cursor += aiLines(part.label, 40).length * 16;
    const ratio = Number(part.tokens) / Number(usage.total);
    const bar = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) * barWidth : 0;
    markup += `<rect class="dg-token-bar" x="${x}" y="${cursor}" width="${bar}" height="10"/><text class="dg-ai-text" x="${x}" y="${cursor + 28}">${aiEscape(part.tokens)}</text>`;
    cursor += 50;
  }
  markup += `<text class="dg-ai-caption" x="${x}" y="${cursor}">Total: ${aiEscape(usage.total)}</text></g>`;
  return { markup, width, height: cursor + 20 };
}

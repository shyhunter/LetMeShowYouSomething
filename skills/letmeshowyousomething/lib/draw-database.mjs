// SPDX-License-Identifier: MIT-0
// #69: tables in a vertical reading order; relationships occupy dedicated corridors on the right.
// No scaling down on phones: the existing diagram panel scrolls, keeping text and targets readable.
export function drawDatabase(diagram, opts = {}) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Break long unspaced values too; do not silently truncate example cells or column definitions.
  const lines = (value, size) => String(value ?? 'null').split(/\r?\n/).flatMap(line => {
    const result = []; let part = '', used = 0;
    for (const char of line) {
      // ASCII occupies one monospace cell; allow two for wide Unicode glyphs.
      const cells = char.codePointAt(0) > 127 ? 2 : 1;
      if (used + cells > size) { result.push(part); part = ''; used = 0; }
      part += char; used += cells;
    }
    result.push(part); return result;
  });
  const text = (value, x, y, size = 24, cls = 'dg-label') => lines(value, size).map((line, i) => `<text class="${cls}" x="${x}" y="${y + i * 18}">${escape(line)}</text>`).join('');
  const width = 420, left = 20, right = left + width;
  const boxes = new Map(), parts = []; let top = 20;
  for (const n of diagram.nodes || []) {
    const columnY = new Map();
    const titleHeight = Math.max(48, lines(n.label, 40).length * 18 + 20);
    let offset = titleHeight;
    let content = text(n.label, left + 14, top + 26, 40, 'dg-label dg-db-title');
    for (const c of n.columns || []) {
      const h = Math.max(44, Math.max(lines(c.label, 21).length, lines(c.type, 17).length) * 18 + 16);
      columnY.set(c.id, top + offset + h / 2);
      content += `<path class="dg-line" d="M${left} ${top + offset}h${width}"/>`
        + text(c.label, left + 14, top + offset + 22, 21, 'dg-label dg-db-column-label')
        + text(c.type, left + 192, top + offset + 22, 17, 'dg-label dg-db-column-type')
        + (c.key ? text('Key', left + 370, top + offset + 22, 5) : '');
      offset += h;
    }
    if (n.sampleRows?.length) {
      content += `<path class="dg-line" d="M${left} ${top + offset}h${width}"/>` + text('Example data — synthetic rows', left + 14, top + offset + 26, 40, 'dg-label dg-db-title'); offset += 44;
      for (const [i, row] of n.sampleRows.entries()) {
        content += text(`Example row ${i + 1}`, left + 14, top + offset + 18, 40); offset += 30;
        for (const c of n.columns) {
          const value = `${c.label}: ${row[c.id] === null ? 'null' : String(row[c.id])}`;
          content += text(value, left + 14, top + offset + 16, 44);
          offset += lines(value, 44).length * 18 + 8;
        }
        offset += 12;
      }
    }
    const selected = n.step !== undefined && n.step === opts.selected;
    boxes.set(n.id, { n, columnY });
    parts.push(`<g class="dg-node dg-k-table${selected ? ' dg-selected' : ''}" data-node="${escape(n.id)}"${n.step !== undefined ? ` data-step="${escape(n.step)}"` : ''}${n.step !== undefined || opts.commentable ? ' tabindex="0" role="button"' : ''} aria-current="${selected}" aria-label="${escape(n.label)}">`
      + `<title>${escape(n.label)}</title><rect class="dg-shape" x="${left}" y="${top}" width="${width}" height="${offset}" rx="8"/>${content}</g>`);
    top += offset + 80;
  }
  const edges = []; let corridor = right + 116;
  for (const [nth, e] of (diagram.edges || []).entries()) {
    // Comments always target the original review, even after a proposed removal/relabel.
    const originalNth = opts.originalEdges ? opts.originalEdges.findIndex(original =>
      ['from', 'fromColumn', 'to', 'toColumn', 'cardinality'].every(key => original[key] === e[key])) : nth;
    const a = boxes.get(e.from), b = boxes.get(e.to);
    if (!a || !b) continue;
    const y1 = a.columnY.get(e.fromColumn), y2 = b.columnY.get(e.toColumn);
    if (y1 === undefined || y2 === undefined) continue;
    const labelLines = lines(e.label || `${e.fromColumn} → ${e.toColumn}`, 12);
    corridor += Math.max(64, labelLines.length * 18 + 44);
    const rail = corridor;
    // Even self-references to the same column have a visible loop.
    const endY = y1 === y2 ? y2 + 12 : y2;
    const path = `M${right} ${y1}H${rail}V${endY}H${right}`;
    const label = `${a.n.label}.${e.fromColumn} (many) → ${b.n.label}.${e.toColumn} (one)${e.label ? `: ${e.label}` : ''}`;
    edges.push(`<g class="dg-edge dg-db-edge" data-from="${escape(e.from)}" data-to="${escape(e.to)}" data-nth="${originalNth}"${opts.commentable ? ` tabindex="0" role="button" aria-label="${escape(label)}"` : ''}><title>${escape(label)}</title>`
      + `<path d="${path}"/>${opts.commentable ? `<path class="dg-hit" d="${path}"/>` : ''}`
      + `<text class="dg-edge-label" x="${right + 12}" y="${y1 - 8}">Many</text><text class="dg-edge-label" x="${right + 76}" y="${endY - 8}">One</text>`
      + labelLines.map((line, i) => `<text class="dg-edge-label" transform="translate(${rail - 8 - i * 18} ${(y1 + endY) / 2}) rotate(-90)" text-anchor="middle">${escape(line)}</text>`).join('') + '</g>');
  }
  return `<svg class="dg dg-database" viewBox="0 0 ${corridor + 104} ${top}" width="${corridor + 104}" height="${top}" role="group" aria-label="${escape(diagram.title)}">${parts.join('')}${edges.join('')}</svg>`;
}

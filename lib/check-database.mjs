// SPDX-License-Identifier: Apache-2.0
// #69: semantic and bounded shape checks, also applied to the reviewer's proposed copy.
export function databaseFaults(d, stepIds) {
  const errors = [];
  const id = /^[a-z0-9][a-z0-9._-]{0,63}$/;
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const text = (x, max) => typeof x === 'string' && x.trim() === x && x.length > 0 && x.length <= max;
  const fields = (x, allowed) => Object.keys(x).every(k => allowed.includes(k));
  const fault = (rule, at, fix) => errors.push(`database ${d.id} (${rule}) ${at}: ${fix}, or the table and its links cannot be interpreted reliably`);
  if (typeof d.id !== 'string' || !id.test(d.id) || !text(d.title, 160) || !fields(d, ['id', 'kind', 'title', 'nodes', 'edges']))
    fault('diagram shape', '', 'use an id, a trimmed title of 1–160 characters, nodes and edges only');
  if (!Array.isArray(d.nodes) || d.nodes.length < 1 || d.nodes.length > 30) {
    fault('table count', '', 'provide between 1 and 30 tables'); return errors;
  }
  const tables = new Map();
  for (const n of d.nodes) {
    if (!object(n)) { fault('table shape', '', 'replace the non-object table with a table definition'); continue; }
    const at = String(n.id);
    if (!fields(n, ['id', 'kind', 'label', 'step', 'columns', 'sampleRows'])) fault('table fields', at, 'remove unknown table fields; mark the key on a declared column');
    if (typeof n.id !== 'string' || !id.test(n.id)) fault('table id', at, 'use a lowercase id of 1–64 letters, digits, dots, underscores or hyphens');
    if (tables.has(n.id)) fault('duplicate table', at, 'give each table a different id');
    tables.set(n.id, n);
    if (n.kind !== 'table') fault('table kind', at, 'use kind table for every database node');
    if (!text(n.label, 160)) fault('table label', at, 'give the table a trimmed label of 1–160 characters');
    if (n.step !== undefined && (!id.test(n.step) || !stepIds.has(n.step))) fault('step', at, 'link step to an item in this review');
    if (!Array.isArray(n.columns) || n.columns.length < 1 || n.columns.length > 30) {
      fault('columns', at, 'provide between 1 and 30 columns'); continue;
    }
    const columns = new Set(); let keys = 0;
    for (const c of n.columns) {
      if (!object(c)) { fault('column shape', at, 'replace the non-object column with an id, label, type and key flag'); continue; }
      if (!fields(c, ['id', 'label', 'type', 'key'])) fault('column fields', at, 'remove unknown column fields');
      if (typeof c.id !== 'string' || !id.test(c.id)) fault('column id', at, 'give the column a valid lowercase id');
      if (columns.has(c.id)) fault('duplicate column', at, 'give each column a different id within its table');
      columns.add(c.id);
      if (!text(c.label, 80)) fault('column label', at, 'use a trimmed column name of 1–80 characters');
      if (!text(c.type, 80)) fault('column type', at, 'describe the type in 1–80 trimmed characters');
      if (typeof c.key !== 'boolean') fault('key flag', at, 'mark each declared column with key true or false');
      if (c.key === true) keys++;
    }
    if (keys !== 1) fault('key count', at, 'mark exactly one declared column as the key');
    if (n.sampleRows !== undefined) {
      if (!Array.isArray(n.sampleRows) || n.sampleRows.length > 10) { fault('sample rows', at, 'provide at most 10 example rows'); continue; }
      for (const row of n.sampleRows) {
        if (!object(row)) { fault('row shape', at, 'provide each example row as an object keyed by column id'); continue; }
        if (Object.keys(row).length !== columns.size || Object.keys(row).some(k => !columns.has(k))) fault('row columns', at, 'supply exactly one cell for every declared column, using null for an empty cell');
        for (const value of Object.values(row)) {
          if (!(value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string')) fault('cell scalar', at, 'use only text, finite numbers, booleans or null in example cells');
          if (typeof value === 'string' && value.length > 500) fault('cell length', at, 'shorten each example cell to at most 500 characters');
        }
      }
    }
  }
  if (d.edges !== undefined && (!Array.isArray(d.edges) || d.edges.length > 160)) { fault('relationships', '', 'provide at most 160 relationships'); return errors; }
  const mappings = new Set();
  for (const e of d.edges || []) {
    if (!object(e)) { fault('relationship shape', '', 'provide each relationship as an object'); continue; }
    if (!fields(e, ['from', 'to', 'fromColumn', 'toColumn', 'cardinality', 'label'])) fault('relationship fields', '', 'use table ids, column ids, cardinality and an optional label only');
    const from = tables.get(e.from), to = tables.get(e.to);
    if (!from || !to) { fault('relationship table', '', 'point both ends at declared tables'); continue; }
    const find = (n, key) => Array.isArray(n.columns) ? n.columns.find(c => object(c) && c.id === key) : undefined;
    const source = find(from, e.fromColumn), target = find(to, e.toColumn);
    if (!source || !target) fault('relationship column', '', 'point both ends at declared columns in their named tables');
    else if (target.key !== true) fault('target key', '', 'point to the parent table key in toColumn; fromColumn is the child side');
    if (e.cardinality !== 'many-to-one') fault('cardinality', '', 'use many-to-one, from the child column to the parent key');
    if (e.label !== undefined && !text(e.label, 80)) fault('relationship label', '', 'use a trimmed relationship label of 1–80 characters or omit it');
    const identity = JSON.stringify([e.from, e.fromColumn, e.to, e.toColumn, e.cardinality]);
    if (mappings.has(identity)) fault('duplicate mapping', '', 'remove the repeated table/column mapping');
    mappings.add(identity);
  }
  return errors;
}

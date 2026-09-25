// SPDX-License-Identifier: Apache-2.0
// The schemas, checked without a dependency: an agent that writes a field the protocol does not have, or
// leaves one out, is told so by the checker it runs, not only by our tests. Covers the keywords our own
// schemas use, no more (test/schema-check.test.mjs compares it with ajv on every example and fault).
// ponytail: a subset of JSON Schema 2020-12; a keyword our schemas start using must be added here.

export const KNOWN = new Set(['$schema', '$id', '$defs', 'title', 'description', 'default', 'examples', 'type', 'required', 'properties',
  'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'enum', 'const', 'pattern', 'minLength', 'maxLength',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', '$ref', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else',
  'contains', 'maxProperties', 'minProperties', 'propertyNames', 'format', 'contentEncoding', 'contentMediaType']);

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const is = (v, t) => (t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeOf(v) === t);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const where = (path) => path || 'the file';
const show = (v) => { const s = JSON.stringify(v); return s && s.length > 60 ? s.slice(0, 57) + '…' : s; };

// A $ref inside the same schema (#/…) or into another one by its $id (…/review.v1.json#/…).
function resolve(ref, root, others) {
  const [url, pointer = ''] = ref.split('#');
  const base = url ? others.find((s) => s.$id === url) : root;
  const target = base && pointer.split('/').filter(Boolean).reduce((o, k) => o?.[k], base);
  if (!target) throw new Error(`schema-check: cannot resolve ${ref}`);
  return [target, base];
}

// Every problem as "path: what is wrong". An empty list means the value matches. `others` are the schemas
// a $ref may point into by their $id.
export function schemaErrors(schema, value, others = [], root = schema, path = '') {
  const out = [];
  const sub = (s, v, p, r = root) => schemaErrors(s, v, others, r, p);
  if (schema === true || schema === undefined) return out;
  if (schema === false) return [`${where(path)}: is not allowed here`];
  for (const k of Object.keys(schema)) if (!KNOWN.has(k)) throw new Error(`schema-check: keyword "${k}" is not supported`);

  if (schema.$ref) { const [target, base] = resolve(schema.$ref, root, others); out.push(...sub(target, value, path, base)); }
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => is(value, t))) return [...out, `${where(path)}: should be ${types.join(' or ')}, not ${typeOf(value)}`];
  }
  if ('const' in schema && !same(value, schema.const)) out.push(`${where(path)}: should be ${show(schema.const)}, not ${show(value)}`);
  if (schema.enum && !schema.enum.some((x) => same(x, value))) out.push(`${where(path)}: ${show(value)} is not one of ${schema.enum.map(show).join(', ')}`);

  if (typeof value === 'string') {
    const n = [...value].length;
    if (schema.minLength !== undefined && n < schema.minLength) out.push(`${where(path)}: shorter than ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && n > schema.maxLength) out.push(`${where(path)}: longer than ${schema.maxLength} characters (${n})`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) out.push(`${where(path)}: ${show(value)} does not have the expected form (${schema.pattern})`);
    if (schema.format === 'date-time' && !/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/i.test(value)) out.push(`${where(path)}: ${show(value)} is not a date-time like 2026-09-25T10:00:00Z`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) out.push(`${where(path)}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) out.push(`${where(path)}: above ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) out.push(`${where(path)}: must be above ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) out.push(`${where(path)}: must be below ${schema.exclusiveMaximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${where(path)}: needs at least ${schema.minItems} entr${schema.minItems === 1 ? 'y' : 'ies'}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) out.push(`${where(path)}: more than ${schema.maxItems} entries`);
    if (schema.uniqueItems && new Set(value.map((x) => JSON.stringify(x))).size !== value.length) out.push(`${where(path)}: has the same entry twice`);
    if (schema.items) value.forEach((x, i) => out.push(...sub(schema.items, x, `${path}[${i}]`)));
    if (schema.contains && !value.some((x, i) => !sub(schema.contains, x, `${path}[${i}]`).length)) out.push(`${where(path)}: has no entry of the expected kind`);
  }
  if (typeOf(value) === 'object') {
    const keys = Object.keys(value);
    for (const k of schema.required ?? []) if (!(k in value)) out.push(`${where(path)}: "${k}" is missing`);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) out.push(`${where(path)}: more than ${schema.maxProperties} fields`);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) out.push(`${where(path)}: fewer than ${schema.minProperties} fields`);
    if (schema.propertyNames) for (const k of keys) if (sub(schema.propertyNames, k, '').length) out.push(`${where(path)}: the name "${k}" does not have the expected form`);
    const props = schema.properties ?? {};
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      if (k in props) out.push(...sub(props[k], value[k], p));
      else if (schema.additionalProperties === false) out.push(`${where(path)}: "${k}" is not a field here${Object.keys(props).length ? ` (known: ${Object.keys(props).join(', ')})` : ''}`);
      else if (typeof schema.additionalProperties === 'object') out.push(...sub(schema.additionalProperties, value[k], p));
    }
  }

  for (const s of schema.allOf ?? []) out.push(...sub(s, value, path));
  if (schema.anyOf && !schema.anyOf.some((s) => !sub(s, value, path).length)) out.push(`${where(path)}: matches none of the allowed shapes`);
  if (schema.oneOf) {
    const results = schema.oneOf.map((s) => sub(s, value, path)), ok = results.filter((r) => !r.length).length;
    if (ok > 1) out.push(`${where(path)}: matches more than one allowed shape`);
    if (ok === 0) {
      // The branch whose own "type" constant names this value is the one meant: report its problems.
      const meant = schema.oneOf.findIndex((s) => { const t = (s.$ref ? resolve(s.$ref, root, others)[0] : s)?.properties?.type?.const; return t !== undefined && value?.type === t; });
      out.push(...(meant >= 0 ? results[meant] : [`${where(path)}: matches none of the allowed shapes${value?.type !== undefined ? ` (type ${show(value.type)} is unknown here)` : ''}`]));
    }
  }
  if (schema.not && !sub(schema.not, value, path).length) out.push(`${where(path)}: ${show(value)} is not allowed here`);
  if (schema.if) {
    const branch = sub(schema.if, value, path).length ? schema.else : schema.then;
    if (branch) out.push(...sub(branch, value, path));
  }
  return out;
}

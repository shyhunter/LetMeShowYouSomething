// SPDX-License-Identifier: Apache-2.0
// The checker holds a review and its answers to the schemas (lib/schema-check.mjs), without a dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schemaErrors, KNOWN } from '../lib/schema-check.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const SCHEMAS = Object.fromEntries(['review', 'feedback', 'history'].map((k) => [`letmeshowyousomething/${k}`, read(`schemas/${k}.v1.schema.json`)]));
const all = Object.values(SCHEMAS);

test('every example matches its schema', () => {
  for (const f of readdirSync(join(root, 'examples')).filter((n) => n.endsWith('.json'))) {
    const x = read(`examples/${f}`);
    if (SCHEMAS[x.protocol]) assert.deepEqual(schemaErrors(SCHEMAS[x.protocol], x, all), [], f);
  }
});

test('every keyword the schemas use is one the validator knows', () => {
  // Visit every schema position, not the field names under properties.
  const unknown = [];
  const walk = (s) => {
    if (!s || typeof s !== 'object') return;
    unknown.push(...Object.keys(s).filter((k) => !KNOWN.has(k)));
    for (const k of ['properties', '$defs']) Object.values(s[k] ?? {}).forEach(walk);
    for (const k of ['allOf', 'anyOf', 'oneOf']) (s[k] ?? []).forEach(walk);
    for (const k of ['items', 'additionalProperties', 'not', 'if', 'then', 'else', 'contains', 'propertyNames']) walk(s[k]);
  };
  all.forEach(walk);
  assert.deepEqual(unknown, []);
});

// What another agent (Hermes) wrote on its first try: fields the protocol does not have. The checker passed it.
test('a review with fields the protocol does not have is refused, each field named', () => {
  const r = read('examples/review.example.json');
  r.id = 'drifted-review';
  r.createdBy.respondent = 'user';
  r.brief = { what: 'Everything about the app', highlights: ['a', 'b'] };
  r.sections[0].mode = 'explain';
  r.focusDiagram = 'userflow';
  const p = join(mkdtempSync(join(tmpdir(), 'schema-')), 'r.json');
  writeFileSync(p, JSON.stringify(r));
  const out = spawnSync(process.execPath, [join(root, 'bin/check.mjs'), 'review', p], { encoding: 'utf8' }).stdout;
  assert.match(out, /✗ matches the schema:/);
  for (const said of [/createdBy: "respondent" is not a field here/, /brief: "what" is not a field here/, /brief\.highlights: should be object, not array/,
    /sections\[0\]\.mode: "explain" is not one of "judge-each", "choose-one"/, /the file: "focusDiagram" is not a field here/, /Fix each one to match schemas\/review\.v1\.schema\.json/])
    assert.match(out, said, out);
});

test('answers are held to their schema too', () => {
  const f = read('examples/feedback.example.json');
  f.mood = 'happy';
  delete f.responses[0].title;
  const e = schemaErrors(SCHEMAS['letmeshowyousomething/feedback'], f, all);
  assert.ok(e.some((x) => /"mood" is not a field here/.test(x)), e.join('\n'));
  assert.ok(e.some((x) => /responses\[0\]: "title" is missing/.test(x)), e.join('\n'));
});

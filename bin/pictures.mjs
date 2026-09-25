#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// #60 — the pictures a reviewer attached, written out as files so an agent (or a person) can look at them.
//
//   node bin/pictures.mjs <feedback.json> [folder]
//
// Run `check.mjs pair` first: it refuses anything that is not really a PNG, JPEG or WebP picture.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [feedbackPath, folder = feedbackPath?.replace(/\.json$/, '') + '-pictures'] = process.argv.slice(2);
if (!feedbackPath) {
  console.error('usage: pictures.mjs <feedback.json> [folder]');
  process.exit(2);
}
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const pictures = JSON.parse(readFileSync(feedbackPath, 'utf8')).pictures ?? [];
if (!pictures.length) { console.log('no pictures in this file'); process.exit(0); }
mkdirSync(folder, { recursive: true });
for (const p of pictures) {
  const ext = EXT[p.type];
  if (!ext || !/^picture-\d{1,4}$/.test(p.id ?? '')) { console.log(`skipped ${p.id}: not a PNG, JPEG or WebP picture`); continue; }
  const file = join(folder, `${p.id}.${ext}`);
  writeFileSync(file, Buffer.from(p.data, 'base64'));
  console.log(`${file}  on "${p.onTitle}" (${p.on}), ${p.width} × ${p.height}${typeof p.screen === 'string' ? `, the reviewer's screenshot of screen "${p.screen}": use it as that screen's image next round` : ''}`);
}

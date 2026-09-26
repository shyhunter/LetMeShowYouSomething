// SPDX-License-Identifier: Apache-2.0
// #145 — no broken links: every local link and picture in the README, the wiki and the site's pages points at a file
// that exists (the site's example pages and schemas are rendered from examples/ and schemas/ at deploy).
// Links to other sites are checked by hand before a launch, not here: a test must not need the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, normalize, basename } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const list = (dir, ext) => readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(ext)).map((f) => join(dir, f));
const FILES = ['README.md', ...list('docs/wiki', '.md'), ...list('site', '.html'), ...list('site/tutorial', '.html')];
const SITE_ROOT = '/LetMeShowYouSomething/';

function where(file, link) {
  const path = decodeURI(link.split('#')[0].split('?')[0]);
  if (!path) return null;
  const at = path.startsWith(SITE_ROOT) ? normalize(join('site', path.slice(SITE_ROOT.length) || 'index.html')) : normalize(join(dirname(file), path));
  if (at.startsWith('site/examples/')) return join('examples', basename(at));
  if (at.startsWith('site/schema/')) return join('schemas', basename(at).replace('.v1.json', '.v1.schema.json'));
  return at;
}

test('every local link and picture in the README, the wiki and the site resolves', () => {
  const broken = [];
  for (const file of FILES) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    const links = file.endsWith('.md') ? [...text.matchAll(/\]\(([^)\s]+)\)|(?:src|srcset)="([^"]+)"/g)].map((m) => m[1] || m[2])
      : [...text.matchAll(/(?:href|src|poster)="([^"]+)"/g)].map((m) => m[1]);
    for (const link of links) {
      if (/^(https?:|mailto:|data:|#)/.test(link)) continue;
      const at = where(file, link);
      if (at && !existsSync(join(ROOT, at))) broken.push(`${file} → ${link}`);
    }
  }
  assert.deepEqual(broken, []);
});

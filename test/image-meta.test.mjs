// SPDX-License-Identifier: Apache-2.0
// Screenshots an agent puts in a review: read by their own bytes, their hidden details named and left out of the
// page, their pixels kept byte for byte. Every picture below is synthetic (our own screenshots, or made here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { crc32 } from 'node:zlib';
import { readImage } from '../lib/image-meta.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const review = () => JSON.parse(readFileSync(join(ROOT, 'examples/password-reset.review.json'), 'utf8'));
const b64 = (src) => Buffer.from(src.split(',')[1], 'base64');
const url = (type, buf) => `data:${type};base64,${buf.toString('base64')}`;
const SECRET = 'SYNTHETIC GPS 51.5007N 0.1246W · camera: test';

// A JPEG screenshot with EXIF and a comment put in after its start marker.
const jpegWithExif = () => {
  const clean = b64(review().flow.screens[0].image.src), seg = (m, s) => { const d = Buffer.from(s, 'latin1'), h = Buffer.from([0xff, m, 0, 0]); h.writeUInt16BE(d.length + 2, 2); return Buffer.concat([h, d]); };
  return { clean, dirty: Buffer.concat([clean.subarray(0, 2), seg(0xe1, 'Exif\0\0' + SECRET), seg(0xfe, SECRET), clean.subarray(2)]) };
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const chunk = (type, data) => { const d = Buffer.from(data, 'latin1'), len = Buffer.alloc(4), c = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type, 'latin1'), d]);
  len.writeUInt32BE(d.length); c.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([len, body, c]); };
const WEBP = Buffer.from('UklGRgACAABXRUJQVlA4WAoAAAAgAAAAAgAAAQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhMEQAAAC8CQAAAB9Cf7hS7/4GI6H8AAA==', 'base64');

test('a JPEG: EXIF and comments named and taken out, the picture itself kept byte for byte', () => {
  const { clean, dirty } = jpegWithExif(), img = readImage(url('image/jpeg', dirty));
  assert.deepEqual([img.type, img.width, img.height, img.removed], ['image/jpeg', 360, 720, ['EXIF/XMP', 'comment']]);
  assert.ok(b64(img.src).equals(clean));
  assert.doesNotMatch(b64(img.src).toString('latin1'), /GPS/);
});

test('a PNG: text and EXIF chunks named and taken out; a clean PNG is left as it is', () => {
  const iend = PNG.length - 12, dirty = Buffer.concat([PNG.subarray(0, iend), chunk('tEXt', 'Comment\0' + SECRET), chunk('eXIf', SECRET), PNG.subarray(iend)]);
  const img = readImage(url('image/png', dirty));
  assert.deepEqual([img.width, img.height, img.removed], [1, 1, ['tEXt', 'eXIf']]);
  assert.ok(b64(img.src).equals(PNG));
  assert.deepEqual(readImage(url('image/png', PNG)).removed, []);
});

test('a WebP: the EXIF and XMP chunks go, and the header stops announcing them', () => {
  const ch = (type, data) => { const d = Buffer.from(data, 'latin1'), h = Buffer.alloc(8); h.write(type, 0, 'latin1'); h.writeUInt32LE(d.length, 4); return Buffer.concat([h, d, d.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  const body = Buffer.concat([WEBP.subarray(12), ch('EXIF', SECRET), ch('XMP ', '<x>' + SECRET + '</x>')]);
  body[8] |= 0x0c;                                                                   // the VP8X header says: EXIF and XMP follow
  const head = Buffer.alloc(12); head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(4 + body.length, 4); head.write('WEBP', 8, 'latin1');
  const img = readImage(url('image/webp', Buffer.concat([head, body])));
  assert.deepEqual([img.width, img.height, img.removed], [3, 2, ['EXIF', 'XMP']]);
  const out = b64(img.src);
  assert.doesNotMatch(out.toString('latin1'), /GPS/);
  assert.equal(out[20] & 0x0c, 0, 'the header no longer announces them');
  assert.equal(out.readUInt32LE(4), out.length - 8, 'the file size is right');
});

test('what is not the picture it says is refused: another type, cut short, or no picture at all', () => {
  assert.equal(readImage(url('image/png', jpegWithExif().clean)), null);
  assert.equal(readImage(url('image/jpeg', jpegWithExif().clean.subarray(0, 300))), null);
  assert.equal(readImage(url('image/png', PNG.subarray(0, 40))), null);
  assert.equal(readImage('data:image/png;base64,QUtJQQ=='), null);
  assert.equal(readImage('https://example.com/a.png'), null);
});

test('the checker names hidden details and refuses what is too large; the page leaves them out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'image-')), r = review(), p = join(dir, 'r.json'), out = join(dir, 'r.html');
  r.id = 'image-meta-test'; r.flow.screens[0].image.src = url('image/jpeg', jpegWithExif().dirty);
  writeFileSync(p, JSON.stringify(r));
  const c = spawnSync(process.execPath, [join(ROOT, 'bin/check.mjs'), 'review', p], { encoding: 'utf8' });
  assert.equal(c.status, 0, c.stdout);
  assert.match(c.stdout, /! pictures carry hidden details: sign-in \(EXIF\/XMP, comment\): details a viewer never sees.*render\.mjs leaves them out of the page/);
  const w = spawnSync(process.execPath, [join(ROOT, 'bin/render.mjs'), p, out], { encoding: 'utf8' });
  assert.equal(w.status, 0, w.stderr);
  assert.match(w.stdout, /sign-in: left out of the page: EXIF\/XMP, comment/);
  const page = readFileSync(out, 'utf8'), line = page.split('\n').find((l) => l.startsWith('const REVIEW = '));
  const inPage = JSON.parse(line.slice('const REVIEW = '.length, -1)).flow.screens[0].image.src;
  assert.ok(b64(inPage).equals(jpegWithExif().clean), 'the page, and so every answered copy of it, holds the clean picture');
  const big = review(); big.id = 'image-too-big';
  const iend = PNG.length - 12; big.flow.screens[0].image.src = url('image/png', Buffer.concat([PNG.subarray(0, iend), chunk('tEXt', 'x'.repeat(2.1 * 1024 * 1024)), PNG.subarray(iend)]));
  writeFileSync(p, JSON.stringify(big));
  const b = spawnSync(process.execPath, [join(ROOT, 'bin/check.mjs'), 'review', p], { encoding: 'utf8' });
  assert.equal(b.status, 1);
  assert.match(b.stdout, /sign-in: the image is 2\.1 MB, more than 2 MB/);
});

// SPDX-License-Identifier: Apache-2.0
// Pictures an agent puts in a review get forwarded with it. This reads a PNG, JPEG or WebP by its own bytes and
// takes out what a viewer never sees but a file can carry: EXIF (camera, time, often the place), XMP, IPTC,
// comments and text chunks. The picture's pixels are kept byte for byte. It cannot see what the pixels show:
// a name or a number on the screen stays, and only a person can check that.
// No dependency: each format is walked by its own structure, and anything it does not understand is refused.

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Chunks that only carry words or metadata; everything the picture needs to draw is kept.
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function png(b) {
  if (b.length < 33 || !b.subarray(0, 8).equals(PNG_SIG)) return null;
  const keep = [b.subarray(0, 8)], removed = [];
  let at = 8, width = 0, height = 0, ended = false;
  while (at + 12 <= b.length) {
    const len = b.readUInt32BE(at), type = b.toString('latin1', at + 4, at + 8), end = at + 12 + len;
    if (end > b.length) return null;
    if (type === 'IHDR') { width = b.readUInt32BE(at + 8); height = b.readUInt32BE(at + 12); }
    if (PNG_DROP.has(type)) removed.push(type); else keep.push(b.subarray(at, end));
    at = end;
    if (type === 'IEND') { ended = true; break; }
  }
  return ended ? { type: 'image/png', width, height, removed, clean: Buffer.concat(keep) } : null;
}

// JPEG segments before the image data: APP1 (EXIF, XMP), APP13 (IPTC) and COM (comments) are dropped;
// APP0 (JFIF), APP2 (colour profile) and APP14 (Adobe) are kept, as they change how it draws.
const JPEG_DROP = { 0xe1: 'EXIF/XMP', 0xed: 'IPTC', 0xfe: 'comment' };
function jpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const keep = [b.subarray(0, 2)], removed = [];
  let at = 2, width = 0, height = 0;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1];
    if (marker === 0xda) { keep.push(b.subarray(at)); return width && height ? { type: 'image/jpeg', width, height, removed, clean: Buffer.concat(keep) } : null; }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) return null;
    const len = b.readUInt16BE(at + 2), end = at + 2 + len;
    if (len < 2 || end > b.length) return null;
    if ((marker >= 0xc0 && marker <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marker)) { height = b.readUInt16BE(at + 5); width = b.readUInt16BE(at + 7); }
    if (JPEG_DROP[marker]) removed.push(JPEG_DROP[marker]); else keep.push(b.subarray(at, end));
    at = end;
  }
  return null;
}

// WebP: a RIFF file of chunks. EXIF and XMP chunks go, and the extended header stops announcing them.
function webp(b) {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunks = [], removed = [];
  let at = 12, width = 0, height = 0;
  while (at + 8 <= b.length) {
    const type = b.toString('latin1', at, at + 4), len = b.readUInt32LE(at + 4), end = at + 8 + len + (len % 2);
    if (at + 8 + len > b.length) return null;
    let chunk = Buffer.from(b.subarray(at, Math.min(end, b.length)));
    if (type === 'VP8X') { chunk[8] &= ~0x0c; width = 1 + chunk.readUIntLE(12, 3); height = 1 + chunk.readUIntLE(15, 3); }
    else if (type === 'VP8 ' && !width) { width = chunk.readUInt16LE(14) & 0x3fff; height = chunk.readUInt16LE(16) & 0x3fff; }
    else if (type === 'VP8L' && !width) { const v = chunk.readUInt32LE(9); width = (v & 0x3fff) + 1; height = ((v >> 14) & 0x3fff) + 1; }
    if (type === 'EXIF' || type === 'XMP ') removed.push(type.trim()); else chunks.push(chunk);
    at = end;
  }
  const body = Buffer.concat(chunks), head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(4 + body.length, 4); head.write('WEBP', 8, 'latin1');
  return width && height ? { type: 'image/webp', width, height, removed, clean: Buffer.concat([head, body]) } : null;
}

const READ = { 'image/png': png, 'image/jpeg': jpeg, 'image/webp': webp };

// A data: URL in, what it really is out: its type by its own bytes, its size, and what hidden parts it carries.
// null when it is not a picture of the type it claims.
export function readImage(src) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(src || ''));
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64'), found = READ[m[1]](bytes);
  return found ? { ...found, bytes: bytes.length, src: `data:${m[1]};base64,${found.clean.toString('base64')}` } : null;
}

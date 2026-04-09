"use strict";

const zlib = require("zlib");

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function pixelsToPNG(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // 8-bit RGBA

  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(size * rowLen, 0);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * rowLen + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Fills a rounded rectangle into the pixel buffer.
 * Uses per-pixel distance-to-corner for clean edges at small radii.
 */
function drawRoundedRect(pixels, size, x1, y1, x2, y2, r, rgb, alpha) {
  const [cr, cg, cb] = rgb;
  // Corner circle centres
  const corners = [
    [x1 + r, y1 + r],
    [x2 - r, y1 + r],
    [x1 + r, y2 - r],
    [x2 - r, y2 - r],
  ];
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      // Determine which region the pixel is in
      const inCornerZone =
        (x < x1 + r || x > x2 - r) && (y < y1 + r || y > y2 - r);
      if (inCornerZone) {
        // Find the nearest corner centre
        const cx = x < x1 + r ? x1 + r : x2 - r;
        const cy = y < y1 + r ? y1 + r : y2 - r;
        const dx = x - cx,
          dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
      }
      const idx = (y * size + x) * 4;
      pixels[idx] = cr;
      pixels[idx + 1] = cg;
      pixels[idx + 2] = cb;
      pixels[idx + 3] = alpha;
    }
  }
}

module.exports = { crc32, pngChunk, pixelsToPNG, drawRoundedRect };

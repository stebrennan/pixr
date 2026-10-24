/* Small, dependency-free PNG codec. No canvas readback or premultiplied-alpha round trip. */
(function (root) {
  'use strict';
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const table = Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  function crc(bytes) { let c = 0xffffffff; for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let pos = 0;
    for (const p of parts) { out.set(p, pos); pos += p.length; } return out;
  }
  function chunk(type, data) {
    const out = new Uint8Array(data.length + 12), view = new DataView(out.buffer);
    view.setUint32(0, data.length); out.set([...type].map(c => c.charCodeAt(0)), 4); out.set(data, 8);
    view.setUint32(out.length - 4, crc(out.subarray(4, out.length - 4))); return out;
  }
  function adler(data) {
    let a = 1, b = 0;
    for (const value of data) { a = (a + value) % 65521; b = (b + a) % 65521; }
    return ((b << 16) | a) >>> 0;
  }
  // Stored DEFLATE blocks: larger files, but exact and portable without a compressor.
  function deflateStored(raw) {
    const parts = [Uint8Array.of(0x78, 0x01)];
    for (let offset = 0; offset < raw.length; offset += 65535) {
      const len = Math.min(65535, raw.length - offset), inv = len ^ 65535;
      parts.push(Uint8Array.of(offset + len === raw.length ? 1 : 0, len & 255, len >> 8, inv & 255, inv >> 8), raw.subarray(offset, offset + len));
    }
    const sum = new Uint8Array(4); new DataView(sum.buffer).setUint32(0, adler(raw)); parts.push(sum);
    return concat(parts);
  }
  function encode(width, height, rgba) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 8388608 || rgba.length !== width * height * 4) {
      throw new Error('Invalid PNG dimensions or RGBA data.');
    }
    const raw = new Uint8Array(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
    const head = new Uint8Array(13), v = new DataView(head.buffer); v.setUint32(0, width); v.setUint32(4, height);
    head[8] = 8; head[9] = 6;
    return concat([Uint8Array.from(signature), chunk('IHDR', head), chunk('IDAT', deflateStored(raw)), chunk('IEND', new Uint8Array())]);
  }
  async function inflate(data, expected) {
    if (typeof DecompressionStream === 'undefined') throw new Error('PNG import requires a current browser with DecompressionStream support.');
    const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const parts = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > expected) { await reader.cancel(); throw new Error('PNG contains excessive decompressed data.'); }
        parts.push(value);
      }
    } catch (e) { throw new Error(`Cannot decompress PNG: ${e.message}`); }
    if (size !== expected) throw new Error('PNG pixel data is truncated.');
    return concat(parts);
  }
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  async function decode(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length > 50 * 1024 * 1024) throw new Error('PNG file exceeds 50 MiB.');
    if (!signature.every((b, i) => bytes[i] === b)) throw new Error('This file is not a PNG image.');
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8, width, height, depth, type, interlace, palette, transparency, ended = false;
    const idat = [];
    while (offset + 12 <= bytes.length) {
      const length = v.getUint32(offset);
      if (length > bytes.length - offset - 12) throw new Error('Truncated PNG chunk.');
      const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      const data = bytes.subarray(offset + 8, offset + 8 + length);
      if (crc(bytes.subarray(offset + 4, offset + 8 + length)) !== v.getUint32(offset + 8 + length)) throw new Error(`PNG ${name} checksum failed.`);
      if (offset === 8 && name !== 'IHDR') throw new Error('PNG must begin with IHDR.');
      if (name === 'IHDR') {
        if (width || length !== 13) throw new Error('Invalid PNG header.');
        const hv = new DataView(data.buffer, data.byteOffset, data.length);
        width = hv.getUint32(0); height = hv.getUint32(4); depth = data[8]; type = data[9]; interlace = data[12];
        if (width < 1 || height < 1 || width > 256 || height > 256) throw new Error(`PNG is ${width} × ${height}; each dimension must be 1–256 pixels.`);
        const valid = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        if (!valid[type]?.includes(depth) || data[10] !== 0 || data[11] !== 0 || interlace > 1) throw new Error('Unsupported PNG header.');
      } else if (name === 'PLTE') palette = data;
      else if (name === 'tRNS') transparency = data;
      else if (name === 'IDAT') idat.push(data);
      else if (name === 'IEND') { ended = true; break; }
      else if (name === 'acTL') throw new Error('Animated PNG is not supported. Import separate PNG frames.');
      else if ((name.charCodeAt(0) & 32) === 0) throw new Error(`Unsupported critical PNG chunk: ${name}`);
      offset += length + 12;
    }
    if (!ended || !idat.length) throw new Error('PNG is missing image data or its end marker.');
    if (type === 3 && (!palette || !palette.length || palette.length % 3 || palette.length > 768)) throw new Error('PNG palette is missing or invalid.');
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type], bits = channels * depth;
    const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
    const sizes = passes.map(([x, y, dx, dy]) => ({ w: Math.max(0, Math.ceil((width - x) / dx)), h: Math.max(0, Math.ceil((height - y) / dy)) }));
    const expected = sizes.reduce((n, { w, h }) => n + (w && h ? (Math.ceil(w * bits / 8) + 1) * h : 0), 0);
    const raw = await inflate(concat(idat), expected), out = new Uint8ClampedArray(width * height * 4);
    let pos = 0;
    for (let pass = 0; pass < passes.length; pass++) {
      const { w, h } = sizes[pass]; if (!w || !h) continue;
      const [startX, startY, stepX, stepY] = passes[pass], rowBytes = Math.ceil(w * bits / 8), bpp = Math.max(1, Math.ceil(bits / 8));
      let prev = new Uint8Array(rowBytes);
      for (let y = 0; y < h; y++) {
        const filter = raw[pos++]; if (filter > 4) throw new Error('Invalid PNG row filter.');
        const row = raw.slice(pos, pos + rowBytes); pos += rowBytes;
        for (let i = 0; i < rowBytes; i++) {
          const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
          row[i] = (row[i] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) & 255;
        }
        const sample = n => depth === 16 ? row[n * 2] * 256 + row[n * 2 + 1] : depth === 8 ? row[n] :
          (row[Math.floor(n * depth / 8)] >> (8 - depth - n * depth % 8)) & ((1 << depth) - 1);
        const to8 = n => Math.round(n * 255 / (depth === 16 ? 65535 : (1 << depth) - 1));
        for (let x = 0; x < w; x++) {
          const samples = Array.from({ length: channels }, (_, c) => sample(x * channels + c));
          let color;
          if (type === 3) {
            const i = samples[0]; if (i * 3 >= palette.length) throw new Error('PNG references a missing palette colour.');
            color = [palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2], transparency?.[i] ?? 255];
          } else if (type === 0 || type === 4) {
            const gray = to8(samples[0]); color = [gray, gray, gray, type === 4 ? to8(samples[1]) : 255];
          } else color = [to8(samples[0]), to8(samples[1]), to8(samples[2]), type === 6 ? to8(samples[3]) : 255];
          if (transparency && (type === 0 || type === 2)) {
            const tv = new DataView(transparency.buffer, transparency.byteOffset, transparency.length);
            if (transparency.length !== channels * 2) throw new Error('Invalid PNG transparency data.');
            if (samples.every((s, c) => s === tv.getUint16(c * 2))) color[3] = 0;
          }
          out.set(color, ((startY + y * stepY) * width + startX + x * stepX) * 4);
        }
        prev = row;
      }
    }
    return { width, height, data: out };
  }
  const api = { encode, decode };
  root.PixelPNG = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

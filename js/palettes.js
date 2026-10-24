(function (root) {
  'use strict';
  const C = root.PixelCore || require('./core.js');
  const rgb = (r, g, b) => C.hexColor([r, g, b, 255]);
  const bit = (n, b) => (n >> b) & 1;
  const zx = Array.from({ length: 16 }, (_, i) => {
    const level = i & 8 ? 255 : 205;
    return rgb(bit(i, 1) * level, bit(i, 2) * level, bit(i, 0) * level);
  });
  // CLUT bits: G1 R1 B1 BRIGHT G0 R0 B0. BRIGHT adds to ALL channels.
  const sam = Array.from({ length: 128 }, (_, i) => {
    const channel = (hi, lo) => Math.round((4 * bit(i, hi) + 2 * bit(i, lo) + bit(i, 3)) * 255 / 7);
    return rgb(channel(5, 1), channel(6, 2), channel(4, 0));
  });
  // CPC Gate Array addresses 0..31; duplicate RGB outputs remain at their hardware indices.
  const cpcTriples = ['111','111','021','221','001','201','011','211','201','221','220','222','200','202','210','212',
    '001','021','020','022','000','002','010','012','101','121','120','122','100','102','110','112'];
  const cpc = cpcTriples.map(s => rgb(...[...s].map(n => [0, 128, 255][Number(n)])));
  const bbc = Array.from({ length: 8 }, (_, i) => rgb(bit(i, 0) * 255, bit(i, 1) * 255, bit(i, 2) * 255));
  // VICE's Colodore (PAL) table, retrieved 2026-10-24; see PALETTES.md.
  const c64 = ['000000','ffffff','96282e','5bd6ce','9f2dad','41b936','2724c4','eff347',
    '9f4815','5e3500','da5f66','474747','787878','91ff84','6864ff','aeaeae'].map(s => '#' + s + 'ff');
  const builtins = [
    { id: 'zx', name: 'ZX Spectrum', colors: zx },
    { id: 'sam', name: 'SAM Coupé · 128', colors: sam },
    { id: 'cpc', name: 'Amstrad CPC 464', colors: cpc },
    { id: 'bbc', name: 'BBC Micro', colors: bbc },
    { id: 'c64', name: 'Commodore 64 · PAL', colors: c64 },
  ];
  function validate(raw, fallback = 'Custom palette') {
    const values = Array.isArray(raw) ? raw : raw && (raw.colors || raw.colours || raw.palette);
    if (!Array.isArray(values) || !values.length || values.length > 4096) throw new Error('A palette needs 1–4096 colours.');
    const name = (!Array.isArray(raw) && raw.name) || fallback;
    if (typeof name !== 'string' || !name.trim() || name.length > 160) throw new Error('Palette name must contain 1–160 characters.');
    return { name: name.trim(), colors: values.map(C.normalizeColor) };
  }
  function parse(text, filename = 'Custom palette') {
    text = text.replace(/^\uFEFF/, '').trim();
    if (/^[\[{]/.test(text)) {
      let raw;
      try { raw = JSON.parse(text); } catch { throw new Error('Invalid palette JSON.'); }
      return validate(raw, filename.replace(/\.[^.]+$/, ''));
    }
    if (/^GIMP Palette(?:\r?\n|$)/.test(text)) {
      let name = filename.replace(/\.[^.]+$/, ''); const colors = [];
      for (const row of text.split(/\r?\n/).slice(1)) {
        const line = row.trim(); if (!line || line.startsWith('#') || /^Columns:\s*\d+$/.test(line)) continue;
        if (line.startsWith('Name:')) { name = line.slice(5).trim(); continue; }
        const m = line.match(/^(\d+)\s+(\d+)\s+(\d+)(?:\s.*)?$/);
        if (!m || m.slice(1).some(n => Number(n) > 255)) throw new Error(`Invalid GPL colour row: ${line.slice(0, 60)}`);
        colors.push(rgb(...m.slice(1).map(Number)));
      }
      return validate({ name, colors });
    }
    const colors = [];
    for (const row of text.split(/\r?\n/)) {
      const line = row.trim(); if (!line || line.startsWith('//') || /^#\s/.test(line)) continue;
      colors.push(...line.split(/[\s,;]+/).filter(Boolean).map(C.normalizeColor));
    }
    return validate({ name: filename.replace(/\.[^.]+$/, ''), colors });
  }
  function arrange(colors, order) {
    const brightness = c => c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    const hue = c => {
      const [r, g, b] = c, max = Math.max(r, g, b), d = max - Math.min(r, g, b);
      if (!d) return -1;
      return ((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
    };
    const entries = colors.map((color, index) => ({ color, index }));
    if (order !== 'hardware') entries.sort((a, b) => {
      const ca = C.parseColor(a.color), cb = C.parseColor(b.color);
      return (order === 'hue' ? hue(ca) - hue(cb) : 0) || brightness(ca) - brightness(cb) || a.index - b.index;
    });
    return entries;
  }
  const api = { builtins, parse, validate, arrange };
  root.PixelPalettes = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

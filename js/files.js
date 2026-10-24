(function (root) {
  'use strict';
  const C = root.PixelCore || require('./core.js'), P = root.PixelPalettes || require('./palettes.js');
  const FORMAT = 'pixel-workshop', VERSION = 1, PROJECT_EXTENSION = '.pixr';
  function toBase64(bytes) {
    let str = ''; for (let i = 0; i < bytes.length; i += 8192) str += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(str);
  }
  function fromBase64(str, length) {
    if (typeof str !== 'string' || str.length !== Math.ceil(length / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(str)) throw new Error('Invalid cel encoding or length.');
    let decoded; try { decoded = atob(str); } catch { throw new Error('Invalid cel Base64 data.'); }
    if (decoded.length !== length) throw new Error('Cel data does not match canvas dimensions.');
    return Uint8ClampedArray.from(decoded, c => c.charCodeAt(0));
  }
  function serialize(p) {
    return JSON.stringify({ format: FORMAT, version: VERSION, name: p.name,
      width: p.width, height: p.height, fps: p.fps, layers: p.layers,
      frames: p.frames.map(f => ({ name: f.name, cels: f.cels.map(toBase64) })),
      activeFrame: p.activeFrame, activeLayer: p.activeLayer,
      customPalettes: p.customPalettes, settings: p.settings }, null, 2);
  }
  function textName(value, fallback) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new Error('Names must contain 1–160 characters.');
    return value.trim();
  }
  function validateCustom(raw = []) {
    if (!Array.isArray(raw) || raw.length > 128) throw new Error('A project can contain at most 128 custom palettes.');
    const ids = new Set();
    return raw.map((item, i) => {
      const pal = P.validate(item), id = typeof item.id === 'string' ? item.id : `custom-${i + 1}`;
      if (!/^custom-[\w-]{1,140}$/.test(id) || ids.has(id)) throw new Error('Invalid or duplicate custom palette identifier.');
      ids.add(id); return { id, ...pal };
    });
  }
  // Conservative compatibility bridge for unversioned flat colour-array prototypes.
  // Unknown layouts are rejected rather than guessing and losing artwork.
  function legacy(raw) {
    if (raw.format || raw.version !== undefined || !raw.width || !raw.height) throw new Error('Unrecognised project format. Expected Pixel Workshop version 1 (compatible with Pixr).');
    const source = raw.frames || (raw.pixels ? [raw.pixels] : null);
    if (!Array.isArray(source)) throw new Error('Unsupported prototype layout. Expected frames/pixels colour arrays.');
    C.dimensions(raw.width, raw.height, source.length);
    const p = C.createProject(raw.width, raw.height, textName(raw.name, 'Imported prototype'));
    p.frames = source.map((f, i) => {
      let pixels = Array.isArray(f) ? f : f.pixels;
      if (Array.isArray(pixels) && Array.isArray(pixels[0])) pixels = pixels.flat();
      if (!Array.isArray(pixels) || pixels.length !== p.width * p.height) throw new Error(`Prototype frame ${i + 1} has incompatible pixel data.`);
      const data = C.blank(p.width, p.height);
      pixels.forEach((color, j) => data.set(color === null || color === '' || color === 'transparent' ? [0, 0, 0, 0] : C.parseColor(color), j * 4));
      return { name: `Frame ${i + 1}`, cels: [data] };
    });
    if (raw.fps !== undefined) p.fps = C.integer(raw.fps, 1, 60, 'FPS');
    return p;
  }
  function deserialize(text) {
    if (text.length > 64 * 1024 * 1024) throw new Error('Project file exceeds 64 MiB.');
    let raw; try { raw = JSON.parse(text); } catch { throw new Error('Invalid JSON. The current project has been preserved.'); }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Project must be a JSON object.');
    if (raw.format !== FORMAT) return legacy(raw);
    if (raw.version !== VERSION) throw new Error(`Unsupported Pixel Workshop version ${raw.version}. This editor reads version 1.`);
    if (!Array.isArray(raw.frames) || !Array.isArray(raw.layers)) throw new Error('Project needs frame and layer arrays.');
    C.dimensions(raw.width, raw.height, raw.frames.length, raw.layers.length);
    const p = C.createProject(raw.width, raw.height, textName(raw.name, 'Untitled'));
    p.fps = C.integer(raw.fps, 1, 60, 'FPS');
    p.layers = raw.layers.map((l, i) => {
      if (!l || typeof l.visible !== 'boolean' || typeof l.locked !== 'boolean') throw new Error(`Invalid layer ${i + 1}.`);
      return { name: textName(l.name, `Layer ${i + 1}`), visible: l.visible, locked: l.locked };
    });
    p.frames = raw.frames.map((f, i) => {
      if (!f || !Array.isArray(f.cels) || f.cels.length !== p.layers.length) throw new Error(`Frame ${i + 1} has an incorrect number of layers.`);
      return { name: textName(f.name, `Frame ${i + 1}`), cels: f.cels.map(c => fromBase64(c, p.width * p.height * 4)) };
    });
    p.activeFrame = C.integer(raw.activeFrame ?? 0, 0, p.frames.length - 1, 'Active frame');
    p.activeLayer = C.integer(raw.activeLayer ?? 0, 0, p.layers.length - 1, 'Active layer');
    p.customPalettes = validateCustom(raw.customPalettes); p.settings = C.validateSettings(raw.settings);
    return p;
  }
  const naturalOrder = files => [...files].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }));
  function importFrames(p, images, replace = false) {
    if (!images.length) throw new Error('Choose at least one PNG.');
    const { width, height } = images[0];
    for (const img of images) if (img.width !== width || img.height !== height) throw new Error(`${img.name || 'PNG'} is ${img.width} × ${img.height}; expected ${width} × ${height}. No images were imported.`);
    if (replace) {
      C.dimensions(width, height, images.length);
      const next = C.createProject(width, height, (images[0].name || 'Imported PNG').replace(/\.png$/i, ''));
      next.settings = { ...p.settings }; next.customPalettes = p.customPalettes.map(p => ({ ...p, colors: [...p.colors] }));
      next.frames = images.map((img, i) => ({ name: img.name || `Frame ${i + 1}`, cels: [img.data.slice()] }));
      return next;
    }
    if (p.width !== width || p.height !== height) throw new Error(`PNG frames must match this canvas (${p.width} × ${p.height}). Use Open PNG to start a differently sized document.`);
    C.editable(p); C.dimensions(width, height, p.frames.length + images.length, p.layers.length);
    const frames = images.map((img, i) => ({ name: img.name || `Frame ${i + 1}`, cels: p.layers.map((_, li) => li === p.activeLayer ? img.data.slice() : C.blank(width, height)) }));
    p.frames.splice(p.activeFrame + 1, 0, ...frames); p.activeFrame++;
    return p;
  }
  function spriteSheet(p) {
    const width = p.width * p.frames.length, height = p.height, data = new Uint8ClampedArray(width * height * 4);
    p.frames.forEach((_, i) => {
      const cel = C.composite(p, i);
      for (let y = 0; y < height; y++) data.set(cel.subarray(y * p.width * 4, (y + 1) * p.width * 4), (y * width + i * p.width) * 4);
    });
    return { width, height, data };
  }
  async function download(content, filename, type) {
    const bridge = typeof window !== 'undefined' && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pixrNative;
    if (bridge) {
      const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
      let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const requestId = `save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return new Promise(resolve => {
        root.PixrNative = root.PixrNative || {};
        root.PixrNative.pendingSaves = root.PixrNative.pendingSaves || {};
        root.PixrNative.pendingSaves[requestId] = resolve;
        root.PixrNative.completeSave = (id, ok) => { const done = root.PixrNative.pendingSaves[id]; if (!done) return; delete root.PixrNative.pendingSaves[id]; done(!!ok); };
        bridge.postMessage({ type: 'save-file', requestId, filename, mime: type, base64: btoa(binary) });
      });
    }
    const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  }
  const api = { FORMAT, VERSION, PROJECT_EXTENSION, serialize, deserialize, validateCustom, naturalOrder, importFrames, spriteSheet, download };
  root.PixelFiles = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

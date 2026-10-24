/* Pixr's DOM-free editing model. Classic script for file://; also usable in Node. */
(function (root) {
  'use strict';
  const MAX_PIXELS = 8 * 1024 * 1024;
  const defaults = () => ({
    color: '#ffcf70ff', tool: 'pencil', brush: 1, mirror: false, grid: true,
    onion: false, zoom: 16, previewZoom: 4, background: '#383b45', checker: true,
    palette: 'zx', arrangement: 'hardware', timeline: true,
  });
  function integer(value, min, max, label) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${label} must be an integer from ${min} to ${max}.`);
    }
    return value;
  }
  function dimensions(width, height, frames = 1, layers = 1) {
    integer(width, 1, 256, 'Width'); integer(height, 1, 256, 'Height');
    integer(frames, 1, 256, 'Frame count'); integer(layers, 1, 64, 'Layer count');
    if (width * height * frames * layers > MAX_PIXELS) {
      throw new Error('Project exceeds the 8,388,608 stored-pixel limit. Reduce dimensions, frames or layers.');
    }
  }
  function parseColor(value) {
    if (typeof value !== 'string') throw new Error('Colours must be hexadecimal strings.');
    let hex = value.trim().replace(/^#/, '');
    if (/^[\da-f]{3,4}$/i.test(hex)) hex = [...hex].map(c => c + c).join('');
    if (!/^(?:[\da-f]{6}|[\da-f]{8})$/i.test(hex)) throw new Error(`Invalid colour: ${value.slice(0, 40)}`);
    if (hex.length === 6) hex += 'ff';
    return hex.match(/../g).map(c => parseInt(c, 16));
  }
  const hexColor = rgba => '#' + Array.from(rgba, n => n.toString(16).padStart(2, '0')).join('');
  const normalizeColor = value => hexColor(parseColor(value));
  const blank = (w, h) => new Uint8ClampedArray(w * h * 4);
  function createProject(width = 32, height = 32, name = 'Untitled') {
    dimensions(width, height);
    return { name, width, height, fps: 8,
      layers: [{ name: 'Layer 1', visible: true, locked: false }],
      frames: [{ name: 'Frame 1', cels: [blank(width, height)] }],
      activeFrame: 0, activeLayer: 0, customPalettes: [], settings: defaults() };
  }
  function clone(p) {
    return { ...p, layers: p.layers.map(l => ({ ...l })),
      frames: p.frames.map(f => ({ ...f, cels: f.cels.map(c => c.slice()) })),
      customPalettes: p.customPalettes.map(pal => ({ ...pal, colors: [...pal.colors] })),
      settings: { ...p.settings } };
  }
  function editable(p, layer = p.activeLayer) {
    if (p.layers[layer].locked) throw new Error('This layer is locked. Unlock it before editing.');
    if (!p.layers[layer].visible) throw new Error('This layer is hidden. Show it before editing.');
    return p.frames[p.activeFrame].cels[layer];
  }
  function getPixel(data, w, x, y) { return Array.from(data.slice((y * w + x) * 4, (y * w + x) * 4 + 4)); }
  function setPixel(data, w, h, x, y, color) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    data.set(color, (y * w + x) * 4);
  }
  // Even brushes extend towards right/bottom: size 2 at (x,y) covers x..x+1, y..y+1.
  function stamp(data, w, h, x, y, color, size = 1, mirror = false) {
    integer(size, 1, 8, 'Brush size');
    const offset = Math.floor((size - 1) / 2);
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const px = x - offset + dx, py = y - offset + dy;
      setPixel(data, w, h, px, py, color);
      if (mirror) setPixel(data, w, h, w - 1 - px, py, color);
    }
  }
  function linePoints(a, b) {
    const out = []; let x = a.x, y = a.y;
    const dx = Math.abs(b.x - x), sx = x < b.x ? 1 : -1;
    const dy = -Math.abs(b.y - y), sy = y < b.y ? 1 : -1;
    let error = dx + dy;
    while (true) {
      out.push({ x, y }); if (x === b.x && y === b.y) break;
      const e = error * 2;
      if (e >= dy) { error += dy; x += sx; }
      if (e <= dx) { error += dx; y += sy; }
    }
    return out;
  }
  function drawLine(data, w, h, a, b, color, size = 1, mirror = false) {
    for (const point of linePoints(a, b)) stamp(data, w, h, point.x, point.y, color, size, mirror);
  }
  // Axis is chosen once per constrained segment; small hand jitter cannot change it.
  function constrain(start, point, axis = null) {
    if (!axis && (point.x !== start.x || point.y !== start.y)) {
      axis = Math.abs(point.x - start.x) >= Math.abs(point.y - start.y) ? 'x' : 'y';
    }
    return { axis, point: axis === 'x' ? { x: point.x, y: start.y } :
      axis === 'y' ? { x: start.x, y: point.y } : { ...start } };
  }
  // Used by the pointer controller and tests. Shift-click is deferred until pointer-up,
  // so a Shift-drag can constrain from its own origin without drawing an unwanted line.
  class Stroke {
    constructor(p, point, { color, size = 1, mirror = false, shift = false, previous = null } = {}) {
      this.data = editable(p); this.w = p.width; this.h = p.height;
      this.color = color || parseColor(p.settings.color); this.size = size; this.mirror = mirror;
      this.start = { ...point }; this.last = { ...point }; this.previous = previous;
      this.shiftClick = shift; this.moved = false; this.shift = shift; this.axis = null;
      this.constraintStart = { ...point };
      if (!shift) this.paint(point, point);
    }
    paint(a, b) { drawLine(this.data, this.w, this.h, a, b, this.color, this.size, this.mirror); }
    move(point, shift = this.shift) {
      if (point.x === this.start.x && point.y === this.start.y && !this.moved) return;
      this.moved = true;
      if (shift !== this.shift) { this.constraintStart = { ...this.last }; this.axis = null; }
      this.shift = shift;
      if (shift) {
        const result = constrain(this.constraintStart, point, this.axis);
        this.axis = result.axis; point = result.point;
      }
      this.paint(this.last, point); this.last = { ...point };
    }
    finish() {
      if (this.shiftClick && !this.moved) this.paint(this.previous || this.start, this.start);
      return { ...this.last };
    }
  }
  function flood(data, w, h, x, y, color) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const target = getPixel(data, w, x, y);
    if (target.every((v, i) => v === color[i])) return;
    const queue = [y * w + x], visited = new Uint8Array(w * h);
    for (let head = 0; head < queue.length; head++) {
      const pos = queue[head]; if (visited[pos]) continue; visited[pos] = 1;
      const i = pos * 4; if (!target.every((v, c) => data[i + c] === v)) continue;
      data.set(color, i); const px = pos % w, py = Math.floor(pos / w);
      if (px) queue.push(pos - 1); if (px + 1 < w) queue.push(pos + 1);
      if (py) queue.push(pos - w); if (py + 1 < h) queue.push(pos + w);
    }
  }
  function fill(p, x, y, color, mirror = false) {
    const data = editable(p); flood(data, p.width, p.height, x, y, color);
    if (mirror) flood(data, p.width, p.height, p.width - 1 - x, y, color);
  }
  function flip(p) {
    const data = editable(p), source = data.slice();
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      setPixel(data, p.width, p.height, x, y, getPixel(source, p.width, p.width - 1 - x, y));
    }
  }
  // Source-over in straight RGBA, rounded after each layer, independent of display CSS.
  function over(bottom, top) {
    const out = bottom.slice();
    for (let i = 0; i < top.length; i += 4) {
      const sa = top[i + 3] / 255; if (!sa) continue;
      const da = bottom[i + 3] / 255, a = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) out[i + c] = Math.round((top[i + c] * sa + bottom[i + c] * da * (1 - sa)) / a);
      out[i + 3] = Math.round(a * 255);
    }
    return out;
  }
  function composite(p, frame = p.activeFrame) {
    return p.layers.reduce((out, layer, i) => layer.visible ? over(out, p.frames[frame].cels[i]) : out, blank(p.width, p.height));
  }
  function bitmapPalette(p, frame = p.activeFrame) {
    const data = composite(p, frame), used = new Map();
    for (let i = 0; i < data.length; i += 4) if (data[i + 3]) {
      const hex = hexColor(data.subarray(i, i + 4)); used.set(hex, (used.get(hex) || 0) + 1);
    }
    return [...used].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([color, count]) => ({ color, count }));
  }
  function resizeOffset(p, width, height, anchor) {
    integer(anchor, 0, 8, 'Anchor');
    return { x: Math.floor((width - p.width) * (anchor % 3) / 2),
      y: Math.floor((height - p.height) * Math.floor(anchor / 3) / 2) };
  }
  function croppedPixels(p, width, height, anchor) {
    dimensions(width, height, p.frames.length, p.layers.length);
    const off = resizeOffset(p, width, height, anchor); let count = 0;
    for (const f of p.frames) for (const cel of f.cels) {
      for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
        if (cel[(y * p.width + x) * 4 + 3] && (x + off.x < 0 || x + off.x >= width || y + off.y < 0 || y + off.y >= height)) count++;
      }
    }
    return count;
  }
  function resize(p, width, height, anchor = 4) {
    dimensions(width, height, p.frames.length, p.layers.length);
    const off = resizeOffset(p, width, height, anchor);
    for (const frame of p.frames) frame.cels = frame.cels.map(cel => {
      const out = blank(width, height);
      for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
        setPixel(out, width, height, x + off.x, y + off.y, getPixel(cel, p.width, x, y));
      }
      return out;
    });
    p.width = width; p.height = height;
  }
  function addLayer(p, name = `Layer ${p.layers.length + 1}`) {
    dimensions(p.width, p.height, p.frames.length, p.layers.length + 1);
    const index = p.activeLayer + 1;
    p.layers.splice(index, 0, { name, visible: true, locked: false });
    p.frames.forEach(f => f.cels.splice(index, 0, blank(p.width, p.height))); p.activeLayer = index;
  }
  function deleteLayer(p) {
    if (p.layers.length === 1) throw new Error('Keep at least one layer.');
    p.layers.splice(p.activeLayer, 1); p.frames.forEach(f => f.cels.splice(p.activeLayer, 1));
    p.activeLayer = Math.min(p.activeLayer, p.layers.length - 1);
  }
  function mergeDown(p) {
    const i = p.activeLayer;
    if (!i) throw new Error('The bottom layer has no layer beneath it.');
    if (p.layers[i].locked || p.layers[i - 1].locked) throw new Error('Unlock both layers before merging.');
    const top = p.layers[i], bottom = p.layers[i - 1];
    for (const frame of p.frames) {
      const a = bottom.visible || !top.visible ? frame.cels[i - 1] : blank(p.width, p.height);
      const b = top.visible || !bottom.visible ? frame.cels[i] : blank(p.width, p.height);
      frame.cels[i - 1] = over(a, b); frame.cels.splice(i, 1);
    }
    bottom.visible = bottom.visible || top.visible;
    p.layers.splice(i, 1); p.activeLayer--;
  }
  function addFrame(p, duplicate = false) {
    dimensions(p.width, p.height, p.frames.length + 1, p.layers.length);
    const cels = duplicate ? p.frames[p.activeFrame].cels.map(c => c.slice()) : p.layers.map(() => blank(p.width, p.height));
    p.frames.splice(p.activeFrame + 1, 0, { name: `Frame ${p.frames.length + 1}`, cels }); p.activeFrame++;
  }
  function deleteFrame(p) {
    if (p.frames.length === 1) throw new Error('Keep at least one frame.');
    p.frames.splice(p.activeFrame, 1); p.activeFrame = Math.min(p.activeFrame, p.frames.length - 1);
  }
  function frameIndexAfterDeletion(frameIndex, deletedIndex, remainingCount) {
    if (frameIndex === deletedIndex) return Math.min(deletedIndex, remainingCount - 1);
    return frameIndex > deletedIndex ? frameIndex - 1 : frameIndex;
  }
  function sameArtwork(a, b) {
    if (a.width !== b.width || a.height !== b.height || a.frames.length !== b.frames.length || a.layers.length !== b.layers.length) return false;
    const metadata = p => JSON.stringify({ ...p, frames: p.frames.map(f => ({ name: f.name, cels: [] })), settings: undefined, activeFrame: undefined, activeLayer: undefined });
    if (metadata(a) !== metadata(b)) return false;
    return a.frames.every((f, fi) => f.cels.every((cel, li) => cel.every((v, i) => v === b.frames[fi].cels[li][i])));
  }
  class History {
    constructor(maxBytes = 64 * 1024 * 1024) { this.undoStack = []; this.redoStack = []; this.maxBytes = maxBytes; }
    size(p) { return p.width * p.height * p.frames.length * p.layers.length * 4 + 4096; }
    trim() {
      let bytes = this.undoStack.concat(this.redoStack).reduce((n, p) => n + this.size(p), 0);
      while (this.undoStack.length > 1 && (bytes > this.maxBytes || this.undoStack.length > 60)) bytes -= this.size(this.undoStack.shift());
      while (this.redoStack.length > 1 && bytes > this.maxBytes) bytes -= this.size(this.redoStack.shift());
    }
    record(before, after) {
      if (sameArtwork(before, after)) return false;
      this.undoStack.push(before); this.redoStack = []; this.trim(); return true;
    }
    undo(current) {
      if (!this.undoStack.length) return current;
      this.redoStack.push(clone(current)); const next = this.undoStack.pop(); this.trim(); return next;
    }
    redo(current) {
      if (!this.redoStack.length) return current;
      this.undoStack.push(clone(current)); const next = this.redoStack.pop(); this.trim(); return next;
    }
  }
  class DocumentSession {
    constructor(project, { id = `document-${Date.now()}-${Math.random()}`, saved = true } = {}) {
      this.id = id; this.project = project; this.history = new History(); this.dirty = !saved;
      this.scrollLeft = 0; this.scrollTop = 0;
    }
  }
  function validateSettings(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid editor settings.');
    const settings = defaults();
    for (const key of ['mirror', 'grid', 'onion', 'checker', 'timeline']) {
      if (raw[key] !== undefined && typeof raw[key] !== 'boolean') throw new Error(`Invalid ${key} setting.`);
      if (raw[key] !== undefined) settings[key] = raw[key];
    }
    for (const [key, min, max] of [['brush', 1, 8], ['zoom', 1, 48], ['previewZoom', 1, 16]]) {
      if (raw[key] !== undefined) settings[key] = integer(raw[key], min, max, key);
    }
    if (raw.color !== undefined) settings.color = normalizeColor(raw.color);
    if (raw.background !== undefined) settings.background = normalizeColor(raw.background).slice(0, 7);
    for (const [key, values] of [['tool', ['pencil', 'eraser', 'fill', 'picker']], ['arrangement', ['hardware', 'hue', 'brightness']]]) {
      if (raw[key] !== undefined) {
        if (!values.includes(raw[key])) throw new Error(`Invalid ${key} setting.`);
        settings[key] = raw[key];
      }
    }
    if (typeof raw.palette === 'string' && raw.palette.length <= 160) settings.palette = raw.palette;
    return settings;
  }
  const api = { MAX_PIXELS, defaults, dimensions, integer, parseColor, hexColor, normalizeColor,
    blank, createProject, clone, editable, getPixel, setPixel, stamp, linePoints, drawLine, constrain,
    Stroke, flood, fill, flip, over, composite, bitmapPalette, resizeOffset, croppedPixels, resize,
    addLayer, deleteLayer, mergeDown, addFrame, deleteFrame, frameIndexAfterDeletion, History, DocumentSession, validateSettings };
  root.PixelCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

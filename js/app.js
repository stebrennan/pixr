/* UI controller. No fetch, modules, server, workers, external resources or artwork autosave. */
(function () {
  'use strict';
  const C = PixelCore, P = PixelPalettes, F = PixelFiles, PNG = PixelPNG;
  const $ = id => document.getElementById(id);
  function nativeBridge() { return window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pixrNative; }
  if (nativeBridge()) document.body.classList.add('native-app');
  function requestFiles(input) {
    const bridge = nativeBridge();
    if (bridge) bridge.postMessage({ type: 'open-files', inputId: input.id, accept: input.accept, multiple: input.multiple });
    else input.click();
  }
  window.PixrNative = window.PixrNative || {};
  window.PixrNative.command = action => {
    if (action === 'undo') undo();
    else if (action === 'redo') undo(true);
    else if (action === 'flip') $('flip').click();
    else if (action === 'resize') $('resize').click();
  };
  function reportNativeFocus() {
    if (!nativeBridge()) return;
    const active = document.activeElement;
    nativeBridge().postMessage({ type: 'editing-focus', textField: !!active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable) });
  }
  document.addEventListener('focusin', reportNativeFocus);
  document.addEventListener('focusout', () => setTimeout(reportNativeFocus, 0));
  window.PixrNative.acceptFiles = (inputId, files) => {
    const input = $(inputId), transfer = new DataTransfer();
    for (const item of files) {
      const binary = atob(item.base64), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      transfer.items.add(new File([bytes], item.name, { type: item.type || 'application/octet-stream' }));
    }
    input.__pixrSourcePaths = files.map(item => item.sourcePath || null);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const storageKey = 'pixel-workshop-preferences-v1'; // Retained so existing browser palettes and settings remain available.
  let documents = [], activeDocument = null, nextUntitled = 1, draggedTabId = null;
  let project = C.createProject(), history = new C.History(), dirty = false, busy = false;
  let stroke = null, beforeStroke = null, previousPoint = null, hover = null;
  let playing = true, previewFrame = 0, previewTime = 0, previewDirty = true;
  let requested = false, timelineDirty = true, bitmapLimit = 128;
  let resizeMode = false, anchor = 4, pngMode = 'open', pngTarget = null;
  const status = message => { $('status').textContent = message; };
  function message(error, title = 'Could not complete that action') {
    $('message-title').textContent = title; $('message-text').textContent = error.message || String(error);
    if (!$('message-dialog').open) $('message-dialog').showModal();
    status(error.message || String(error));
  }
  function guard(fn) {
    return (...args) => {
      if (busy) return;
      try { return fn(...args); } catch (e) { message(e); }
    };
  }
  function remember() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ settings: project.settings, customPalettes: project.customPalettes }));
    } catch {}
  }
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (raw) { project.settings = C.validateSettings(raw.settings); project.settings.onion = false; project.customPalettes = F.validateCustom(raw.customPalettes); }
  } catch {}
  function storeActive() { if (activeDocument) Object.assign(activeDocument, { project, history, dirty, scrollLeft: $('stage').scrollLeft, scrollTop: $('stage').scrollTop }); }
  function activate(doc) {
    finishStroke(); storeActive(); activeDocument = doc; project = doc.project; history = doc.history; dirty = doc.dirty;
    playing = false; previewFrame = project.activeFrame; previewTime = 0; previousPoint = null; hover = null; bitmapLimit = 128;
    $('stage').scrollTo(doc.scrollLeft || 0, doc.scrollTop || 0);
    document.title = `${dirty ? '• ' : ''}${project.name} — Pixr`;
    $('play').textContent = '▶ Play'; $('play').setAttribute('aria-pressed', 'false');
    renderTabs(); renderLibrary(); syncControls(); schedule(true);
  }
  function uniqueUntitled() { let name; do { name = `Untitled ${nextUntitled++}`; } while (documents.some(d => d.project.name === name)); return name; }
  function addDocument(next, saved = false, name = null) {
    next.name = name || next.name || uniqueUntitled();
    if (/^Untitled$/.test(next.name)) next.name = uniqueUntitled();
    const doc = new C.DocumentSession(next, { saved });
    storeActive(); documents.push(doc); activate(doc); return doc;
  }
  function renderTabs() {
    const bar = $('document-tabs'); if (!bar) return;
    bar.replaceChildren(...documents.map(doc => {
      const tab = document.createElement('div'); tab.className = `document-tab${doc === activeDocument ? ' active' : ''}`; tab.draggable = true; tab.dataset.tabId = doc.id; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(doc === activeDocument)); tab.title = doc.project.name;
      const select = document.createElement('button'); select.className = 'tab-select'; select.dataset.doc = doc.id; select.textContent = doc.project.name; select.title = doc.project.name;
      const mark = document.createElement('span'); mark.className = 'tab-dirty'; mark.textContent = doc.dirty ? '●' : ''; mark.title = doc.dirty ? 'Unsaved changes' : '';
      const close = document.createElement('button'); close.className = 'tab-close'; close.dataset.closeDoc = doc.id; close.textContent = '×'; close.title = `Close ${doc.project.name}`; close.setAttribute('aria-label', close.title);
      tab.append(select, mark, close); return tab;
    }));
    const active = bar.querySelector('.document-tab.active'); if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  if (!project.name || project.name === 'Untitled') project.name = uniqueUntitled();
  activeDocument = new C.DocumentSession(project, { id: `doc-${Date.now()}`, saved: true }); history = activeDocument.history; documents.push(activeDocument);
  function palettes() { return P.builtins.concat(project.customPalettes); }
  function selectedPalette() { return palettes().find(p => p.id === project.settings.palette) || P.builtins[0]; }
  function syncPaletteSelect() {
    const all = palettes(), selected = selectedPalette(); project.settings.palette = selected.id;
    $('palette-select').replaceChildren(...all.map(pal => {
      const opt = document.createElement('option'); opt.value = pal.id; opt.textContent = pal.name; return opt;
    }));
    $('palette-select').value = selected.id;
    $('delete-palette').disabled = !project.customPalettes.some(p => p.id === selected.id);
    $('library-count').textContent = `${selected.colors.length} colours`;
  }
  function setDirty(value = true) {
    dirty = value; if (activeDocument) activeDocument.dirty = value; $('dirty').hidden = !value; renderTabs();
    document.title = `${dirty ? '• ' : ''}${project.name} — Pixr`;
  }
  function setting(key, value) {
    project.settings[key] = value; remember(); syncControls(); schedule();
  }
  function chooseColor(color) { setting('color', C.normalizeColor(color)); }
  function swatches(target, entries) {
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const color = entry.color, btn = document.createElement('button'); btn.className = 'swatch';
      btn.style.setProperty('--color', rgbaCSS(color)); btn.dataset.color = color;
      const label = `${color}${entry.index !== undefined ? ` · index ${entry.index}` : ''}${entry.count ? ` · ${entry.count} pixels` : ''}`;
      btn.title = label; btn.setAttribute('aria-label', label); btn.setAttribute('aria-pressed', String(color === project.settings.color));
      fragment.append(btn);
    }
    target.replaceChildren(fragment);
  }
  function rgbaCSS(hex) { const [r, g, b, a] = C.parseColor(hex); return `rgba(${r},${g},${b},${a / 255})`; }
  function renderLibrary() {
    syncPaletteSelect(); swatches($('library-palette'), P.arrange(selectedPalette().colors, project.settings.arrangement));
  }
  function renderBitmap() {
    const used = C.bitmapPalette(project); $('used-count').textContent = `${used.length} colour${used.length === 1 ? '' : 's'}`;
    $('bitmap-empty').hidden = used.length > 0;
    swatches($('bitmap-palette'), used.slice(0, bitmapLimit));
    $('bitmap-more').hidden = used.length <= bitmapLimit;
    $('bitmap-more').textContent = `Show ${Math.min(128, used.length - bitmapLimit)} more (${used.length - bitmapLimit} remaining)`;
  }
  function syncControls() {
    const s = project.settings, color = C.parseColor(s.color);
    document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === s.tool)));
    for (const key of ['grid', 'onion', 'checker']) $(key).checked = s[key];
    $('brush-number').value = s.brush;
    $('background').value = s.background; $('color-picker').value = s.color.slice(0, 7); $('hex').value = s.color;
    $('alpha').value = color[3]; $('color-alpha').textContent = `${Math.round(color[3] / 255 * 100)}%`;
    $('selected-color').style.setProperty('--color', rgbaCSS(s.color));
    $('zoom').value = s.zoom; $('preview-zoom').value = s.previewZoom;
    $('arrangement').value = s.arrangement; $('fps').value = project.fps;
    $('timeline').hidden = !s.timeline; $('timeline-toggle').setAttribute('aria-expanded', String(s.timeline));
    $('timeline-toggle').textContent = s.timeline ? 'Frames & Layers ▼' : 'Frames & Layers ▶';
    if (nativeBridge()) nativeBridge().postMessage({ type: 'history-state', undo: !!history.undoStack.length, redo: !!history.redoStack.length });
    $('delete-frame').disabled = project.frames.length === 1; $('delete-layer').disabled = project.layers.length === 1;
    $('merge-layer').disabled = project.activeLayer === 0;
    $('document-name').textContent = project.name; $('dimensions').textContent = `${project.width} × ${project.height}`;
    $('cel-label').textContent = `${project.layers[project.activeLayer].name} / Frame ${project.activeFrame + 1}`;
    $('layer-state').textContent = project.layers[project.activeLayer].locked ? 'Locked' : !project.layers[project.activeLayer].visible ? 'Hidden' : '';
    document.querySelectorAll('.swatch').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === s.color)));
    renderView();
  }
  function renderView() {
    const s = project.settings, surface = $('surface');
    surface.style.width = `${project.width * s.zoom}px`; surface.style.height = `${project.height * s.zoom}px`;
    surface.style.setProperty('--zoom', `${s.zoom}px`);
    for (const el of [surface, $('preview-viewport')]) {
      el.style.setProperty('--backdrop', s.background); el.classList.toggle('checker', s.checker);
      el.style.backgroundColor = s.background;
    }
    $('pixel-grid').hidden = !s.grid || s.zoom < 4;
    $('preview').style.width = `${project.width * s.previewZoom}px`;
    $('preview').style.height = `${project.height * s.previewZoom}px`;
    renderCursor();
  }
  function put(canvas, data, w = project.width, h = project.height) {
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    canvas.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
  }
  function renderArt() {
    const canvas = $('art'); canvas.width = project.width; canvas.height = project.height;
    const ctx = canvas.getContext('2d');
    const current = C.composite(project);
    let pixels = current;
    if (project.settings.onion && project.frames.length > 1) {
      const previous = C.composite(project, (project.activeFrame + project.frames.length - 1) % project.frames.length);
      pixels = new Uint8ClampedArray(current);
      for (let i = 0; i < previous.length; i += 4) {
        const sourceAlpha = previous[i + 3] / 255 * .35;
        if (!sourceAlpha) continue;
        const destinationAlpha = current[i + 3] / 255;
        const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
        const destinationWeight = destinationAlpha * (1 - sourceAlpha);
        pixels[i] = (96 * sourceAlpha + current[i] * destinationWeight) / outputAlpha;
        pixels[i + 1] = (190 * sourceAlpha + current[i + 1] * destinationWeight) / outputAlpha;
        pixels[i + 2] = (255 * sourceAlpha + current[i + 2] * destinationWeight) / outputAlpha;
        pixels[i + 3] = outputAlpha * 255;
      }
    }
    ctx.putImageData(new ImageData(pixels, project.width, project.height), 0, 0);
  }
  function thumbnail(canvas, data) {
    if (canvas.width !== project.width) canvas.width = project.width;
    if (canvas.height !== project.height) canvas.height = project.height;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.putImageData(new ImageData(data, project.width, project.height), 0, 0);
  }
  function button(text, title, className = '') {
    const b = document.createElement('button'); b.textContent = text; b.title = title; b.className = className; return b;
  }
  function renderTimeline() {
    const table = $('timeline-table'), head = document.createElement('thead'), top = document.createElement('tr');
    const corner = document.createElement('th'); corner.textContent = 'LAYERS / FRAMES'; corner.scope = 'col'; top.append(corner);
    project.frames.forEach((f, fi) => {
      const th = document.createElement('th'); th.scope = 'col';
      const b = button(String(fi + 1).padStart(2, '0'), f.name, `frame-heading${fi === project.activeFrame ? ' active' : ''}`);
      b.dataset.frame = fi; b.setAttribute('aria-label', `Select frame ${fi + 1}: ${f.name}`); th.append(b); top.append(th);
    }); head.append(top);
    const body = document.createElement('tbody');
    for (let li = project.layers.length - 1; li >= 0; li--) {
      const layer = project.layers[li], row = document.createElement('tr'), th = document.createElement('th'); th.scope = 'row';
      const heading = document.createElement('div'); heading.className = `layer-heading${li === project.activeLayer ? ' active' : ''}`;
      const visibility = button(layer.visible ? '◉' : '○', `${layer.visible ? 'Hide' : 'Show'} ${layer.name}`, 'visibility');
      visibility.dataset.visibility = li; visibility.setAttribute('aria-label', visibility.title); visibility.setAttribute('aria-pressed', String(layer.visible));
      const lock = button(layer.locked ? '▣' : '◇', `${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`, 'locking');
      lock.dataset.lock = li; lock.setAttribute('aria-label', lock.title); lock.setAttribute('aria-pressed', String(layer.locked));
      const name = button(layer.name, `Select ${layer.name}`, 'layer-name'); name.dataset.layer = li;
      heading.append(visibility, lock, name); th.append(heading); row.append(th);
      project.frames.forEach((f, fi) => {
        const td = document.createElement('td'), active = fi === project.activeFrame && li === project.activeLayer;
        const b = button('', `Frame ${fi + 1} · ${layer.name}`, `cel${active ? ' active' : ''}`);
        b.dataset.frame = fi; b.dataset.layer = li; b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', String(active));
        const canvas = document.createElement('canvas'); thumbnail(canvas, f.cels[li]); b.append(canvas); td.append(b); row.append(td);
      }); body.append(row);
    }
    const scroll = $('timeline-scroll'), left = scroll.scrollLeft, y = scroll.scrollTop;
    table.replaceChildren(head, body); scroll.scrollLeft = left; scroll.scrollTop = y;
  }
  function schedule(timeline = false) {
    timelineDirty ||= timeline; previewDirty = true;
    if (requested) return; requested = true;
    requestAnimationFrame(() => {
      requested = false; renderArt(); renderBitmap();
      if (timelineDirty) { renderTimeline(); timelineDirty = false; }
      syncControls();
    });
  }
  function finishStroke() {
    if (!stroke) return;
    previousPoint = stroke.finish(); stroke = null;
    if (history.record(beforeStroke, project)) setDirty(); beforeStroke = null;
    schedule(true);
  }
  function mutate(fn, text) {
    finishStroke(); const before = C.clone(project);
    try { fn(); } catch (e) { project = before; throw e; }
    if (history.record(before, project)) setDirty();
    previousPoint = null; schedule(true); if (text) status(text);
  }
  function replaceProject(next, saved = false, name = null) {
    const doc = addDocument(next, saved, name); remember(); setDirty(!saved); schedule(true); return doc;
  }
  function selectCel(fi, li) {
    finishStroke(); project.activeFrame = fi; project.activeLayer = li; previousPoint = null; bitmapLimit = 128;
    if (!playing) previewFrame = fi; schedule(true);
  }
  function undo(redo = false) {
    finishStroke(); const list = redo ? history.redoStack : history.undoStack; if (!list.length) return;
    const previousFrameCount = project.frames.length;
    const currentSettings = { ...project.settings };
    project = redo ? history.redo(project) : history.undo(project);
    // Drawing preferences do not unexpectedly jump backwards with pixel history.
    project.settings = currentSettings;
    if (project.frames.length !== previousFrameCount) { previewFrame = project.activeFrame; previewTime = 0; }
    else previewFrame = Math.min(previewFrame, project.frames.length - 1);
    previousPoint = null; setDirty(); renderLibrary(); remember(); schedule(true); status(redo ? 'Redone.' : 'Undone.');
  }
  function pointAt(event) {
    const rect = $('surface').getBoundingClientRect();
    return { x: Math.max(0, Math.min(project.width - 1, Math.floor((event.clientX - rect.left) / project.settings.zoom))),
      y: Math.max(0, Math.min(project.height - 1, Math.floor((event.clientY - rect.top) / project.settings.zoom))) };
  }
  function renderCursor() {
    const s = project.settings, pencil = ['pencil', 'eraser'].includes(s.tool), size = pencil ? s.brush : 1;
    const a = $('brush-cursor'); a.hidden = !hover;
    if (!hover) return;
    const offset = Math.floor((size - 1) / 2), x = hover.x - offset, y = hover.y - offset;
    const place = (el, left, top) => {
      const x1 = Math.max(0, left), y1 = Math.max(0, top), x2 = Math.min(project.width, left + size), y2 = Math.min(project.height, top + size);
      el.style.left = `${x1 * s.zoom}px`; el.style.top = `${y1 * s.zoom}px`;
      el.style.width = `${(x2 - x1) * s.zoom}px`; el.style.height = `${(y2 - y1) * s.zoom}px`;
    };
    place(a, x, y);
  }
  const surface = $('surface');
  surface.addEventListener('pointerdown', guard(event => {
    const drawingTool = ['pencil', 'eraser'].includes(project.settings.tool);
    if ((event.button !== 0 && !(event.button === 2 && drawingTool)) || stroke) return;
    event.preventDefault(); $('stage').focus({ preventScroll: true });
    const point = pointAt(event), s = project.settings; hover = point;
    if (s.tool === 'picker' || event.altKey) {
      const color = C.getPixel(C.composite(project), project.width, point.x, point.y);
      chooseColor(C.hexColor(color)); status(`Picked ${C.hexColor(color)} at ${point.x}, ${point.y}.`); return;
    }
    C.editable(project);
    if (s.tool === 'fill') { mutate(() => C.fill(project, point.x, point.y, C.parseColor(s.color)), 'Filled the connected area on this cel.'); return; }
    const erase = (s.tool === 'eraser') !== (event.button === 2);
    beforeStroke = C.clone(project);
    stroke = new C.Stroke(project, point, { color: erase ? [0, 0, 0, 0] : C.parseColor(s.color),
      size: s.brush, shift: event.shiftKey, previous: previousPoint });
    surface.setPointerCapture(event.pointerId); schedule();
  }));
  surface.addEventListener('contextmenu', event => event.preventDefault());
  surface.addEventListener('pointermove', guard(event => {
    const point = pointAt(event);
    if (stroke) {
      // Coalesced events retain detail on fast mouse/tablet movement; interpolation fills gaps.
      const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
      for (const e of events) stroke.move(pointAt(e), event.shiftKey);
      stroke.move(point, event.shiftKey); hover = { ...stroke.last }; schedule();
    } else hover = point;
    $('coordinates').textContent = `${hover.x}, ${hover.y}`; renderCursor();
  }));
  surface.addEventListener('pointerup', guard(event => {
    if (stroke) { stroke.move(pointAt(event), event.shiftKey); finishStroke(); }
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  }));
  surface.addEventListener('pointercancel', finishStroke);
  surface.addEventListener('lostpointercapture', finishStroke);
  surface.addEventListener('pointerleave', () => { if (!stroke) { hover = null; renderCursor(); $('coordinates').textContent = '—, —'; } });
  window.addEventListener('blur', finishStroke);
  function fit() {
    const stage = $('stage'), zoom = Math.max(1, Math.min(48, Math.floor(Math.min((stage.clientWidth - 56) / project.width, (stage.clientHeight - 56) / project.height))));
    setting('zoom', zoom); stage.scrollTo(0, 0); status(`Canvas fitted at ${zoom}×.`);
  }
  function openSize(resizing) {
    finishStroke(); resizeMode = resizing; anchor = 4;
    $('size-title').textContent = resizing ? 'Resize canvas' : 'New canvas';
    $('size-description').textContent = resizing ? 'Resize every frame and layer. Enlargement adds transparent padding.' : 'Start with a transparent canvas.';
    $('size-submit').textContent = resizing ? 'Resize canvas' : 'Create canvas'; $('anchors').hidden = !resizing;
    $('width').value = project.width; $('height').value = project.height;
    document.querySelectorAll('[data-anchor]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.anchor) === anchor)));
    $('size-dialog').showModal(); $('width').select();
  }
  const anchorNames = ['Top left', 'Top centre', 'Top right', 'Centre left', 'Centre', 'Centre right', 'Bottom left', 'Bottom centre', 'Bottom right'];
  ['↖', '↑', '↗', '←', '·', '→', '↙', '↓', '↘'].forEach((symbol, i) => {
    const b = button(symbol, anchorNames[i]); b.type = 'button'; b.dataset.anchor = i; b.setAttribute('aria-label', anchorNames[i]);
    b.addEventListener('click', () => { anchor = i; document.querySelectorAll('[data-anchor]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.anchor) === anchor))); });
    $('anchors').querySelector('.anchor-grid').append(b);
  });
  $('size-form').addEventListener('submit', guard(event => {
    event.preventDefault(); const w = Number($('width').value), h = Number($('height').value); C.dimensions(w, h);
    if (resizeMode) {
      const cropped = C.croppedPixels(project, w, h, anchor);
      if (cropped && !confirm(`This resize discards ${cropped} non-transparent stored pixels across all frames and layers (including hidden or locked layers). Continue?`)) return;
      mutate(() => C.resize(project, w, h, anchor), `Canvas resized to ${w} × ${h}. Undo restores cropped artwork.`);
    } else {
      const next = C.createProject(w, h); next.settings = { ...project.settings, onion: false }; next.customPalettes = project.customPalettes; next.name = uniqueUntitled();
      replaceProject(next, true); status(`New transparent ${w} × ${h} canvas.`);
    }
    $('size-dialog').close(); fit();
  }));
  function on(id, fn, event = 'click') { $(id).addEventListener(event, guard(fn)); }
  on('new', () => openSize(false)); on('resize', () => openSize(true));
  $('document-tabs').addEventListener('click', guard(event => { const select = event.target.closest('[data-doc]'), close = event.target.closest('[data-close-doc]'); if (select) { const doc = documents.find(d => d.id === select.dataset.doc); if (doc && doc !== activeDocument) activate(doc); } else if (close) closeDocument(close.dataset.closeDoc); }));
  $('document-tabs').addEventListener('dragstart', event => {
    const tab = event.target.closest('[data-tab-id]'); if (!tab) return;
    draggedTabId = tab.dataset.tabId; event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedTabId); tab.classList.add('dragging');
  });
  $('document-tabs').addEventListener('dragover', event => {
    const tab = event.target.closest('[data-tab-id]'); if (!draggedTabId || !tab || tab.dataset.tabId === draggedTabId) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    const after = event.clientX > tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2;
    document.querySelectorAll('.document-tab.drop-before,.document-tab.drop-after').forEach(el => el.classList.remove('drop-before','drop-after'));
    tab.classList.add(after ? 'drop-after' : 'drop-before');
  });
  $('document-tabs').addEventListener('drop', event => {
    const tab = event.target.closest('[data-tab-id]'); if (!draggedTabId || !tab) return;
    event.preventDefault();
    const rect = tab.getBoundingClientRect(), after = event.clientX > rect.left + rect.width / 2;
    documents = C.reorderDocuments(documents, draggedTabId, tab.dataset.tabId, after); draggedTabId = null;
    renderTabs();
  });
  $('document-tabs').addEventListener('dragend', () => {
    draggedTabId = null; document.querySelectorAll('.document-tab.dragging,.document-tab.drop-before,.document-tab.drop-after').forEach(el => el.classList.remove('dragging','drop-before','drop-after'));
  });
  on('help', () => $('help-dialog').showModal());
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).close()));
  document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => { finishStroke(); setting('tool', b.dataset.tool); }));
  on('brush-number', () => {
    const field = $('brush-number'), value = Number(field.value);
    if (!field.value || !Number.isFinite(value)) { field.value = project.settings.brush; return; }
    setting('brush', Math.max(1, Math.min(8, Math.round(value))));
  }, 'change');
  for (const id of ['grid', 'onion', 'checker']) on(id, () => setting(id, $(id).checked), 'change');
  on('background', () => setting('background', $('background').value), 'input');
  on('reset-backdrop', () => {
    project.settings.background = C.defaults().background;
    project.settings.checker = true;
    remember(); syncControls(); schedule();
  });
  on('color-picker', () => chooseColor($('color-picker').value + C.parseColor(project.settings.color)[3].toString(16).padStart(2, '0')), 'input');
  on('alpha', () => chooseColor(project.settings.color.slice(0, 7) + Number($('alpha').value).toString(16).padStart(2, '0')), 'input');
  on('hex', () => {
    try { chooseColor($('hex').value); } catch (e) { $('hex').value = project.settings.color; throw e; }
  }, 'change');
  for (const id of ['bitmap-palette', 'library-palette']) on(id, e => { const b = e.target.closest('[data-color]'); if (b) chooseColor(b.dataset.color); });
  on('bitmap-more', () => { bitmapLimit += 128; renderBitmap(); });
  on('palette-select', () => { setting('palette', $('palette-select').value); renderLibrary(); }, 'change');
  on('arrangement', () => { setting('arrangement', $('arrangement').value); renderLibrary(); }, 'change');
  on('flip', () => mutate(() => C.flip(project), 'Flipped the selected layer in this frame.'));
  on('timeline-toggle', () => setting('timeline', !project.settings.timeline));
  for (let n = 1; n <= 48; n++) { const option = document.createElement('option'); option.value = n; option.textContent = `${n * 100}%`; $('zoom').append(option); }
  // Project format accepts every integer preview zoom, including values set by older files.
  $('preview-zoom').replaceChildren(...Array.from({ length: 16 }, (_, i) => { const o = document.createElement('option'); o.value = i + 1; o.textContent = i + 1; return o; }));
  on('zoom', () => setting('zoom', Number($('zoom').value)), 'change');
  on('preview-zoom', () => setting('previewZoom', Number($('preview-zoom').value)), 'change');
  on('zoom-in', () => setting('zoom', Math.min(48, project.settings.zoom + 1)));
  on('zoom-out', () => setting('zoom', Math.max(1, project.settings.zoom - 1))); on('fit', fit);
  on('add-frame', () => mutate(() => C.addFrame(project), 'Added a transparent frame.'));
  on('duplicate-frame', () => mutate(() => C.addFrame(project, true), 'Duplicated all layers in this frame.'));
  on('delete-frame', () => {
    if (!confirm('Delete the selected frame, including every layer?')) return;
    const deletedIndex = project.activeFrame;
    mutate(() => C.deleteFrame(project), 'Frame deleted.');
    previewFrame = C.frameIndexAfterDeletion(previewFrame, deletedIndex, project.frames.length);
    previewTime = 0; previewDirty = true;
  });
  on('add-layer', () => mutate(() => C.addLayer(project), 'Added a layer across every frame.'));
  on('rename-layer', () => {
    const name = prompt('Layer name:', project.layers[project.activeLayer].name); if (name === null) return;
    if (!name.trim() || name.length > 160) throw new Error('Layer names need 1–160 characters.');
    mutate(() => { project.layers[project.activeLayer].name = name.trim(); }, 'Layer renamed.');
  });
  on('delete-layer', () => { if (confirm('Delete this layer across every frame?')) mutate(() => C.deleteLayer(project), 'Layer deleted across all frames.'); });
  on('merge-layer', () => {
    if (!project.activeLayer) return;
    const layers = project.layers.slice(project.activeLayer - 1, project.activeLayer + 1);
    if (layers.some(l => l.locked)) throw new Error('Unlock both layers before merging.');
    if (layers[0].visible !== layers[1].visible && !confirm('One layer is hidden. Merge preserves the visible result and discards the hidden layer’s pixels across all frames. Continue?')) return;
    mutate(() => C.mergeDown(project), 'Merged down across all frames. Undo restores both layers.');
  });
  on('timeline-table', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.visibility !== undefined) {
      const li = Number(b.dataset.visibility); mutate(() => { project.layers[li].visible = !project.layers[li].visible; });
    } else if (b.dataset.lock !== undefined) {
      const li = Number(b.dataset.lock); mutate(() => { project.layers[li].locked = !project.layers[li].locked; });
    } else selectCel(b.dataset.frame === undefined ? project.activeFrame : Number(b.dataset.frame), b.dataset.layer === undefined ? project.activeLayer : Number(b.dataset.layer));
  });
  on('fps', () => {
    try { const fps = C.integer(Number($('fps').value), 1, 60, 'FPS'); mutate(() => { project.fps = fps; }); previewTime = 0; }
    catch (e) { $('fps').value = project.fps; throw e; }
  }, 'change');
  function togglePlay() {
    playing = !playing; previewTime = 0;
    if (!playing) previewFrame = project.activeFrame; previewDirty = true;
    $('play').textContent = playing ? 'Ⅱ Pause' : '▶ Play'; $('play').setAttribute('aria-pressed', String(playing));
  }
  on('play', togglePlay);
  function tick(time) {
    previewFrame = Math.min(previewFrame, project.frames.length - 1);
    if (playing && project.frames.length > 1 && !busy) {
      if (!previewTime) previewTime = time;
      const steps = Math.floor((time - previewTime) / (1000 / project.fps));
      if (steps) { previewFrame = (previewFrame + steps) % project.frames.length; previewTime += steps * 1000 / project.fps; previewDirty = true; }
    }
    if (previewDirty) {
      put($('preview'), C.composite(project, previewFrame)); $('preview-frame').textContent = `${previewFrame + 1} / ${project.frames.length}`; previewDirty = false;
    }
    requestAnimationFrame(tick);
  }
  async function withBusy(fn) {
    if (busy) return; finishStroke(); busy = true; document.body.inert = true; status('Reading local file…');
    let error;
    try { await fn(); } catch (e) { error = e; }
    finally { busy = false; document.body.inert = false; }
    if (error) message(error);
  }
  function checkFile(file, limit) { if (file.size > limit * 1024 * 1024) throw new Error(`${file.name} exceeds ${limit} MiB.`); }
  async function openPNGFiles(inputFiles, mode = 'open', targetDoc = null, sourcePaths = []) {
    const files = F.naturalOrder([...inputFiles].map((file, index) => ({ file, name: file.name, sourcePath: sourcePaths[index] || null })));
    if (!files.length) return;
    if (files.length > 256) throw new Error('Import at most 256 frames at a time.');
    const images = [];
    for (const item of files) {
      checkFile(item.file, 50);
      images.push({ ...await PNG.decode(await item.file.arrayBuffer()), name: item.name, sourceName: item.name, sourcePath: item.sourcePath });
    }
    const target = targetDoc && documents.includes(targetDoc) ? targetDoc : activeDocument;
    if (mode === 'append' && target && target !== activeDocument) activate(target);
    const next = F.importFrames(C.clone(project), images, mode === 'open');
    if (mode === 'open') {
      next.settings.onion = false;
      const name = files.length === 1 ? files[0].name.replace(/\.png$/i, '') : `${files[0].name.replace(/\.png$/i, '')}-seq`;
      replaceProject(next, true, name); fit();
    } else mutate(() => { project = next; }, `Imported ${images.length} frame(s) in natural filename order.`);
    status(`Imported ${images.length} PNG frame(s), ${images[0].width} × ${images[0].height}.`);
  }
  async function openProjectFiles(inputFiles, sourcePaths = []) {
    const files = [...inputFiles]; if (!files.length) return;
    if (files.length > 128) throw new Error('Open at most 128 Pixr documents at a time.');
    for (const [index, file] of files.entries()) {
      checkFile(file, 64); const next = F.deserialize(await file.text());
      const doc = replaceProject(next, true, file.name.replace(/\.(pixr|json|pixelworkshop)$/i, ''));
      doc.filePath = sourcePaths[index] || null;
    }
    status(`Opened ${files.length} Pixr document${files.length === 1 ? '' : 's'}.`);
  }
  on('open-files', () => requestFiles($('open-files-input')));
  $('open-files-input').addEventListener('change', event => {
    const files = [...event.target.files], sourcePaths = event.target.__pixrSourcePaths || [];
    event.target.value = ''; event.target.__pixrSourcePaths = []; if (!files.length) return;
    const pngs = files.filter(file => /\.png$/i.test(file.name) || file.type === 'image/png');
    const projects = files.filter(file => /\.(pixr|json|pixelworkshop)$/i.test(file.name) && !pngs.includes(file));
    void withBusy(async () => {
      if (pngs.length + projects.length !== files.length) throw new Error('Open PNG images or Pixr project files.');
      if (pngs.length) await openPNGFiles(pngs, 'open', null, pngs.map(file => sourcePaths[files.indexOf(file)]));
      if (projects.length) await openProjectFiles(projects, projects.map(file => sourcePaths[files.indexOf(file)]));
    });
  });
  function hasFiles(event) { return [...(event.dataTransfer?.types || [])].includes('Files'); }
  document.addEventListener('dragenter', event => {
    if (hasFiles(event)) { event.preventDefault(); document.body.classList.add('file-drop'); }
  });
  document.addEventListener('dragover', event => {
    if (hasFiles(event)) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
  });
  document.addEventListener('dragleave', event => {
    if (hasFiles(event) && (!event.relatedTarget || !document.documentElement.contains(event.relatedTarget))) document.body.classList.remove('file-drop');
  });
  document.addEventListener('drop', event => {
    document.body.classList.remove('file-drop');
    if (!hasFiles(event)) return;
    event.preventDefault();
    const dropped = [...event.dataTransfer.files], pngs = dropped.filter(file => /\.png$/i.test(file.name) || file.type === 'image/png');
    const projects = dropped.filter(file => /\.(pixr|json|pixelworkshop)$/i.test(file.name) && !pngs.includes(file));
    const unsupported = dropped.filter(file => !pngs.includes(file) && !projects.includes(file));
    if (!pngs.length && !projects.length) { message(new Error('Drop PNG images or Pixr project files to open them.')); return; }
    void withBusy(async () => {
      if (unsupported.length) throw new Error(`Unsupported dropped file: ${unsupported[0].name}. Drop PNG images or Pixr project files.`);
      if (pngs.length) await openPNGFiles(pngs, 'open');
      if (projects.length) await openProjectFiles(projects);
    });
  });
  function safeName(name) { return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().slice(0, 100) || 'pixr'; }
  async function saveDocument(doc = activeDocument, saveAs = false) {
    if (!doc) return false;
    finishStroke(); storeActive();
    const contents = F.serialize(doc.project), filename = `${safeName(doc.project.name)}${F.PROJECT_EXTENSION}`;
    try {
      const result = await F.download(contents, filename, 'application/json', { savePath: saveAs ? '' : (doc.filePath || ''), saveAs });
      const ok = typeof result === 'object' ? result.ok : result;
      if (ok) { if (typeof result === 'object' && result.path) doc.filePath = result.path; doc.dirty = false; if (doc === activeDocument) setDirty(false); else renderTabs(); status(`Saved ${doc.project.name}.`); }
      return !!ok;
    } catch (e) { message(e); return false; }
  }
  function saveProject() { return saveDocument(activeDocument); }
  function saveProjectAs() { return saveDocument(activeDocument, true); }
  async function closeDocument(id) {
    const doc = documents.find(d => d.id === id); if (!doc) return;
    if (doc === activeDocument) { finishStroke(); storeActive(); }
    if (doc.dirty) {
      const choice = await askClose(doc.project.name);
      if (choice === 'cancel') return;
      if (choice === 'save' && !(await saveDocument(doc))) return;
    }
    if (doc === activeDocument) finishStroke();
    const index = documents.indexOf(doc); documents.splice(index, 1);
    if (!documents.length) { const fresh = C.createProject(); fresh.name = uniqueUntitled(); addDocument(fresh, true); }
    else if (doc === activeDocument) activate(documents[Math.min(index, documents.length - 1)]);
    else renderTabs();
  }
  function askClose(name) {
    return new Promise(resolve => {
      const dialog = $('close-dialog'); $('close-document-name').textContent = name;
      const done = value => { dialog.close(); dialog.removeEventListener('close', cancelled); resolve(value); };
      const cancelled = () => resolve('cancel');
      dialog.addEventListener('close', cancelled, { once: true });
      dialog.querySelector('[data-choice="save"]').onclick = () => done('save');
      dialog.querySelector('[data-choice="discard"]').onclick = () => done('discard');
      dialog.querySelector('[data-choice="cancel"]').onclick = () => done('cancel');
      dialog.showModal();
    });
  }
  on('save-project', saveProject); on('save-as', saveProjectAs);
  function exportImage(sheet) {
    finishStroke(); const img = sheet ? F.spriteSheet(project) : { width: project.width, height: project.height, data: C.composite(project) };
    const frame = sheet ? null : project.frames[project.activeFrame];
    const originalPNGName = frame?.sourceName || (/\.png$/i.test(frame?.name || '') ? frame.name : null);
    const filename = safeName(originalPNGName || `${safeName(project.name)}-${sheet ? 'sheet' : 'frame-' + (project.activeFrame + 1)}.png`);
    const sourcePath = frame?.sourcePath || '';
    const directory = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
    F.download(PNG.encode(img.width, img.height, img.data), filename, 'image/png', { directory });
    $('export-menu').open = false; status(`Exported ${img.width} × ${img.height} transparent PNG. Editing layers are intact.`);
  }
  on('export-png', () => exportImage(false)); on('export-sheet', () => exportImage(true));
  on('export-palette', () => {
    const pal = selectedPalette(); F.download(JSON.stringify({ name: pal.name, colors: pal.colors }, null, 2), `${safeName(pal.name)}.palette.json`, 'application/json');
    $('export-menu').open = false; status('Selected palette exported to JSON.');
  });
  on('import-palette', () => $('palette-file').click());
  $('palette-file').addEventListener('change', event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    void withBusy(async () => {
      checkFile(file, 2); if (project.customPalettes.length >= 128) throw new Error('The custom palette library is full (128 palettes).');
      const pal = P.parse(await file.text(), file.name), id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      mutate(() => { project.customPalettes.push({ id, ...pal }); project.settings.palette = id; }, `Imported ${pal.name}.`);
      renderLibrary(); remember();
    });
  });
  on('delete-palette', () => {
    const pal = selectedPalette(); if (!pal.id.startsWith('custom-')) return;
    if (!confirm(`Delete the custom palette “${pal.name}”? Artwork colours will stay intact.`)) return;
    mutate(() => { project.customPalettes = project.customPalettes.filter(p => p.id !== pal.id); project.settings.palette = 'zx'; }, 'Custom palette deleted.');
    renderLibrary(); remember();
  });
  window.addEventListener('beforeunload', event => { if (documents.some(doc => doc.dirty)) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('keydown', guard(event => {
    if (document.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
    const key = event.key.toLowerCase(), mod = event.metaKey || event.ctrlKey;
    if (nativeBridge() && mod && ['z', 'y'].includes(key)) return;
    if (mod && ['z', 'y', 's', 'o'].includes(key)) {
      event.preventDefault();
      if (key === 'z' || key === 'y') undo(event.shiftKey || key === 'y');
      else if (key === 's') saveProject(); else requestFiles($('open-files-input')); return;
    }
    if (nativeBridge() && mod && key === 'n') { event.preventDefault(); openSize(false); return; }
    if (nativeBridge() && mod && key === 'w') { event.preventDefault(); closeDocument(activeDocument.id); return; }
    if (nativeBridge() && event.ctrlKey && key === 'tab' && documents.length > 1) { event.preventDefault(); const i = documents.indexOf(activeDocument), step = event.shiftKey ? -1 : 1; activate(documents[(i + documents.length + step) % documents.length]); return; }
    if (mod || event.altKey || stroke) return;
    const tools = { b: 'pencil', e: 'eraser', f: 'fill', i: 'picker' };
    if (tools[key]) {
      event.preventDefault(); setting('tool', tools[key]);
      if (document.activeElement === $('stage')) $('stage').blur();
    }
    else if (key === 'g') setting('grid', !project.settings.grid);
    else if (key === 'h') mutate(() => C.flip(project), 'Flipped the current cel horizontally.');
    else if (key === '[' || key === ']') setting('brush', Math.max(1, Math.min(8, project.settings.brush + (key === ']' ? 1 : -1))));
    else if (key === ' ') { event.preventDefault(); togglePlay(); }
    else if (['+', '=', '-'].includes(key)) { event.preventDefault(); setting('zoom', Math.max(1, Math.min(48, project.settings.zoom + (key === '-' ? -1 : 1)))); }
    else if (key === '0') { event.preventDefault(); fit(); }
    else if (key === 'arrowleft' || key === 'arrowright') { event.preventDefault(); selectCel((project.activeFrame + project.frames.length + (key === 'arrowright' ? 1 : -1)) % project.frames.length, project.activeLayer); }
  }));
  document.addEventListener('click', event => { if (!$('export-menu').contains(event.target)) $('export-menu').open = false; });
  renderTabs(); renderLibrary(); syncControls(); remember(); setDirty(false); schedule(true); requestAnimationFrame(tick);
})();

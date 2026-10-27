'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = path => fs.readFileSync(path, 'utf8');
const html = read('index.html'), app = read('js/app.js'), core = read('js/core.js');
const swift = read('macos/PixrApp.swift');
const cases = [
  ['four icon-only accessible tools', () => {
    const tools = [...html.matchAll(/<button data-tool="([^"]+)"[^>]*>(.*?)<\/button>/gs)];
    assert.deepEqual(tools.map(x => x[1]), ['pencil', 'eraser', 'fill', 'picker']);
    assert(tools.every(x => /aria-label=/.test(x[0]) && /title=/.test(x[0]) && !/<kbd>|Pencil<|Eraser<|Fill<|Pick</.test(x[0])));
  }],
  ['brush input is numeric, 1–8, and placed before Grid', () => {
    assert.match(html, /class="brush-control"[^>]*>Brush size <input id="brush-number" type="number" min="1" max="8"/);
    assert(html.indexOf('id="brush-number"') < html.indexOf('id="grid"'));
    assert(!/id="brush"|brush-sample|SQUARE BRUSH/.test(html));
    assert.match(app, /Math\.max\(1, Math\.min\(8, Math\.round\(value\)\)\)/);
  }],
  ['Mirror X controls and behavior are removed; legacy data is ignored', () => {
    assert(!/id="mirror"|mirror-cursor|setting\('mirror'/.test(html + app));
    assert(!/mirror/.test(core));
    assert.match(core, /for \(const key of \['grid', 'onion', 'checker', 'timeline'\]\)/);
  }],
  ['preferences footer is absent and bottom status bar remains', () => {
    assert(!/storage-status|storage-note/.test(html));
    assert.match(html, /<footer class="statusbar"><span id="status"/);
  }],
  ['browser Flip Cell and Resize Canvas follow Export', () => {
    const exportIndex = html.indexOf('id="export-menu"'), flipIndex = html.indexOf('id="flip"'), resizeIndex = html.indexOf('id="resize"');
    assert(exportIndex >= 0 && exportIndex < flipIndex && flipIndex < resizeIndex);
    assert.match(html, /class="button-group image-actions"/);
    assert(!/native-app[^\n]*filebar/.test(html));
  }],
  ['Undo/Redo toolbar controls are absent and shortcuts remain tab-local', () => {
    assert(!/id="undo"|id="redo"/.test(html));
    assert.match(app, /if \(nativeBridge\(\) && mod && \['z', 'y'\]\.includes\(key\)\) return/);
    assert.match(app, /const list = redo \? history\.redoStack : history\.undoStack/);
  }],
  ['tool shortcuts clear focus from the canvas container', () => {
    assert.match(app, /if \(document\.activeElement === \$\('stage'\)\) \$\('stage'\)\.blur\(\)/);
    assert.match(read('style.css'), /#stage:focus-visible/);
  }],
  ['native Edit and Image menus dispatch through Pixr command bridge', () => {
    assert.match(swift, /NSMenu\(title: "Edit"\)/); assert.match(swift, /title: "Undo"/); assert.match(swift, /title: "Redo"/);
    assert.match(swift, /NSMenu\(title: "Image"\)/); assert.match(swift, /title: "Flip Cell"/); assert.match(swift, /title: "Resize Canvas…"/);
    assert.match(swift, /window\.PixrNative\.command/); assert.match(app, /if \(action === 'undo'\) undo\(\)/);
  }],
  ['native Web actions toolbar remains hidden', () => assert.match(read('style.css'), /\.native-app \.filebar \{ display:none \}/)],
  ['compact rail stays centered at standard and narrow breakpoints', () => {
    const css = read('style.css');
    assert.match(css, /grid-template-columns:56px minmax\(0,1fr\) 284px/);
    assert.match(css, /grid-template-columns:56px minmax\(0,1fr\) 258px/);
    assert.match(css, /\.tools \{[^}]*padding:12px 8px[^}]*align-items:center/s);
    assert.match(css, /\.tool-list button \{[^}]*width:38px[^}]*height:38px/s);
  }],
];
let failed = 0;
for (const [name, run] of cases) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.message}`); }
}
console.log(`${cases.length - failed}/${cases.length} interface checks passed.`);
if (failed) process.exitCode = 1;

/* The same assertions run in Node and directly in each browser via tests/index.html. */
(function (root) {
  'use strict';
  const C = root.PixelCore || require('../js/core.js'), P = root.PixelPalettes || require('../js/palettes.js');
  const F = root.PixelFiles || require('../js/files.js'), PNG = root.PixelPNG || require('../js/png.js');
  const fixtures = root.PixelFixtures || require('./fixtures.js'), cases = [];
  const test = (name, fn) => cases.push({ name, fn });
  const eq = (a, b, why = '') => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${why} Expected ${JSON.stringify(b).slice(0, 150)}, received ${JSON.stringify(a).slice(0, 150)}.`);
  };
  const ok = (a, why = 'Assertion failed') => { if (!a) throw new Error(why); };
  const throws = (fn, pattern) => { let error; try { fn(); } catch (e) { error = e; } ok(error && (!pattern || pattern.test(error.message)), 'Expected a clear validation error.'); };
  const red = [255, 0, 0, 255], blue = [0, 0, 255, 255], clear = [0, 0, 0, 0];
  const pixel = (p, x, y, frame = p.activeFrame, layer = p.activeLayer) => C.getPixel(p.frames[frame].cels[layer], p.width, x, y);
  const paint = (p, x, y, color = red, size = 1) => C.stamp(C.editable(p), p.width, p.height, x, y, color, size);
  const count = data => Array.from(data).filter((_, i) => i % 4 === 3).filter(Boolean).length;
  test('Rectangular, single-pixel and maximum canvas dimensions', () => {
    for (const [w, h] of [[1, 1], [1, 256], [47, 19], [256, 256]]) {
      const p = C.createProject(w, h); eq(p.frames[0].cels[0].length, w * h * 4); eq(count(C.composite(p)), 0);
    }
    for (const [w, h] of [[0, 1], [257, 1], [3.5, 4], [4, NaN]]) throws(() => C.createProject(w, h));
    throws(() => C.dimensions(256, 256, 256, 64), /limit/);
  });
  test('Pencil and eraser replace exact RGBA pixels', () => {
    const p = C.createProject(7, 3); paint(p, 6, 2, [51, 22, 129, 83]); eq(pixel(p, 6, 2), [51, 22, 129, 83]);
    eq(pixel(p, 5, 2), clear); paint(p, 6, 2, clear); eq(count(C.composite(p)), 0);
  });
  for (let size = 1; size <= 8; size++) test(`Square brush ${size} × ${size}, anchoring and clipped edges`, () => {
    const p = C.createProject(21, 19), offset = Math.floor((size - 1) / 2);
    paint(p, 10, 9, red, size); eq(count(C.composite(p)), size * size);
    eq(pixel(p, 10 - offset, 9 - offset), red); eq(pixel(p, 10 - offset + size - 1, 9 - offset + size - 1), red);
    eq(pixel(p, 10 - offset - 1, 9), clear);
    paint(p, 10, 9, clear, size); eq(count(C.composite(p)), 0);
    paint(p, 0, 0, red, size); eq(count(C.composite(p)), (size - offset) ** 2);
  });
  test('Continuous fast strokes have no gaps', () => {
    const p = C.createProject(31, 13); C.drawLine(C.editable(p), 31, 13, { x: 0, y: 6 }, { x: 30, y: 6 }, red, 1);
    eq(count(C.composite(p)), 31); for (let x = 0; x < 31; x++) eq(pixel(p, x, 6), red);
  });
  for (let size = 1; size <= 8; size++) test(`Shift-drag axis locking with ${size} px brush`, () => {
    const p = C.createProject(30, 30), s = new C.Stroke(p, { x: 8, y: 9 }, { color: red, size, shift: true, previous: { x: 0, y: 0 } });
    s.move({ x: 15, y: 10 }, true); s.move({ x: 18, y: 25 }, true); s.finish();
    const o = Math.floor((size - 1) / 2); eq(s.last, { x: 18, y: 9 });
    eq(count(C.composite(p)), (11 + size - 1) * size);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
      const affected = x >= 8-o && x <= 18-o+size-1 && y >= 9-o && y < 9-o+size;
      eq(pixel(p, x, y), affected ? red : clear, `Unexpected neighbour at ${x},${y}`);
    }
  });
  test('Shift-click connects the previous endpoint; Shift-drag does not', () => {
    const p = C.createProject(10, 8), s = new C.Stroke(p, { x: 8, y: 6 }, { color: red, shift: true, previous: { x: 1, y: 6 } });
    eq(count(C.composite(p)), 0); s.finish(); eq(count(C.composite(p)), 8);
    const q = C.createProject(10, 8), d = new C.Stroke(q, { x: 8, y: 1 }, { color: red, shift: true, previous: { x: 0, y: 7 } });
    d.move({ x: 7, y: 6 }, true); d.finish(); eq(d.last, { x: 8, y: 6 }); eq(pixel(q, 0, 7), clear); eq(count(C.composite(q)), 6);
  });
  test('Flood fill respects connected RGBA regions and ignores brush size', () => {
    const p = C.createProject(5, 3); p.settings.brush = 8;
    C.drawLine(C.editable(p), 5, 3, { x: 2, y: 0 }, { x: 2, y: 2 }, red);
    C.fill(p, 0, 0, blue); eq(count(C.composite(p)), 9); eq(pixel(p, 1, 2), blue); eq(pixel(p, 3, 0), clear);
    C.fill(p, 0, 0, blue); eq(count(C.composite(p)), 9);
    C.fill(p, 4, 2, [255, 0, 0, 64]); eq(pixel(p, 4, 0), [255, 0, 0, 64]);
  });
  test('Flip cell reflects artwork without changing canvas dimensions', () => {
    const p = C.createProject(7, 3); paint(p, 0, 1); C.flip(p); eq(pixel(p, 6, 1), red); eq(pixel(p, 0, 1), clear);
  });
  test('Undo/redo stores whole strokes; new edits clear redo', () => {
    let p = C.createProject(8, 3); const h = new C.History(), before = C.clone(p);
    const s = new C.Stroke(p, { x: 0, y: 1 }, { color: red }); s.move({ x: 7, y: 1 }); s.finish();
    ok(h.record(before, p)); eq(h.undoStack.length, 1); p = h.undo(p); eq(count(C.composite(p)), 0);
    p = h.redo(p); eq(count(C.composite(p)), 8); p = h.undo(p);
    const old = C.clone(p); paint(p, 5, 2); h.record(old, p); eq(h.redoStack.length, 0);
    eq(h.record(C.clone(p), p), false);
  });
  for (let anchor = 0; anchor < 9; anchor++) test(`Resize anchor ${anchor}: enlargement, cropping and exact undo`, () => {
    let p = C.createProject(3, 5); paint(p, 1, 2, [10, 20, 30, 99]); C.addFrame(p, true); C.addLayer(p); paint(p, 0, 0, blue);
    const before = C.clone(p), history = new C.History(); C.resize(p, 7, 9, anchor);
    const dx = (anchor % 3) * 2, dy = Math.floor(anchor / 3) * 2;
    eq(pixel(p, 1+dx, 2+dy, 0, 0), [10,20,30,99]); eq(pixel(p, dx, dy, 1, 1), blue);
    eq(count(p.frames[0].cels[1]), 0); history.record(before, p); p = history.undo(p);
    eq(F.serialize(p), F.serialize(before));
    eq(C.croppedPixels(p, 1, 1, anchor), anchor === 0 ? 2 : anchor === 4 ? 1 : 3);
    C.resize(p, 1, 1, anchor); eq(p.frames[1].cels[1].length, 4);
  });
  test('Odd centred resize uses floor offsets without resampling', () => {
    const p = C.createProject(4, 4); paint(p, 1, 1); C.resize(p, 3, 3, 4); eq(pixel(p, 0, 0), red);
    C.resize(p, 4, 4, 4); eq(pixel(p, 0, 0), red); eq(count(C.composite(p)), 1);
  });
  function frameFixture() {
    const p = C.createProject(3, 2, 'Frame test'); C.addLayer(p);
    p.frames[0].name = 'first'; paint(p, 0, 0, red, 1, false); p.activeLayer = 1; paint(p, 1, 0, blue);
    C.addFrame(p); p.frames[1].name = 'middle'; p.activeLayer = 0; paint(p, 2, 0, [0,255,0,255]); p.activeLayer = 1; paint(p, 2, 1, [255,255,0,255]);
    C.addFrame(p); p.frames[2].name = 'last'; p.activeLayer = 0; paint(p, 0, 1, [255,0,255,255]); p.activeLayer = 1; paint(p, 1, 1, [0,255,255,255]);
    return p;
  }
  const storedFrames = p => p.frames.map(f => ({ name: f.name, cels: f.cels.map(c => Array.from(c)) }));
  test('Frames duplicate deeply and remain isolated; blank frames have every layer', () => {
    const p = C.createProject(3, 2); paint(p, 1, 1); C.addLayer(p); paint(p, 0, 0, blue); C.addFrame(p, true);
    paint(p, 0, 0, clear); eq(pixel(p, 0, 0, 0, 1), blue); eq(pixel(p, 0, 0, 1, 1), clear);
    C.addFrame(p); eq(p.frames[2].cels.length, 2); eq(count(C.composite(p)), 0); C.deleteFrame(p); eq(p.frames.length, 2);
  });
  test('Inserting a blank frame preserves the populated frame and its cels', () => {
    const p = C.createProject(3, 2); paint(p, 1, 1, red); const original = p.frames[0].cels[0].slice();
    C.addFrame(p);
    eq(p.activeFrame, 1); eq(p.frames[0].cels[0], original); eq(count(C.composite(p, 0)), 1); eq(count(C.composite(p, 1)), 0);
  });
  test('Deleting the first frame removes all its cels and selects the next frame', () => {
    const p = frameFixture(), before = storedFrames(p), layers = JSON.stringify(p.layers); p.activeFrame = 0;
    C.deleteFrame(p);
    eq(p.frames.length, 2); eq(p.activeFrame, 0); eq(storedFrames(p), before.slice(1)); eq(JSON.stringify(p.layers), layers);
  });
  test('Deleting a middle frame preserves both neighbours and selects the next', () => {
    const p = frameFixture(), before = storedFrames(p), layers = JSON.stringify(p.layers); p.activeFrame = 1;
    C.deleteFrame(p);
    eq(p.frames.length, 2); eq(p.activeFrame, 1); eq(storedFrames(p), [before[0], before[2]]); eq(JSON.stringify(p.layers), layers);
  });
  test('Deleting the final frame preserves earlier frames and selects the previous', () => {
    const p = frameFixture(), before = storedFrames(p), layers = JSON.stringify(p.layers); p.activeFrame = 2;
    C.deleteFrame(p);
    eq(p.frames.length, 2); eq(p.activeFrame, 1); eq(storedFrames(p), before.slice(0, 2)); eq(JSON.stringify(p.layers), layers);
  });
  test('Only frame cannot be deleted and failed deletion changes nothing', () => {
    const p = C.createProject(2, 3, 'Keep me'); paint(p, 1, 2); const before = F.serialize(p);
    throws(() => C.deleteFrame(p), /at least one frame/); eq(F.serialize(p), before);
  });
  test('Frame deletion undo and redo restore the complete selected frame structure', () => {
    let p = frameFixture(); p.activeFrame = 1; const before = F.serialize(p), history = new C.History();
    C.deleteFrame(p); history.record(F.deserialize(before), p); const after = F.serialize(p);
    p = history.undo(p); eq(F.serialize(p), before); p = history.redo(p); eq(F.serialize(p), after);
    eq(p.frames.length, 2); eq(p.activeFrame, 1); eq(p.layers.length, 2);
  });
  test('Playback preview index stays on a surviving frame across deletions', () => {
    const p = frameFixture(); let previewFrame = 2;
    const lastFrame = storedFrames(p)[previewFrame]; p.activeFrame = 0; const removed = p.activeFrame;
    C.deleteFrame(p); previewFrame = C.frameIndexAfterDeletion(previewFrame, removed, p.frames.length);
    eq([p.frames.length, previewFrame], [2, 1]); eq(storedFrames(p)[previewFrame], lastFrame);
    p.activeFrame = 1; const removedFinal = p.activeFrame;
    const adjacentFrame = storedFrames(p)[0];
    C.deleteFrame(p); previewFrame = C.frameIndexAfterDeletion(previewFrame, removedFinal, p.frames.length);
    eq([p.frames.length, previewFrame], [1, 0]); eq(storedFrames(p)[previewFrame], adjacentFrame);
    eq(C.frameIndexAfterDeletion(0, 1, 2), 0); eq(C.frameIndexAfterDeletion(1, 1, 2), 1);
  });
  test('Layers share definitions; locking and visibility prevent drawing', () => {
    const p = C.createProject(3, 2); C.addFrame(p); C.addLayer(p); eq(p.frames.map(f => f.cels.length), [2, 2]);
    p.layers[1].locked = true; throws(() => paint(p, 0, 0), /locked/); p.layers[1].locked = false;
    p.layers[1].visible = false; throws(() => paint(p, 0, 0), /hidden/); C.deleteLayer(p); eq(p.frames.map(f => f.cels.length), [1, 1]);
  });
  test('Source-over alpha and Merge Down agree across all frames', () => {
    const p = C.createProject(3, 2); paint(p, 1, 0, [255,0,0,128]); C.addFrame(p, true); C.addLayer(p);
    paint(p, 1, 0, [0,0,255,128]); p.activeFrame = 0; paint(p, 1, 0, [0,255,0,255]);
    const before = p.frames.map((_, i) => Array.from(C.composite(p, i)));
    eq(C.getPixel(C.composite(p, 1), 3, 1, 0), [85,0,170,192]); C.mergeDown(p);
    eq(p.frames.map((_, i) => Array.from(C.composite(p, i))), before); eq(p.layers.length, 1);
  });
  test('Merge respects hidden layers and locked destinations', () => {
    for (const flags of [[true,false], [false,true], [false,false]]) {
      const p = C.createProject(1, 1); paint(p, 0, 0); C.addLayer(p); paint(p, 0, 0, blue);
      p.layers[0].visible = flags[0]; p.layers[1].visible = flags[1]; const before = C.composite(p);
      C.mergeDown(p); eq(Array.from(C.composite(p)), Array.from(before));
    }
    const p = C.createProject(1, 1); C.addLayer(p); p.layers[0].locked = true; throws(() => C.mergeDown(p), /Unlock/);
  });
  test('Current bitmap palette comes only from visible composited colours', () => {
    const p = C.createProject(2, 1); p.settings.color = '#ffffffff'; eq(C.bitmapPalette(p), []);
    paint(p, 0, 0); C.addLayer(p); paint(p, 0, 0, blue); eq(C.bitmapPalette(p), [{ color:'#0000ffff', count:1 }]);
    p.layers[1].visible = false; eq(C.bitmapPalette(p), [{ color:'#ff0000ff', count:1 }]);
    p.layers[1].visible = true; paint(p, 0, 0, clear); p.activeLayer = 0; paint(p, 0, 0, clear); eq(C.bitmapPalette(p), []);
    paint(p, 0, 0, [255,0,0,128]); p.activeLayer = 1; paint(p, 0, 0, [0,0,255,128]);
    eq(C.bitmapPalette(p)[0].color, '#5500aac0'); C.addFrame(p); eq(C.bitmapPalette(p), []);
  });
  test('Built-in palette hardware indices and SAM 7-bit encoding', () => {
    const [zx, sam, cpc, bbc, c64] = P.builtins; eq(P.builtins.map(p => p.colors.length), [16,128,32,8,16]);
    eq(zx.colors[1], '#0000cdff'); eq(zx.colors[9], '#0000ffff'); eq(zx.colors[0], zx.colors[8]);
    eq(new Set(sam.colors).size, 128); eq(sam.colors[1], '#000049ff'); eq(sam.colors[8], '#242424ff');
    eq(sam.colors[16], '#000092ff'); eq(sam.colors[127], '#ffffffff'); eq(sam.colors[32], '#920000ff'); eq(sam.colors[64], '#009200ff');
    eq(new Set(cpc.colors).size, 27); eq(cpc.colors[20], '#000000ff'); eq(cpc.colors[11], '#ffffffff');
    eq(bbc.colors[1], '#ff0000ff'); eq(bbc.colors[4], '#0000ffff'); eq(c64.colors[2], '#96282eff');
    for (const order of ['hardware','hue','brightness']) eq(P.arrange(sam.colors, order).map(e => e.index).sort((a,b) => a-b), Array.from({length:128},(_,i)=>i));
  });
  test('Custom GPL, JSON and hexadecimal list imports validate and retain names', () => {
    eq(P.parse('GIMP Palette\nName: My colours\nColumns: 4\n# a comment\n255 0 10 Red\n0 20 30\n').name, 'My colours');
    eq(P.parse('["#f00","#11223344"]').colors, ['#ff0000ff','#11223344']);
    eq(P.parse('{"name":"Soft","colors":["#123"]}').name, 'Soft');
    eq(P.parse('# a comment\n#f00\n00ff00, 00112233', 'Mine.hex').colors, ['#ff0000ff','#00ff00ff','#00112233']);
    for (const text of ['', '#nope', 'GIMP Palette\n256 0 1 bad', '{broken', '{"colors":[]}']) throws(() => P.parse(text));
    eq(P.parse(JSON.stringify(P.parse('#123\n#456','Palette.hex'))).name, 'Palette');
  });
  test('Document tabs reorder without changing document identities', () => {
    const docs = ['Knight', 'Wizard', 'Serf'].map((name, i) => ({ id: name.toLowerCase(), name, index: i }));
    eq(C.reorderDocuments(docs, 'serf', 'knight').map(d => d.name), ['Serf', 'Knight', 'Wizard']);
    eq(C.reorderDocuments(docs, 'knight', 'wizard', true).map(d => d.name), ['Wizard', 'Knight', 'Serf']);
    eq(C.reorderDocuments(docs, 'unknown', 'wizard').map(d => d.id), ['knight', 'wizard', 'serf']);
    eq(docs.map(d => d.index), [0, 1, 2]);
  });

  test('Three document sessions keep artwork and undo histories isolated', () => {
    const docs = [
      new C.DocumentSession(C.createProject(2, 3), { id: 'knight', saved: true }),
      new C.DocumentSession(C.createProject(5, 4), { id: 'wizard', saved: false }),
      new C.DocumentSession(C.createProject(3, 1), { id: 'serf', saved: true }),
    ];
    docs.forEach((doc, i) => { doc.project.name = ['Knight', 'Wizard', 'Serf'][i]; });
    const before = C.clone(docs[1].project);
    paint(docs[1].project, 4, 3); docs[1].history.record(before, docs[1].project);
    docs[1].dirty = true;
    eq(docs.map(d => d.project.name), ['Knight', 'Wizard', 'Serf']);
    eq(docs.map(d => [d.project.width, d.project.height]), [[2, 3], [5, 4], [3, 1]]);
    eq(docs.map(d => d.dirty), [false, true, false]);
    eq(docs.map(d => d.history.undoStack.length), [0, 1, 0]);
    const restored = docs[1].history.undo(docs[1].project);
    eq(restored.frames[0].cels[0].some(Boolean), false);
    eq(docs[0].project.frames[0].cels[0].some(Boolean), false);
    eq(docs[2].project.frames[0].cels[0].some(Boolean), false);
  });

  test('Versioned projects preserve RGBA, layers, frames, preferences and palettes', () => {
    const p = C.createProject(13, 5, 'Portable'); paint(p, 12, 4, [7,9,201,1]); C.addLayer(p); C.addFrame(p, true);
    p.layers[0].visible = false; p.layers[1].locked = true; p.fps = 23; p.settings.brush = 8;
    p.customPalettes = [{ id:'custom-test', name:'My palette', colors:['#00112233'] }]; p.settings.palette = 'custom-test';
    const text = F.serialize(p), result = F.deserialize(text); eq(F.serialize(result), text);
    eq(F.PROJECT_EXTENSION, '.pixr'); eq(JSON.parse(text).format, 'pixel-workshop');
    eq(pixel(result,12,4,0,0), [7,9,201,1]);
  });
  test('Legacy Mirror X settings are ignored when loading version 1 projects', () => {
    const p = C.createProject(2, 2), raw = JSON.parse(F.serialize(p));
    raw.settings.mirror = true;
    const loaded = F.deserialize(JSON.stringify(raw));
    eq(loaded.settings.mirror, undefined); eq(loaded.settings.brush, 1);
  });
  test('Invalid and future projects are rejected without modifying the current model', () => {
    const p = C.createProject(2, 3); paint(p, 0, 0); const original = F.serialize(p);
    const bad = [text => '{', text => text.replace('"version": 1','"version": 9'), text => text.replace('"width": 2','"width": 0')];
    for (const mutate of bad) throws(() => F.deserialize(mutate(original)));
    for (const edit of [r=>{r.frames[0].cels[0]='AAAA';}, r=>{r.layers[0].visible='yes';}, r=>{r.settings.brush=99;}, r=>{r.frames[0].cels=[];}]) {
      const raw = JSON.parse(original); edit(raw); throws(() => F.deserialize(JSON.stringify(raw)));
    }
    eq(F.serialize(p), original);
  });
  test('Conservative prototype colour-array migration', () => {
    const p = F.deserialize(JSON.stringify({ width:2,height:1,frames:[['#f00',null],{pixels:[['#00f','transparent']]}],fps:10 }));
    eq(p.frames.length,2); eq(pixel(p,0,0,0,0),red); eq(pixel(p,0,0,1,0),blue); eq(p.fps,10);
    throws(() => F.deserialize('{"width":2,"height":1,"frames":[[123,456]]}'));
  });
  test('Natural import order, rectangular frame matching, atomic rejection', () => {
    eq(F.naturalOrder([{name:'walk10.png'},{name:'walk2.png'},{name:'walk1.png'}]).map(f=>f.name),['walk1.png','walk2.png','walk10.png']);
    const p = C.createProject(3, 2), data = C.blank(3,2); data.set(red);
    const imgs = [
      {width:3,height:2,data,name:'frame1.png',sourceName:'frame1.png',sourcePath:'/sprites/frame1.png'},
      {width:3,height:2,data,name:'frame2.png',sourceName:'frame2.png',sourcePath:'/sprites/frame2.png'},
    ];
    F.importFrames(p,imgs); eq(p.frames.length,3); eq(p.frames[1].sourcePath,'/sprites/frame1.png');
    eq(C.clone(p).frames[2].sourceName,'frame2.png');
    eq(F.serialize(p).includes('/sprites/frame1.png'),false);
    p.frames[1].cels[0][0]=12; eq(p.frames[2].cels[0][0],255);
    const before=F.serialize(p); throws(()=>F.importFrames(p,[imgs[0],{...imgs[1],width:2}]), /expected/); eq(F.serialize(p),before);
    const next=F.importFrames(p,[{width:1,height:6,data:C.blank(1,6)}],true); eq([next.width,next.height],[1,6]);
  });
  test('Transparent horizontal sprite sheet has correct frame order and intact layers', () => {
    const p=C.createProject(2,3); paint(p,0,2); C.addFrame(p); paint(p,1,0,blue); C.addLayer(p);
    const before=F.serialize(p), sheet=F.spriteSheet(p); eq([sheet.width,sheet.height],[4,3]);
    eq(C.getPixel(sheet.data,4,0,2),red); eq(C.getPixel(sheet.data,4,3,0),blue); eq(C.getPixel(sheet.data,4,2,2),clear);
    eq(F.serialize(p),before);
  });
  test('PNG exact RGBA import/export including alpha 0, 1, 64, 128 and 254', async () => {
    const data=Uint8ClampedArray.from([23,87,192,0, 77,99,33,1, 3,29,87,64, 41,211,16,128, 254,123,17,254, 4,5,6,255]);
    const img=await PNG.decode(PNG.encode(3,2,data)); eq([img.width,img.height],[3,2]); eq(Array.from(img.data),Array.from(data));
  });
  test('Maximum rectangular PNG and multi-block DEFLATE export', async () => {
    const data=Uint8ClampedArray.from({length:256*129*4},(_,i)=>(i*29)%256), png=PNG.encode(256,129,data);
    eq(Array.from((await PNG.decode(png)).data),Array.from(data));
  });
  for (const fixture of fixtures) test(`Independent PNG fixture: ${fixture.name}`, async () => {
    const png=Uint8Array.from(atob(fixture.base64),c=>c.charCodeAt(0)), img=await PNG.decode(png);
    eq([img.width,img.height],[fixture.width,fixture.height]); eq(Array.from(img.data),fixture.data);
  });
  test('Corrupt PNGs fail clearly', async () => {
    for (const input of [new Uint8Array(10), PNG.encode(1,1,C.blank(1,1)).slice(0,-8)]) {
      let failed=false; try { await PNG.decode(input); } catch { failed=true; } ok(failed);
    }
    const bad=PNG.encode(1,1,C.blank(1,1)); bad[bad.length-15]^=1;
    let failed=false; try { await PNG.decode(bad); } catch(e) { failed=/checksum/.test(e.message); } ok(failed);
  });
  if (typeof document !== 'undefined') test('Browser natively decodes exported PNG dimensions, RGB and alpha', async () => {
    const data=Uint8ClampedArray.from([255,0,0,255, 0,0,255,128, 0,0,0,0, 0,255,0,255, 1,2,3,255, 200,0,100,255]);
    const url=URL.createObjectURL(new Blob([PNG.encode(3,2,data)],{type:'image/png'}));
    try {
      const image=new Image(); image.src=url; await image.decode(); eq([image.naturalWidth,image.naturalHeight],[3,2]);
      const canvas=document.createElement('canvas'); canvas.width=3;canvas.height=2;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);eq(Array.from(ctx.getImageData(0,0,3,2).data),Array.from(data));
    } finally { URL.revokeObjectURL(url); }
  });
  async function run(report = () => {}) {
    const results=[];
    for (const {name,fn} of cases) {
      try { await fn(); results.push({name,pass:true}); } catch(e) { results.push({name,pass:false,error:e.stack || e.message}); }
      report(results[results.length-1]);
    }
    return results;
  }
  root.PixelTests={run};if(typeof module!=='undefined')module.exports={run};
})(globalThis);

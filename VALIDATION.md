# Validation record and browser checklist

Validated on 2026-10-24 on macOS / Apple Silicon. All implementation files are
under the Pixr repository root. Game runtime code, production assets and Godot
tests were not modified. Existing unrelated working-tree changes were retained.
No commit or push was made.

## Automated results

| Environment | Result | Scope |
| --- | --- | --- |
| Node 24.21.0 | **54/54 passed** | Shared DOM-free editing, palette, project and PNG suite |
| Brave, Chromium 155 user agent | **55/55 passed** | Same suite from `file://`, plus native browser PNG decoding |
| Safari 27.0.1 / WebKit 605.1.15 | **55/55 passed** | Same suite from `file://`, plus native browser PNG decoding |
| Google Chrome | Not installed / not directly tested | Chromium results are supporting evidence, not a separate Chrome run |
| Firefox | Not installed / not directly tested | Manual validation remains outstanding |

The suite covers rectangular dimensions, painting/erasing, all eight square
brush sizes, even-size anchoring, gap-free lines, all eight Shift-constrained
brush sizes, Shift-click versus Shift-drag, fill, mirror/flip, undo/redo, all
nine resize anchors, crop detection, odd centre offsets, frame isolation, shared
layers, locks, visibility, source-over merging, composited palette extraction,
colour selection versus usage, hardware indices/SAM encoding, custom palette
parsing, strict project loading, prototype migration, natural frame import order,
sprite sheets and exact PNG RGBA round trips.

Independent PNG fixtures are encoded using Python's standard-library `zlib`:
all five row filters, Adam7 interlacing, packed indexed colour with alpha,
1-bit grayscale, RGB transparency keys and 16-bit grayscale/alpha. The browser
check additionally decodes an exported PNG using its native image decoder.

Run once after relevant code changes:

```sh
node tests/run.js
```

For browser checks, open **[tests.html](tests.html)** at the application root.
Its scripts are all descendants of that directory. A harness opened from a
nested directory referencing parent scripts failed under Safari's local file
access restrictions; moving the harness to the root resolved it without changing
browser security settings. No HTTP server, build step or installed packages
were used. JavaScript syntax checks and local HTML resource/ID checks passed.

## Focused UI checks completed

In Safari, the application was launched directly from the filesystem and its
desktop layout visually inspected. A 24 × 16 transparent document was created,
painted with square brushes, duplicated into a second frame and given a second
layer. Painting, layer hiding and showing updated the bitmap palette correctly.
The animation preview continued looping independently. Merge Down reduced the
two layers across both frames while preserving the visible result.

The project was downloaded and reopened through Safari's file picker, retaining
dimensions, two frames, pixels and editor settings. A 48 × 16 horizontal PNG
sheet was downloaded and independently decoded in Node: **every exported RGBA
byte matched the saved project's composited frame data**. The transparent region
did not contain the pale display backdrop. Safari's download permission prompts
were accepted for these local export requests. A native pointer paint action
was also exercised in Brave; the browser console had no error messages.

The smoke-test files `Untitled.pixelworkshop.json` and `Untitled-sheet.png` were
left in the browser's Downloads folder. They are disposable test artwork.

## Manual checklist

Run the remaining checks in each target browser before claiming full browser
acceptance. Use disposable artwork and leave browser security settings enabled.
The automated suite verifies the algorithms; this checklist verifies native
pointer, keyboard, picker and download behaviour.

- [ ] In Chrome, Safari and Firefox, open `index.html` using Open File. Confirm
  the address is `file://`, no server is running and all application resources
  are local. Disconnect the network and repeat drawing, project save/load and
  PNG import/export. The app's CSP already prohibits network connections.
- [ ] Open `tests.html` and confirm all checks pass. In Safari, grant access to
  the selected HTML file if its local Open dialog appears. Do not open an old
  copy of a test harness from inside a nested directory.
- [ ] Create 1 × 1, 17 × 31 and 256 × 256 canvases; verify square pixels, scroll,
  integer zoom, Fit, grid, checkerboard and solid backdrops. Resize the browser
  to about 800 × 600; collapse/reopen the timeline and scroll palette sections.
  Verify preview playback stays visible.
- [ ] Draw slowly and quickly at 1×, intermediate and 48× zoom. Check corner
  clipping, brushes 1–8, erasing, mirror footprints and cursor outlines. Drag
  outside the canvas and release; the next stroke must work normally.
- [ ] Hold Shift before dragging horizontally and vertically, with small hand
  jitter and every brush size. Ensure no neighbouring pixels are altered beyond
  the brush's documented footprint. Shift-click from a previous endpoint; then
  Shift-drag elsewhere and confirm it does not draw a connecting diagonal first.
  Toggle Shift during a stroke and try undo/redo after each completed stroke.
- [ ] Exercise B/E/F/I, M/G/H, Space, arrows, brackets, +/-/0 and Cmd/Ctrl S/O/Z,
  Shift Z and Ctrl Y. Check that shortcuts do not interfere with text/number
  fields, selects, native colour pickers or dialogs. Test the local keyboard
  layout's bracket keys, including Alt combinations where relevant.
- [ ] Sample an opaque, translucent and transparent pixel. Enter short and full
  hex values, change opacity and use the native colour picker. Verify selecting
  an unused colour leaves the current bitmap palette unchanged.
- [ ] Draw and erase the last occurrence of a colour. Switch frames and layer
  visibility, merge translucent layers and undo/redo; check palette counts.
- [ ] Import a rectangular PNG with partial alpha. Compare its positions and
  alpha at full opacity against a separate image editor. Import matching PNGs
  named `frame1`, `frame2`, `frame10`; verify natural order. Try a mixed-dimension
  batch and verify no frame from that batch is installed.
- [ ] Switch all five built-in palettes and all three arrangements; inspect SAM
  indices 1, 8, 16, 32, 64 and 127. Import GPL/JSON/hex lists, including a palette
  name containing `<` or `&`; it should appear as text. Export/reimport a custom
  palette, delete it and undo. Try malformed data and confirm clear errors.
- [ ] Add, rename, hide, lock and delete layers across several frames. Try
  drawing while locked/hidden. Merge down on visible, both-hidden and one-hidden
  pairs; verify warnings and undo. Ensure locked merge destinations are refused.
- [ ] Add, duplicate, select and delete frames, including a timeline cell that
  changes both dimensions. Change FPS and preview zoom while playback continues.
  Pause, change frames, enable onion skinning, then export: no onion pixels should
  be exported. Check frame isolation after editing a duplicated frame.
- [ ] Resize artwork with each of the nine anchors, enlarging and shrinking.
  Include art on hidden and locked layers. Cancel the crop warning once and
  verify no change. Accept it, then undo; every cel must return exactly.
- [ ] Save and reopen a project containing partial alpha, hidden/locked layers,
  multiple frames and a custom palette. Check saved preferences. Open malformed
  JSON, a future version and a truncated cel; current artwork must survive.
- [ ] Export the selected frame, horizontal sheet and custom palette. Verify
  filenames, PNG dimensions and transparent regions in another image editor.
  Confirm the browser actually completed each download before closing the app.
- [ ] In Safari, handle a download permission prompt for local `blob:null/...`
  URLs if shown. It may recur for separate exports. Denying/cancelling a download
  must not alter the artwork; retry Save to request the file again.
- [ ] Use private browsing or a profile with restricted/full storage. Confirm
  editing and project downloads remain available and the storage status explains
  any restriction. Save a project with custom palettes, move the application
  folder and reopen the project in another browser to recover those palettes.
- [ ] Attempt to replace/close unsaved work; verify prompts where supported.
  Browsers may suppress before-unload prompts before a user gesture. Cancelling
  a download cannot be detected by the app, so check important saved files.

Full Chrome/Firefox execution, physical modifier-key/drag testing, restricted
storage profiles and the full window-size/browser matrix remain manual review
items. They are not represented as completed by the automated results above.

## Pixr repository migration

The browser and shared model checks above were run against the source implementation
before migration; the same source modules and fixtures are now at this repository
root. Native application checks for the new `com.stebrennan.pixr` WKWebView bundle
are recorded after running the macOS build.

### Destination migration checks (2026-10-24)

| Check | Result |
| --- | --- |
| `node tests/run.js` in this repository | **54/54 passed** |
| `node --check` for `js/app.js` and `js/files.js` | Passed |
| `sh -n macos/build-app.sh` | Passed |
| `./macos/build-app.sh` in this repository | Built `Pixr.app` successfully |
| Bundle signature and executable permission | Verified; executable is `Contents/MacOS/Pixr` |
| Bundle display name / identifier | `Pixr` / `com.stebrennan.pixr` |
| Native WebKit window | Opened from a temporary staged copy outside both repositories; loaded bundled `file://` editor resources and displayed Pixr in the window and menu bar |
| Native file panel | Open panel appeared; the UI automation timed out during file selection, so import, save, Finder launch, Dock icon, and persistence round trips remain unverified |

The app bundle and `.build/` output are locally generated and ignored by Git.
The native binary is ad-hoc signed, not Developer ID signed or notarized.

## Branding and frame management update (2026-10-24)

| Check | Result |
| --- | --- |
| `node tests/run.js` | **60/60 passed** |
| `node --check js/app.js`, `js/core.js`, `js/files.js` | Passed |
| `sh -n macos/build-app.sh` | Passed |
| `./macos/build-app.sh` | Built `Pixr.app`; signature, executable, bundle display name/icon metadata, and generated icon dimensions verified |
| Safari `file://` branding check | Pixr icon/name shown; tagline absent; file controls use “Open Pixr File” / “Save Pixr File” |
| Safari frame UI check | Added two frames (three total), deleted the selected last frame (two total), adjacent frame selected, preview count updated; Undo restored three frames and Redo returned to two |
| Native UI for this rebuild | Not run in this validation pass; Dock/Finder icon and native file panel round trips remain unverified for this build |

The suite now includes deletion of first, middle, and last frames, the final-frame
guard, cel and layer preservation, preview-index adjustment, and serialized
undo/redo restoration. The source already removed frames from the frame array;
the defect addressed here was stale playback-preview indexing after a deletion,
which could make playback show the wrong surviving frame. The Open Pixr File
browser button also now routes through the existing native file bridge so the
native wrapper can present its file panel.

The canonical `assets/pixr-icon.svg` produces the web favicon, manifest icons,
header mark, PNG icon sizes, and `assets/Pixr.icns`. The freshly built native app
was not launched for this validation pass; the browser header and generated
resources were inspected separately. All changes remain uncommitted and
unpushed.

## Native JavaScript dialog fix (2026-10-24)

The wrapper previously did not assign a `WKUIDelegate`, so its WebKit view had
no native handlers for JavaScript `confirm()` and `prompt()` dialogs. Frame and
layer deletion both depend on `confirm()`, and layer rename uses `prompt()`.
`PixrApp.swift` now presents native sheets for confirmations and text input, and
passes the user's choice or entered value back to WebKit.

| Check | Result |
| --- | --- |
| `node tests/run.js` | **60/60 passed** |
| `sh -n macos/build-app.sh` | Passed |
| `./macos/build-app.sh` after delegate change | Built and signed `Pixr.app` successfully |
| Native dialog interaction | Not run; the user asked to skip launching the native app |

The wrapper build compiles the updated Swift source. The dialog presentation and
the delete actions in the native window remain runtime-unverified because the
app was not launched.

## Frame insertion thumbnail display (2026-10-24)

The reported frame contents were not deleted: in the native wrapper, selecting
the original frame after insertion still showed its 25 painted pixels. The
timeline thumbnail had been downscaled into a 28 × 28 canvas before display,
which could drop sparse pixels and make a surviving frame look empty. Thumbnails
now retain each cel's full resolution and are scaled by CSS for display.

| Check | Result |
| --- | --- |
| `node tests/run.js` | **61/61 passed**, including blank-frame insertion preservation |
| JavaScript syntax checks | Passed |
| `./macos/build-app.sh` | Built and signed the updated wrapper successfully |
| Native UI check | Painted 25 pixels, added a blank frame, saw the mark remain in the prior timeline cell, selected it, and confirmed the pixel count remained 25 |
| Safari local-file check | Repeated the insertion; the prior frame's mark remained visible in its timeline cell |

The change affects timeline thumbnail rendering only; frame data and the
animation canvas were already intact.

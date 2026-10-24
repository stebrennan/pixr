# Pixr 1.0

A portable, offline pixel-art and sprite-animation editor. Everything needed to
run it is in this folder; it has no connection to the Godot game.

## Launch

Open **[index.html](index.html)** in a current desktop Chrome, Safari or Firefox.
Use the browser's **Open File** command if HTML is associated with a text editor.
No installation, build step, web server or internet connection is needed. Keep
`index.html`, `style.css` and `js/` together when copying the application.

Safari may ask you to confirm the local HTML file in an Open dialog. Choose the
file and click Open. Do not disable browser security protections. See
[VALIDATION.md](VALIDATION.md) for tested browsers and a manual checklist.

## macOS application

Build **Pixr.app** on macOS with Xcode Command Line Tools:

```sh
./macos/build-app.sh
```

The build creates `Pixr.app` in the repository root. Drag it to **Applications**
(or run it in place), then open it in Finder. To add it to the Dock, launch Pixr,
Control-click its Dock icon and choose **Options → Keep in Dock**. The app has a
native WebKit window and native file open/save panels. It includes the editor
resources and icon, so it can be moved outside the repository. An ad-hoc local
signature is applied; macOS may ask for confirmation on first launch.

To uninstall, remove the Dock icon and move `Pixr.app` to the Trash. This leaves
saved artwork files and Pixr's WebKit preferences in your user Library intact.

The bundle identifier is `com.stebrennan.pixr`. Rebuild after changing web app
files. The canonical application icon is `assets/pixr-icon.svg`; the build
renders the web, header, Finder and Dock variants from that source. The build
uses Swift, AppKit, WebKit, `iconutil` and `codesign` from macOS developer tools.

## Drawing and canvas controls

- **New:** independent width and height, each 1–256 pixels; initially transparent.
- **Pencil / Eraser:** square brushes from 1–8 pixels, interpolated during fast
  strokes. One completed stroke is one undo operation. Pencil writes the chosen
  RGBA value directly, so repeated strokes do not accumulate opacity.
- **Brush anchoring:** the pointer names one pixel. The square starts at
  `pointer − floor((size − 1) / 2)` on both axes. Odd sizes are centred; even sizes
  extend right and down. A 2 px brush at `(x, y)` covers `x…x+1, y…y+1`. Cursor
  outlines show the clipped brush and its mirrored footprint.
- **Shift + drag:** the first pixel movement chooses horizontal or vertical,
  with ties horizontal. That axis stays fixed until Shift is released. Holding
  Shift before starting a drag constrains from that stroke's starting point.
- **Shift + click:** draws a straight line from the previous pencil/eraser
  endpoint in the same cel. Switching frames/layers, undoing or other artwork
  commands reset that endpoint. A Shift-click is deferred until release to avoid
  painting an unwanted connecting line at the beginning of a constrained drag.
- **Flood fill:** four-connected, exact RGBA matching on the active cel;
  independent of brush size. Mirror X also fills from the mirrored starting point.
- **Eyedropper / Alt + click:** samples visible composited RGBA, including alpha.
- **Mirror X:** reflects affected pixels across the canvas's vertical centre.
- **Flip cel:** horizontally flips only the active layer in the selected frame.
- **Zoom / Fit:** integer nearest-neighbour display zoom from 1× to 48×. Large
  canvases scroll; Fit selects the largest fitting integer zoom, with a 1× minimum.
- **Grid / backdrop:** grid lines are displayed at zoom 4× and above. Choose a
  solid colour or checkerboard for transparency. Display backgrounds, grid,
  brush outlines and onion skinning never become exported pixels.

**Resize canvas** changes every cel's boundaries without scaling pixels. Select
one of nine anchors. Enlarging adds transparency. Cropping warns with a count of
discarded non-transparent stored pixels, including hidden and locked layers.
Undo restores them. For odd centred size differences, offsets round down (e.g.
4 → 3 pixels has offset −1; 3 → 4 has offset 0).

Undo/redo covers drawing, fill, flip, resize, layers, frames, FPS and custom
palette changes. History retains up to 60 operations and targets a 64 MiB pixel
budget; at least the latest operation remains undoable. History is session-only.
Drawing/display preferences are not rolled back when undoing artwork.

## Frames and layers

Frames run horizontally and layers vertically in the timeline. Click a cell to
select both; click a frame heading or layer name to select just that dimension.
Layers are listed topmost first and share names, order, visibility and locking
across all frames. Hide/show and lock/unlock buttons are beside each layer name.
Hidden or locked layers cannot be painted. Add inserts above the selected layer;
deleting a layer removes it from every frame. At least one layer and frame remain.

Add Frame inserts a blank frame after the selection; Duplicate copies every
layer. **Delete Frame** removes the selected frame and all of its cels. It selects
the next frame, or the previous frame when deleting the last one; the final frame
cannot be deleted. Undo and redo restore the complete frame. Preview playback
loops independently of the selected editing frame, at 1–60 FPS, with its own
1×–16× zoom. Pause shows the selected frame. Onion skinning
shows the preceding frame at 25% opacity, wrapping at the start of the animation.

**Merge Down** combines the selected layer and the layer beneath it across every
frame, using source-over alpha. Unlock both first. If one is hidden, confirmation
is required: the visible result is preserved and the hidden pixels are discarded.
If both are hidden, their stored artwork is merged and remains hidden. Undo
restores the separate layers. Exports flatten visible layers without changing
the editable document. Layer reordering is outside this first release.

## Import, save and export

**Open PNG** starts a document with dimensions detected from the image. Selecting
multiple files creates animation frames in natural filename order (`walk2`
before `walk10`). All dimensions must match. **Import frames** inserts after the
selected frame on the active layer; other layers in those frames are transparent.
These images must match the existing canvas. A failed import preserves the
current document and imports none of the files.

PNG import supports grayscale, RGB, indexed and RGBA images, all standard PNG
filters, packed grayscale/index values, tRNS transparency and Adam7 interlacing.
8-bit RGBA values are decoded directly, avoiding canvas premultiplication loss.
16-bit PNG components are rounded to 8-bit. Colour profiles, gamma and other
colour-management metadata are not applied or retained. APNG is rejected; use
separate PNG frame files. No colour quantisation is performed.

**Save Pixr File** saves an editable `.pixr` document. **Open Pixr File** validates
the entire file before replacing your work. Pixr files contain JSON using the
existing versioned project format, and retain dimensions, all cels, hidden pixels,
layer properties, frames, FPS, custom palettes, active selection and editor
settings. Older `.json` and `.pixelworkshop.json` files continue to open. A PNG is
a finished flattened image and does not retain this editable project data. See
[PROJECT-FORMAT.md](PROJECT-FORMAT.md).

The Export menu offers:

- **Current frame:** transparent PNG of the selected frame's visible layers.
- **Animation sheet:** transparent horizontal PNG; frames left to right with no
  gutters, each exactly the document's width and height. Sheet dimensions are
  `canvas width × frame count` by `canvas height`. No animation metadata is added.
- **Selected palette:** JSON containing the palette name and colours in its
  original index order, regardless of the current visual arrangement.

PNG exports use lossless, uncompressed DEFLATE blocks. They are larger than PNGs
from an optimising compressor, but preserve exact RGBA without dependencies.
Very wide sprite sheets may exceed other applications' image-size limits.

Browsers choose the download location and may add a filename suffix. Saving
requests a download; the app cannot verify completion or overwrite a chosen file
in place. Confirm the file exists before closing important work. Closing or
replacing unsaved work prompts where the browser permits. Saving/exporting does
not modify imported files or any game assets.

Safari can request download permission for the local `blob:null/...` URL used
by each export. Allow the requested download to receive the file. This can recur
for separate files; denying a download leaves your artwork intact.

## Palettes

The **current bitmap palette** lists the distinct non-transparent RGBA values
actually present in the selected frame's visible composite. Overpainted and
hidden layer colours are excluded. Selection alone adds no colour. Swatches
include pixel counts; very large bitmap palettes are displayed 128 at a time.
Drawing, erasing, frame changes, visibility, merging and undo/redo update it.

The library includes ZX Spectrum, SAM Coupé (all 128 colours), Amstrad CPC 464,
BBC Micro and Commodore 64. Hardware order retains index duplicates (Spectrum's
two blacks and the CPC's 32 codes / 27 distinct colours). Hue and brightness
arrangements retain the source index in each swatch tooltip. The palettes are
references, not hardware restriction enforcement. See [PALETTES.md](PALETTES.md)
for verified definitions and RGB conventions.

Choose any colour with swatches, the eyedropper, native picker or hex input.
Supported hex forms are `#RGB`, `#RGBA`, `#RRGGBB` and `#RRGGBBAA`; the opacity
slider provides an explicit 8-bit alpha channel.

**Import palette** supports:

- GIMP `.gpl`, including `Name:`, `Columns:`, comments and RGB rows with optional names.
- JSON arrays of hex strings, or `{ "name": "My palette", "colors": ["#123456"] }`.
  `colours` and `palette` are also accepted as colour-array property names.
- `.txt` / `.hex` lists of hex values separated by newlines, whitespace, commas
  or semicolons. Blank lines, `//` comments and `# ` comment lines are ignored.

Names are preserved; unnamed lists use the filename. Each custom palette needs
1–4096 colours; the library supports up to 128 custom palettes. Select a custom
palette to delete or export it. Deletion does not alter artwork and is undoable.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| B / E / F / I | Pencil / eraser / fill / eyedropper |
| Alt + click | Sample the visible pixel |
| [ / ] | Decrease / increase brush size |
| Shift + drag / Shift + click | Constrain axis / connect a line |
| M / G / H | Mirror X / grid / flip active cel |
| Space | Play / pause preview |
| + / − / 0 | Zoom in / out / fit |
| Left / Right arrow | Select previous / next frame |
| Cmd/Ctrl Z | Undo |
| Cmd/Ctrl Shift Z or Ctrl Y | Redo |
| Cmd/Ctrl S / O | Save / open editable project |

Shortcuts are suspended in text fields, selects and dialogs. Drawing commands
are suspended during an active stroke; undo/save can finish that stroke first.

## Local persistence and limits

Browser storage is optional. The app tries to remember custom palettes and
lightweight preferences under `pixel-workshop-preferences-v1`. Restrictions,
private browsing or full storage do not prevent editing or project downloads.
Moving the app to another path/browser may create a separate preference store.
Opening a project loads its embedded custom palette library; export palettes or
save the current project first if you want to retain a different library.
**Artwork is never automatically saved in localStorage.** Save editable projects
regularly; they are the portable backup for artwork, palettes and settings.

Maximums are 256 frames, 64 layers and 8,388,608 stored pixels across all cels
(whichever limit is reached first). Import limits: 50 MiB per PNG, 64 MiB per
project and 2 MiB per palette. Very large timelines/history may be slower; this
first release prioritises small retro sprites. Minimum UI width is 760 pixels;
touch/mobile editing and keyboard-only pixel navigation are not provided.

Older Pixel Workshop v1 files remain compatible: Pixr retains the `pixel-workshop` project-format identifier, reads the existing browser preference key, and preserves embedded custom palettes. Prototype source files were not supplied. A conservative compatibility reader
accepts unversioned `{width,height,pixels}` or `{width,height,frames}` projects
whose pixels are flat or row-major arrays of hex strings or null transparency.
It also accepts frame objects with `pixels`. Unknown, versioned prototype layouts
are rejected rather than guessed; full v0.1–v0.6 compatibility is unverified.

## Static hosting

The browser edition is a static site and is prepared for GitHub Pages: use the
repository root as the Pages source, with no build step. All app assets use
relative URLs. The native `Pixr.app` and `.build/` output are git-ignored and
must not be used as the Pages source. Pages deployment is not enabled by this
repository setup.

## Source layout and validation

```text
pixr/
├── Pixr.app/                 # Generated native app bundle (git-ignored)
├── assets/                   # Canonical SVG icon and generated platform variants
├── macos/                    # Native WebKit app and icon/build scripts
├── manifest.webmanifest      # Web app metadata for supporting browsers
├── index.html                # Workspace
├── style.css
├── js/
│   ├── core.js               # DOM-free image model, operations and history
│   ├── palettes.js           # Hardware palettes, parsing and arrangements
│   ├── png.js                # Exact RGBA PNG decoder / encoder
│   ├── files.js              # Project validation, import and export
│   └── app.js                # UI, pointer controls, preview and preferences
├── tests.html                # Open directly for browser tests
├── tests/
│   ├── run.js                # Node test runner
│   ├── suite.js              # Shared editing and file tests
│   ├── fixtures.js           # Independent PNG fixtures
│   ├── generate-fixtures.py  # Optional stdlib-only fixture regeneration
│   ├── browser.js            # Browser runner / native PNG decoding check
│   ├── diagnostics.js
│   └── test.css
├── PROJECT-FORMAT.md
├── PALETTES.md
├── VALIDATION.md
└── README.md
```

There are no runtime or test dependencies. Run the core tests with Node 22+:

```sh
node tests/run.js
```

Or open **[tests.html](tests.html)** directly in the browser. The test entry point
is at the application root so Safari can load all descendant resources within
the granted local directory. Tests cover editing semantics, every brush size
and resize anchor, serialization, palettes, independent PNG fixtures and native
browser PNG decoding. The Godot tests and runtime are independent and unchanged.

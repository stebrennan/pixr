# Pixr repository instructions

Pixr is a standalone offline pixel-art and sprite-animation editor migrated
from `atic-atac-reimagined/tools/pixel-workshop/`. Keep this repository focused
on Pixr; do not change the Godot game here.

## Compatibility

- Preserve the `pixel-workshop` version 1 project format identifier. Existing
  Pixel Workshop JSON projects must continue to open.
- Save new editable documents as `.pixr`; continue accepting legacy JSON project
  filenames and contents.
- Keep the existing browser preference storage key readable so saved custom
  palettes and preferences remain available.
- Keep the app offline and free of external runtime dependencies. Browser use
  must work by opening `index.html` directly with `file://`.
- Keep web asset references relative. Do not add server-only or build-time
  requirements to the browser app.

## macOS application

`macos/PixrApp.swift` is the native AppKit/WebKit wrapper. Build Pixr with
`./macos/build-app.sh`. Generated `Pixr.app/` and `.build/` are ignored.
The native window must load bundled resources and use native open/save panels.
Keep its bundle identifier `com.stebrennan.pixr` unless a deliberate migration
is documented.

`assets/pixr-icon.svg` is the canonical icon source. Regenerate all raster and
ICNS variants with the normal macOS build; do not hand-edit generated variants.

## Workflow

Preserve existing functionality and make focused changes. Run the shared Node
suite with `node tests/run.js` when changing application code. Do not commit or
publish changes unless explicitly requested. GitHub Pages is not configured.

# Pixr project format, version 1

Pixr files use the preferred `.pixr` extension and contain UTF-8 JSON. Existing
`.json` and `.pixelworkshop.json` project files remain supported. The extension
does not change the data format: for backward compatibility, `format` remains
exactly `"pixel-workshop"` and `version` is the integer `1`.
Unknown versions fail without changing the current document.

```json
{
  "format": "pixel-workshop",
  "version": 1,
  "name": "Tiny sprite",
  "width": 1,
  "height": 1,
  "fps": 8,
  "layers": [{ "name": "Layer 1", "visible": true, "locked": false }],
  "frames": [{ "name": "Frame 1", "cels": ["/wAAgA=="] }],
  "activeFrame": 0,
  "activeLayer": 0,
  "customPalettes": [],
  "settings": {}
}
```

This example contains a single red pixel with alpha 128. Each cel is a standard,
padded Base64 string encoding **exactly `width × height × 4` raw bytes**:
top-to-bottom rows, left-to-right pixels, R/G/B/A bytes, straight/unpremultiplied
8-bit channels. Invisible RGB under alpha zero is retained in saved cels.

Layers are stored **bottom to top**. Every frame has exactly one cel per layer,
in that same order. Layers' visibility, locking and names apply to all frames.
Source-over compositing rounds RGBA back to 8-bit after each visible layer.
An entirely transparent pixel contributes no colour to the composite.

Required dimensions are integers from 1–256. FPS is an integer from 1–60. There
must be 1–256 frames and 1–64 layers, with at most 8,388,608 pixels in all cels.
Names contain 1–160 characters. Selection indices are zero-based and in range.
Frame/layer/project names and selection indices have sensible defaults if absent.
Layer `visible` and `locked` values must be booleans. Required structural fields,
FPS, cel lengths and settings are validated before the document is installed.

Custom palettes contain `id`, `name`, and `colors` (normalized `#rrggbbaa` strings).
IDs match `custom-[A-Za-z0-9_-]+` with a suffix of at most 140 characters and
must be unique. Missing IDs are assigned on import. No built-in palette tables
are duplicated inside the project. At most 128 custom palettes, each with
1–4096 colours, are accepted.

Optional `settings` fields (defaults in parentheses):

| Field | Values |
| --- | --- |
| `color` | Hex RGBA (`#ffcf70ff`) |
| `tool` | `pencil`, `eraser`, `fill`, `picker` (`pencil`) |
| `brush` | Integer 1–8 (`1`) |
| `grid`, `onion` | Booleans (`true`, `false`) |
| `zoom`, `previewZoom` | Integer 1–48 / 1–16 (`16` / `4`) |
| `background`, `checker` | Hex backdrop / boolean (`#383b45` / `true`) |
| `palette` | Built-in ID `zx`, `sam`, `cpc`, `bbc`, `c64`, or custom ID (`zx`) |
| `arrangement` | `hardware`, `hue`, `brightness` (`hardware`) |
| `timeline` | Boolean (`true`) |

An unavailable selected palette falls back to ZX Spectrum in the UI. Unknown
fields, including the legacy Mirror X preference, are ignored; known invalid
values are rejected. Missing settings use defaults. Playback position, playing/paused state, pointer state, dirty flag and
undo history are deliberately transient.

The unversioned prototype compatibility bridge supports only hex colour arrays
described in the README. It does not guess numeric packed-colour layouts,
layered prototype variants or data URLs. Once imported, saving always writes
version 1. Future migrations should convert validated input into this model
before replacing the active project; never partially install a file.

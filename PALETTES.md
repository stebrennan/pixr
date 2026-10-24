# Hardware palette definitions

Definitions were checked on 2026-10-24. They describe palette indices and digital
RGB representations; analogue display appearance varies. Colour limits and
attribute restrictions are not enforced by the editor.

## ZX Spectrum

16 indices, normal 0–7 followed by BRIGHT 8–15, with duplicated black. Bits 0,
1 and 2 enable blue, red and green. Active channel levels are 205 for normal and
255 for BRIGHT, matching the existing project's recovered-art preview convention.
FLASH is temporal attribute behaviour, not another static colour.

Source: Sinclair's [BASIC manual, chapter 16](https://worldofspectrum.org/ZXBasicManual/zxmanchap16.html).
That manual establishes indices and brightness, not a uniquely calibrated RGB
level; 205/255 is the explicit application convention.

## SAM Coupé

All 128 CLUT values, in ascending **7-bit hardware code**, rather than the 16
default BASIC pen assignments. In `G1 R1 B1 BRIGHT G0 R0 B0`, bits 0–2 are the
low bits of B/R/G, bit 3 is a shared half-step brightness bit, and bits 4–6 are
the high bits of B/R/G. For each channel:

```text
level = 4 × high_bit + 2 × low_bit + shared_bright_bit
byte  = round(level × 255 / 7)
```

Thus code 1 is `(0,0,73)`, 8 is `(36,36,36)`, 16 is `(0,0,146)`, and 127 is
white. BRIGHT affects **all** components, including channels whose two colour
bits are zero. The palette has 128 distinct colours, not RGB332 or 64 colours
duplicated at two brightness values. The linear 0–255 conversion is an explicit
digital representation of those hardware levels.

Primary source: MGT [SAM Coupé Technical Manual v3.0, printed p.19](https://sam.speccy.cz/systech/sam-coupe_tech-man_v3-0.pdf).
The half-step weighting is also explained in the [Unofficial Technical Manual,
screen colours section](https://www.worldofsam.org/sites/default/files/dl-29/unofficial_tech-man_v1-0.pdf).

## Amstrad CPC 464

The original arrangement is the **Gate Array's 32 hardware codes**, 0–31,
including duplicate outputs. There are 27 distinct RGB combinations using
channel values 0, 128 and 255. These are nominal off/half/full representations;
they are not an assertion about calibrated CRT voltage or a CPC Plus palette.
Firmware/BASIC colour numbers use a different order. Hardware code 20 is black,
11 is bright white, and 0/1 are half-level white.

Primary source: Amstrad's [firmware manual, Appendix V](https://cpctech.cpcwiki.de/docs/manual/s968ap05.pdf)
and [Gate Array register specification](https://cpctech.cpcwiki.de/docs/manual/s968ap12.pdf).
The [CPC hardware reference](https://cpctech.cpcwiki.de/docs/garray.html) provides
the code-to-RGB table used for cross-checking the manual's hardware definitions.

## BBC Micro

The eight static physical colours in the BBC OS colour-number order: black,
red, green, yellow, blue, magenta, cyan, white. RGB channels are either 0 or 255;
R is bit 0, G is bit 1 and B is bit 2. Physical numbers 8–15 describe flashing
pairs and are not additional static RGB values. This is the OS physical-colour
order, before direct ULA register inversion, not a Mode 5 logical-pen palette.

Primary source: the [BBC Microcomputer User Guide, actual colours table](https://ru.scribd.com/document/106182073/Bbc-Micro-User-Guide),
also available in the [original manual scan](https://bbc.nvg.org/doc/BBCUserGuide-1.00.pdf),
and the [Advanced User Guide, §19.2.3](https://manualzilla.com/doc/6893132/bbc-microcomputer-advanced-user-guide).

## Commodore 64

16 colours in VIC-II index order. The editor uses the **Colodore PAL** RGB table
published by VICE (retrieved 2026-10-24):

```text
000000 ffffff 96282e 5bd6ce 9f2dad 41b936 2724c4 eff347
9f4815 5e3500 da5f66 474747 787878 91ff84 6864ff aeaeae
```

Source: [VICE's Colodore palette data](https://raw.githubusercontent.com/VICE-Team/svn-mirror/main/vice/data/C64/colodore.vpl).
[Colodore's author](https://www.colodore.com/) explains the measured analogue
model and display variation. There is no single official C64 hex table. This
specific representation is identified so it is reproducible and not silently
mixed with another Pepto/Colodore/VICE variant.

## Arrangements

Hardware order preserves the source entries and duplicates. Hue order sorts
greys first, then HSV hue and weighted brightness. Brightness order uses
`0.2126 R + 0.7152 G + 0.0722 B` on the stored bytes. Equal keys retain index
order. Arrangements affect presentation only; export uses source index order.
Every swatch tooltip retains its original index.

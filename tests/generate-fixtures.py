"""Regenerate independent PNG test vectors using only Python's standard library."""
import base64
import json
from pathlib import Path
import struct
import zlib


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


def png(w, h, depth, kind, raw, extra=b'', interlace=0):
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, depth, kind, 0, 0, interlace))
            + extra + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


def paeth(a, b, c):
    p = a + b - c
    distances = [abs(p-a), abs(p-b), abs(p-c)]
    return [a, b, c][distances.index(min(distances))]


fixtures = []


def add(name, w, h, data, encoded):
    fixtures.append(dict(name=name, width=w, height=h, data=data, base64=base64.b64encode(encoded).decode()))


w, h = 7, 5
pixels = [(x * 31, y * 47, (x + y) * 19, [0, 1, 64, 128, 254, 255, 192][x]) for y in range(h) for x in range(w)]
rows = [bytes(sum((list(c) for c in pixels[y*w:(y+1)*w]), [])) for y in range(h)]
raw = bytearray()
prev = bytes(w*4)
for f, row in enumerate(rows):
    raw.append(f)
    for i, value in enumerate(row):
        a, b, c = row[i-4] if i >= 4 else 0, prev[i], prev[i-4] if i >= 4 else 0
        raw.append((value - [0, a, b, (a+b)//2, paeth(a, b, c)][f]) % 256)
    prev = row
rgba = sum((list(c) for c in pixels), [])
add('rgba-all-filters', w, h, rgba, png(w, h, 8, 6, raw))
raw = bytearray()
for sx, sy, dx, dy in [(0,0,8,8), (4,0,8,8), (0,4,4,8), (2,0,4,4), (0,2,2,4), (1,0,2,2), (0,1,1,2)]:
    for y in range(sy, h, dy):
        if sx >= w:
            continue
        raw.append(0)
        for x in range(sx, w, dx):
            raw.extend(pixels[y*w+x])
add('rgba-adam7', w, h, rgba, png(w, h, 8, 6, raw, interlace=1))
palette = bytes([12,34,56, 240,21,60, 5,200,7, 88,99,111])
indices = [0,1,2,3,0, 3,2,1,0,1, 1,2,3,2,0]
raw = bytearray()
for y in range(3):
    row = indices[y*5:(y+1)*5] + [0,0,0]
    raw.extend([0, sum(row[i] << (6-i*2) for i in range(4)), sum(row[i+4] << (6-i*2) for i in range(4))])
data = sum(([*(palette[i*3:i*3+3]), [0,64,128,255][i]] for i in indices), [])
add('indexed-2bit-alpha', 5, 3, data, png(5,3,2,3,raw,chunk(b'PLTE',palette)+chunk(b'tRNS',bytes([0,64,128,255]))))
add('grayscale-1bit', 3, 2, [0,0,0,255, 255,255,255,255, 0,0,0,255, 255,255,255,255, 0,0,0,255, 255,255,255,255], png(3,2,1,0,bytes([0,0x40,0,0xa0])))
add('rgb-transparent-key', 2, 1, [20,40,60,0, 80,90,100,255], png(2,1,8,2,bytes([0,20,40,60,80,90,100]), chunk(b'tRNS',struct.pack('>HHH',20,40,60))))
add('grayscale-alpha-16', 2, 1, [128,128,128,64, 255,255,255,255], png(2,1,16,4,b'\0'+struct.pack('>HHHH',32896,16448,65535,65535)))
Path(__file__).with_name('fixtures.js').write_text(
    '// Independently encoded by generate-fixtures.py (Python zlib).\n'
    '(function(root){const fixtures = '+json.dumps(fixtures, separators=(',', ':'))+';\n'
    'root.PixelFixtures=fixtures;if(typeof module!=="undefined")module.exports=fixtures;})(globalThis);\n')

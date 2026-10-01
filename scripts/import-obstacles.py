#!/usr/bin/env python3
"""Pick cells from a chroma-green obstacle sheet and restyle them to match the
game's sprites: key out the green, pixelate to a coarse grid, crush to a small
palette with violet shadows, add a dark outline.

Usage: import-obstacles.py <src> <dst> <cols> <rows> <picks>
  picks: ';'-separated output rows, each a ','-list of source cells "r.c",
         e.g. "0.1,0.0;1.1,1.3,1.0" -> row 0 = low variants, row 1 = walls.
Output cells are 128x128.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, dst, cols, rows, picks = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
CELL, GRID = 128, 52            # output cell, pixel grid across the longest side

im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
Hs, Ws, _ = im.shape
cw, ch = Ws / cols, Hs / rows

def key(px):
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    green = (g - np.maximum(r, b))
    a = np.clip(1 - (green - 25) / 60, 0, 1)            # soft edge on the spill
    px = px.copy()
    px[..., 1] = np.minimum(g, np.maximum(r, b) + 10)    # despill
    return px, a

def restyle(px, a):
    rgba = np.dstack([px, a * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    bbox = img.getchannel('A').point(lambda v: 255 if v > 60 else 0).getbbox()
    img = img.crop(bbox)
    w, h = img.size
    s = GRID / max(w, h)
    small = img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.BOX)
    arr = np.asarray(small).astype(np.float32)
    rgb, al = arr[..., :3] / 255, arr[..., 3] / 255
    lum = rgb @ np.array([0.3, 0.55, 0.15])
    sat = rgb.max(-1) - rgb.min(-1)
    # violet shadows, dirtier mid-tones: mix low-saturation pixels toward the bruise palette
    grey = sat < 0.18
    violet = np.stack([lum * 0.85 + 0.03, lum * 0.7, lum * 1.05 + 0.04], -1)
    rgb[grey] = violet[grey]
    rgb = np.clip((rgb - 0.02) * 1.05, 0, 1) ** 1.15          # deeper blacks
    al = (al > 0.5).astype(np.float32)                         # hard pixel edges
    out = Image.fromarray(np.dstack([rgb * 255, al * 255]).astype(np.uint8), 'RGBA')
    # small palette like the hand-made sheets
    q = out.convert('RGB').quantize(colors=20, method=Image.MEDIANCUT).convert('RGB')
    out = Image.merge('RGBA', (*q.split(), out.getchannel('A')))
    # 1px dark outline
    sw, sh = out.size
    pad = Image.new('RGBA', (sw + 2, sh + 2), (0, 0, 0, 0))
    mask = out.getchannel('A')
    grown = Image.new('L', pad.size, 0); grown.paste(mask, (1, 1)); grown = grown.filter(ImageFilter.MaxFilter(3))
    pad.paste(Image.new('RGBA', pad.size, (10, 2, 14, 255)), (0, 0), grown)
    pad.alpha_composite(out, (1, 1))
    k = (CELL - 8) // max(pad.size)
    k = max(1, k)
    big = pad.resize((pad.width * k, pad.height * k), Image.NEAREST)
    if max(big.size) < CELL - 8:   # fill the cell: nearest by a fractional factor
        f = (CELL - 8) / max(pad.size)
        big = pad.resize((round(pad.width * f), round(pad.height * f)), Image.NEAREST)
    cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    cell.alpha_composite(big, ((CELL - big.width) // 2, (CELL - big.height) // 2))
    return cell

rows_out = [r.split(',') for r in picks.split(';')]
ncol = max(len(r) for r in rows_out)
sheet = Image.new('RGBA', (ncol * CELL, len(rows_out) * CELL), (0, 0, 0, 0))
for oy, row in enumerate(rows_out):
    for ox, rc in enumerate(row):
        r, c = map(int, rc.split('.'))
        x0, y0 = int(c * cw) + 2, int(r * ch) + 2
        px = im[y0:int((r + 1) * ch) - 2, x0:int((c + 1) * cw) - 2]
        px, a = key(px)
        sheet.alpha_composite(restyle(px, a), (ox * CELL, oy * CELL))
sheet.save(dst)
print(dst, sheet.size)

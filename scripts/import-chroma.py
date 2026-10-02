#!/usr/bin/env python3
"""Import a sheet drawn on flat chroma green (#00ff00): key the green out,
remove the green spill on the edges, cut the grid and scale every cell by the
same factor so creatures keep their relative size.

Usage: import-chroma.py <src> <dst> <cols> <rows> <cell_w> [cell_h] [--inset N]
  --inset N  crop N source pixels off every cell edge (drawn grid lines)
"""
import sys
import numpy as np
from PIL import Image

argv = sys.argv[1:]
inset = 0
if '--inset' in argv:
    k = argv.index('--inset')
    inset = int(argv[k + 1])
    del argv[k:k + 2]
args = argv
src, dst, cols, rows, out = args[0], args[1], int(args[2]), int(args[3]), int(args[4])
outh = int(args[5]) if len(args) > 5 else out
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
green = g - np.maximum(r, b)
alpha = np.clip(1 - (green - 30) / 70, 0, 1)            # soft edge
alpha[alpha < 0.08] = 0
im[..., 1] = np.minimum(g, np.maximum(r, b) + 12)       # despill
rgba = Image.fromarray(np.dstack([im, alpha * 255]).astype(np.uint8), 'RGBA')

W, H = rgba.size
cw, ch = W / cols, H / rows
sheet = Image.new('RGBA', (cols * out, rows * outh), (0, 0, 0, 0))
k = min(out / (cw - 2 * inset), outh / (ch - 2 * inset))
for rr in range(rows):
    for cc in range(cols):
        cell = rgba.crop((round(cc * cw) + inset, round(rr * ch) + inset, round((cc + 1) * cw) - inset, round((rr + 1) * ch) - inset))
        cell = cell.resize((round(cell.width * k), round(cell.height * k)), Image.LANCZOS)
        sheet.alpha_composite(cell, (cc * out + (out - cell.width) // 2, rr * outh + (outh - cell.height) // 2))
sheet.save(dst)
print(dst, sheet.size)

#!/usr/bin/env python3
"""Import a sheet drawn on flat chroma green (#00ff00): key the green out,
remove the green spill on the edges, cut the grid and scale every cell by the
same factor so creatures keep their relative size.

Usage: import-chroma.py <src> <dst> <cols> <rows> <cell_out>
"""
import sys
import numpy as np
from PIL import Image

src, dst, cols, rows, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
green = g - np.maximum(r, b)
alpha = np.clip(1 - (green - 30) / 70, 0, 1)            # soft edge
alpha[alpha < 0.08] = 0
im[..., 1] = np.minimum(g, np.maximum(r, b) + 12)       # despill
rgba = Image.fromarray(np.dstack([im, alpha * 255]).astype(np.uint8), 'RGBA')

W, H = rgba.size
cw, ch = W / cols, H / rows
sheet = Image.new('RGBA', (cols * out, rows * out), (0, 0, 0, 0))
k = out / max(cw, ch)
for rr in range(rows):
    for cc in range(cols):
        cell = rgba.crop((round(cc * cw), round(rr * ch), round((cc + 1) * cw), round((rr + 1) * ch)))
        cell = cell.resize((round(cell.width * k), round(cell.height * k)), Image.LANCZOS)
        sheet.alpha_composite(cell, (cc * out + (out - cell.width) // 2, rr * out + (out - cell.height) // 2))
sheet.save(dst)
print(dst, sheet.size)

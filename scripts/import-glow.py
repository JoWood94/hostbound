#!/usr/bin/env python3
"""Import glowing art (shots, beams, currents) where the background must become
transparent but the glow must survive as soft alpha.

  black   : art on a flat black background. alpha = brightness, colour is
            un-premultiplied, so drawing it back over black gives the original.
  checker : art on a fake grey/white checkerboard. Greys carry no colour, so
            alpha = saturation; colours are pushed back to full strength.

Usage:
  import-glow.py <src> <dst> <cols> <rows> <cell_w> [cell_h] [--key black|checker]
                 [--inset N] [--tile]

--inset N  crop N source pixels off every cell edge (kills grid lines)
--tile     make the result tile vertically (crossfade the bottom into the top)
"""
import sys
import numpy as np
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = sys.argv[1:]
def opt(name, default):
    return opts[opts.index(name) + 1] if name in opts else default

src, dst, cols, rows, cw = args[0], args[1], int(args[2]), int(args[3]), int(args[4])
ch = int(args[5]) if len(args) > 5 and args[5].isdigit() else cw
key = opt('--key', 'black')
inset = int(opt('--inset', '0'))
tile = '--tile' in opts

im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
H, W, _ = im.shape
sw, sh = W / cols, H / rows

out = Image.new('RGBA', (cols * cw, rows * ch), (0, 0, 0, 0))
for r in range(rows):
    for c in range(cols):
        x0, y0 = int(c * sw) + inset, int(r * sh) + inset
        x1, y1 = int((c + 1) * sw) - inset, int((r + 1) * sh) - inset
        px = im[y0:y1, x0:x1]
        mx = px.max(axis=2)
        mn = px.min(axis=2)
        if key == 'black':
            a = np.clip((mx - 0.06) / 0.94, 0, 1)           # crush JPEG noise in the black
            rgb = px / np.maximum(mx, 1e-3)[..., None] * np.minimum(1, mx / np.maximum(a, 1e-3))[..., None]
        else:
            sat = (mx - mn) / np.maximum(mx, 1e-3)
            a = np.clip((sat - 0.12) / 0.5, 0, 1)
            # strip the white/grey the colour was blended with
            rgb = (px - mn[..., None]) / np.maximum(mx - mn, 1e-3)[..., None] * mx[..., None]
            rgb = np.clip(rgb * 1.1, 0, 1)
        rgba = np.dstack([np.clip(rgb, 0, 1), a])
        cell = Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA')
        # premultiplied resize avoids dark fringes
        cell = cell.resize((cw, ch), Image.LANCZOS)
        out.paste(cell, (c * cw, r * ch))

if tile:
    a = np.asarray(out).astype(np.float32)
    n = a.shape[0] // 4
    top, bot = a[:n].copy(), a[-n:].copy()
    w = np.linspace(0, 1, n)[:, None, None]
    a[:n] = bot * (1 - w) + top * w                      # rows wrap: end flows into start
    a = a[:-n] if a.shape[0] - n > 0 else a
    out = Image.fromarray(a.astype(np.uint8), 'RGBA')

out.save(dst)
print(f'{dst}: {out.size[0]}x{out.size[1]}')

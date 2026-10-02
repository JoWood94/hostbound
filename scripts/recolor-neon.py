#!/usr/bin/env python3
"""Recolour the symbiote sheet as neon violet-pink flesh (like the HOSTBOUND logo):
flesh tones (reds/maroons/purples) are remapped by brightness onto a
violet -> pink ramp; eyes (yellow), bone and white flash frames are kept.
A soft pink-violet glow is baked around the silhouette of every cell.

Usage: recolor-neon.py <src> <dst> <cell> [--glow R]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = sys.argv[1:]
src, dst, cell = args[0], args[1], int(args[2])
glow_r = float(opts[opts.index('--glow') + 1]) if '--glow' in opts else 4

im = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32) / 255
rgb, a = im[..., :3], im[..., 3]
mx, mn = rgb.max(-1), rgb.min(-1)
sat = (mx - mn) / np.maximum(mx, 1e-6)
# hue in degrees
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
d = np.maximum(mx - mn, 1e-6)
hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
flesh = (a > 0) & (sat > 0.2) & ((hue >= 285) | (hue <= 22))

# brightness ramp: dark outline -> deep violet -> neon violet -> hot pink highlight
stops = np.array([0, 0.3, 0.6, 0.85, 1.0])
cols = np.array([[0x18, 0x02, 0x18], [0x4a, 0x08, 0x52], [0xb0, 0x1c, 0xb0], [0xf0, 0x4c, 0xe8], [0xff, 0x90, 0xee]]) / 255
v = np.clip(mx / 0.7, 0, 1)
out = rgb.copy()
for ch in range(3):
    out[..., ch] = np.where(flesh, np.interp(v, stops, cols[:, ch]), rgb[..., ch])

res = np.dstack([out, a])
img = Image.fromarray((res * 255).astype(np.uint8), 'RGBA')

# glow under each cell's silhouette (per cell, so it never bleeds into neighbours)
W, H = img.size
final = Image.new('RGBA', (W, H), (0, 0, 0, 0))
glow_col = np.array([0xe8, 0x4d, 0xe8], np.float32)
for y in range(0, H, cell):
    for x in range(0, W, cell):
        c = img.crop((x, y, x + cell, y + cell))
        mask = c.split()[3].filter(ImageFilter.GaussianBlur(glow_r))
        ga = np.asarray(mask).astype(np.float32) / 255 * 0.75
        glow = np.dstack([np.broadcast_to(glow_col, ga.shape + (3,)), ga * 255]).astype(np.uint8)
        layer = Image.fromarray(glow, 'RGBA')
        layer.alpha_composite(c)
        final.paste(layer, (x, y))
final.save(dst, optimize=True)
print(dst, final.size)

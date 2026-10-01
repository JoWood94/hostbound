"""Turn a generated sprite sheet with a FAKE checkerboard background (JPG, no
alpha) into a clean transparent PNG with uniform cells.

  python3 scripts/import-sheet.py art/source/symbiote_sheet.jpg public/sprites/symbiote.png 8 4 128

How: fit the checkerboard (two greys, square size and phase) from the sheet's
own background, rebuild it, then alpha = how far each pixel is from the
predicted background (difference matte). Semi-transparent smoke survives.
"""
import sys
import numpy as np
from PIL import Image

src, dst, cols, rows, cell = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
g = im.mean(2)
mx, mn = im.max(2), im.min(2)
greyish = (mx - mn) < 14

# Background = neutral grey inside the band spanned by the two checker greys
# (JPEG blur makes in-between greys at square edges). Sprites are saturated,
# very dark (outline, smoke over dark squares) or very bright (hit flash, teeth).
g_bg = g[greyish & (g > 35) & (g < 130)]
dark = g_bg[g_bg < 78].mean(); light = g_bg[g_bg >= 78].mean()
lo, hi = dark - 9, light + 10
v = g
sat = mx - mn
dv = np.maximum(np.maximum(lo - v, v - hi), 0)
ds = np.maximum(sat - 13, 0)
score = np.maximum(dv, ds * 1.6)
alpha = np.clip(score / 14, 0, 1)
# Kill isolated specks and fill pinholes: open then close on the alpha mask.
from PIL import ImageFilter
m = Image.fromarray((alpha * 255).astype(np.uint8), 'L')
m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
m = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
alpha = np.minimum(alpha, np.asarray(m).astype(np.float32) / 255 + 0.0)
# Background estimate for un-blending edge pixels: the nearer checker grey.
near = np.where(np.abs(v - dark) < np.abs(v - light), dark, light)
bg = np.repeat(near[:, :, None], 3, axis=2).astype(np.float32)
sx = sy = 0.0

# Un-blend colour: fg = (p - (1-a) bg) / a
a3 = np.maximum(alpha, 1e-3)[:, :, None]
fg = np.clip((im - (1 - a3) * bg) / a3, 0, 255)
rgba = np.dstack([fg, alpha[:, :, None] * 255]).astype(np.uint8)
full = Image.fromarray(rgba, 'RGBA')

# Uniform grid crop -> square cells -> resize.
cw, ch = W / cols, H / rows
side = min(cw, ch)
out = Image.new('RGBA', (cols * cell, rows * cell), (0, 0, 0, 0))
for r in range(rows):
    for c in range(cols):
        x0 = c * cw + (cw - side) / 2
        y0 = r * ch + (ch - side) / 2
        tile = full.crop((round(x0), round(y0), round(x0 + side), round(y0 + side)))
        # premultiply for clean resize, then un-premultiply
        arr = np.asarray(tile).astype(np.float32)
        pm = arr.copy(); pm[:, :, :3] *= arr[:, :, 3:4] / 255
        small = np.asarray(Image.fromarray(pm.astype(np.uint8), 'RGBA').resize((cell, cell), Image.LANCZOS)).astype(np.float32)
        a = small[:, :, 3:4] / 255
        small[:, :, :3] = np.where(a > 0, small[:, :, :3] / np.maximum(a, 1e-3), 0)
        out.paste(Image.fromarray(np.clip(small, 0, 255).astype(np.uint8), 'RGBA'), (c * cell, r * cell))
out.save(dst, optimize=True)
print(f'checker greys {dark:.0f}/{light:.0f}, wrote {dst} {out.size}')

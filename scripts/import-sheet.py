"""Turn a generated sprite sheet with a FAKE checkerboard background (JPG, no
alpha) into a clean transparent PNG with uniform cells.

  python3 scripts/import-sheet.py <src> <dst.png> <cols> <rows> <cell_w> [cell_h] [--loose]

cell_h defaults to keeping the source cell's aspect ratio (pass 0 for that).
--loose: treat every neutral grey between the two checker greys as background.
         Cleaner for sheets without grey-ish sprites (bosses); strict mode protects
         grey-green bodies (enemies).

How it works:
1. Find the two checker greys from the histogram of neutral pixels (they vary per sheet).
2. Candidate background = neutral pixels near those greys (or between them: JPEG blur).
3. Background = candidates CONNECTED to the cell borders (flood fill), so grey or dark
   parts inside a sprite survive. Enclosed checker islands (gaps between ribs, legs)
   are removed if they contain both greys.
4. Soften the edge by one pixel, un-blend the colour, crop the grid, resize.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
cols, rows, cell_w = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
args = [a for a in sys.argv[6:] if not a.startswith('--')]
loose = '--loose' in sys.argv
cell_h_arg = (int(args[0]) or None) if args else None

im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
v = im.mean(2)
sat = im.max(2) - im.min(2)
neutral = sat < 11

# 1. the two checker greys = the two strongest peaks of neutral values
hist, edges = np.histogram(v[neutral], bins=128, range=(0, 256))
smooth = np.convolve(hist, np.ones(3) / 3, mode='same')
p1 = int(np.argmax(smooth))
masked = smooth.copy()
masked[max(0, p1 - 12):p1 + 13] = 0
p2 = int(np.argmax(masked))
g_dark, g_light = sorted([(p1 + 0.5) * 2, (p2 + 0.5) * 2])

# 2. candidates: neutral and within the grey band (tight on the dark side: outlines are dark)
# Close to either grey (any neutral pixel), or in between ONLY if perfectly grey
# (JPEG edge blur). Greyish-green bodies sit in between with a hint of colour: kept.
near_dark = np.abs(v - g_dark) <= (5 if g_dark < 30 else 9)
near_light = np.abs(v - g_light) <= 10
between = (v > g_dark) & (v < g_light) & ((sat < 11) if loose else (sat < 5))
cand = neutral & (near_dark | near_light | between)

# 3. flood fill from cell borders
# .copy(): images made from numpy arrays are read-only and floodfill would silently do nothing
mask = Image.fromarray(np.where(cand, 255, 0).astype(np.uint8), 'L').copy()
cw, ch = W / cols, H / rows
seeds = []
for c in range(cols + 1):
    x = min(W - 1, int(round(c * cw)))
    seeds += [(x, y) for y in range(0, H, 3)]
for r in range(rows + 1):
    y = min(H - 1, int(round(r * ch)))
    seeds += [(x, y) for x in range(0, W, 3)]
for (x, y) in seeds:
    if mask.getpixel((x, y)) == 255:
        ImageDraw.floodfill(mask, (x, y), 128, thresh=0)
m = np.asarray(mask).copy()

# enclosed islands: remove if they look like checker (both greys present, big enough)
for _ in range(400):
    left = np.argwhere(m == 255)
    if not len(left):
        break
    y, x = left[0]
    tmp = Image.fromarray(m, 'L').copy()
    ImageDraw.floodfill(tmp, (int(x), int(y)), 100, thresh=0)
    m = np.asarray(tmp).copy()
    region = m == 100
    vals = v[region]
    if not region.any():
        m[int(y), int(x)] = 50
        continue
    both = (np.abs(vals - g_dark) < 8).mean() > 0.2 and (np.abs(vals - g_light) < 10).mean() > 0.2
    m[region] = 128 if (region.sum() > 30 and both) else 50

bg = m == 128
# Drop small opaque leftovers that are grey (checker crumbs); keep coloured chips (gore).
op = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), 'L').copy()
opa = np.asarray(op).copy()
ys, xs = np.nonzero(opa == 255)
seen = np.zeros_like(opa, dtype=bool)
for y, x in zip(ys[::7], xs[::7]):
    if seen[y, x] or opa[y, x] != 255:
        continue
    tmp = Image.fromarray(opa, 'L').copy()
    ImageDraw.floodfill(tmp, (int(x), int(y)), 77, thresh=0)
    reg = np.asarray(tmp) == 77
    seen |= reg
    if reg.sum() < 60 and sat[reg].mean() < 12:
        bg |= reg
alpha = np.where(bg, 0.0, 1.0).astype(np.float32)
# 4. soft 1px edge + speck removal
a_img = Image.fromarray((alpha * 255).astype(np.uint8), 'L')
a_img = a_img.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))   # drop specks
a_img = a_img.filter(ImageFilter.GaussianBlur(0.6))
alpha = np.asarray(a_img).astype(np.float32) / 255

near = np.where(np.abs(v - g_dark) < np.abs(v - g_light), g_dark, g_light)
bgc = np.repeat(near[:, :, None], 3, axis=2)
a3 = np.maximum(alpha, 1e-3)[:, :, None]
fg = np.where(a3 > 0.95, im, np.clip((im - (1 - a3) * bgc) / a3, 0, 255))
full = Image.fromarray(np.dstack([fg, alpha[:, :, None] * 255]).astype(np.uint8), 'RGBA')

cell_h = cell_h_arg or int(round(cell_w * ch / cw))
out = Image.new('RGBA', (cols * cell_w, rows * cell_h), (0, 0, 0, 0))
for r in range(rows):
    for c in range(cols):
        tile = full.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
        arr = np.asarray(tile).astype(np.float32)
        pm = arr.copy(); pm[:, :, :3] *= arr[:, :, 3:4] / 255
        small = np.asarray(Image.fromarray(pm.astype(np.uint8), 'RGBA').resize((cell_w, cell_h), Image.LANCZOS)).astype(np.float32)
        a = small[:, :, 3:4] / 255
        small[:, :, :3] = np.where(a > 0, small[:, :, :3] / np.maximum(a, 1e-3), 0)
        out.paste(Image.fromarray(np.clip(small, 0, 255).astype(np.uint8), 'RGBA'), (c * cell_w, r * cell_h))
out.save(dst, optimize=True)
print(f'{src}: greys {g_dark:.0f}/{g_light:.0f}, cells {cell_w}x{cell_h}, wrote {dst} {out.size}')

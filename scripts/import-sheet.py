"""Turn a generated sprite sheet with a FAKE checkerboard background (JPG, no
alpha) into a clean transparent PNG with uniform cells.

  python3 scripts/import-sheet.py <src> <dst.png> <cols> <rows> <cell_w> [cell_h] [--loose]

cell_h defaults to keeping the source cell's aspect ratio (pass 0 for that).
--fit:   sprites that overflow their grid cell (generated sheets often do) are
         collected by connected piece, assigned to the cell holding their centre,
         and each ROW is cropped to its real content (same crop and scale for every
         frame of the row, so animation does not jitter). Nothing gets cut.
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
fit = '--fit' in sys.argv
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

def paste_scaled(tile, dst_x, dst_y, scale, ox, oy):
    """Resize `tile` by `scale` (premultiplied) and paste at dst + (ox, oy)."""
    tw, th = max(1, round(tile.width * scale)), max(1, round(tile.height * scale))
    arr = np.asarray(tile).astype(np.float32)
    pm = arr.copy(); pm[:, :, :3] *= arr[:, :, 3:4] / 255
    small = np.asarray(Image.fromarray(pm.astype(np.uint8), 'RGBA').resize((tw, th), Image.LANCZOS)).astype(np.float32)
    a = small[:, :, 3:4] / 255
    small[:, :, :3] = np.where(a > 0, small[:, :, :3] / np.maximum(a, 1e-3), 0)
    out.alpha_composite(Image.fromarray(np.clip(small, 0, 255).astype(np.uint8), 'RGBA'), (dst_x + ox, dst_y + oy))

if fit:
    # Label opaque pieces; each goes to the cell that holds its centre.
    solid = (alpha > 0.35)
    work = Image.fromarray(np.where(solid, 255, 0).astype(np.uint8), 'L').copy()
    owner = np.full((H, W), -1, dtype=np.int32)
    ys, xs = np.nonzero(solid)
    for y, x in zip(ys[::5], xs[::5]):
        if owner[y, x] != -1:
            continue
        tmp = work.copy()
        ImageDraw.floodfill(tmp, (int(x), int(y)), 77, thresh=0)
        reg = np.asarray(tmp) == 77
        if not reg.any():
            continue
        ry, rx = np.nonzero(reg)
        if reg.sum() < 120:          # crumbs: belong to nobody (and do not stretch the crop)
            owner[reg] = -2
        else:
            cr = min(rows - 1, int(ry.mean() // ch)); cc = min(cols - 1, int(rx.mean() // cw))
            owner[reg] = cr * cols + cc
        work.paste(0, mask=Image.fromarray((reg * 255).astype(np.uint8), 'L'))
    # Soft edges belong to the nearest owned pixel's cell: grow ownership a little.
    for r in range(rows):
        # Row bbox relative to each cell origin, over all frames of the row.
        x0s, y0s, x1s, y1s = [], [], [], []
        for c in range(cols):
            m = owner == r * cols + c
            if not m.any():
                continue
            yy, xx = np.nonzero(m)
            x0s.append(xx.min() - c * cw); x1s.append(xx.max() - c * cw)
            y0s.append(yy.min() - r * ch); y1s.append(yy.max() - r * ch)
        if not x0s:
            continue
        bx0, by0, bx1, by1 = min(x0s) - 2, min(y0s) - 2, max(x1s) + 3, max(y1s) + 3
        bw, bh = bx1 - bx0, by1 - by0
        scale = min((cell_w - 4) / bw, (cell_h - 4) / bh)
        ox = int((cell_w - bw * scale) / 2); oy = int((cell_h - bh * scale) / 2)
        for c in range(cols):
            m = owner == r * cols + c
            if not m.any():
                continue
            # this cell's pixels only (others transparent), soft edge kept via dilation
            mm = Image.fromarray((m * 255).astype(np.uint8), 'L').filter(ImageFilter.MaxFilter(5))
            piece = full.copy()
            pa = np.asarray(piece).copy()
            pa[:, :, 3] = (pa[:, :, 3].astype(np.float32) * (np.asarray(mm) / 255)).astype(np.uint8)
            piece = Image.fromarray(pa, 'RGBA')
            sx0, sy0 = round(c * cw + bx0), round(r * ch + by0)
            tile = piece.crop((sx0, sy0, sx0 + round(bw), sy0 + round(bh)))
            paste_scaled(tile, c * cell_w, r * cell_h, scale, ox, oy)
    out.save(dst, optimize=True)
    print(f'{src}: greys {g_dark:.0f}/{g_light:.0f}, FIT cells {cell_w}x{cell_h}, wrote {dst} {out.size}')
    sys.exit(0)

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

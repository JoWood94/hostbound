#!/usr/bin/env python3
"""Hand-built pixel art for the player's shot sheet (public/sprites/shots_player.png).

Every sprite is drawn pixel by pixel on a 32x32 grid, with a fixed palette, a
1 px dark outline, light from the top-left with ordered dithering between the
colour bands, and a stepped (not blurred) glow; then scaled x3 with nearest
neighbour into 96 px cells. 8 columns x 2 rows, same cells the game reads:

  row 0: spit, slug glob, pellet, rocket pod, larva (lies sideways, head right),
         echo round, bone needle, charged glob
  row 1: small glob, splash, droplet burst, teardrop, spark burst,
         beam slice (tiles vertically), rail streak, bone chips

Usage: python3 scripts/pixel-shots.py [out.png]   (default: the game's sheet)
"""
import math
import sys
from PIL import Image

N = 32            # logical pixels per cell
SCALE = 3         # 32 x 3 = 96 px cells
COLS, ROWS = 8, 2

# palette
O = (7, 4, 10)          # outline
D = (40, 66, 8)         # dark green
M = (112, 164, 12)      # mid green
A = (198, 255, 26)      # acid green
L = (230, 255, 138)     # light
C = (248, 255, 222)     # hot core
B0, B1, B2, B3 = (74, 58, 40), (138, 117, 83), (205, 187, 142), (244, 236, 208)   # bone
GREENS = [D, M, A, L, C]
BONES = [B0, B1, B2, B3, B3]

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


class Cell:
    def __init__(self):
        self.px = {}            # (x, y) -> (r, g, b, a)

    def put(self, x, y, col, a=255):
        if 0 <= x < N and 0 <= y < N:
            self.px[(x, y)] = (*col, a)

    def filled(self, x, y):
        p = self.px.get((x, y))
        return p is not None and p[3] > 200


def band(v, x, y, ramp=GREENS, dither=0.14):
    """v in 0..1 -> palette colour, with ordered dithering at band edges."""
    v += (BAYER[y % 4][x % 4] / 16 - 0.5) * dither
    i = max(0, min(len(ramp) - 1, int(v * len(ramp))))
    return ramp[i]


def blob(c, cx, cy, rx, ry=None, ramp=GREENS, lumpy=0.0, seed=0, hot=True):
    """A shaded ellipse lit from the top-left. `lumpy` wobbles the edge."""
    ry = ry or rx
    for y in range(N):
        for x in range(N):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            ang = math.atan2(dy, dx)
            edge = 1 + lumpy * (math.sin(ang * 5 + seed) * 0.6 + math.sin(ang * 3 - seed * 2) * 0.4)
            d = math.hypot(dx, dy) / edge
            if d > 1:
                continue
            light = (-dx - dy) * 0.5 + 0.5           # top-left bright
            v = 0.15 + 0.55 * light + 0.35 * (1 - d * d)
            c.put(x, y, band(min(1, v), x, y, ramp))
    if hot:   # a small hot highlight up-left of centre
        hx, hy = int(cx - rx * 0.35), int(cy - ry * 0.4)
        c.put(hx, hy, C); c.put(hx + 1, hy, C); c.put(hx, hy + 1, L)


def drip(c, x, y0, length, width=1):
    """A drip of plasma hanging down from (x, y0), thinning and fading."""
    for k in range(length):
        t = k / max(1, length - 1)
        col = M if t < 0.5 else D
        a = int(255 * (1 - t * 0.7))
        w = width if t < 0.6 else 1
        for dx in range(w):
            c.put(x + dx, y0 + k, col, a)


def smear(c, cx, y0, w0, length):
    """The glowing smear a shot leaves behind it: starts under the body,
    tapers to a point and fades, a brighter thread down the middle."""
    y0 -= 2                                       # tucked under the body's outline
    for k in range(length):
        t = k / max(1, length - 1)
        w = max(0.5, w0 * (1 - t))
        wob = math.sin(k * 0.8) * 0.5 * t
        for x in range(N):
            dx = x + 0.5 - (cx + wob)
            if abs(dx) > w or (x, y0 + k) in c.px:
                continue
            mid = abs(dx) < max(0.6, w * 0.35)
            col = (A if mid else M) if t < 0.45 else (M if mid else D)
            c.put(x, y0 + k, col, int(40 + 170 * (1 - t) ** 1.3))
    c.put(round(cx - 1), y0 + length + 1, M, 110)


def outline(c, col=O):
    pts = list(c.px.items())
    solid = {k for k, v in pts if v[3] > 200}
    for (x, y) in list(solid):
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if (nx, ny) not in c.px and 0 <= nx < N and 0 <= ny < N:
                c.px[(nx, ny)] = (*col, 255)


def glow(c, col=A, steps=(42,)):
    """Stepped glow: rings of translucent pixels around the sprite."""
    for a in steps:
        edge = set()
        for (x, y) in list(c.px):
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if (nx, ny) not in c.px and 0 <= nx < N and 0 <= ny < N:
                    edge.add((nx, ny))
        for (x, y) in edge:
            c.px[(x, y)] = (*col, a)


def line(c, x0, y0, x1, y1, col, a=255):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n):
        t = i / max(1, n - 1)
        c.put(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), col, a)


# ---------------------------------------------------------------------------
# sprites
# ---------------------------------------------------------------------------
def spit():
    c = Cell()
    blob(c, 16, 13, 5)
    outline(c)
    smear(c, 16, 19, 3, 9)
    glow(c)
    return c


def slug():
    c = Cell()
    blob(c, 16, 13, 8, 8, lumpy=0.08, seed=1)
    # dark cracks
    for (x0, y0, x1, y1) in ((12, 10, 15, 13), (15, 13, 14, 17), (18, 9, 20, 12), (17, 15, 20, 17)):
        line(c, x0, y0, x1, y1, D)
    outline(c)
    smear(c, 16, 22, 5, 9)
    glow(c)
    return c


def pellet():
    c = Cell()
    blob(c, 16, 16, 2.6, hot=False)
    c.put(15, 15, C)
    outline(c)
    smear(c, 16, 19, 1.5, 4)
    glow(c, steps=(60,))
    return c


def rocket():
    c = Cell()
    # teardrop pod pointing up
    for y in range(N):
        for x in range(N):
            ty = (y + 0.5 - 6) / 13           # 0 at tip .. 1 at base
            if not 0 <= ty <= 1:
                continue
            w = 5.2 * math.sin(math.pi * min(1, ty * 1.15)) ** 0.8
            dx = (x + 0.5 - 16) / max(0.1, w)
            if abs(dx) > 1:
                continue
            light = (-dx) * 0.5 + 0.5
            v = 0.2 + 0.5 * light + 0.3 * (1 - dx * dx) - 0.15 * ty
            c.put(x, y, band(v, x, y))
    c.put(15, 10, C); c.put(15, 11, L)
    outline(c)
    # smoke puffs below (dark green, translucent, outside the outline)
    for (x, y, r, a) in ((16, 22, 1.8, 170), (14.5, 25.5, 2.0, 120), (17, 29, 1.6, 80)):
        for yy in range(N):
            for xx in range(N):
                d2 = (xx - x) ** 2 + (yy - y) ** 2
                if d2 <= r * r and (xx, yy) not in c.px:
                    c.put(xx, yy, M if d2 < r * r * 0.35 and yy < y else D, a)
    glow(c, steps=(50,))
    return c


def larva():
    """Lies sideways (head to the right): the game turns it so the head leads."""
    c = Cell()
    pts = []
    for i in range(40):
        t = i / 39
        x = 3 + t * 24
        y = 16 + math.sin(t * math.pi * 2.2) * 5
        pts.append((x, y, 1.6 + 1.6 * t))     # thicker toward the head
    for (x, y, r) in pts:
        for yy in range(int(y - r - 1), int(y + r + 2)):
            for xx in range(int(x - r - 1), int(x + r + 2)):
                dx, dy = xx + 0.5 - x, yy + 0.5 - y
                if dx * dx + dy * dy <= r * r:
                    light = 0.5 - dy / (2 * r)
                    c.put(xx, yy, band(0.3 + 0.6 * light, xx, yy))
    hx, hy, _ = pts[-1]
    blob(c, hx + 1.5, hy, 3.2, 3.0)                          # the head
    c.put(round(hx) + 3, round(hy) - 2, O); c.put(round(hx) + 3, round(hy) + 1, O)   # two dark pits
    c.put(round(hx) - 1, round(hy) - 2, D); c.put(round(hx) - 1, round(hy) + 2, D)   # the neck
    for k in range(4, 34, 6):                                # segment rings
        x, y, r = pts[k]
        c.put(int(x), int(y + r * 0.3), D)
    outline(c); glow(c)
    return c


def echo():
    c = Cell()
    blob(c, 16, 14, 12, 12, lumpy=0.03)
    # dark veins branching from the centre
    for ang in (0.3, 1.5, 2.6, 3.7, 4.8, 5.8):
        x, y = 16.0, 14.0
        for k in range(10):
            a = ang + math.sin(k * 0.9 + ang) * 0.35
            x += math.cos(a) * 1.1; y += math.sin(a) * 1.1
            if (int(x) - 16) ** 2 + (int(y) - 14) ** 2 < 100:
                c.put(int(x), int(y), D if k > 2 else M)
    outline(c)
    smear(c, 16, 27, 6, 5)
    glow(c)
    return c


def needle():
    """A curved, sharpened bone spike: wide knuckled base, a slight hook to the tip."""
    c = Cell()
    for y in range(1, 26):
        t = (y - 1) / 24                      # 0 tip .. 1 base
        w = 0.5 + 3.2 * t ** 1.4
        cx = 16 + math.sin(t * math.pi) * 1.2  # a slight curve
        for x in range(N):
            dx = (x + 0.5 - cx) / w
            if abs(dx) <= 1:
                v = 0.25 + 0.5 * (0.5 - dx * 0.5) + 0.25 * (1 - t)
                c.put(x, y, band(v, x, y, BONES, 0.2))
    blob(c, 13.5, 25, 2.6, 2.2, ramp=BONES, hot=False)
    blob(c, 18.5, 25, 2.6, 2.2, ramp=BONES, hot=False)
    c.put(16, 2, B3); c.put(16, 1, A)        # an acid-wet tip
    for (x, y) in ((16, 12), (17, 17), (15, 21)):
        c.put(x, y, B1)                       # pits in the bone
    outline(c)
    smear(c, 16, 29, 2, 3)
    glow(c)
    return c


def charged():
    c = Cell()
    blob(c, 16, 15, 6)
    outline(c)
    # a jagged crackling rim of pale pixels around it
    for k in range(18):
        a = k / 18 * math.pi * 2
        r = 8.5 + (2 if k % 3 == 0 else 0.5 * math.sin(k * 7))
        c.put(round(16 + math.cos(a) * r), round(15 + math.sin(a) * r), L if k % 2 else C)
    smear(c, 16, 22, 3, 6)
    glow(c, steps=(48, 20))
    return c


def small():
    c = Cell()
    blob(c, 16, 14, 4)
    outline(c)
    smear(c, 16, 19, 2.5, 7)
    glow(c)
    return c


def splash():
    """A shot hitting: a flat puddle, and droplets thrown up and out of it."""
    c = Cell()
    for y in range(N):
        for x in range(N):
            dx, dy = (x + 0.5 - 16) / 9, (y + 0.5 - 23) / 2.6
            if dx * dx + dy * dy <= 1:
                c.put(x, y, band(0.5 - dy * 0.35, x, y))
    for (x, y, sx, sy) in ((7, 15, -1, 1), (10, 10, -1, 1), (14, 7, 0, 1), (19, 8, 0, 1), (22, 11, 1, 1), (25, 16, 1, 1)):
        blob(c, x, y, 1.4, hot=False)
        for k in (2, 3):                      # a short streak back toward the puddle
            c.put(x - sx * k // 2, y + sy * k, M, 170 - k * 40)
    outline(c); glow(c)
    return c


def droplets():
    """A burst: droplets flying out from a bright pop, each with a short streak."""
    c = Cell()
    for k in range(8):
        a = k / 8 * math.pi * 2 + 0.3
        r = 10 + (k % 2) * 2.5
        x, y = 16 + math.cos(a) * r, 16 + math.sin(a) * r
        blob(c, x, y, 1.5 if k % 2 else 1.9, hot=False)
        for s2 in (2.5, 4):
            c.put(round(16 + math.cos(a) * (r - s2)), round(16 + math.sin(a) * (r - s2)), M, 150 if s2 < 3 else 90)
    for k in range(5):
        a = k / 5 * math.pi * 2 + 1.1
        c.put(round(16 + math.cos(a) * 6), round(16 + math.sin(a) * 6), L)
    blob(c, 16, 16, 2.2)
    outline(c); glow(c)
    return c


def teardrop():
    c = Cell()
    for y in range(N):
        for x in range(N):
            ty = (y + 0.5 - 6) / 13
            if not 0 <= ty <= 1:
                continue
            w = 5.2 * math.sin(math.pi * min(1, ty * 1.15)) ** 0.8
            dx = (x + 0.5 - 16) / max(0.1, w)
            if abs(dx) <= 1:
                c.put(x, y, band(0.2 + 0.5 * (0.5 - dx * 0.5) + 0.3 * (1 - dx * dx) - 0.15 * ty, x, y))
    c.put(15, 10, C); c.put(15, 11, L)
    outline(c)
    smear(c, 16, 20, 3.5, 8)
    glow(c)
    return c


def sparks():
    c = Cell()
    blob(c, 16, 16, 3.2)
    for k in range(8):
        a = k / 8 * math.pi * 2
        ln = 9 if k % 2 == 0 else 5
        for s in range(3, ln):
            x, y = 16 + math.cos(a) * s, 16 + math.sin(a) * s
            c.put(round(x), round(y), C if s < 5 else (L if s < 7 else A))
    outline(c); glow(c, steps=(45,))
    return c


def beam_slice():
    """Three twisted strands around a hot core; tiles top to bottom."""
    c = Cell()
    for y in range(N):
        for x in range(N):
            dx = x + 0.5 - 16
            if abs(dx) <= 2.5:
                c.put(x, y, C if abs(dx) <= 1.2 else L)
        for k in range(3):
            ph = y / N * math.pi * 2 + k * math.pi * 2 / 3
            sx = 16 + math.sin(ph) * 6
            front = math.cos(ph) > 0
            for w in range(-1, 2):
                xx = round(sx) + w
                col = (A if w == 0 else M) if front else D
                if front or (xx, y) not in c.px:
                    c.put(xx, y, col)
    # outline only at the sides (top and bottom must tile)
    solid = {k for k, v in c.px.items() if v[3] > 200}
    for (x, y) in solid:
        for nx in (x - 1, x + 1):
            if (nx, y) not in c.px:
                c.px[(nx, y)] = (*O, 255)
    return c


def rail():
    c = Cell()
    for x in range(1, 31):
        c.put(x, 16, C); c.put(x, 15, L); c.put(x, 17, A)
    for k in range(9):
        x = 3 + k * 3
        c.put(x, 13 - (k % 2), A, 200); c.put(x + 1, 19 + (k % 2), L, 160)
    glow(c, steps=(48, 20))
    return c


def bone_chips():
    c = Cell()
    for k in range(9):
        a = k / 9 * math.pi * 2 + 0.4
        r = 5 + (k % 3) * 3
        x, y = 16 + math.cos(a) * r, 16 + math.sin(a) * r
        blob(c, x, y, 1.3 + (k % 2) * 0.6, ramp=BONES, hot=False)
    blob(c, 16, 16, 2.2)
    outline(c); glow(c, steps=(40,))
    return c


SHEET = [
    [spit, slug, pellet, rocket, larva, echo, needle, charged],
    [small, splash, droplets, teardrop, sparks, beam_slice, rail, bone_chips],
]


def render(out):
    img = Image.new('RGBA', (COLS * N * SCALE, ROWS * N * SCALE), (0, 0, 0, 0))
    for r, row in enumerate(SHEET):
        for col, fn in enumerate(row):
            cell = fn()
            for (x, y), rgba in cell.px.items():
                for sy in range(SCALE):
                    for sx in range(SCALE):
                        img.putpixel(((col * N + x) * SCALE + sx, (r * N + y) * SCALE + sy), rgba)
    img.save(out)
    print('wrote', out, img.size)


if __name__ == '__main__':
    render(sys.argv[1] if len(sys.argv) > 1 else 'public/sprites/shots_player.png')

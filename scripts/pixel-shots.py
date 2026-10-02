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

shots_bio (v1.2 carrier bodies):
  row 0: glaive, glaive (turned), mine, mine about to burst, seed shell,
         seed shell splitting, husk shell, burst egg sac
  row 1: maggot, maggot bent, maggot curled (latched), stinger (tip up),
         stinger stuck (tip down), stuck stinger about to burst, stinger pop

shots_trait (the bolt's look follows the build's dominant trait):
  row 0: venom, frag, arc, seeker, brand, fission, ghost, ricochet
  row 1: skyshot, crit, drone dart, shrapnel shard, fission child,
         echo fragment, heartbeat volley, afterglow ribbon

Usage: python3 scripts/pixel-shots.py [sheet] [out.png]   (no args: every sheet)
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


# ---------------------------------------------------------------------------
# v1.2 carrier bodies (public/sprites/shots_bio.png)
# ---------------------------------------------------------------------------
HOT = (255, 226, 140)   # a stinger about to burst: pale heat, never threat orange


def polar(c, fn):
    for y in range(N):
        for x in range(N):
            dx, dy = x + 0.5 - 16, y + 0.5 - 16
            fn(x, y, math.hypot(dx, dy), math.atan2(dy, dx))


def glaive(phase=0.0):
    """Three curved bone blades round a green hub, acid on the cutting edge."""
    c = Cell()
    def px(x, y, r, a):
        if r < 2.5 or r > 12:
            return
        for k in range(3):
            centre = k * math.pi * 2 / 3 + phase + r * 0.11      # blades sweep back
            d = math.atan2(math.sin(a - centre), math.cos(a - centre))
            half = 0.62 * (1 - (r / 12.5) ** 1.6) + 0.06
            if abs(d) <= half:
                lead = d > half * 0.45                            # the leading edge
                v = 0.3 + 0.5 * (1 - r / 12.5) + (0.25 if d < 0 else 0)
                c.put(x, y, A if lead and r > 5 else band(v, x, y, BONES, 0.2))
    polar(c, px)
    blob(c, 16, 16, 3.2)
    outline(c); glow(c)
    return c


def glaive_b():
    return glaive(math.pi / 3)


def mine(swollen=False):
    c = Cell()
    r = 8.5 if swollen else 7
    blob(c, 16, 16, r, r * 0.95, lumpy=0.05, seed=2)
    for (x, y) in ((12, 13), (19, 12), (17, 19), (12, 19), (20, 16)):
        c.put(x, y, L if not swollen else C)
        c.put(x + 1, y, M)
    if swollen:   # glowing cracks
        for (x0, y0, x1, y1) in ((10, 15, 14, 17), (18, 9, 20, 13), (16, 20, 19, 23)):
            line(c, x0, y0, x1, y1, C)
    outline(c); glow(c, steps=(60, 25) if swollen else (42,))
    return c


def mine_swollen():
    return mine(True)


def seed_shell(split=False):
    c = Cell()
    parts = [(-7, 3), (0, -2), (7, 3)] if split else [(0, 0)]
    for (ox, oy) in parts:
        rx, ry = (2.6, 4) if split else (5, 8)
        cx, cy = 16 + ox, 16 + oy
        for y in range(N):
            for x in range(N):
                dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                taper = 1 - max(0, -dy) * 0.35          # pointed top
                if dx * dx / (taper * taper) + dy * dy <= 1:
                    v = 0.25 + 0.5 * (0.5 - dx * 0.5) + 0.25 * (1 - dy * dy)
                    col = band(v, x, y)
                    if abs(abs(dx) - 0.5) < (0.5 / rx) and abs(dy) < 0.8:
                        col = D if dx > 0 else M          # two seams down the husk
                    c.put(x, y, col)
    outline(c)
    if not split:
        smear(c, 16, 26, 2.5, 5)
    glow(c)
    return c


def seed_split():
    return seed_shell(True)


def husk():
    """A thin translucent half-moon shell, dithered."""
    c = Cell()
    def px(x, y, r, a):
        if 9 <= r <= 13 and -math.pi < a < 0:
            dith = BAYER[y % 4][x % 4] / 16
            alpha = 230 if r > 11.5 else (150 if dith > 0.35 else 90)
            c.put(x, y, L if r > 12 else A, alpha)
    polar(c, px)
    for k in range(5):                                 # cracks
        a = -math.pi * (0.15 + k * 0.17)
        c.put(round(16 + math.cos(a) * 11), round(16 + math.sin(a) * 11), D)
    glow(c, steps=(35,))
    return c


def egg_burst():
    c = Cell()
    def px(x, y, r, a):
        torn = 6 + 1.5 * math.sin(a * 7)
        if r <= 9 and r >= torn and a > -2.4:
            c.put(x, y, band(0.3 + 0.4 * (1 - r / 9), x, y))
    polar(c, px)
    for (x, y) in ((16, 9), (13, 6), (20, 7), (10, 10), (22, 11)):
        blob(c, x, y, 1.3, hot=False)
    outline(c); glow(c)
    return c


def maggot(curve=0.0, curl=False):
    """A grotesque maggot seen from above, head up: a small dark head with two
    hooked mandibles, then fat creased segments tapering to the tail."""
    c = Cell()
    segs = [(0, 2.5), (3.8, 3.8), (8.2, 4.3), (12.4, 3.8), (16, 3.0), (19, 2.0)]   # (distance from head, radius)
    pts = []
    for (d, r) in segs:
        if curl:
            a = -math.pi * 0.95 + d / 19 * math.pi * 1.45
            x, y = 16 + 7.5 * math.cos(a), 17 + 7.5 * math.sin(a)
        else:
            x, y = 16 + curve * (d / 19) ** 2 * 6, 6 + d
        pts.append((x, y, r))
    for i, (x, y, r) in reversed(list(enumerate(pts))):
        for yy in range(N):
            for xx in range(N):
                dx, dy = (xx + 0.5 - x) / r, (yy + 0.5 - y) / r
                d2 = dx * dx + dy * dy
                if d2 <= 1:
                    v = 0.2 + 0.45 * (0.5 - dx * 0.35 - dy * 0.35) + 0.3 * (1 - d2)
                    ramp = [O, D, D, M, A] if i == 0 else [D, M, A, L, L]
                    c.put(xx, yy, band(v, xx, yy, ramp, 0.18))
        if i:   # a dark crease where the segment meets the one before
            px0, py0, _ = pts[i - 1]
            mx, my = (x + px0) / 2, (y + py0) / 2
            nx, ny = -(y - py0), (x - px0)
            nl = math.hypot(nx, ny) or 1
            for k in (-2, -1, 0, 1, 2):
                c.put(round(mx + nx / nl * k * 1.2), round(my + ny / nl * k * 1.2), D)
    # hooked mandibles reaching forward from the head
    hx, hy, hr = pts[0]
    fx, fy = (pts[0][0] - pts[1][0]), (pts[0][1] - pts[1][1])
    fl = math.hypot(fx, fy) or 1
    fx, fy = fx / fl, fy / fl
    sx, sy = -fy, fx
    for side in (-1, 1):
        x0, y0 = hx + sx * side * 1.5 + fx * 1.5, hy + sy * side * 1.5 + fy * 1.5
        x1, y1 = x0 + fx * 2.5 + sx * side * 0.8, y0 + fy * 2.5 + sy * side * 0.8
        x2, y2 = x1 + fx * 1.2 - sx * side * 1.4, y1 + fy * 1.2 - sy * side * 1.4
        line(c, x0, y0, x1, y1, B1); line(c, x1, y1, x2, y2, B2)
    outline(c); glow(c)
    return c


def maggot_bent():
    return maggot(1.0)


def maggot_curled():
    return maggot(curl=True)


def stinger(flip=False, hot=False):
    """A barbed bone stinger, tip up (flip: stuck tip down)."""
    c = Cell()
    def P(x, y, col, a=255):
        c.put(x, (N - 1 - y) if flip else y, col, a)
    for y in range(4, 25):
        t = (y - 4) / 20
        w = 0.5 + 2.4 * t ** 1.2
        for x in range(N):
            dx = (x + 0.5 - 16) / w
            if abs(dx) <= 1:
                ramp = [B0, B1, B2, B3, HOT] if hot else BONES
                P(x, y, band(0.3 + 0.5 * (0.5 - dx * 0.5) + 0.2 * (1 - t), x, y, ramp, 0.2))
    for (y, w) in ((10, 3), (15, 4), (20, 5)):                    # barbs pointing back
        for k in range(w):
            P(16 - 1 - k, y + k, B2); P(16 + 1 + k, y + k, B1)
    for y in range(25, 29):                                       # glowing tail
        for x in (15, 16, 17):
            P(x, y, HOT if hot else (A if x == 16 else M), 255 if y < 27 else 160)
    P(16, 3, HOT if hot else A)
    outline(c)
    glow(c, col=HOT if hot else A, steps=(70, 30) if hot else (42,))
    return c


def stinger_stuck():
    return stinger(True)


def stinger_hot():
    return stinger(True, True)


def stinger_pop():
    c = Cell()
    for k in range(9):
        a = k / 9 * math.pi * 2
        r = 6 + (k % 3) * 2.5
        x, y = 16 + math.cos(a) * r, 16 + math.sin(a) * r
        line(c, 16 + math.cos(a) * (r - 3), 16 + math.sin(a) * (r - 3), x, y, B2 if k % 2 else B3)
    blob(c, 16, 16, 3, ramp=[B2, B3, HOT, HOT, C], hot=False)
    outline(c); glow(c, col=HOT, steps=(60, 25))
    return c


def empty():
    return Cell()


# ---------------------------------------------------------------------------
# shot looks by dominant trait (public/sprites/shots_trait.png)
# ---------------------------------------------------------------------------
def base_glob(c, r=4.5, cy=13):
    blob(c, 16, cy, r)


def t_venom():
    c = Cell(); base_glob(c)
    for (x, y, rr) in ((12, 18, 1.2), (19, 17, 1.0)):
        blob(c, x, y, rr, hot=False)                 # bubbles hanging off it
    for x, ln in ((14, 5), (18, 4)):
        for k in range(ln):
            c.put(x, 17 + k, M if k < ln - 1 else D)
        c.put(x, 17 + ln, A)                          # the drop at the end
    outline(c); smear(c, 16, 19, 2, 6); glow(c)
    return c


def t_frag():
    c = Cell(); base_glob(c, 4)
    for k in range(8):
        a = k / 8 * math.pi * 2
        for s2 in (5, 6, 7):
            c.put(round(16 + math.cos(a) * s2), round(13 + math.sin(a) * s2), B3 if s2 == 7 else B2)
    outline(c); smear(c, 16, 21, 2, 5); glow(c)
    return c


def t_arc():
    c = Cell(); base_glob(c)
    outline(c)
    for (x0, y0) in ((9, 9), (21, 8), (11, 17)):      # zig-zag sparks crawling on it
        x, y = x0, y0
        for k in range(5):
            c.put(x, y, C if k % 2 else L)
            x += 1 if x0 < 16 else -1
            y += 1 if k % 2 else -1
    smear(c, 16, 19, 2.5, 6); glow(c, steps=(55, 20))
    return c


def t_seeker():
    """Pointed and leaning into its turn, with a thin wake."""
    c = Cell()
    for y in range(N):
        for x in range(N):
            dx, dy = (x + 0.5 - 16) / 4.2, (y + 0.5 - 15) / 6
            taper = 1 - max(0, -dy) * 0.55
            if dx * dx / (taper * taper) + dy * dy <= 1:
                c.put(x, y, band(0.25 + 0.5 * (0.5 - dx * 0.5) + 0.25 * (1 - dy * dy), x, y))
    c.put(15, 11, C); c.put(16, 10, C)
    outline(c)
    for k in range(8):
        c.put(16 + (k % 2), 22 + k, M if k < 4 else D, 200 - k * 20)
    glow(c)
    return c


def t_brand():
    c = Cell(); base_glob(c)
    for k in range(14):                               # a burnt spiral scar
        a = k * 0.75
        r = 0.5 + k * 0.22
        c.put(round(16 + math.cos(a) * r), round(13 + math.sin(a) * r), D if k % 3 else O)
    outline(c); smear(c, 16, 19, 2.5, 6); glow(c)
    return c


def t_fission():
    c = Cell()
    blob(c, 13.5, 13, 3.6); blob(c, 18.5, 13, 3.6)
    c.put(16, 11, D); c.put(16, 15, D)                # the pinch
    outline(c); smear(c, 16, 18, 3, 6); glow(c)
    return c


def t_ghost():
    """Hollow: a dithered shell only, half transparent."""
    c = Cell()
    def px(x, y, r, a):
        if r <= 5.2:
            edge = r > 3.6
            if edge or BAYER[y % 4][x % 4] > 13:
                c.put(x, y, L if edge else A, 230 if edge else 110)
    for y in range(N):
        for x in range(N):
            px(x, y, math.hypot(x + 0.5 - 16, y + 0.5 - 13), 0)
    smear(c, 16, 19, 2, 6); glow(c, col=L, steps=(30,))
    return c


def t_ricochet():
    c = Cell(); base_glob(c)
    for y in (11, 15):                                # two dark bands, like a bouncing ball
        for x in range(12, 21):
            if (x, y) in c.px:
                c.put(x, y, D)
    outline(c); smear(c, 16, 19, 2.5, 5); glow(c)
    return c


def t_sky():
    c = Cell(); base_glob(c, 4)
    for side in (-1, 1):                              # flat membrane fins
        for k in range(5):
            for w in range(3 - k // 2):
                c.put(16 + side * (5 + k), 12 + w + k // 2, M if w else A, 220)
    outline(c); smear(c, 16, 18, 2, 6); glow(c)
    return c


def t_crit():
    c = Cell()
    for y in range(N):
        for x in range(N):
            dx, dy = abs(x + 0.5 - 16), abs(y + 0.5 - 14)
            if dx / 4 + dy / 8 <= 1:
                c.put(x, y, band(0.35 + 0.5 * (1 - dx / 4) + 0.15 * (1 - dy / 8), x, y))
    c.put(16, 10, C); c.put(16, 11, C)
    outline(c); smear(c, 16, 23, 1.5, 4); glow(c, steps=(55, 20))
    return c


def t_dart():
    c = Cell()
    for y in range(8, 22):
        t = (y - 8) / 13
        w = 0.6 + 1.6 * math.sin(math.pi * min(1, t * 1.1))
        for x in range(N):
            if abs(x + 0.5 - 16) <= w:
                c.put(x, y, band(0.3 + 0.5 * (1 - t) + 0.2 * (0.5 - (x - 16) / 4), x, y))
    outline(c); smear(c, 16, 23, 1.2, 4); glow(c)
    return c


def t_shard():
    c = Cell()
    poly = [(13, 7), (18, 10), (20, 17), (16, 23), (14, 18), (11, 13)]
    for y in range(N):
        for x in range(N):
            inside = False
            j = len(poly) - 1
            for i2 in range(len(poly)):
                xi, yi = poly[i2]; xj, yj = poly[j]
                if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                    inside = not inside
                j = i2
            if inside:
                c.put(x, y, band(0.35 + 0.4 * (1 - (x - 11) / 10) + 0.2 * (1 - (y - 7) / 16), x, y))
    line(c, 14, 10, 17, 18, L)
    outline(c); glow(c)
    return c


def t_child():
    c = Cell(); blob(c, 16, 14, 2.8)
    outline(c); smear(c, 16, 18, 1.6, 5); glow(c)
    return c


def t_echo_small():
    c = Cell(); blob(c, 16, 14, 5)
    for ang in (0.5, 2.1, 3.6, 5.1):
        x, y = 16.0, 14.0
        for k in range(4):
            x += math.cos(ang) * 1.1; y += math.sin(ang) * 1.1
            c.put(int(x), int(y), D)
    outline(c); smear(c, 16, 20, 2.5, 6); glow(c)
    return c


def t_beat():
    c = Cell(); blob(c, 16, 14, 5.5)
    for k in range(10):                               # veins radiating out like a pulse
        a = k / 10 * math.pi * 2
        for s2 in (7, 8):
            c.put(round(16 + math.cos(a) * s2), round(14 + math.sin(a) * s2), D if s2 == 7 else M, 200)
    outline(c); smear(c, 16, 21, 3, 6); glow(c, steps=(55, 25))
    return c


def t_ribbon():
    c = Cell(); base_glob(c, 4, 9)
    outline(c)
    for k in range(18):                               # a long thin fading ribbon
        x = 16 + round(math.sin(k * 0.55) * 2)
        c.put(x, 14 + k, A if k < 6 else (M if k < 12 else D), max(60, 230 - k * 9))
        c.put(x + 1, 14 + k, M, max(40, 160 - k * 8))
    glow(c)
    return c


SHEETS = {
    'shots_player': [
        [spit, slug, pellet, rocket, larva, echo, needle, charged],
        [small, splash, droplets, teardrop, sparks, beam_slice, rail, bone_chips],
    ],
    'shots_trait': [
        [t_venom, t_frag, t_arc, t_seeker, t_brand, t_fission, t_ghost, t_ricochet],
        [t_sky, t_crit, t_dart, t_shard, t_child, t_echo_small, t_beat, t_ribbon],
    ],
    'shots_bio': [
        [glaive, glaive_b, mine, mine_swollen, seed_shell, seed_split, husk, egg_burst],
        [maggot, maggot_bent, maggot_curled, stinger, stinger_stuck, stinger_hot, stinger_pop, empty],
    ],
}


def render(name, out):
    rows = SHEETS[name]
    img = Image.new('RGBA', (COLS * N * SCALE, len(rows) * N * SCALE), (0, 0, 0, 0))
    for r, row in enumerate(rows):
        for col, fn in enumerate(row):
            cell = fn()
            for (x, y), rgba in cell.px.items():
                for sy in range(SCALE):
                    for sx in range(SCALE):
                        img.putpixel(((col * N + x) * SCALE + sx, (r * N + y) * SCALE + sy), rgba)
    img.save(out)
    print('wrote', out, img.size)


if __name__ == '__main__':
    # pixel-shots.py [sheet] [out.png]; no args: every sheet into public/sprites
    if len(sys.argv) > 1:
        render(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else f'public/sprites/{sys.argv[1]}.png')
    else:
        for name in SHEETS:
            render(name, f'public/sprites/{name}.png')

"""PWA icons, OLED style: a close-up of the symbiote's eye on true black, the
pink body flooding the lower half like liquid (option B2 in icons.html).
Everything is a signed distance (smooth union of circles, iris circle, slit
capsule), so edges are antialiased at any size with flat opaque fills only.
  python3 scripts/icons-oled.py
"""
import numpy as np
from PIL import Image

PINK = np.array([0xd8, 0x3c, 0xd8], float)
IRIS = np.array([0xc6, 0xff, 0x1a], float)
BLACK = np.zeros(3)
K = 0.16                                   # smooth-union radius: liquid joins
BLOBS = [(0.0, 1.02, 0.52), (1.0, 1.0, 0.56), (0.54, 0.54, 0.25), (0.83, 0.24, 0.07), (0.69, 0.13, 0.035)]
EYE = (0.54, 0.54, 0.17)


def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.minimum(a, b) - h * h * k / 4


def render(size, scale=1.0):
    # scale < 1 pulls the composition toward the centre (maskable safe zone)
    c = (np.arange(size) + 0.5) / size
    x, y = np.meshgrid(c, c)
    x = 0.5 + (x - 0.5) / scale
    y = 0.5 + (y - 0.5) / scale
    px = 1 / (size * scale)                # one pixel in icon units

    body = np.full_like(x, 1e9)
    for bx, by, br in BLOBS:
        body = smin(body, np.hypot(x - bx, y - by) - br, K)
    ex, ey, er = EYE
    iris = np.hypot(x - ex, y - ey) - er
    ph, pw = er * 0.22, er * 0.7           # same slit as oled.js drawSymbiote
    sx = np.clip(x - ex, -(pw - ph), pw - ph)
    slit = np.hypot(x - ex - sx, y - ey) - ph

    cov = lambda d: np.clip(0.5 - d / px, 0, 1)[..., None]
    img = BLACK + (PINK - BLACK) * cov(body)
    img = img + (IRIS - img) * cov(iris)
    img = img + (BLACK - img) * cov(slit)
    return Image.fromarray(np.round(img).astype(np.uint8), 'RGB')


for size, name, scale in [(180, 'icon-180.png', 1), (192, 'icon-192.png', 1), (512, 'icon-512.png', 1), (512, 'icon-maskable-512.png', 0.8)]:
    render(size, scale).save(f'public/{name}')
print('icons written')

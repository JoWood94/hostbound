"""PWA icons from the symbiote sheet (row 0, frame 0) on the void colour.
  python3 scripts/icons-from-sheet.py
"""
from PIL import Image, ImageFilter
sheet = Image.open('public/sprites/symbiote.png').convert('RGBA')
frame = sheet.crop((0, 0, 128, 128))
for size, name, safe in [(180, 'icon-180.png', 0.92), (192, 'icon-192.png', 0.92), (512, 'icon-512.png', 0.92), (512, 'icon-maskable-512.png', 0.7)]:
    bg = Image.new('RGBA', (size, size), (7, 4, 10, 255))
    s = int(size * safe)
    spr = frame.resize((s, s), Image.LANCZOS)
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    tint = Image.new('RGBA', spr.size, (255, 43, 214, 255))
    tint.putalpha(spr.getchannel('A'))
    glow.paste(tint, ((size - s) // 2, (size - s) // 2), tint)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.04))
    bg = Image.alpha_composite(bg, Image.blend(Image.new('RGBA', (size, size), (0, 0, 0, 0)), glow, 0.55))
    bg.alpha_composite(spr, ((size - s) // 2, (size - s) // 2 - int(size * 0.02)))
    bg.convert('RGB').save(f'public/{name}')
print('icons written')

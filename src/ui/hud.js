import { W } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { text, fillPoly, strokePoly } from '../render/draw.js';

function heart(x, y, color, filled) {
  const pts = [x, y - 4, x + 5, y - 8, x + 9, y - 4, x, y + 6, x - 9, y - 4, x - 5, y - 8];
  if (filled) fillPoly(pts, color);
  strokePoly(pts, color, 1.5);
}

export function drawHud(p, distance, coins) {
  const y = 18;
  for (let i = 0; i < p.maxHearts; i++) heart(14 + i * 22, y, PAL.red, i < p.hearts);
  for (let i = 0; i < p.blueHearts; i++) heart(14 + (p.maxHearts + i) * 22, y, PAL.blue, true);

  text(`${Math.floor(distance)}m`, W - 10, y, { color: PAL.cyan, size: 16, align: 'right' });
  text(`¤${coins}`, W - 10, y + 18, { color: PAL.acid, size: 12, align: 'right' });

  // Dash cooldown pip
  const ready = p.dashCd <= 0;
  text(ready ? 'DASH' : '····', W / 2, y, { color: ready ? PAL.white : PAL.dim, size: 10, align: 'center' });
}

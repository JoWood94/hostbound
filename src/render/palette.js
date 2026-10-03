export const PAL = {
  bg: '#0a0008',
  bg2: '#14020f',
  magenta: '#ff2bd6',
  cyan: '#19f0ff',
  acid: '#b6ff2b',
  orange: '#ff6a00',
  red: '#ff1f4b',
  blue: '#3d7bff',
  white: '#f4f0ff',
  dim: '#3a1030',
  mute: '#9a86a6',   // readable secondary text
  amber: '#ffb000',
  violet: '#a64dff',
  mint: '#00ff9c',
  yellow: '#ffe81a',   // neon yellow: tertiary UI accent
  violetNeon: '#9b5cff', // ultraviolet: epic rarity
};
// UI roles: primary = symbiote pink, secondary = neon green (acid), tertiary =
// neon yellow. Cyan stays in the palette for the phase language.

// Reserved colours: enemy bullets are ALWAYS magenta/orange, player shots ALWAYS acid green.
export const COLOR_ENEMY_BULLET = PAL.magenta;
export const COLOR_ENEMY_BULLET_ALT = PAL.orange;
// Player shots: acid bio-plasma. Distinct from the red symbiote and from the
// magenta/orange enemy bullets.
export const COLOR_PLAYER_BULLET = '#c6ff1a';
export const COLOR_PLAYER_CORE = '#f4ffd8';

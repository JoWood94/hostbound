// Ships: the run-to-run variety instead of multiple characters.
// Each ship has its own silhouette, tweaks base stats and may carry a starting item.
// (Internally still called "boards" for save compatibility.)
import { PAL } from '../render/palette.js';

export const BOARDS = [
  { id: 'stock', name: 'STOCK', color: PAL.cyan, unlock: null,
    desc: '3 hearts. Balanced interceptor. The ship you stole first.',
    apply: () => {}, start: [] },
  { id: 'ghost', name: 'GHOST', color: PAL.white, unlock: 'phase_run_25',
    desc: '2 hearts. Stealth frame: high SPEED, faster phase, i-frames doubled.',
    apply: (s) => { s.maxHearts -= 1; s.speed += 0.3; s.phaseCd *= 0.6; s.iframeTime *= 2; }, start: [] },
  { id: 'tank', name: 'TANK', color: PAL.orange, unlock: 'boss_2run',
    desc: '5 hearts, starts with SLUG. Too heavy to jump, rams through low barriers.',
    apply: (s) => { s.maxHearts += 2; s.speed -= 0.15; s.canJump = false; s.breakLow = true; }, start: ['slug'] },
  { id: 'viral', name: 'VIRAL', color: PAL.acid, unlock: 'toxin_kills_60',
    desc: '3 hearts, bio-ship, starts with TOXIN. Poisoned enemies drop double cells.',
    apply: (s) => { s.toxinCoins = true; }, start: ['toxin'] },
  { id: 'glitch', name: 'GLITCH', color: PAL.magenta, unlock: 'discover_18',
    desc: '1 heart + 3 blue, LUCK +2. Starts with 2 random items.',
    apply: (s) => { s.maxHearts = 1; s.blueStart = 3; s.luck += 2; }, start: ['?', '?'] },
];

export const BOARD_BY_ID = Object.fromEntries(BOARDS.map((b) => [b.id, b]));

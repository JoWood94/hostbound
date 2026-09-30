// Hoverboards: the run-to-run variety instead of multiple characters.
// Each board tweaks base stats and may carry a starting item.
import { PAL } from '../render/palette.js';

export const BOARDS = [
  { id: 'stock', name: 'STOCK', color: PAL.cyan, unlock: null,
    desc: '3 hearts. Balanced. The board you stole first.',
    apply: () => {}, start: [] },
  { id: 'ghost', name: 'GHOST', color: PAL.white, unlock: 'phase_run_25',
    desc: '2 hearts. Phase cooldown halved, i-frames doubled.',
    apply: (s) => { s.maxHearts -= 1; s.phaseCd *= 0.5; s.iframeTime *= 2; }, start: [] },
  { id: 'tank', name: 'TANK', color: PAL.orange, unlock: 'boss_2run',
    desc: '5 hearts, starts with SLUG. Cannot jump, smashes low barriers.',
    apply: (s) => { s.maxHearts += 2; s.canJump = false; s.breakLow = true; }, start: ['slug'] },
  { id: 'viral', name: 'VIRAL', color: PAL.acid, unlock: 'toxin_kills_60',
    desc: '3 hearts, starts with TOXIN. Poisoned enemies drop double coins.',
    apply: (s) => { s.toxinCoins = true; }, start: ['toxin'] },
  { id: 'glitch', name: 'GLITCH', color: PAL.magenta, unlock: 'discover_18',
    desc: '1 heart + 3 blue. Starts with 2 random items. First shop is free.',
    apply: (s) => { s.maxHearts = 1; s.blueStart = 3; }, start: ['?', '?'], freeShop: true },
];

export const BOARD_BY_ID = Object.fromEntries(BOARDS.map((b) => [b.id, b]));

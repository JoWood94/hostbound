// Combo discovery. Every pair of items that does something together is a
// combo. Effects come from the shot engine and item stats (nothing here changes
// gameplay); this file only names them so the player can discover and look
// them up later, Isaac-style but without needing a wiki:
//   - not discovered: an offered item only says it RESONATES with something you hold
//   - discovered (held both once): the name and effect are shown from then on
import { SYNERGIES, ITEM_BY_ID, computeStats, EVOLUTIONS, CARRIER_PAIRS } from './items.js';

// `when(stats)`: the combo only exists if its effect is real for the current
// shot carrier (e.g. rockets only spiral if rockets are what you fire).
const pair = (a, b, name, desc, id = `${a}+${b}`, when = null) => ({ id, a, b, name, desc, when });
const carrierIs = (c) => (s) => s.carrier === c;
// A trio: three items. Same shape, with `c` as the third.
const trio = (a, b, c, name, desc) => ({ ...pair(a, b, name, desc, `${a}+${b}+${c}`), c });

export const COMBOS = [
  // Named synergies (they also carry a stat bonus in items.js)
  ...SYNERGIES.map((s) => pair(s.req[0], s.req[1], s.name, s.desc, s.id)),

  // Shot modifiers composing through the shot engine
  pair('laser', 'scatter', 'PRISM FAN', 'The beam splits into a fan of beams.'),
  pair('laser', 'sine', 'SERPENT BEAM', 'The beam snakes across your lane and its neighbours.'),
  pair('laser', 'railgun', 'PULSE LANCE', 'The beam fires in heavy charged pulses.'),
  pair('laser', 'rockets', 'SCORCHER', 'Where the beam lands, things explode.'),
  pair('railgun', 'scatter', 'TRIDENT', 'Rails strike in a cone.', undefined, carrierIs('rail')),
  pair('railgun', 'sine', 'ZIGZAG RAIL', 'Rails zigzag through three lanes.', undefined, carrierIs('rail')),
  pair('railgun', 'rockets', 'DETONATOR', 'Everything a rail touches explodes.', undefined, carrierIs('rail')),
  pair('rockets', 'scatter', 'SALVO', 'Rockets launch in a fan.', undefined, carrierIs('rocket')),
  pair('rockets', 'sine', 'CORKSCREW', 'Rockets spiral across lanes.', undefined, carrierIs('rocket')),
  pair('scatter', 'sine', 'FIREFLIES', 'Pellets weave as they spread.', undefined, carrierIs('bolt')),

  // Modifiers that change how a shot modifier behaves
  pair('laser', 'split', 'SIDE BEAMS', 'Extra beams bend into the next lanes.'),
  pair('laser', 'homing', 'BENDING BEAM', 'With nothing ahead, the beam bends to a target next door.'),
  pair('laser', 'pierce', 'BORE BEAM', 'The beam drills through more enemies.'),
  pair('laser', 'echo', 'SURGE', 'The beam surges every few moments.'),
  pair('railgun', 'homing', 'AUTO-AIM', 'Rails snap to a target in the next lane.', undefined, carrierIs('rail')),
  pair('railgun', 'pierce', 'OVERPENETRATION', 'Rails already pierce: they hit harder instead.', undefined, carrierIs('rail')),
  pair('railgun', 'split', 'TRIPLE RAIL', 'Rails also strike the side lanes.', undefined, carrierIs('rail')),
  pair('scatter', 'split', 'WIDE SPREAD', 'More shots in a wider cone.'),
  pair('rockets', 'frag', 'BIG BADDA', 'Bigger blasts.'),
  pair('rockets', 'pierce', 'CLUSTER', 'Rockets punch through and blow up again.'),

  // v1.1
  pair('fission', 'split', 'CASCADE', 'Fission fragments split once more.'),
  pair('fission', 'rockets', 'MIRV', 'Every fission fragment explodes.'),
  pair('fission', 'homing', 'HYDRA', 'Fission fragments hunt from their new lanes.'),
  pair('fission', 'laser', 'FORK', 'The beam forks at its first two targets.'),
  pair('shrapnel', 'chain', 'GRENADE', 'Shrapnel shards explode.'),
  pair('shrapnel', 'toxin', 'SPORE BURST', 'Shrapnel shards poison twice as hard.'),
  pair('shrapnel', 'laser', 'REFRACTION', 'Shrapnel turns into instant beams that strike the nearest enemies.'),
  pair('brand', 'crit', 'EXECUTION', 'Crits on branded enemies hit x5; the brand jumps on.'),
  pair('brand', 'arc', 'CONDUIT', 'Arcs reach branded enemies first, one more jump.'),
  pair('brand', 'homing', 'BLOODHOUND', 'Seekers reach branded enemies two lanes away.'),
  pair('charge', 'railgun', 'SIEGE', 'A charged rail hits x2.5 and staggers bosses.', undefined, carrierIs('rail')),
  pair('charge', 'echo', 'RESONANCE', 'A charged shot is always an echo round.'),
  pair('skyshot', 'kickflip', 'AIR RAID', 'Landing fires a skyshot into three lanes.'),
  pair('skyshot', 'pound', 'METEOR', 'Ground pound: three lanes wide, with the air bonus.'),
  pair('ghostround', 'mirror', 'SPECTRE', 'Reflected shots are ghost shots.'),
  pair('ghostround', 'blink', 'WRAITH', 'Longer phase; ghost shots slow what they hit.'),
  pair('afterglow', 'sine', 'RIBBON', 'Trails last twice as long: an acid net.'),
  pair('afterglow', 'laser', 'SCAR', 'Changing lane leaves the beam burning for 1 s.'),
  pair('premonition', 'adrenaline', 'SIXTH SENSE', 'On your last heart, lanes light two ticks early.'),
  pair('cellwall', 'greed', 'HIVE MIND', 'A blue heart every 15 cells.'),
  pair('carapace', 'plating', 'EXOSKELETON', 'The shell holds two hits per section.'),
  pair('blackhole', 'orbital', 'EVENT HORIZON', 'After a black hole, orbitals eat shots twice as wide.'),
  // pair('leadweights', 'slug', 'ARTILLERY', 'Huge shots, and SLUG no longer slows them.'),   // LEAD WEIGHTS is off
  pair('sporecloud', 'toxin', 'MIASMA', 'The spore cloud poisons enemies in it.'),
  pair('momentum', 'slipstream', 'DRIFT', 'Two quick lane changes charge the slipstream burst.'),
  trio('fission', 'shrapnel', 'chain', 'CHAIN FISSION', 'Every kill starts a chain of splitting, exploding shards.'),

  // v1.2 carrier pairs (items.js CARRIER_PAIRS): real only when the pair is
  // the one shaping the weapon (the two highest-priority carriers held)
  ...CARRIER_PAIRS.filter((q) => !q.legacy).map((q) => pair(q.a, q.b, q.name, q.desc, `pair:${q.id}`, (s) => s.pair === q.id)),

  // v1.2 evolutions: base item at its max stack + partner (items.js EVOLUTIONS)
  ...EVOLUTIONS.map((ev) => ({ ...pair(ev.base, ev.partner, ev.name, ev.desc, `evo:${ev.id}`, (s) => !!s.evo[ev.id]), evo: true })),
];

export const COMBO_BY_ID = Object.fromEntries(COMBOS.map((c) => [c.id, c]));

const held = (stacks, id) => (stacks[id] || 0) > 0;

// Combos currently formed by the build.
export function activeCombos(stacks, stats) {
  return COMBOS.filter((c) => held(stacks, c.a) && held(stacks, c.b) && (!c.c || held(stacks, c.c)) && (!c.when || !stats || c.when(stats)));
}

// What an offered item would form with the current build.
export function offerHints(id, stacks, save, board) {
  const out = [];
  const after = board ? computeStats(board, { ...stacks, [id]: (stacks[id] || 0) + 1 }) : null;
  const before = board ? computeStats(board, stacks) : null;
  for (const c of COMBOS) {
    // An evolution is hinted by the card that completes it (often the base item's last stack).
    if (c.evo) {
      if (!after || !c.when(after) || c.when(before)) continue;
      const partner = id === c.a ? c.b : c.a;
      out.push({ combo: c, partner: ITEM_BY_ID[partner], known: !!(save.combos && save.combos[c.id]), evo: true });
      continue;
    }
    const members = c.c ? [c.a, c.b, c.c] : [c.a, c.b];
    if (!members.includes(id) || held(stacks, id)) continue;
    const others = members.filter((m) => m !== id);
    if (!others.every((m) => held(stacks, m))) continue;
    const partner = others[0];
    if (c.when && after && !c.when(after)) continue;
    out.push({ combo: c, partner: ITEM_BY_ID[partner], known: !!(save.combos && save.combos[c.id]) });
  }
  return out;
}

export function knownCount(save) {
  return COMBOS.filter((c) => save.combos && save.combos[c.id]).length;
}

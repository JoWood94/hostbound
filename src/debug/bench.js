// Damage bench (debug only): fixed targets, a fixed build, a fixed time.
// Returns the total damage dealt, so builds and traits compare by measure:
//   __game.bench(['split', 'converge'], { lanes: [2] })
//   lanes: one target per entry (repeat a lane to stack it; stackLane spaces
//   them vertically), lane: where the player sits, hp: each target's health.
export function runBench(game, ids, { secs = 10, type = 'tank', lanes = [0, 1, 2, 3, 4], lane = 2, stackLane = false, hp = 400, setup, keepBullets = false } = {}) {
  game.start();
  const r = game.run;
  for (const id of ids) game.acquire(id);
  game.god();
  r.player.lane = lane; r.player.x = 49 + lane * 65.6; r.player.laneFromX = r.player.x;
  r.chunkT = 1e9; r.pending = null; r.distance = 0;
  if (setup) setup(r);
  for (const e of game.enemies) e.dead = true;
  game.tick(1);
  lanes.forEach((l, k) => { const e = game.spawn(type, l); e.hp = e.maxHp = hp; if (stackLane) e.holdY = 60 + 40 * k; });
  const hp0 = new Map();
  for (let f = 0; f < secs * 60; f++) {
    for (const e of game.enemies) if (!hp0.has(e)) hp0.set(e, e.hp);
    game.tick(1);
    for (const e of game.enemies) if (e.state === 'leave') e.state = 'rest';
    if (!keepBullets) game.enemyBullets.n = 0;
  }
  let dealt = 0;
  for (const [e, h] of hp0) dealt += h - Math.max(0, e.hp);
  return Math.round(dealt);
}

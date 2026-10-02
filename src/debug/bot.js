// A careful test player (debug only): plays a run through the game's own
// state, the way an attentive human would. It is the fairness check that
// paper verification misses (real spacing on the track, real timing):
//   - stays out of lanes a boss has lit, and of lanes where a barrier or a shot arrives soon, heading early
//     for the lane with the most time left (path not crossing a lane about to
//     be hit);
//   - jumps wires and low waves just before they arrive;
//   - phases tears and veils just before they arrive (in the air too: drop and phase),
//     and a shot it has no lane left to dodge.
// If the bot keeps getting hit by the same thing, that thing is unfair.
export function runBot(game, setup, seconds, { log = false } = {}) {
  game.start();
  const r = game.run;
  setup(r);
  const py = game.playerY;
  const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  const laneOf = (x) => Math.max(0, Math.min(4, Math.round((x - 49) / 65.6)));
  let hits = 0, prev = r.player.hearts, phased = 0;
  const causes = {}, events = [];
  for (let f = 0; f < seconds * 60; f++) {
    if (r.mode !== 'play') { r.mode = 'play'; r.pickChoices = []; }
    const p = r.player, eb = game.enemyBullets;
    const obs = game.obstacles.filter((o) => !o.dead && !o.hit);
    // like a person, it leaves the lanes a boss has lit before the shots exist
    const lit = new Set();
    if (r.boss && r.boss.state === 'telegraph') for (const pt of r.boss.teleParts) if (!['low', 'summon', 'obs'].includes(pt.kind)) for (const l of pt.lanes) lit.add(l);
    const danger = (l) => {
      let t = lit.has(l) ? 0.9 : 9;
      for (const o of obs) if (o.type === 'wall' && o.lane === l && o.y < py + 22) t = Math.min(t, Math.max(0, (py - 22 - o.y) / Math.max(1, r.speed)));
      for (let i = 0; i < eb.n; i++) if (eb.kind[i] !== 1 && laneOf(eb.x[i]) === l && eb.y[i] < py + 8) t = Math.min(t, Math.max(0, (py - 10 - eb.y[i]) / Math.max(1, eb.vy[i])));
      // a kamikaze lights its lane, then dives down it
      for (const e of game.enemies) if (e.type === 'kamikaze' && !e.dead && e.lane === l && e.y < py + 10) {
        if (e.state === 'dive') t = Math.min(t, Math.max(0, (py - 20 - e.y) / 600));
        else if (e.state === 'telegraph') t = Math.min(t, 0.9);
      }
      return t;
    };
    if (p.laneT >= 1) {
      const here = danger(p.lane);
      if (here < 1) {
        let best = p.lane, score = here;
        for (let l = 0; l < 5; l++) {
          const d = Math.abs(l - p.lane), t = danger(l);
          if (t < d * 0.14 + 0.05) continue;
          const sc = t - d * 0.12;
          if (sc > score + 0.05) { score = sc; best = l; }
        }
        let moved = false;
        if (best !== p.lane) { const step = best > p.lane ? 1 : -1; if (danger(p.lane + step) > 0.12) { key(step > 0 ? 'ArrowRight' : 'ArrowLeft'); moved = true; } }
        if (!moved && here < 0.12 && p.phaseCd <= 0 && p.phaseT <= 0) { key('ArrowDown'); phased++; }   // boxed in: phase it
      }
    }
    let jumpSoon = false, phaseSoon = false;
    const air = r.stats.jumpTime * (p.airMul || 1);   // the next jump's length: aim its middle at the threat
    for (const o of obs) {
      const t = (py - o.y) / Math.max(1, r.speed);
      if (t < 0 || t > 0.3) continue;
      if (o.type === 'low' && o.lane === p.lane && t > 0.05 && t < air * 0.55) jumpSoon = true;
      if ((o.type === 'veil' || (o.type === 'rift' && o.lane === p.lane)) && t < 0.18) phaseSoon = true;
    }
    for (let i = 0; i < eb.n; i++) {
      if (eb.kind[i] !== 1 || laneOf(eb.x[i]) !== p.lane) continue;
      const t = (py - eb.y[i]) / Math.max(1, eb.vy[i]);
      if (t > 0.04 && t < air * 0.5) jumpSoon = true;
    }
    if (jumpSoon && p.jumpT <= 0) key('ArrowUp');
    if (phaseSoon && p.phaseT <= 0) key('ArrowDown');
    game.tick(1);
    if (p.hearts < prev) {
      hits += prev - p.hearts;
      const k = r.lastHit ? r.lastHit.what : '?';
      causes[k] = (causes[k] || 0) + 1;
      if (log && events.length < 8) events.push({ f, lane: p.lane, what: k, section: r.sec ? r.sec.id : r.boss ? `${r.boss.name} ${r.boss.phase}:${r.boss.atkIndex}` : '-' });
    }
    if (p.hearts <= 1) p.hearts = 3;         // keep playing to sample the whole stretch
    prev = p.hearts;
  }
  return log ? { hits, causes, events, phased } : { hits, causes, phased };
}

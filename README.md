# HOSTBOUND

Lane runner + bullet hell + roguelike synergies. Mobile first, vanilla JS, Canvas 2D, zero runtime dependencies.

Design doc: [GDD.md](GDD.md)

## Play

- **Swipe left/right**: change lane (5 lanes)
- **Swipe up**: jump (low barriers, orange low waves)
- **Swipe down**: phase (brief invulnerability); in the air: fast fall
- **Orange button** (bottom-left): use the active item when charged by kills
- Desktop: A/D or arrows, W/Space, S/Shift, E for active, P/Esc pause

## Dev

```bash
npm install
npm run dev        # http://localhost:5173/hostbound/ (also on LAN, --host is on)
npm run build      # dist/
npm run preview    # serve the production build
node scripts/make-icons.mjs   # regenerate PWA icons
node scripts/balance.mjs      # print the balance report (player DPS vs enemy/boss HP)
```

Debug handle: open with `?debug` and use `window.__game.run` / `window.__game.save` in the console.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/` to GitHub Pages.
In the repo settings, set **Pages → Source** to **GitHub Actions** once.
The site lives at https://jowood94.github.io/hostbound/ (the Vite `base` matches the repo name).

## Structure

```
src/
  core/    canvas, loop, input, rng, save, ui (buttons)
  game/    run (one run), player, weapon, bullets, enemies, boss, obstacles,
           pickups, items (+synergies), boards, achievements, world
  render/  palette, draw primitives, fx (particles/shake/hit-stop), post (scanlines/grain/glitch)
  audio/   audio (Web Audio SFX), music (procedural sequencer)
  ui/      hud, screens (menu, archive, pick, shop, pause, dead)
```

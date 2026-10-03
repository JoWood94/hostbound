# HOSTBOUND — OLED style (branch `oled-slice`)

The game is drawn entirely in code from a few primitives, on true black. There are no
sprite sheets, glow or translucent layers. This file holds the rules agreed during the
redesign; follow them when anything new is drawn.

## Principles
- **True black** (`#000`) everywhere: on OLED those pixels are off. No grain, scanlines, vignette or gradients.
- **Primitives only**: capsules (round ends), circles (solid or hollow), rounded triangles. `oled.js` exports `capsule` and `rtri`.
- **One corner ratio**: every rounded triangle uses `ROUND = 0.4` × circumradius. Small UI glyphs (the pause play icon) may use 0.18 so they don't melt. The glaive shuriken is the one deliberately sharp shape.
- **Flat colour, no shadows**: one solid colour per element. No cores, rims, drop shadows, nuclei or "shade" circles. Life and motion come from size and easing, never from alpha. The only fades left are transitions (screen fade-in, tutorial text).
- **60+ fps**: everything animates every frame with springs and easing (`spring()` in `oled.js`). Shots are interpolated with the render alpha, and transitions run on `performance.now()`.

## Colour
| Role | Colour |
|---|---|
| Primary (player, RUN) | symbiote pink `#d83cd8` |
| Secondary (UI, HOST, tagline) | neon green `PAL.acid` |
| Player shots | acid `#c6ff1a` |
| Enemy shots / dodge | magenta `#ff2bd6` (rounded triangles) |
| Jump | orange `#ff6a00` (dotted rows) |
| Phase | cyan `#19f0ff` (hollow shapes) |
| Item rarity (the ONLY meaning of item colours) | common white, rare cyan, epic ultraviolet `#9b5cff` |
| Tertiary (spare, not on the home screen) | neon yellow `#ffe81a` |

## Type
- Display text (titles, buttons, item names, numbers) uses the game's own monoline glyphs (`src/ui/glyphs.js`): capsule strokes and arcs, the logo's hand. Call `text(..., { font: 'display' })`.
- Body text is Quicksand.

## Player
- The body is a **genome** grown per run (`src/render/specimen.js`); `FIRST_SPECIMEN` is the hand-made reference. It is purely cosmetic: the hitbox never changes. The menu shows the alien you will play, and a new one grows on every launch, retry and return to the menu.
- **Jump**: any genome folds into a pink sphere and somersaults. **Phase**: it folds into a tall cyan pill with two dark-cyan echoes. Both are springs.
- **RUN transition** (`drawLiquidMorph`): the alien melts into a pool, a heavy drop pours down through a wobbling neck, and the parts re-form at the run start. It is drawn as dense overlapping circles.

## World
- No lane dividers; the lane you enter glows faintly, then fades. Tiny parallax stars run underneath.
- Side walls: a thin neon line in the district colour (`WALLS` in `world.js`; `'flesh'` keeps the organic banks for comparison).
- Obstacles: one primitive each, and the shape is the meaning. Solid magenta capsule = dodge, dotted orange row = jump, hollow cyan capsule = phase. Same-type neighbours on a row merge into one shape. No eyes or dots on obstacles.
- Enemy lane warnings: only two thin edges, no fill.

## Enemies and bosses
- Enemies (`src/render/bestiary.js`) have fixed designs so they can be learned, in the Drone's vocabulary: one tracking eye, and a silhouette that tells the move. Telegraph = the body swells and the pupil turns white. White flash only on a hit.
- Enemy animation is a **sprite sheet in code** (`SHEETS` in `bestiary.js`): per type five rows of poses sampled at 60 fps and built once at load: idle (loop on the enemy's age), tele (indexed by telegraph progress), atk (the shot, `ATK_S`), hit (white squash, `HIT_S`), death (the type's own silhouette pops and collapses inside a ring, `DEATH_S`). No per-instance variation. The pupil is the only live part, drawn over the sheet.
- Bosses (`src/render/bosses.js`): each phase grows or opens a part. Their HP bar sits in the HUD strip.
- Boss animation is a sprite sheet in code too (`BOSS_SHEETS`): three sheets per boss, one per phase: pristine, damaged, wrecked. Rows: idle (2 s loop), tele (the charge, on telegraph progress), atk (the release, `BOSS_ATK_S`), hit. Damage is cut out in black: cracks that lengthen and chips bitten from the rim (seeded per boss, phase 2 keeps phase 1's wounds), plus one broken part in the wrecked sheet; the idle trembles when damaged and lurches when wrecked. Frenzy plays the wrecked sheet at double speed. Death (`drawBossDeath`, `BOSS_DEATH_S` 1.3 s, shorter than the loot delay): a white jolt, the wrecked body shakes while every crack runs on and the chips widen, the eyes go dark; then it splits into its own pieces (seeded per boss) that fly out and shrink inside two opening rings.

## Shots and effects
- `src/render/shots.js`: every projectile is one flat colour. Beams and rails bend with a rounded radius (no sharp corners). Sparks die by thinning.

## UI
- Every button is a neon-outlined capsule; the primary has a heavier outline. Settings use iOS switches, and tabs are labels with a capsule underline.
- Radius 14 for cards, chips and the pause button.
- Menus follow the home: pink (`#d83cd8`) for the primary action and selection, acid for progress, glyph type for headings and names, 48 px side margins for buttons, no card grids and no grey outlines.
- **Archive**: one scrolling list per tab (drag with inertia and rubber band, mouse wheel, horizontal swipe flips tabs), no pagination. Items are grouped by rarity under a glyph header with a count; unlocked items are icon + name rows two per line, locked ones are small hollow circles in a dark shade of the rarity colour, without text. A tap opens the detail in place under its row (and scrolls it into view); the selected row gets a pink capsule. Combos: icon + icon, name, description. Goals: open ones first, with a thin acid progress capsule.
- **Pause**: centred like the home. PAUSED, distance and level, hearts, the alien of this run, the build as icons with a rarity capsule under each, the shot, only the stats the build moved (green up, red down) and the active combos in pink. At the bottom: RESUME (primary pink capsule), **HOLD TO END RUN** (fills red under the finger in 0.8 s, drains on release; a short tap shows HOLD IT DOWN), then the SFX/MUSIC switches. On a keyboard, holding Q fills END RUN the same way; Esc/P resume.
- **Death**: the same composition. A 0.6 s freeze frame circles what killed you, then solid black: CONSUMED in red, BY <killer> in its colour, the distance big in white, NEW BEST (acid) or BEST (mute), one line of kills, bosses and level, this run's alien as GOO, which starts from right where the player was (on the track, or the pause alien when the run ends from pause) and, on ONE curve (`drawDeathGoo`), glides to the centre, grows to `DEAD_R` (36, the pause alien's size, so every death ends on the same goo) and slumps into goo, fully goo exactly as it lands; inside the collapse the parts hold their shape early and melt late (`drawGoo`: its parts slump and melt into one puddle in the same pink that keeps simmering, with bubbles that swell and pop on the rim and the eyes adrift on top; a dead eye is the green iris with a black X where the slit was), the build icons, new unlocks in pink; RETRY (primary pink), MENU and SHARE pinned to the bottom. **Rebirth**: RETRY and MENU never cut. The next specimen is already grown when you die, so the goo turns straight into it in ONE continuous move (`drawRegrow`, `REGROW_S`): the mass lifts off the floor and rounds up while it travels to the run start (RETRY) or the menu spot (MENU), stretched along a long fall; the new genome's parts grow out of it along a gentle curve while the mass holds its volume; the dead X eyes sink in as the new eyes surface as beads and open their slits. The black death screen fades out underneath (HUD included). At the end it matches `drawSymbiote` exactly (the ties between mass and parts thin away), so nothing pops. Ending the run from pause skips the freeze frame, the glitch and the title shake: black pause straight to black death screen, so the track never flashes.
- **Pick**: cards keep their rarity outline; the selected one turns pink and the hint above reads TAP AGAIN TO TAKE IT in pink glyphs (no pulsing alpha).
- `buildIcons` in `screens.js` draws a build (pause, death): centred icon rows, a rarity capsule under each icon, the stack count at its shoulder.
- Item cards follow a padding grid (`cardGrid` in `screens.js`). Item icons come from `src/render/icons.js`: white monoline primitives, one per item, showing what it does.

## Dev pages (untracked)
- `specimens.html` shows a grid of 12 generated aliens, for tuning the genome rules (`?s=N` pages through more).
- `bosses.html` shows the three boss sheets live side by side; `?full&b=<id>` shows every frame of one boss.
- `rebirth.html` shows the death goo and the rebirth sampled in rows: death glide (melt + grow + rise), simmer, regrow in place (menu), regrow down a fall (retry); `?live` loops the whole cycle.
- `bestiary.html` shows every enemy sheet: a live preview cycling idle, telegraph, shot, hit and death, next to 8 sampled frames of each row.

# NEON OVERDRIFT — prompt per generare sprite e asset

Prompt in inglese (i generatori rendono meglio). Per ogni asset:
1. incolla lo **STYLE BIBLE**,
2. poi il prompt dell'asset,
3. e il **NEGATIVE PROMPT** se il sito lo supporta.

Consiglio: genera prima il simbionte, scegli la versione migliore e usala come
**immagine di riferimento** (o allena uno stile / "custom model") per tutto il resto,
così ogni asset resta coerente.

---

## STYLE BIBLE (incolla sempre per primo)

```
Dark cosmic horror pixel art for a mobile vertical shooter. Top-down view.
Mood: Carrion meets Fear & Hunger, lit by dirty acidic Japanese neon.
Grotesque alien biology: wet raw flesh, exposed teeth, clustered yellow eyes,
torn membranes, sutures, veins, pus, bone fragments, rot. Organic, never clean,
never cute, never mechanical sci-fi.
Palette: near-black void #07040a, dried-blood reds #22030a #7a0f22 #a01c34,
bruise purple #3a1a5a, sickly yellow #d9c45a, plus acid neon accents only as
bioluminescence: hot pink #ff2bd6, electric cyan #19f0ff, acid green #c6ff1a,
toxic orange #ff6a00. Neon glows are dirty and flickering, like old Tokyo signage.
Crisp pixel art, limited palette, strong readable silhouette at small size,
1px dark outline, hard pixel shading, no anti-aliasing blur, no gradients washes.
Transparent background. Centered in each cell. No text, no UI, no shadow on the ground.
```

## NEGATIVE PROMPT

```
cute, chibi, cartoon, clean, glossy 3D render, plastic, mechanical spaceship,
metal panels, robot, human face, text, watermark, logo, background scenery,
drop shadow, blurry, soft airbrush, gradient background, side view, isometric
```

---

## Specifiche tecniche (uguali per tutto)

| Regola | Valore |
|---|---|
| Vista | dall'alto. Il **giocatore guarda in su**, i **nemici guardano in giù** (verso il giocatore) |
| Sfondo | trasparente (PNG) |
| Spritesheet | fotogrammi in **una sola riga**, celle tutte uguali, nessuno spazio tra le celle |
| Scala | genera alla dimensione indicata (1×); se il sito lavora più grande, genera a 4× e poi riduci con "nearest neighbor" |
| Leggibilità | i proiettili **nemici** solo magenta/arancio; i colpi del **giocatore** solo ciano/verde acido |

---

## 1. Il simbionte del giocatore — MASSA

Cella **64×64**. Rivolto verso l'alto (la "testa"/bocca principale in alto).

**Volo (loop, 8 fotogrammi)**
```
Sprite sheet, 8 frames in one row, 64x64 cells, seamless loop.
The player creature: a floating amorphous mass of raw red alien flesh, roughly
round, propelled by 6 to 9 writhing tentacles that trail backwards (down) and
coil and uncoil each frame. Several toothy mouths open and close on its body,
a cluster of 4 sickly yellow eyes with slit pupils near the top, pulsing veins,
a few bone shards piercing the flesh, wet highlights. Faint hot pink
bioluminescent rim light. Facing up. Menacing, disgusting, alive.
```

**Salto (palla che rotola, 8 fotogrammi)**
```
Sprite sheet, 8 frames in one row, 64x64 cells, seamless spin loop.
The same flesh mass curled into a tight spinning ball, tentacles wrapped
around itself, mouths shut, eyes peeking through, rotating 45 degrees per frame,
motion smear on the edges, hot pink glowing rim. Top-down.
```

**Phase (dissolvenza, 6 fotogrammi)**
```
Sprite sheet, 6 frames in one row, 64x64 cells.
The same flesh mass dissolving into dark smoke and drifting black ichor,
becoming translucent and ghostly by frame 4, then reforming. Cyan and magenta
chromatic split on the edges.
```

**Crescita (3 stadi, 1 fotogramma ciascuno)**
```
3 frames in one row, 64x64 cells. The same flesh mass at three growth stages:
small with 5 tentacles, medium with 8 tentacles and more mouths,
huge and swollen with 12 tentacles, extra eyes and bone spikes.
```

**Organi-arma (icone innestabili, 6 fotogrammi, celle 24×24)**
```
6 small grotesque flesh organs in one row, 24x24 cells, each a weapon grafted
on an alien creature: a glowing cyan gland (laser), a sac of acid green spores
(scatter), a long bony spine charged with light (rail), a pink pod full of
larvae (rockets), a spiral tentacle (sine wave), a sphincter mouth (default shot).
```

---

## 2. Nemici (7 ruoli, una razza per settore in futuro)

Per ogni nemico: **4 fotogrammi idle** + **2 fotogrammi "telegraph"** (si illumina
prima di sparare) + **6 fotogrammi morte** (esplosione di carne). Rivolto **in giù**.
Sostituisci `[ROLE]` e la dimensione.

Template:
```
Sprite sheet, 12 frames in one row: frames 1-4 idle loop, frames 5-6 the creature
flares its glowing parts brightly as a warning before attacking, frames 7-12 it
bursts into gore, bone chips and ichor. [CELL] cells. Top-down, facing down
toward the player. [ROLE]
```

| Nemico | Cella | `[ROLE]` |
|---|---|---|
| Drone | 40×40 | `A floating alien eyeball the size of a fist, veined, held aloft by four torn bat-like membranes, one huge sickly yellow eye with a slit pupil, sutures across the lids.` |
| Sweeper | 64×40 | `A flat ray-like alien with a wide membranous body, gill slits leaking pus, three spitting glands along its front edge that glow toxic orange.` |
| Crusher | 48×48 | `A heavy armored crab-like alien, cracked yellowed bone shell, two small claws, a wide glowing maw on its front edge that spits ground shockwaves.` |
| Hopper | 32×32 | `A bloated tick-like alien with a ridged abdomen and four jointed legs bent to leap, a tiny head with one yellow eye.` |
| Kamikaze | 32×40 | `A segmented parasite larva diving head-first, with a barbed glowing stinger, torn wing membranes and a sac of fluid on its back.` |
| Wall | 72×32 | `A horizontal bar of fused vertebrae and flesh studded with four eye-pods, held together by sinew, a gap of exposed bone in the middle.` |
| Tank | 48×56 | `A huge beetle-like alien with two cracked bone wing-cases, six short legs, mandibles and a fleshy horn cannon pointing down.` |

---

## 3. Boss (5)

Cella **240×96**. 4 fotogrammi idle + 2 telegraph + 1 "danneggiato" (ferite aperte).
```
Sprite sheet, 7 frames in one row, 240x96 cells. A colossal alien boss seen from
above, facing down toward the player, filling the cell width. Frames 1-4 slow
breathing idle, frames 5-6 every glowing organ flares as a warning, frame 7 the
same boss wounded with open bleeding gashes. [BOSS]
```

| Boss | `[BOSS]` |
|---|---|
| Sentinel | `A fortress of flesh shaped like a flattened lens around one gigantic yellow eye, ribs arching over its back, a row of five spitting teeth along the bottom edge, sutures and gashes.` |
| Hive | `Three translucent egg sacs connected by thick flesh strands, larvae squirming inside each sac, glowing acid green.` |
| Hunter | `A predator skull of yellowed bone fused to raw flesh, one central eye socket glowing like a targeting reticle, a jaw full of needle teeth, two engine-like glands on the sides.` |
| Prism | `A clean pink alien crystal shard growing out of a diseased tumor mass, flesh roots gripping the crystal, glowing glands along a fleshy bar below.` |
| Warden | `A ribcage gate: five huge curved ribs held by sinew around a beating red heart, veins pulsing, pus at the joints.` |

---

## 4. Colpi, effetti, pickup

**Colpi del giocatore** (celle 16×16, ciano/verde acido)
```
8 small projectile sprites in one row, 16x16 cells, organic alien ammunition:
a cyan glob of spit, an acid green bone needle, a glowing larva, a cyan spore pod
with a smoke tail, a small pellet of bile, a cyan ring of plasma, a big glowing
cyan blob, a white-hot impact flash. Bioluminescent, transparent background.
```

**Raggio laser** (tile verticale ripetibile 24×64)
```
A vertically tileable beam texture, 24x64, seamless top to bottom: a living
cyan beam of light made of twisted luminous nerve fibers, white hot core, dirty glow.
```

**Proiettili nemici** (celle 16×16, SOLO magenta/arancio)
```
6 enemy projectile sprites in one row, 16x16 cells: hot magenta glowing spit orb
with a white core (3 variants), toxic orange orb (2 variants), a magenta acid
droplet. Must read clearly against a black background.
```

**Onda bassa** (64×20, da saltare)
```
A low curved shockwave of toxic orange bile skimming the ground, 64x20,
crescent shape bulging downward, white-hot edge, dripping. Single frame.
```

**Esplosioni** (celle 48×48, 8 fotogrammi)
```
Sprite sheet, 8 frames in one row, 48x48 cells: a gore explosion, flesh chunks,
bone chips and ichor bursting outward then fading into dark smoke, hot pink and
sickly yellow sparks.
```

**Pickup** (celle 20×20)
```
5 pickup sprites in one row, 20x20 cells: a glowing acid green biomass cell
(currency), a beating red organ (heart), a pale blue cyst (shield heart),
a glitching corrupted egg with cyan and magenta split (mystery item),
a small pink tumor (bonus). Bioluminescent.
```

---

## 5. Ambiente: correnti cosmiche

**Corrente (corsia), tile verticale 64×128**
```
A vertically seamless tile, 64x128: a river of cosmic plasma flowing downward,
dirty acid pink and cyan streaks, floating specks of organic debris, faint
filaments like nerves, dark edges fading to transparent on left and right.
```

**Sfondo, tile verticale 360×1280** (parallax lento)
```
A vertically seamless background, 360x1280, deep space void, almost black,
with distant colossal alien carcasses drifting: rib cages the size of moons,
a dead eye, torn membranes, faint sickly nebula in bruise purple and
dried-blood red, sparse dirty stars. Very dark, low contrast so sprites read on top.
```

**Ostacoli**
```
2 obstacle sprites in one row, 64x48 cells, top-down: (1) a low drifting net of
torn membrane and floating spores, toxic orange glow, clearly flat and low
(the player jumps over it); (2) a tall chunk of alien carcass, a block of bone
and dead flesh with a magenta warning glow, clearly tall and solid (must be avoided).
```

---

## 6. Icone degli item (celle 32×32)

Template, una richiesta per gruppo di 6–8 item:
```
[N] item icons in one row, 32x32 cells, grotesque alien organ trinkets on
transparent background, each readable at small size: [LIST]
```
Esempi di `[LIST]`: `a split forked tongue (SPLITTER), a twitching muscle coil
(RAPID), a heavy calcified slug (SLUG), a bone needle (PIERCER), a tracking eye
on a stalk (SEEKER), a cluster of spore grenades (FRAG), a crackling nerve (ARC),
a dripping poison gland (TOXIN)`.

---

## 7. Come esportare e consegnarmeli

1. PNG trasparenti, fotogrammi in una riga, celle della dimensione indicata.
2. Nomi file: `symbiote_fly.png`, `symbiote_roll.png`, `symbiote_phase.png`,
   `enemy_drone.png`, `boss_sentinel.png`, `fx_explosion.png`,
   `bullets_player.png`, `bullets_enemy.png`, `pickups.png`, `lane_current.png`,
   `bg_space.png`, `obstacles.png`, `icons_1.png` …
3. Mettili in `public/sprites/` del progetto (o mandameli): li collego io al gioco
   al posto degli sprite disegnati in codice, senza toccare il gameplay.

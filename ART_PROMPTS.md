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

Va solo nel campo "Negative prompt" del sito: elenca cosa evitare. Se il sito non ha
quel campo, salta questo blocco (incollato nel prompt principale otterrebbe l'opposto).
Volutamente NON esclude tratti umani: le creature possono essere mezze aliene e mezze umane.

```
cute, chibi, cartoon, glossy 3D render, plastic, mechanical spaceship,
metal panels, robot, text, watermark, logo, background scenery,
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

## 1. Il simbionte del giocatore — MASSA (spritemap completa)

Un unico foglio **512×256**: griglia **8 colonne × 4 righe**, celle **64×64**.

| Riga | Contenuto | Fotogrammi |
|---|---|---|
| 1 | VOLO, loop | 8 |
| 2 | SALTO, palla che rotola, loop | 8 |
| 3 | PHASE (6) + COLPITO (1) + vuoto (1) | 8 |
| 4 | CRESCITA (3) + MORTE (5) | 8 |

```
One sprite sheet, 512x256 pixels, a grid of 8 columns by 4 rows, every cell exactly
64x64 pixels, no gutters, no borders, transparent background. The SAME creature in
every cell, identical proportions, palette and details; only the animation changes.

THE CREATURE (seen from directly above, its front facing UP):
A floating amorphous mass of raw alien flesh, body about 34 px across, centered at
x=32, y=28 of each cell. Its front edge (top) is a vertical slit maw lined with two
rows of needle teeth. Asymmetric cluster of 4 sickly yellow eyes with black slit
pupils just above-left of the maw (one big, three small). Two smaller toothed mouths
on the left and right flanks. Three yellowed bone shards pierce the flesh. Dark
purple veins under translucent skin, a few stitched sutures, wet specular dots.
Seven tentacles, 18 to 26 px long, sprout from the back half and trail downward
and outward, thick at the base, thin at the tip.
Colour ramp for the flesh, darkest to lightest: #22030a #4a0815 #7a0f22 #a01c34 #d0465a.
Teeth and bone #e8dcc0 and #b9a47c. Eyes #d9c45a, pupils #0a0006. Veins #3a1a5a.
1 px outline #07040a. Light from the top-left. A 1 px hot pink #ff2bd6 bioluminescent
rim on the upper-left edges only. Hard pixel shading, no blur, no gradients.

ROW 1 — FLY, 8-frame seamless loop. A jellyfish-like propulsion pulse: frames 1-4 the
body contracts by 2 px and the tentacles pull in, frames 5-8 it relaxes and the
tentacles sweep outward. A wave travels down each tentacle from base to tip, each
tentacle offset in phase. The main maw opens on frames 3-4 and 7-8.

ROW 2 — JUMP ROLL, 8-frame seamless loop. The creature curls into a tight ball 30 px
across, tentacles wrapped around it as spiral bands, maw closed. The ball rotates 45
degrees clockwise per frame. Eyes visible on frames 1, 3, 5, 7. A 2 px hot pink motion
smear trails on the left edge.

ROW 3 — frames 1-6 PHASE: the creature dissolves into black smoke and drifting ichor,
semi-transparent by frame 3, almost gone on frame 4, reforming on frames 5-6, with a
cyan #19f0ff and magenta #ff2bd6 chromatic split on the edges.
Frame 7 HIT: the same idle pose as frame 1, the whole silhouette flashed pure white
except the eyes. Frame 8 empty.

ROW 4 — frames 1-3 GROWTH stages, idle pose: small (body 26 px, 5 tentacles), medium
(body 34 px, 7 tentacles, as in the other rows), huge (body 46 px, 11 tentacles, 3
extra eyes, more bone spikes, swollen veins). Frames 4-8 DEATH: the creature bursts,
flesh chunks, teeth and bone chips flying outward, ichor splash, fading into dark
smoke by frame 8.
```

Se il sito non accetta fogli così grandi, genera una riga alla volta (512×64) ripetendo
lo stesso blocco "THE CREATURE" e solo la riga che ti serve, con l'immagine della prima
riga come riferimento.

**Organi-arma (icone innestabili, 6 fotogrammi, celle 24×24)**
```
6 small grotesque flesh organs in one row, 24x24 cells, each a weapon grafted
on an alien creature: a glowing cyan gland (laser), a sac of acid green spores
(scatter), a long bony spine charged with light (rail), a pink pod full of
larvae (rockets), a spiral tentacle (sine wave), a sphincter mouth (default shot).
```

---

## 2. Nemici — un unico foglio (settore 1: la razza "BROOD")

Allega **la spritemap del simbionte come immagine di riferimento di stile**.
I nemici devono avere lo stesso tratto pixel art ma una **carne diversa** da quella del
giocatore (lui è rosso sangue): così in gioco si distinguono a colpo d'occhio.

Un foglio **512×448**: griglia **8 colonne × 7 righe**, celle **64×64**.
Ogni riga è un nemico, sempre nello stesso ordine (il gioco lo legge così):

| Riga | Nemico | Colonne 1–4 | 5–6 | 7–8 |
|---|---|---|---|---|
| 1 | Drone | riposo in loop | avviso prima di sparare | morte |
| 2 | Sweeper | idem | idem | idem |
| 3 | Crusher | idem | idem | idem |
| 4 | Hopper | idem | idem | idem |
| 5 | Kamikaze | idem | idem | idem |
| 6 | Wall | idem | idem | idem |
| 7 | Tank | idem | idem | idem |

```
One sprite sheet, 512x448 pixels, a grid of 8 columns by 7 rows, every cell exactly
64x64 pixels, no gutters, no borders, transparent background. Same pixel art style,
outline and shading as the reference image, but these are ENEMIES of a different alien
race called the Brood, so their flesh is different from the red player creature:
rotting bruise-purple and grey-green flesh #2a1a3a #3a2a4a #4a5a3a #6a7a4a, yellowed
bone #cdbb8e #8a7553, sickly yellow eyes #d9c45a with black slit pupils, dried blood
#7a0f22 in wounds. Bioluminescent accents in hot pink #ff2bd6 and toxic orange #ff6a00
only on the parts that shoot. 1 px outline #07040a, light from the top-left.
All enemies are seen from directly above and FACE DOWN, toward the player.
Each creature stays centered in its cell and keeps identical proportions across its row.

In every row: columns 1-4 a seamless idle loop (breathing, twitching, membranes or legs
moving). Columns 5-6 the WARNING pose: the creature tenses and every glowing part flares
bright white-pink, eyes wide open, it is about to shoot. Columns 7-8 DEATH: column 7 it
bursts open, flesh chunks, bone chips and ichor flying; column 8 a flat splatter of gore
fading out.

Row 1 DRONE (fits in 40x40): a floating eyeball the size of a fist, veined, carried by
four torn bat-like membranes, one huge yellow eye with sutures across the lids.
Row 2 SWEEPER (fits in 60x36): a flat ray-like creature, wide membranous body, gill
slits leaking pus, three spitting glands along its front edge glowing toxic orange.
Row 3 CRUSHER (fits in 48x44): a heavy crab-like creature, cracked yellowed bone shell,
two small claws, a wide glowing maw on its front edge that spits ground shockwaves.
Row 4 HOPPER (fits in 32x32): a bloated tick with a ridged abdomen and four jointed legs
bent to leap, a tiny head with one yellow eye. Its idle loop shows the legs coiling.
Row 5 KAMIKAZE (fits in 30x42): a segmented parasite larva diving head-first downward,
a barbed glowing stinger at the front, torn wing stubs, a sac of fluid on its back.
Row 6 WALL (fits in 64x30, wide and flat): a horizontal bar of fused vertebrae and
flesh studded with four eye-pods, held by sinew, a gap of bare bone in its centre.
Row 7 TANK (fits in 48x58): a huge beetle with two cracked bone wing-cases, six short
legs, mandibles and a fleshy horn cannon pointing down.
```

## 3. Boss — un unico foglio

Allega di nuovo la spritemap del simbionte come riferimento di stile.

Un foglio **1024×640**: griglia **4 colonne × 5 righe**, celle **256×128** (larghe).

| Riga | Boss | Col 1–2 | Col 3 | Col 4 |
|---|---|---|---|---|
| 1 | Sentinel | riposo (2 fotogrammi) | avviso | ferito |
| 2 | Hive | idem | idem | idem |
| 3 | Hunter | idem | idem | idem |
| 4 | Prism | idem | idem | idem |
| 5 | Warden | idem | idem | idem |

```
One sprite sheet, 1024x640 pixels, a grid of 4 columns by 5 rows, every cell exactly
256x128 pixels, no gutters, no borders, transparent background. Same pixel art style,
outline and shading as the reference image. These are colossal BOSSES of the Brood race,
seen from directly above, FACING DOWN toward the player, each one about 220 px wide and
centered in its cell, filling the width. Flesh palette: rotting bruise purple and
grey-green #2a1a3a #3a2a4a #4a5a3a #6a7a4a, yellowed bone #cdbb8e #8a7553, dried blood
#7a0f22, sickly yellow eyes #d9c45a. Glowing parts in hot pink #ff2bd6 and toxic orange
#ff6a00. 1 px outline #07040a, light from the top-left.

In every row: columns 1-2 a slow two-frame breathing idle. Column 3 the WARNING pose:
every glowing organ flares bright white-pink, eyes wide, about to attack. Column 4 the
same boss WOUNDED: open bleeding gashes, cracked bone, one eye burst.

Row 1 SENTINEL: a fortress of flesh shaped like a flattened lens around one gigantic
yellow eye, ribs arching over its back, a row of five spitting teeth along the bottom
edge, sutures and gashes.
Row 2 HIVE: three translucent egg sacs side by side, joined by thick flesh strands,
larvae squirming inside each sac, the sacs glow acid green #c6ff1a.
Row 3 HUNTER: a predator skull of yellowed bone fused to raw flesh, one central eye
socket glowing like a targeting reticle, a jaw of needle teeth, a fleshy gland on each side.
Row 4 PRISM: a clean pink alien crystal shard in the centre, growing out of a diseased
tumor mass, flesh roots gripping the crystal, a row of five glowing glands along the bottom.
Row 5 WARDEN: a ribcage gate, five huge curved ribs across the whole width held by sinew,
a beating red heart in the middle, veins pulsing, pus at the joints.
```

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

## 5. Sfondi in parallasse e correnti

Lo sfondo scorre sotto le corsie a velocità diverse (più lontano = più lento).
Tre immagini **verticali ripetibili** (il bordo alto combacia con quello basso),
tutte **360×1280**, molto **scure e poco contrastate** perché sopra devono leggersi
nemici e proiettili. Allega la spritemap del simbionte come riferimento di stile.

**Strato lontano (il più lento): il vuoto**
```
A vertically seamless background, 360x1280 pixels, pixel art, the top edge tiles
perfectly with the bottom edge. Deep space void, almost black #07040a, a faint sickly
nebula in bruise purple #3a1a5a and dried-blood red #22030a, sparse dirty stars, a few
distant colossal dead alien shapes barely visible in silhouette. Very dark, low contrast,
no bright spots. No text, no UI.
```

**Strato medio: le carcasse alla deriva**
```
A vertically seamless layer, 360x1280 pixels, pixel art, transparent background,
the top edge tiles perfectly with the bottom edge. Huge drifting alien carcasses seen
from above, kept to the LEFT and RIGHT edges only (leave the central 240 px mostly
empty): a broken rib cage, a torn membrane, a dead eye the size of a moon, floating bone
fragments and flesh debris. Dark and desaturated, rotting bruise purple and grey-green,
faint hot pink #ff2bd6 bioluminescent veins. No text, no UI.
```

**Strato vicino (il più veloce): polvere e detriti**
```
A vertically seamless layer, 360x1280 pixels, pixel art, transparent background,
the top edge tiles perfectly with the bottom edge. Sparse small floating debris seen
from above: spores, bone chips, droplets of ichor, motes of dirty acid green #c6ff1a and
cyan #19f0ff light. Mostly empty transparent space. No text, no UI.
```

**Corrente cosmica (una corsia), tile verticale 64×128**
```
A vertically seamless tile, 64x128 pixels, pixel art, transparent background. A narrow
river of cosmic plasma flowing downward, dirty hot pink #ff2bd6 and cyan #19f0ff streaks,
tiny floating specks of organic debris, faint nerve-like filaments, edges fading to fully
transparent on the left and right. Subtle, it sits under enemies and bullets.
```

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

1. PNG con **trasparenza vera**. Molti siti mostrano una scacchiera grigia ma esportano un
   JPG con la scacchiera disegnata dentro: lo script la toglie
   (`python3 scripts/import-sheet.py <sorgente> public/sprites/<nome>.png <colonne> <righe> 128`),
   ma con un PNG trasparente i bordi e il fumo vengono più puliti.
2. Nomi file: `symbiote_fly.png`, `symbiote_roll.png`, `symbiote_phase.png`,
   `enemies_brood.png`, `bosses_brood.png`, `bg_far.png`, `bg_mid.png`, `bg_near.png`,
   `fx_explosion.png`,
   `bullets_player.png`, `bullets_enemy.png`, `pickups.png`, `lane_current.png`,
   `bg_space.png`, `obstacles.png`, `icons_1.png` …
3. Mettili in `public/sprites/` del progetto (o mandameli): li collego io al gioco
   al posto degli sprite disegnati in codice, senza toccare il gameplay.

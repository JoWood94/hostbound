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

## 2b. Nemici — secondo foglio Brood (BROODER, STALKER, THROB, WEAVER)

Sostituisce gli sprite fatti in codice. **Allega il primo foglio Brood** come
riferimento: stesso stile, stessa palette, stessa luce. 1024×512, 8 colonne × 4
righe, celle 128×128 (come il primo foglio una volta importato). Colonne come il
primo: 1–4 idle, 5–6 avviso (occhi accesi, bocca aperta), 7–8 morte.
```
Match the attached Brood enemy sheet exactly: same dark gritty pixel art, same chunky
pixel size, same bruise purple and grey-green flesh, same bone yellow, same lighting
and dark outline. A sprite sheet of 4 new alien creatures seen from directly above,
1024x512 pixels, 8 columns x 4 rows of 128x128 cells, each creature centred and about
90 px wide, flat pure chroma green #00ff00 background, no grid lines, no text.
Columns 1-4: idle loop (subtle breathing, limbs shifting). Columns 5-6: attack warning
(eyes flare white-hot, maw or valves open, glow brightens). Columns 7-8: death (the body
bursts into gore and ichor, then collapses).
Row 1 BROODER: a bloated translucent egg sac carried on six thin insect legs, clusters
of dirty yellow #ffd23f eggs glowing inside, a dripping ovipositor at the back that
lays eggs downward.
Row 2 STALKER: a long thin eel-like hunter, one huge sighting eye with a red-pink
#ff5c8a iris, a barbed needle snout pointing down, a ridge of small spines.
Row 3 THROB: a floating heart-like organ, three valves on top, swollen veins, deep
blue #3d7bff light pulsing from inside, a few severed arteries trailing.
Row 4 WEAVER: a ribbed spider-like body with three long tendrils hanging below, three
eyes in a row, pale pink #ff9cf0 silk threads strung between the tendrils.
No green in the creatures.
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

## 3b. Boss — secondo foglio (5 boss nuovi)

Stesso formato del primo foglio boss (**allegalo come riferimento**, insieme alla
spritemap del simbionte): 1024×640, 4 colonne × 5 righe, celle 256×128, fondo **verde
chroma #00ff00** (lo tolgo io). Colonne come il primo: 1–2 riposo, 3 avviso, 4 ferito.
Sono i boss dei distretti 6–10; dopo di loro tornano tutti come MK2.

Ogni boss ha già un'identità di gioco, così l'aspetto racconta cosa farà:

| Riga | Boss | Cosa fa in gioco |
|---|---|---|
| 1 | MAW | Bocca che inspira: risucchia i colpi verso il centro, poi sputa ventagli e onde basse a tempo |
| 2 | CHOIR | Anello di teste che cantano: raggi armonici che si alternano tra corsie pari e dispari, cori a canone |
| 3 | MOTHER | Regina della covata: depone file di uova da saltare e partorisce droni, ondate a ritmo |
| 4 | SPINE | Millepiedi lungo tutta la pista: il corpo fa da muro su più corsie e si sposta, varchi tra i segmenti |
| 5 | ECLIPSE | Occhio del vuoto: veli e squarci da attraversare col phase mescolati a raffiche nel buio |

```
Match the two attached reference sheets exactly: same dark gritty pixel art, same chunky
pixel size, same Brood flesh palette (bruise purple and grey-green #2a1a3a #3a2a4a
#4a5a3a #6a7a4a, yellowed bone #cdbb8e #8a7553, dried blood #7a0f22, sickly yellow eyes
#d9c45a), glowing parts in hot pink #ff2bd6 and toxic orange #ff6a00, 1 px outline
#07040a, light from the top-left.
One sprite sheet, 1024x640 pixels, a grid of 4 columns by 5 rows, every cell exactly
256x128 pixels, no gutters, no borders, flat pure chroma green #00ff00 background.
Colossal BOSSES seen from directly above, FACING DOWN toward the player, each about
220 px wide, centred in its cell, filling the width.
In every row: columns 1-2 a slow two-frame breathing idle. Column 3 the WARNING pose:
every glowing organ flares white-pink, eyes wide, about to attack. Column 4 the same boss
WOUNDED: open bleeding gashes, cracked bone, one eye burst.
Row 1 MAW: an enormous round mouth seen from above, rings of inward-pointing teeth
spiralling into a dark throat, lips of swollen flesh, two small eyes on stalks at the
sides, glowing pink saliva strands across the throat.
Row 2 CHOIR: a ring of five fused heads with open singing mouths, joined by a shared
spine, each mouth glowing toxic orange inside, thin vocal cords stretched between them
like harp strings.
Row 3 MOTHER: a bloated brood queen, a huge translucent abdomen full of glowing yellow
eggs, many small legs along the sides, a crown of bony horns, a dripping ovipositor at
the front pointing down.
Row 4 SPINE: a giant centipede curled across the whole width, armoured bone segments
with pink glowing joints, many legs, a horned head on one side and a stinger tail on the
other, gaps between the segments.
Row 5 ECLIPSE: a black void sphere with a burning pink corona, one huge pale eye in the
middle, tendrils of darkness reaching out to the sides, small stars caught in its pull.
No green in the creatures, no text.
```

## 4. Colpi, effetti, pickup

Regola di colore: **tutto ciò che spari tu è verde acido** (#c6ff1a, nucleo #f4ffd8);
**tutto ciò che ti fa male è magenta/arancio**. Mai mischiare: in pieno bullet hell
si deve capire in un decimo di secondo cosa è tuo.

**Colpi del giocatore — un unico foglio** (512×128, 8 colonne × 2 righe, celle 64×64)
```
A sprite sheet of player projectiles, 512x128 pixels, a grid of 8 columns and 2 rows
of 64x64 cells, each sprite centred in its cell and pointing UP, pixel art, flat pure
black #000000 background (no checkerboard, no gradient). All projectiles are living
bio-plasma spat by a symbiote: dirty acid green #c6ff1a with a pale hot core #f4ffd8,
wet, organic, slightly translucent, a short glowing smear trailing downward.
Row 1, idle shots, one per column:
1 small glob of glowing spit (basic shot), 2 big heavy calcified glob (slug),
3 tiny pellet of bile (scatter), 4 spore pod with a smoke trail (rocket),
5 wavy larva (sine wave), 6 huge swollen glob ringed with veins (echo round),
7 bone needle (piercer), 8 blank.
Row 2, impacts and beams:
1-3 impact splash in 3 frames (spit bursting into acid droplets),
4-5 rocket spore bursting in 2 frames, 6 vertical slice of a living beam
(twisted luminous nerve fibres, white-hot core, tileable top to bottom),
7 rail streak (a thin blinding green line with a sheath of sparks), 8 blank.
No text, no UI, no numbers.
```

**Proiettili nemici** (256×64, 4 colonne di 64)
```
4 enemy projectile sprites in one row, 256x64 pixels, 64x64 cells, centred, pixel art,
flat pure black #000000 background. Hostile alien venom: 1 hot magenta #ff2bd6 orb of
spit with a white core, 2 toxic orange #ff6a00 orb with a white core, 3 big magenta
acid droplet with a dripping tail, 4 a low curved crescent shockwave of orange bile
skimming the ground (to be jumped). Must read clearly over a dark background.
No green anywhere.
```

**Esplosioni** (celle 48×48, 8 fotogrammi)
```
Sprite sheet, 8 frames in one row, 48x48 cells: a gore explosion, flesh chunks,
bone chips and ichor bursting outward then fading into dark smoke, hot pink and
sickly yellow sparks. Flat pure black background.
```

**Pickup** (celle 20×20)
```
5 pickup sprites in one row, 20x20 cells: a glowing acid green biomass cell
(currency), a beating red organ (heart), a pale blue cyst (shield heart),
a glitching corrupted egg with cyan and magenta split (mystery item),
a small pink tumor (bonus). Bioluminescent. Flat pure black background.
```

**Colpi v1.2 — corpi dei carrier nuovi** (512×128, 8 colonne × 2 righe, celle 64×64)
Oggi sono disegnati in vettoriale (`drawBody` in `bullets.js`). Stessa regola: tutto ciò che
spari è verde acido. Larve e pungiglioni sono piccoli in gioco (circa 12-16 px): servono
sagome semplici e forti, leggibili anche rimpicciolite.
```
Match the attached player projectile sheet exactly (same dirty acid green #c6ff1a
bio-plasma, pale hot core #f4ffd8, 1 px near-black outline #07040a, wet organic look).
A sprite sheet of 16 player projectiles, 512x128 pixels, 8 columns x 2 rows of 64x64
cells, one sprite centred per cell, pointing UP, pixel art, flat pure black #000000
background, no grid lines, no text. Strong simple silhouettes that still read at 16 px.
Row 1:
1 a three-bladed spinning disc of sharpened bone with glowing acid edges (glaive),
2 the same glaive blurred mid-spin,
3 a round spore pod with a soft pulsing glow, closed (mine),
4 the same pod swollen and about to burst, cracks of light,
5 a seed mortar shell, heavy and ribbed, with a short glowing trail,
6 the same shell splitting open into three smaller seeds,
7 a translucent husk shell, half-moon shaped (shield),
8 an egg sac bursting open with green slime (hatching).
Row 2:
1 a cute-gross alien larva seen from above, head up: 4 plump glowing segments getting
smaller toward the tail, a pale head with two curved pincer mandibles, tiny legs,
2 the same larva with its body curved to one side (crawl frame),
3 the same larva curled into a C, mandibles biting down (latched, eating),
4 a barbed bone stinger in flight, tip up, a thin glowing tail,
5 the same stinger stuck tip down, its tail glowing hot,
6 the stuck stinger swelling orange #ffd27a, about to burst,
7 a small orange-white burst of the stinger exploding,
8 blank.
```

## 4c. Rifacimento colpi e effetti (v1.3) — sostituisce i fogli dei colpi sopra

> **Fatto a mano in pixel art** (2026-10-02). I fogli di colpi, corpi dei carrier, varianti per tratto,
> effetti sui nemici ed esplosioni sono generati da `scripts/pixel-shots.py` (`python3 scripts/pixel-shots.py`
> rigenera tutto in `public/sprites/`): `shots_player`, `shots_bio`, `shots_trait`, `fx_status`, `fx_player`.
> I prompt qui sotto restano solo come alternativa con un generatore di immagini.

**Perché la prima versione non andava** (troppo cartoon e non pixel art):
- avevo chiesto occhi, cuori, ali, stelle e "cute-gross", che diventano icone da cartone;
- c'erano 32 celle per foglio;
- mancava una griglia di pixel bassa e fissa.

Ora ogni foglio ha 16 celle (8×2, come `shots_player.png`, che era riuscito bene), usa solo
forme organiche astratte e ha le PIXEL RULES qui sotto.

Ordine per ogni foglio:
1. STYLE BIBLE;
2. PIXEL RULES;
3. il prompt del foglio;
4. il NEGATIVE PROMPT dei colpi (nel campo apposito);
5. allega `public/sprites/shots_player.png` come riferimento.

Prova prima il foglio A1. Se esce bene, gli altri vanno nello stesso modo.

**PIXEL RULES** (incolla dopo lo STYLE BIBLE)
```
Strict low-resolution pixel art, like a 16-bit arcade shmup (SNES / Neo Geo era).
Every sprite is drawn on a tiny pixel grid of about 24x24 pixels inside its cell and
scaled up with nearest-neighbour, so each art pixel is a visible square block. Hard
square pixel clusters, 4 to 5 colours per sprite (outline #07040a, dark green #3d5c0a,
acid green #c6ff1a, pale green #e6ff8a, hot core #f4ffd8), hand-placed highlights,
optional ordered dithering. No smooth gradients, no soft airbrush glow, no anti-aliasing,
no vector curves, no cel-shaded cartoon outlines. Match the attached sheet's pixel size,
palette and rendering exactly.
```

**NEGATIVE PROMPT dei colpi**
```
cartoon, cute, chibi, emoji, face, eyes, mouth, smile, heart symbol, star symbol, wings,
cel shading, vector art, smooth gradient, soft glow, airbrush, 3D render, glossy, plastic,
high resolution painting, anti-aliased, blurry, text, numbers, grid lines, orange, magenta,
red, blue
```

**A1. Colpi base** (512×128, 8 colonne × 2 righe, celle 64×64, rivolti in alto)
```
A sprite sheet of 16 player projectiles, 512x128 pixels, 8 columns x 2 rows of 64x64
cells, one sprite centred per cell, pointing UP, flat pure black #000000 background.
Acid bio-plasma spat by an alien symbiote, wet and organic, a short pixel smear trailing
downward. Row 1: 1 a small round glob of spit, 2 a heavy lumpy calcified glob with dark
cracks, 3 a tiny pellet of bile (only 6 pixels wide), 4 a teardrop spore pod with a short
wisp of dark green smoke behind it, 5 a thin wriggling worm of plasma in an S curve,
6 a huge swollen glob with dark veins across its surface, 7 a long pale bone needle,
8 a glob ringed by a jagged crackling rim of pale pixels (charged).
Row 2, impacts: 1-3 a glob bursting into droplets in 3 frames, 4 a drippy splash
puddle, 5 a burst of bone chips, 6 a small spiky spark burst, 7 a needle snapping in two,
8 empty.
```

**A2. Varianti per tratto** (512×128, 8 × 2 celle 64×64): il gioco sceglie l'aspetto del
colpo in base al tratto dominante della build.
```
A sprite sheet of 16 player projectiles, 512x128 pixels, 8 columns x 2 rows of 64x64
cells, one sprite centred per cell, pointing UP, flat pure black #000000 background.
Variations of the same small acid glob of spit, each changed in SHAPE only, same
palette. Row 1: 1 a glob with thick drips and two bubbles hanging off it (venom),
2 a glob inside a ring of short bone spikes (fragmenting), 3 a glob with three
zig-zag pixel sparks crawling over it (electric arc), 4 a pointed glob leaning forward
with a thin wake of pixels (seeking), 5 a glob with a dark burnt spiral scar (branded),
6 a glob pinched in the middle into two lobes (splitting cell), 7 a hollow glob drawn as
a dithered outline only, half transparent (ghost), 8 a glob banded with two dark rings
(bouncing).
Row 2: 1 a glob with two thin flat membrane fins at its sides (airborne), 2 a sharp
diamond-shaped shard of plasma (critical), 3 a short slim dart (drone shot), 4 a jagged
broken acid splinter (shrapnel), 5 a tiny round glob (fragment), 6 a small swollen glob
with veins (echo fragment), 7 a glob with dark veins radiating out like a pulse
(heavy beat), 8 a glob trailing a long thin ribbon of fading pixels (burning trail).
```

**B. Corpi dei carrier** (512×128, 8 × 2 celle 64×64)
```
A sprite sheet of 16 player projectiles, 512x128 pixels, 8 columns x 2 rows of 64x64
cells, one sprite centred per cell, pointing UP, flat pure black #000000 background.
Row 1: 1 a flat three-bladed disc of sharpened bone, blades curved like a shuriken,
acid green edges, 2 the same disc with motion-blurred blades (spinning), 3 a round
spore pod, closed, a few pale spots, 4 the same pod swollen with glowing cracks,
5 a heavy ribbed seed shell, 6 the same shell splitting open into three seeds,
7 a thin translucent half-moon husk shell, dithered, 8 a burst egg sac with slime.
Row 2: 1 a grotesque maggot seen from above, head up, four fat segments tapering to the
tail, two small dark pincers at the head, 2 the same maggot bent to one side,
3 the same maggot curled into a C, pincers closed, 4 a barbed bone stinger, tip up,
5 the stinger stuck tip down, 6 the stuck stinger swollen and glowing pale,
7 a small tight burst of bone splinters, 8 empty.
```

**C. Raggi, scie e fili** (512×128, 8 × 2 celle 64×64; fette che si ripetono in verticale)
```
A sprite sheet of beam and trail pieces, 512x128 pixels, 8 columns x 2 rows of 64x64
cells, flat pure black #000000 background. Row 1 are vertical slices that tile
seamlessly top to bottom, centred: 1 a beam of three twisted strands of nerve fibre
around a hot pale core, 2 the same beam overcharged, almost white, wider, 3 a thin
blinding rail line with scattered pixel sparks, 4 a thin twisted sinew cord, 5 a thin
taut wire with small beads, 6 a wide pillar of pale light with acid green edges,
7 a faint broken trail of dripping pixels, 8 empty.
Row 2: 1-3 a beam impact flare in 3 frames, 4-5 a rail hit flash in 2 frames,
6 a short jagged flash line, 7 a knot of sinew, 8 empty.
```

**D. Effetti sui nemici** (384×96, 8 × 2 celle 48×48; centro vuoto, il nemico resta visibile)
```
A sprite sheet of 16 status effect overlays drawn on top of enemies, 384x96 pixels,
8 columns x 2 rows of 48x48 cells, flat pure black #000000 background. Each overlay is
a loose ring or scatter of marks around an EMPTY centre. Acid green palette, except
numb and frozen in pale lilac #c9b8ff #8c78d8. Row 1: 1-2 rising venom bubbles and drips,
2 loop frames, 3 a dark burnt spiral mark floating above the centre, 4 lilac frost
cracks and small sparks, 5 lilac ice crystals closing in, 6 slow drooping wisps,
7 four corner brackets of a targeting reticle, 8 a ring segment filling with light.
Row 2: 1 small maggots biting at the rim, 2 three barbed stingers stuck in a ring,
3 a body melting into acid foam, 4 lilac ice shards bursting outward, 5 a cracked
translucent husk, 6 a burst egg sac with tiny maggots, 7-8 empty.
```

**E. Esplosioni del giocatore** (512×128, 8 × 2 celle 64×64; niente sangue né fuoco)
```
A sprite sheet of player explosions, 512x128 pixels, 8 columns x 2 rows of 64x64 cells,
flat pure black #000000 background, acid green palette only. Row 1: an acid spore burst
in 8 frames: a pale core swelling, bursting into pixel droplets and a ring of spores,
then thinning into a few drifting specks. Row 2: 1-4 a white-hot flash in 4 frames,
a pale disc with acid green edges collapsing into a thin ring, 5-7 a small tight burst
of bone splinters in 3 frames, 8 empty.
```

## 4d. Gli stessi fogli in versione Gemini

Gemini non ha il campo del negative prompt e lavora meglio con un unico testo che parte dall'immagine di riferimento. Ogni prompt è autonomo: incollalo intero (senza STYLE BIBLE) e allega `public/sprites/shots_player.png`. Inizia da A1.

**A1. Colpi base (ridisegno del foglio attuale, stesse celle: il gioco legge gli sprite per posizione)**
```
Using the attached sprite sheet as the exact style reference (same chunky pixel art, same pixel size, same acid green palette: #c6ff1a, pale core #f4ffd8, dark green shading, 1-pixel near-black outline, same soft glow and same wet organic look), create a new sprite sheet with the same layout: 8 columns by 2 rows of equal square cells, one sprite centred in each cell, all pointing up, on a flat pure black background. Pixel art only: hard square pixels, no smooth gradients, no painterly or cartoon look, no faces or eyes, no text, no grid lines. Use only acid green tones, never orange, magenta, red or blue. Redraw every sprite of the reference in the SAME cell, more refined and more detailed, keeping its shape and size. Row 1: 1 small glob of spit, 2 big heavy lumpy glob with dark cracks, 3 tiny pellet, 4 teardrop spore pod with a wisp of dark green smoke, 5 thin plasma worm in an S curve, 6 huge swollen glob with dark veins, 7 long pale bone needle, 8 (new) a glob ringed by a jagged crackling rim of pale pixels. Row 2: 1 small glob, 2 drippy splash, 3 starburst of droplets, 4 teardrop glob, 5 spiky spark burst, 6 vertical beam slice of twisted luminous strands that tiles top to bottom and fills the cell height, 7 thin horizontal rail streak with pixel sparks, 8 (new) a small burst of bone chips.
```

**A2. Varianti del colpo per tratto**
```
Using the attached sprite sheet as the exact style reference (same chunky pixel art, same pixel size, same acid green palette: #c6ff1a, pale core #f4ffd8, dark green shading, 1-pixel near-black outline, same soft glow and same wet organic look), create a new sprite sheet with the same layout: 8 columns by 2 rows of equal square cells, one sprite centred in each cell, all pointing up, on a flat pure black background. Pixel art only: hard square pixels, no smooth gradients, no painterly or cartoon look, no faces or eyes, no text, no grid lines. Use only acid green tones, never orange, magenta, red or blue. Sixteen variations of the same small glob of spit from the reference, each changed in shape only. Row 1: 1 thick drips and two bubbles hanging off it, 2 inside a ring of short bone spikes, 3 three zig-zag pixel sparks crawling over it, 4 pointed and leaning forward with a thin wake, 5 a dark burnt spiral scar on it, 6 pinched in the middle into two lobes, 7 hollow, drawn as a dithered outline only, 8 banded with two dark rings. Row 2: 1 two thin flat membrane fins at its sides, 2 a sharp diamond-shaped shard, 3 a short slim dart, 4 a jagged broken splinter, 5 a tiny round droplet, 6 a small swollen glob with veins, 7 dark veins radiating out from it, 8 trailing a long thin ribbon of fading pixels.
```

**B. Corpi dei carrier**
```
Using the attached sprite sheet as the exact style reference (same chunky pixel art, same pixel size, same acid green palette: #c6ff1a, pale core #f4ffd8, dark green shading, 1-pixel near-black outline, same soft glow and same wet organic look), create a new sprite sheet with the same layout: 8 columns by 2 rows of equal square cells, one sprite centred in each cell, all pointing up, on a flat pure black background. Pixel art only: hard square pixels, no smooth gradients, no painterly or cartoon look, no faces or eyes, no text, no grid lines. Use only acid green tones, never orange, magenta, red or blue. Row 1: 1 a flat three-bladed disc of sharpened pale bone, blades curved like a shuriken, glowing green edges, 2 the same disc with motion-blurred blades, 3 a round closed spore pod with a few pale spots, 4 the same pod swollen with glowing cracks, 5 a heavy ribbed seed shell, 6 the same shell splitting open into three seeds, 7 a thin translucent half-moon husk, dithered, 8 a burst egg sac with slime. Row 2: 1 a grotesque maggot seen from above, head up, four fat segments tapering to the tail, two small dark pincers, 2 the same maggot bent to one side, 3 the same maggot curled into a C, 4 a barbed pale bone stinger, tip up, 5 the stinger stuck tip down, 6 the stuck stinger swollen and glowing pale, 7 a small tight burst of bone splinters, 8 empty.
```

**C. Raggi, scie e fili (le fette della riga 1 si ripetono in verticale)**
```
Using the attached sprite sheet as the exact style reference (same chunky pixel art, same pixel size, same acid green palette: #c6ff1a, pale core #f4ffd8, dark green shading, 1-pixel near-black outline, same soft glow and same wet organic look), create a new sprite sheet with the same layout: 8 columns by 2 rows of equal square cells, one sprite centred in each cell, all pointing up, on a flat pure black background. Pixel art only: hard square pixels, no smooth gradients, no painterly or cartoon look, no faces or eyes, no text, no grid lines. Use only acid green tones, never orange, magenta, red or blue. Row 1, vertical slices that fill the full cell height and tile seamlessly top to bottom: 1 a beam of three twisted strands around a hot pale core, 2 the same beam overcharged, wider and almost white, 3 a thin blinding line with scattered pixel sparks, 4 a thin twisted sinew cord, 5 a thin taut wire with small beads, 6 a wide pillar of pale light with green edges, 7 a faint broken trail of dripping pixels, 8 empty. Row 2: 1-3 a beam impact flare in 3 frames, 4-5 a hit flash in 2 frames, 6 a short jagged flash line, 7 a knot of sinew, 8 empty.
```

**D. Effetti sui nemici (sovrapposizioni con il centro vuoto: il nemico sotto resta visibile)**
```
Using the attached sprite sheet as the exact style reference (same chunky pixel art, same pixel size, same acid green palette: #c6ff1a, pale core #f4ffd8, dark green shading, 1-pixel near-black outline, same soft glow and same wet organic look), create a new sprite sheet with the same layout: 8 columns by 2 rows of equal square cells, one sprite centred in each cell, all pointing up, on a flat pure black background. Pixel art only: hard square pixels, no smooth gradients, no painterly or cartoon look, no faces or eyes, no text, no grid lines. Use acid green tones, except the numb and frozen effects in pale lilac #c9b8ff and #8c78d8; never orange, magenta, red or blue. Each sprite is a loose ring or scatter of marks around an EMPTY centre. Row 1: 1-2 rising bubbles and drips, two loop frames, 3 a dark burnt spiral mark floating above the centre, 4 lilac frost cracks and small sparks, 5 lilac ice crystals closing in, 6 slow drooping wisps, 7 four corner brackets of a targeting reticle, 8 a ring segment filling with light. Row 2: 1 small maggots biting at the rim, 2 three barbed stingers stuck in a ring, 3 a shape melting into foam, 4 lilac ice shards bursting outward, 5 a cracked translucent husk, 6 a burst egg sac with tiny maggots, 7-8 empty.
```

**E. Esplosioni del giocatore (niente sangue né fuoco)**
```
Using the attached sprite sheet as the exact style reference (same chunky pixel art, same pixel size, same acid green palette: #c6ff1a, pale core #f4ffd8, dark green shading, 1-pixel near-black outline, same soft glow and same wet organic look), create a new sprite sheet with the same layout: 8 columns by 2 rows of equal square cells, one sprite centred in each cell, all pointing up, on a flat pure black background. Pixel art only: hard square pixels, no smooth gradients, no painterly or cartoon look, no faces or eyes, no text, no grid lines. Use only acid green tones, never orange, magenta, red or blue. Row 1: a spore burst in 8 frames, a pale core swelling, bursting into pixel droplets and a ring of spores, then thinning into a few drifting specks. Row 2: 1-4 a white-hot flash in 4 frames, a pale disc with green edges collapsing into a thin ring, 5-7 a small tight burst of bone splinters in 3 frames, 8 empty.
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

**Corrente cosmica (una corsia), tile verticale 72×144**
```
A vertically seamless tile, 72x144 pixels, pixel art, transparent background. A narrow
river of cosmic plasma flowing downward, dirty hot pink #ff2bd6 and cyan #19f0ff streaks,
tiny floating specks of organic debris, faint nerve-like filaments, edges fading to fully
transparent on the left and right. Subtle, it sits under enemies and bullets.
```

## 6. Icone degli item — un unico foglio

Un foglio solo con tutti i 44 item **nell'ordine del gioco** (512×384, 8 colonne ×
6 righe, celle 64×64; le ultime 4 celle vuote). Colore dominante per categoria, come
nelle carte: armi verde acido, difesa ciano, economia giallo, rischio rosso,
modalità di sparo magenta, attivi arancio. Se il generatore sbaglia l'ordine o il
numero di celle, rigeneralo a metà (righe 1–3, poi 4–6) con lo stesso prompt.

```
A sprite sheet of item icons, 512x384 pixels, a grid of 8 columns and 6 rows of
64x64 cells, one icon centred in each cell with some margin, pixel art, flat pure black
#000000 background (no checkerboard, no grid lines, no text, no numbers, no labels).
Every item is a grotesque bioluminescent alien organ or trinket, wet and fleshy, dark
outline, readable at 32 px, seen in three-quarter view. Colour accents: weapons acid
green #c6ff1a, defence cyan #19f0ff, economy dirty yellow #ffd23f, risk blood red
#ff1f4b, fire modes hot magenta #ff2bd6, actives toxic orange #ff6a00.
Read cells left to right, top to bottom:
Row 1: 1 a forked split tongue, 2 a twitching coiled muscle, 3 a heavy calcified slug, 4 a ring of magnetised vertebrae, 5 a long bone needle, 6 a tracking eye on a stalk, 7 a cluster of spore grenades, 8 a crackling exposed nerve.
Row 2: 1 a dripping poison gland, 2 an eye pierced by a crosshair of thorns, 3 a ribbed resonating shell, 4 a chitin armour plate, 5 a frozen pale blue cyst, 6 a translucent membrane bubble, 7 a small moon of flesh orbiting a core, 8 a flickering half-transparent heart.
Row 3: 1 a shard of reflective scale, 2 a curled springy tendon, 3 a cluster of healing larvae, 4 a horseshoe of bone with sparks, 5 a fat gold-veined tumour, 6 a four-leafed fungus, 7 a gland venting green flame, 8 a bone die with eyes as pips.
Row 4: 1 a bulging pulsing adrenal gland, 2 a cracked glass organ full of light, 3 a tiny symbiote larva companion, 4 a heavy clenched knuckle of bone, 5 a streaming wisp of ectoplasm, 6 a hidden mouth with teeth in shadow, 7 a string of linked swollen pods, 8 a fat red leech.
Row 5: 1 a bleeding cut heart, 2 a stack of biomass cells growing, 3 a glowing eye shooting a beam, 4 an open spore pod fanning seeds, 5 a long spinal column charged with light, 6 a pod of three spore rockets, 7 a wriggling serpent larva, 8 a bursting nerve cluster.
Row 6: 1 an hourglass of bone with green sand, 2 a heart overloaded with light, 3 a vertical bolt from an open eye, 4 a stitched flesh patch, 5 blank, 6 blank, 7 blank, 8 blank.
```

---

## 8. Pista cosmica: bordi, divisori, ostacoli

Via il look Tron (pannelli, griglie, cartelli a strisce). Niente carne qui: la pista
è un fascio di correnti di plasma che attraversa il vuoto, tenuto insieme da linee di
campo magnetico. Bordi e divisori sono **luce** → fondo **nero pieno** (diventa
trasparenza). Gli ostacoli sono **corpi solidi** → fondo **verde chroma #00ff00**,
quindi niente verde negli ostacoli.
Regola colori del gioco: **arancio = si salta**, **magenta = si cambia corsia**.

**Bordo laterale** (striscia verticale 64×1024, ripetibile; la specchio per il lato destro)
```
A vertically seamless border strip, 64x1024 pixels, pixel art, flat pure black #000000
background. The left edge of a river of cosmic plasma flowing through deep space: a
dense bank of magnetic field lines and plasma filaments, crackling hot pink #ff2bd6 and
cyan #19f0ff strands, faint violet #3a1a5a nebula haze fading outward to the left,
a few tiny bright sparks. The inner (right) edge is a crisp bright filament so lanes
stay readable. Mostly dark, low contrast except the inner filament.
The top edge tiles perfectly with the bottom edge. No text.
```

**Divisorio di corsia**: fatto in codice (filo di campo sottile con un nodo
luminoso), l'immagine generata non serviva.

**Ostacoli v3** (foglio 512×256, 4 colonne × 2 righe, celle 128×128)
Asteroidi e rocce vanno bene: il problema della prima prova era lo stile cartoon
(contorni spessi colorati, ombre a blocchi pulite, colori saturi, ghiaccio azzurro).
Allega la spritemap del simbionte come riferimento di stile.
```
Match the rendering style of the attached reference sheet exactly. Gritty, dark,
realistic pixel art, NOT cartoon: no thick coloured outlines, no flat cel shading, no
saturated candy colours, no cute rounded shapes. Rough porous rock texture, dithered
shading, deep black shadows, dust and pitting, small details, harsh rim light.
A sprite sheet of space rocks drifting in a river of cosmic plasma, seen strictly from
directly above (top-down, no perspective), 512x256 pixels, a grid of 4 columns and
2 rows of 128x128 cells, one object centred per cell, flat pure chroma green #00ff00
background, no grid lines, no borders.
Row 1, LOW obstacles to jump over: flat and wide (about 110 px wide, 30-40 px tall),
charcoal grey rock lit from inside by toxic orange #ff6a00 heat:
1 a flat band of rubble and gravel, 2 a long low slab of cracked basalt with glowing
seams, 3 a ring fragment of crushed rocks, 4 a trail of small smouldering meteor chips.
Row 2, WALL obstacles to avoid: big and heavy (about 90x90 px), near-black pitted
asteroid rock with a faint hot magenta #ff2bd6 glow only in deep cracks and on the rim:
1 a jagged asteroid, 2 a split boulder with a magenta fissure, 3 an asteroid studded
with dark crystal shards, 4 a dense iron meteorite with one red #ff1f4b glowing core.
Desaturated rock, colour only from the glow. No green in the art, no text.
```

---

## 6b. Icone degli item v1.1 — secondo foglio

Stesso stile e colori per categoria del primo foglio (allegalo come riferimento).
512×256, 8 colonne × 4 righe, celle 64×64, i 32 item nuovi nell'ordine del gioco.
```
Match the attached item icon sheet exactly: same grotesque bioluminescent alien organs,
same dark outline, same category colour accents. A sprite sheet of item icons, 512x256
pixels, 8 columns x 4 rows of 64x64 cells, one icon centred per cell, flat pure black
#000000 background, no grid lines, no text, no numbers.
Read cells left to right, top to bottom:
Row 1: 1 a glowing cell splitting into two, 2 a bone cracking into sharp acid splinters,
3 a hot branding iron shaped like an eye, 4 a coiled muscle glowing with stored energy,
5 a winged spore rising, 6 a translucent ghost larva, 7 a comet of acid with a long trail,
8 two linked twin embryos.
Row 2: 1 a dense black pearl in flesh, 2 a pumping gland with green droplets, 3 a light
hollow bird bone, 4 a thick plate of horn, 5 a branching glowing neuron, 6 a lens made of
an eyeball, 7 a cell in mitosis with two nuclei, 8 a rolling ball of tendons.
Row 3: 1 a third eye opening, 2 a ribbed beetle shell, 3 a puff of acid spores, 4 a wall of
stacked cells, 5 a peeled second skin, 6 a whirlpool of plasma, 7 a cracked glowing egg,
8 a lead weight with a hook.
Row 4: 1 a feverish red-hot organ, 2 a coin-like cell split in half, 3 a parasitic worm,
4 a tiny black hole with an accretion ring, 5 a mirror-like membrane, 6 an overloaded
crackling heart, 7 a tear in space, 8 a shed husk.
Colour accents: weapons acid green #c6ff1a, defence cyan #19f0ff, economy dirty yellow
#ffd23f, risk blood red #ff1f4b, actives toxic orange #ff6a00.
```

## 6c. Icone degli item v1.2 — terzo foglio

Stesso stile del primo foglio. 512×128, 8 colonne × 2 righe, celle 64×64.
```
Match the attached item icon sheet exactly: same grotesque bioluminescent alien organs,
same dark outline, same category colour accents. A sprite sheet of item icons, 512x128
pixels, 8 columns x 2 rows of 64x64 cells, one icon centred per cell, flat pure black
#000000 background, no grid lines, no text, no numbers.
Row 1 (fire modes, hot magenta #ff2bd6 accents): 1 a bone glaive disc, 2 a spore pod mine,
3 a cluster of larvae, 4 a barbed stinger, 5 a seed mortar shell; then weapon traits
(acid green #c6ff1a): 6 a shot bouncing off a wall, 7 three shots meeting in one point,
8 a slingshot made of sinew.
Row 2 (acid green unless noted): 1 a numbing venom gland, 2 a shot passing through one
body into the next, 3 an empty husk shell (defence cyan #19f0ff), 4 a reaper hook,
5 a burning metabolism organ, 6 a beating heart with shock rings, 7 a rush of blood
drops, 8 blank.
```

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

---

## 9. Logo HOSTBOUND (Nano Banana / Gemini)

Prompt autonomo (senza STYLE BIBLE). Allega come riferimento colori `public/sprites/border.png`
(il plasma dei bordi del menu). Esporta su nero puro: lo importo con
`scripts/import-glow.py --key black`, il bagliore diventa trasparenza.

```
A neon sign logo for a dark cosmic horror arcade game, reading exactly "HOSTBOUND" split on two lines as "Host" and "BOUND", spelled exactly like that, no other text. Top line: the word "Host" as a hand-drawn neon tube script, tilted slightly upward, made of glowing glass tubes with visible tube bends, joints and small dark gaps where the tube turns, like real old neon signage. Bottom line: the word "BOUND" in heavy wide block capitals, overlapping the bottom of the script a little, built as a thick double neon outline with a near-black glassy fill, and living plasma flowing inside the letters like the attached reference: bright electric cyan #19f0ff currents with hot magenta #e020c0 veins branching through them. Colours taken from the game's menu: "Host" glows hot magenta #ff2bd6 with a pale pink-white core, "BOUND" glows electric cyan #19f0ff with magenta plasma veins, small acid green #b6ff2b sparks and drips of light falling from the bottom edge of "BOUND", and a thin wavy cyan and violet energy current running horizontally behind the two words in place of a horizon line. The light is dirty and organic: slightly uneven tube thickness, a few flickering dim segments, a faint wet bioluminescent haze, like a neon sign in a flooded alien Tokyo alley. Not chrome, not metallic, not 80s Miami vaporwave, no sunset, no palm trees, no grid floor. Flat pure black background, the whole logo centred with generous black margins, wide horizontal format 2:1. Crisp, high contrast, readable at small size on a phone screen.
```

Se il plasma dentro BOUND viene troppo pieno, aggiungi in fondo:
`Keep the inside of BOUND mostly dark, the plasma only as thin glowing veins.`

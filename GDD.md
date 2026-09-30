# NEON OVERDRIFT — Game Design Document

> Infinite runner + bullet hell + roguelike synergies. Mobile first. Vanilla JS. GitHub Pages.

## 1. Pitch

Sei un corriere clandestino su hoverboard in un tunnel neon sotto una città cyberpunk. Il tunnel non finisce mai. Droni, torrette e virus ti sparano addosso. Raccogli chip illegali che mutano la tua board in modi sempre più assurdi. Muori, sblocchi, ricominci.

Feeling: **Hotline Miami** (cupo, acido, violento, synth martellante) in un mondo **Tron** (neon su nero). Non pulito, non allegro. VHS grain, scanline, glitch quando prendi danno.

## 2. Pilastri

1. **Una mano, un dito.** Tutto il gioco si gioca in portrait con il pollice. Nessun bottone durante la run.
2. **Ogni run è diversa.** Item + board + ordine boss cambiano la build. Sinergie emergenti, non scriptate.
3. **Morire sblocca.** Ogni run avanza il meta anche se va male. Mai una run "sprecata".
4. **Leggibile nel caos.** Proiettili nemici sempre distinguibili (colore, forma) da quelli del player e dagli effetti.

## 3. Vista e mondo

- **Top-down 2D verticale**, portrait. Player nel terzo inferiore dello schermo, mondo scorre verso il basso.
- **5 corsie** fisse, stile Subway Surfers. Il player è **sempre in una corsia**: uno swipe = una corsia, scatto a durata fissa (~0,1 s). Mai movimento libero che segue il dito. Corsia del player illuminata. Nemici, proiettili, ostacoli e pickup vivono nelle corsie. Tutto è leggibile in termini di "quale corsia è sicura".
- **Velocità di scroll** cresce con la distanza (curva logaritmica, cap per restare leggibile).
- **Distretti**: ogni ~1000 m cambia palette e set nemici (solo cosmetico + mix spawn, non contenuto extra). Cicla.

## 4. Controlli

| Azione | Mobile | Desktop (debug) |
|---|---|---|
| Cambia corsia | Swipe sx / dx | ← → / A D |
| Salto / hop | Swipe su | Spazio / W |
| Phase (i-frame sul posto) | Swipe giù | Shift / S |
| Sparo | Automatico, sempre | — |
| Pausa | Tap in alto / perdi focus | Esc / P |

- **Salto**: supera ostacoli bassi (barriere, buchi). Durante salto sei ancora colpibile dai proiettili.
- **Phase**: invulnerabilità ~250 ms sul posto (la board "sfasa"). Cooldown 2 s. Item lo modificano (es. phase = dash di 2 corsie).
- Dead zone tocco e sensibilità configurabili in impostazioni.

## 5. Vita, scudo, danno

- **Cuori** (stile Isaac). Base: 3 cuori rossi. Item aggiungono cuori max o curano.
- **Cuori scudo (blu)**: assorbono danno prima dei rossi. Non si rigenerano da soli. Drop e item li danno.
- **Scudo energetico (barra)**: alcuni item/board danno scudo che **si ricarica** se non prendi danno per N s.
- **Protezioni**: item che negano un colpo ogni X s, che riflettono proiettili, che trasformano danno in monete perse (stile Sonic), ecc.
- Colpo subito → -1 cuore, **i-frame 1 s**, glitch screen, hit-stop 60 ms.
- Ordine assorbimento: scudo energetico → cuori blu → cuori rossi.
- 0 cuori → morte → schermata run summary → meta.

## 6. Nemici e ostacoli

### Ostacoli (runner)
- **Barriera bassa**: salta o cambia corsia.
- **Barriera alta**: cambia corsia obbligatorio.
- **Buco nel pavimento**: salta.
- **Laser gate**: si accende/spegne a ritmo, passa nel buio.
- **Muro pieno con varco**: 1 corsia libera, si vede da lontano.

### Nemici (bullet hell su corsie)
Regola d'oro: **ogni nemico ha UN pattern fisso e un telegraph** (la corsia che sta per colpire si illumina prima dello sparo). Il giocatore impara il nemico, non il caso. La difficoltà scala cadenza/velocità, mai il pattern.

Ogni nemico insegna una mossa:

| Nemico | Da | Pattern | Mossa insegnata |
|---|---|---|---|
| **Drone** | 0 m | raffica 3 nella sua corsia | cambia corsia |
| **Sweeper** | 500 m | spazza 3 corsie adiacenti in sequenza, freccia mostra la direzione | entra nella corsia già spazzata |
| **Crusher** | 1000 m | onda **bassa** su 3 corsie adiacenti | salta, o spostati di 2 corsie |
| Hopper, Wall, Kamikaze, Tank | dopo | vedi backlog | — |

Spawner: 1 nemico attivo fino a 800 m, 2 fino a 2000 m, poi 3. Nemici sempre ad almeno 2 corsie di distanza. Sweeper e Crusher solo se soli a schermo. Ogni nemico spara 2 volée e se ne va (max 4 in late game). Difficoltà scala al massimo +40% di cadenza.

Proiettili viaggiano **dritti giù nella corsia** (vx = 0). Variante "bassa" (arancio) si può saltare; variante "alta" (magenta) no.


### Boss
Ogni **~500 m** (scala) un boss. Schermo si ferma di scrollare (o scroll lento), arena. 3 fasi, pattern che cambiano. Al boss 5, 10, 15... variante "élite" più dura.

Boss lista MVP: **Sentinel** (torretta gigante centrale), **Hive** (spawna sciami), **Warden** (muri di laser + ventagli).

Sconfitto → **scelta 1 di 3 item** dal pool sbloccato. Rarità pesata.

## 7. Item e sinergie (cuore del gioco)

Tre categorie:

### A. Modificatori arma (stackabili)
Ogni item aggiunge un flag o modifica un numero. Il sistema di sparo legge tutti i flag ogni frame.

| Item | Effetto | Sinergia esempio |
|---|---|---|
| Split | +1 proiettile per colpo, ventaglio | + Pierce = ventaglio perforante |
| Pierce | attraversa N nemici | + Bounce = rimbalza e perfora |
| Bounce | rimbalza sui bordi | + Homing = insegue dopo rimbalzo |
| Homing | curva verso nemico più vicino | + Split = sciame di missili |
| Big Shot | proiettile 2x, danno 1.5x, cadenza -30% | + Split compensa cadenza |
| Rapid | cadenza +40% | + Big Shot = tanto danno |
| Chain | colpo salta a nemico vicino | + Pierce = catena lunga |
| Explode | proiettile esplode a impatto | + Chain = esplosioni a catena |
| Laser | sostituisce proiettili con raggio continuo (cambia tutta la logica) | + Bounce = laser rimbalzante |
| Poison | DoT su nemico | + Explode = nuvola tossica |
| Crit | 15% chance danno x3 | scala con tutto |

### B. Passive / difesa
Cuore max, cuore blu, scudo ricaricabile, magnete monete, dash cooldown -50%, dash lascia scia dannosa, i-frame più lunghi, riflesso proiettili durante dash, orbital (sfera che gira e blocca proiettili), companion drone.

### C. Attivi (1 slot, carica con distanza/kill)
Bomb (pulisce schermo), Time Slow 3 s, Overdrive (sparo x3 per 5 s), Heal.

### Regole sinergie
- Sinergie emergono da **composizione di flag**, non da tabelle "A+B=C". Poche eccezioni "wow" con nome (es. Laser + Split + Bounce = "PRISM"), annunciate a schermo quando si formano.
- Ogni item ha **rarità** (comune 60%, raro 30%, epico 10%).
- Alcuni item **escludono** altri (Laser esclude Big Shot).
- Max stack per item (es. Split max 4).

## 8. Shop

- Ogni **2 boss** (alternato) appare **negozio** al posto del boss: scroll rallenta, 3-4 slot con item e prezzo in **monete**.
- Merce: 1 item random (prezzo alto), 1 cura, 1 cuore blu, 1 reroll dei 3 item del prossimo boss.
- Monete: droppate da nemici, pickup sulla strada. Persistono **solo nella run**.
- Nessun negozio permanente fuori run: il meta si sblocca giocando, non comprando (pilastro 3).

## 9. Meta progressione (roguelike unlock)

Persistenza in `localStorage` (JSON versionato, con migrazione).

### Item pool
- Pool iniziale: ~10 item base.
- Pool completo: ~40 item.
- Item si **sbloccano** via **achievement**. Una volta sbloccati, appaiono nelle run future.
- Alcuni item si sbloccano **trovandoli**: appaiono come drop "corrotto" (glitchato) in run; se lo raccogli e finisci il boss successivo vivo, è sbloccato per sempre.

### Achievement (esempi)
- Corri 1000 m → sblocca Bounce.
- Uccidi 100 droni → Rapid.
- Finisci un boss senza prendere danno → Crit.
- Muori con 0 monete 3 volte → Magnete.
- Fai una run con solo item difensivi → Orbital.
- Raggiungi boss 10 → Laser.

Achievement mostrati in schermata meta con progresso (X/Y). Molti segreti (mostrano "???" fino a metà progresso).

### Hoverboard (varianza)
Un solo protagonista. Board diverse, sbloccabili via achievement:

| Board | Stat | Arma base | Passiva |
|---|---|---|---|
| **Stock** | 3 cuori, velocità media | colpo singolo | — |
| **Ghost** | 2 cuori | colpo singolo veloce | dash cooldown dimezzato, i-frame doppi |
| **Tank** | 5 cuori, lenta | Big Shot | non può saltare, sfonda barriere basse |
| **Viral** | 3 cuori | Poison | nemici avvelenati droppano monete doppie |
| **Glitch** | 1 cuore + 3 blu | random ogni boss | item costano 0 nel primo shop |

### Statistiche persistenti
Best distance, run totali, kill totali, boss battuti, item scoperti (X/40), board sbloccate.

## 10. Arte

- **Tutto procedurale in Canvas 2D.** Nessuna immagine.
- Palette base: nero `#0a0008`, magenta `#ff2bd6`, ciano `#19f0ff`, verde acido `#b6ff2b`, arancio `#ff6a00`. Distretti ruotano le tinte.
- Player: triangolo/board con trail. Nemici: forme geometriche distinte per tipo (cerchio, esagono, croce). Proiettili nemici: **sempre magenta/arancio**, player: **sempre ciano**.
- Post-processing (secondo canvas o overlay): scanline, vignetta, grain animato, aberrazione cromatica al danno, screen shake.
- Glow: `shadowBlur` costoso su mobile → pre-render sprite glow su offscreen canvas e blit. Budget: 60 fps su iPhone di 4-5 anni fa.
- Font: monospace pesante, tutto maiuscolo, testo che "glitcha".

## 11. Audio

- **Web Audio API procedurale.** Zero file.
- SFX: laser (osc square + pitch drop), hit (noise burst), pickup (arpeggio breve), esplosione (noise + lowpass sweep), boss warning (sirena).
- Musica: sequencer minimale in codice. Kick 4/4, bassline acida (saw + filtro risonante), pad. **BPM sale con la difficoltà.** Boss = pattern diverso.
- Mute toggle e volume in impostazioni. Audio si sblocca al primo tap (policy mobile).

## 12. Architettura tecnica

```
neon-overdrift/
├── index.html
├── vite.config.js
├── package.json
├── public/            # manifest PWA, icona
└── src/
    ├── main.js        # bootstrap, resize, loop
    ├── core/
    │   ├── loop.js        # fixed timestep update, render interpolato
    │   ├── input.js       # touch/mouse/keyboard → intents
    │   ├── canvas.js      # DPR, letterbox portrait, offscreen
    │   ├── rng.js         # PRNG seedable (mulberry32)
    │   └── save.js        # localStorage, versioning, migrazione
    ├── game/
    │   ├── state.js       # macchina stati: menu, run, boss, shop, dead, meta
    │   ├── player.js
    │   ├── weapon.js      # legge flag item → genera proiettili
    │   ├── bullets.js     # pool proiettili (array tipizzati, no GC)
    │   ├── enemies/       # un file per tipo + spawner
    │   ├── bosses/
    │   ├── obstacles.js
    │   ├── pickups.js
    │   ├── items/
    │   │   ├── registry.js    # tutti gli item, flag, rarità, unlock id
    │   │   └── synergies.js   # sinergie nominate
    │   ├── shop.js
    │   ├── difficulty.js  # curve in funzione di distanza
    │   ├── achievements.js
    │   └── boards.js
    ├── render/
    │   ├── draw.js        # primitive neon
    │   ├── fx.js          # particelle, shake, glitch
    │   └── post.js        # scanline, grain, vignette
    ├── audio/
    │   ├── sfx.js
    │   └── music.js
    └── ui/
        ├── hud.js
        ├── menus.js
        └── itemPick.js
```

Principi:
- **Fixed timestep** 60 Hz per logica, render con interpolazione. Deterministico con seed → replay/debug possibili.
- **Object pool** per proiettili e particelle. Zero allocazioni nel loop caldo.
- **Collisioni**: cerchio-cerchio per proiettili, AABB per ostacoli. Spatial hash semplice se serve.
- **Item = dati**, non classi. `{ id, name, rarity, flags: {...}, mods: {...}, unlock: 'ach_id' }`. Weapon compone i flag.
- Nessuna dipendenza runtime. Vite solo per dev server e build.

## 13. Deploy

- Repo GitHub pubblico `neon-overdrift`.
- GitHub Actions: su push a `main` → `npm ci && npm run build` → deploy `dist/` su Pages.
- `vite.config.js` con `base: '/neon-overdrift/'`.
- **PWA**: manifest + service worker minimale → "Aggiungi a Home", fullscreen, offline. Amici lo installano come app.
- URL finale: `https://<user>.github.io/neon-overdrift/`.

## 14. Piano fasi

### Fase 0 — Scheletro (giocabile in 1 sessione)
- Vite, canvas portrait con DPR, loop fixed timestep, input drag.
- Player si muove, spara auto, scroll sfondo con corsie.
- Drone base che spara. Collisioni. Cuori. Morte → restart.
- Post FX base (scanline, grain). **Già sembra il gioco.**

### Fase 1 — Runner core
- Ostacoli (5 tipi), salto, dash con i-frame.
- Spawner con difficoltà crescente. Monete + magnete.
- HUD: cuori, distanza, monete.
- SFX procedurali base.

### Fase 2 — Bullet hell
- 5 nemici, 6 pattern proiettili. Object pool.
- Primo boss (Sentinel), 3 fasi. Arena.
- Screen shake, hit-stop, particelle.

### Fase 3 — Roguelike
- Item registry (~15 item), weapon che compone flag.
- Scelta 1 di 3 post-boss. Shop.
- 2-3 sinergie nominate con annuncio.
- Musica procedurale con BPM dinamico.

### Fase 4 — Meta
- Save system versionato.
- Achievement (~15), unlock item, unlock board.
- Schermata meta: pool item, board, stats.
- Board 3 iniziali.

### Fase 5 — Polish e ship
- Bilanciamento curve. Test su iPhone/Android reali.
- PWA, icona, splash.
- GitHub Actions + Pages. Link ad amici.

### Dopo
- Altri boss, altri item fino a 40, board 5, distretti visivi, daily seed, leaderboard locale, share screenshot run.

## 15. Rischi

- **Performance glow su mobile**: mitigare con sprite pre-renderizzati, niente `shadowBlur` live.
- **Leggibilità**: troppi effetti = non vedi proiettili. Regola: proiettili nemici sempre sopra tutto, colore riservato.
- **Bilanciamento sinergie**: alcune combo rompono il gioco. Va bene per un po' (è divertente), ma cap sui stack.
- **Scope creep**: 40 item è tanto. Fase 3 parte con 15, il resto dopo il ship.

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
| Cambia corsia | Swipe sx / dx, oppure tap sulla metà sx / dx | ← → / A D |
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
- **Velo (squarcio)**: tenda ciano su tutte e 5 le corsie, non si schiva né si salta: solo **phase**.
- **Micro-squarcio** (`P` nelle file): lo stesso strappo largo una corsia, di solito nel varco di una fila di muri (`BBPBB`), o in alternativa a un filo (`TBPBT`: salti fuori o fai phase al centro). Barriere da phase (P e veli) ad almeno 7 battute l'una dall'altra: il phase è sempre carico anche al tempo massimo. Mai due entro 140 m (il phase è sempre carico), suggerimento PHASE ▼ mezzo secondo prima.
- **Formazioni** su più corsie, dentro le sezioni (righe `B` muro, `T` filo da saltare, `.` libero; ogni riga ha almeno una corsia non-muro, righe ad almeno 2 battute): linea di fili, tenaglia (`BTTTB`, `.TTT.`), zip (`TBTBT` / `BTBTB`), slalom (varco che si sposta di 1 corsia), tamburi (fili, varco, fili), cancello con varco fuori dalla portata dello Stalker.
- Linguaggio colori: **arancio = salta**, **magenta = schiva**, **ciano = phase**. Tutti e tre sono disegnati in codice come una famiglia: fili di plasma tesi nella corrente. Basso = filo arancio sottile con scintille ed emettitori; muro = nodo magenta denso con due piloni e nucleo rosso; velo = tenda ciano su tutta la pista.

### Nemici (bullet hell su corsie)
Regola d'oro: **ogni nemico ha UN pattern fisso e un telegraph** (la corsia che sta per colpire si illumina prima dello sparo). Il giocatore impara il nemico, non il caso. La difficoltà scala cadenza/velocità, mai il pattern.

Ogni nemico insegna una mossa:

| Nemico | Da | Pattern | Mossa insegnata |
|---|---|---|---|
| **Drone** | 0 m | raffica 3 nella sua corsia | cambia corsia |
| **Sweeper** | 500 m | spazza 3 corsie adiacenti in sequenza, freccia mostra la direzione | entra nella corsia già spazzata |
| **Crusher** | 1000 m | onda **bassa** su 3 corsie adiacenti | salta, o spostati di 2 corsie |
| **Brooder** | 700 m | tre uova (onde basse) nella sua corsia, a tempo | salti ritmici, o esci dalla corsia |
| **Hopper** | 1500 m | spara e salta di corsia, freccia mostra la prossima | seguilo con l'occhio, non col corpo |
| **Stalker** | 1200 m | aggancia la tua corsia (al massimo ±1 dalla sua) e spara 2 aghi veloci | muoviti dopo l'aggancio |
| **Throb** | 1800 m | battito: sua corsia, poi le due vicine, ×2 | danza dentro/fuori dal varco |
| **Kamikaze** | 2000 m | illumina la corsia e ci si tuffa | lascia la corsia o uccidilo prima |
| **Weaver** | 2300 m | tesse un varco che si sposta nelle sue 3 corsie, una fila per battuta | segui il varco |
| **Wall** | 2500 m | tutte le corsie tranne la sua (da 1600 m: dentro, fuori, dentro a tempo) | mettiti sotto di lui |
| **Tank** | 3000 m | onda bassa su tutto alternata a colpi a 2 corsie (tardi: rullo di 3 onde) | salta e spostati |

**Sezioni (direttore).** Nemici, ostacoli e veli non escono più a caso e indipendenti: la run concatena **sezioni scritte a mano** (`src/game/sections.js`, ~30), piccole coreografie sul metronomo. Ogni evento ha una battuta fissa: un nemico *entra* su una battuta, una fila di ostacoli o un velo *ti raggiunge* su una battuta. Variazione solo nella scelta della sezione (tra quelle sbloccate, le più nuove pesano doppio, niente ripetizioni delle ultime 3) e nello specchio sinistra/destra: le forme tornano e si imparano. La sezione successiva parte quando i nemici della corrente sono all'ultima raffica e i suoi ostacoli hanno passato metà schermo, più 2 battute di respiro. Le raffiche per nemico sono fisse (élite +1): una sezione dura sempre uguale; la difficoltà sale col tempo (BPM a scalini per distretto), la velocità dei colpi, gli élite e la libreria che si allarga. Verifica: in 10 minuti simulati nessun momento con 5 corsie coperte, salvo la stretta voluta del Wall.

**Combattimento / percorso.** Le sezioni sono di due tipi e il direttore le **alterna**: *combattimento* (nemici, a volte con qualche ostacolo) e *percorso* (`COURSES`: solo ostacoli, molte corsie bloccate, veli; ~13, da 60 m a 3000 m: cancelli, scale di fili, scacchiera, slalom, tunnel, zip, tamburi, serpente, bivio, gauntlet, serpente del rift, tempesta). Un percorso parte solo quando i nemici del combattimento precedente se ne sono andati, così muri e raffiche non si sommano mai (verificato: nessun colpo in arrivo mentre una fila di muri passa accanto). Le sezioni introduttive si ritirano (`to`) quando diventerebbero banali. Ogni percorso è stato verificato attraversabile, anche specchiato, con al massimo un salto di corsia per battuta.

Spawner: 1 nemico attivo fino a 800 m, 2 fino a 2000 m, poi 3. Nemici sempre ad almeno 2 corsie di distanza. Sweeper e Crusher solo se soli a schermo. Ogni nemico spara 2 volée e se ne va (max 4 in late game). Difficoltà scala al massimo +40% di cadenza.

**Ritmo dello sparo.** Tutti i nemici normali sparano su un **metronomo condiviso** (un tick = mezza battuta, 0,21 s): finito l'avviso, il primo colpo aspetta il tick successivo, e gli intervalli dentro una raffica sono multipli di tick. Il tempo (BPM) sale a scalini, uno per distretto (ogni 1000 m), non in modo continuo. Una sola velocità per tutti i colpi normali, alti e bassi, anche lei a scalini per distretto: la distanza sullo schermo corrisponde alla distanza nel tempo. I colpi escono dalla bocca della creatura con un lampo e un suono. La corsia resta illuminata **finché la raffica non ti ha superato**: la luce significa "pericolo adesso". I nemici entrano planando (ease-out) e, finite le raffiche, risalgono e se ne vanno verso l'alto invece di scivolare giù tra i propri colpi.

Proiettili viaggiano **dritti giù nella corsia** (vx = 0). Variante "bassa" (arancio) si può saltare; variante "alta" (magenta) no.


### Boss
Ogni **~500 m** (scala) un boss. Schermo si ferma di scrollare (o scroll lento), arena. 3 fasi, pattern che cambiano. Al boss 5, 10, 15... variante "élite" più dura.

Boss lista MVP: **Sentinel** (torretta gigante centrale), **Hive** (spawna sciami), **Warden** (muri di laser + ventagli).

Sconfitto → **scelta 1 di 3 item** dal pool sbloccato. Rarità pesata.

**Salti di fila.** Due file con onde da saltare (boss `L`, Brooder, rullo del Tank) sono sempre ad almeno 0,65 s (un salto 0,45 s + reazione), a qualunque tempo: prima il Warden ne metteva una ogni ~0,43 s e non si potevano prendere tutte.

**Ritmo dei boss.** Oltre a volée, sweep, beam e onde basse, ogni boss ha attacchi a **righe ritmiche**: una fila di colpi per battuta (`x` colpo, `L` onda da saltare, `.` libero), tutte alla stessa velocità, quindi sullo schermo arrivano alla cadenza con cui partono. Regola di equità, verificata da script su tutte le sequenze: ogni riga lascia almeno una corsia, e la corsia libera si sposta al massimo di 1 per battuta (un salto di corsia dura 0,11 s, la battuta minima è 0,3 s).

Identità ritmica per boss:
- **Sentinel — marcia**: `x.x.x` / `.x.x.` alternate, un passo laterale a ogni battuta; in fase 3 mescolate a salti.
- **Hive — sciame**: droni sui bordi, un varco che vaga tra le corsie 1–3.
- **Hunter — inseguimento**: aggancia la tua corsia, il varco parte sotto di te e scappa; devi stargli dietro.
- **Prism — scala**: varchi a zig-zag su tutta la pista tra un raggio e l'altro.
- **Warden — tamburi**: onde basse a tempo, cambi corsia in aria (`LxLxL` / `xLxLx`).

Scala: la velocità dei boss cresce del 12% per boss battuto (max 1,75×), e accorcia battute, telegraph e pause, accelerando anche i proiettili. Dal boss 1 sono già più rapidi dei nemici normali: sono gli esami della run.

**Nemici ritmici ad alta difficoltà**: Sweeper da ~1200 m va avanti e indietro (pendolo); Wall da ~1600 m stringe a tempo (tutto tranne la sua corsia → solo la sua → di nuovo tutto); Tank da ~2000 m fa un rullo di tre onde basse.

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

### Item v1.1
32 item nuovi (76 in tutto), 24 combo e un trio, descritti in `DESIGN_V1.1.md` parte B. In breve: modificatori di colpo che valgono per tutti e quattro i tipi di colpo (FISSION, SHRAPNEL, BRAND, CHARGE, SKYSHOT, GHOSTROUND, AFTERGLOW, TWIN LINK), statistiche con un prezzo (DENSE CORE, ADRENAL GLAND, HOLLOW BONES, KERATIN, SYNAPSE, FOCUS LENS, MOMENTUM, MITOSIS), power-up (PREMONITION, CARAPACE, SPORE CLOUD, CELL WALL, SECOND SKIN, UNDERTOW, SYMBIONT EGG), attivi (BLACK HOLE, MIRROR FIELD, OVERCHARGE, WARP, MOLT) e rischio (LEAD WEIGHTS, FEVER, DOUBLE OR NOTHING, PARASITE). Item in conflitto si escludono dal mazzo (`conflicts`). Ogni scelta di livello contiene almeno un item già posseduto e ancora impilabile. Il trio FISSION + SHRAPNEL + CHAIN REACTION si chiama CHAIN FISSION (MELTDOWN era già LASER + TOXIN). Unica eccezione alla regola del seeker ±1 corsia: BLOODHOUND (BRAND + SEEKER) arriva a ±2 verso i nemici marchiati.

## 8. Livelli (al posto del market)

- La valuta sono le **cellule** (verdi, membrana e nucleo). Sono **esperienza**: riempiono la barra acida in cima allo schermo.
- Ogni livello apre una **scelta 1 di 3** dal pool sbloccato, come in Vampire Survivors; il gioco si ferma durante la scelta. Livelli guadagnati insieme si mettono in coda.
- Cellule per salire dal livello L: `10 + 8·(L−1)` (balance.js `xpNeed`). Un giocatore fermo in corsia arriva al livello 6 in ~4 minuti; chi raccoglie le file sale più in fretta.
- **SKIP** cura 1 cuore (se manca); se il pool è esaurito il livello cura comunque.
- Restano il **bottino dei boss** (scelta 1 di 3) e i **chip corrotti** (decriptati battendo il boss).
- **Due fonti, due ruoli** (`rollItems(..., { source })`):
  - *Livelli* — frequenti e piccoli: solo COMMON e RARE di arma, difesa, economia e rischio; niente modalità di sparo, niente attivi, niente EPIC. Gli oggetti che possiedi già tornano più spesso (×1,6): i livelli costruiscono gli stack. Misurato: 66% COMMON, 34% RARE.
  - *Boss* — rari e trasformativi: le **modalità di sparo**, gli **attivi** e gli **EPIC** escono solo qui; COMMON improbabili; almeno una carta RARE o meglio; se non hai ancora una modalità, una carta lo è (il primo boss è la svolta della build); mai più di una modalità per offerta. Misurato: 17% COMMON, 76% RARE, 7% EPIC, sempre una modalità se non ne hai.
  - Il boss lascia anche 12 + 4·n cellule: di solito il bottino è seguito subito da un livello.
- Un boss alla fine di ogni distretto (ogni 1000 m); niente più negozio, niente pause economiche.
- Item legati alle monete: GREED = più cellule (sali prima), MAGNET le attira, **MUTAGEN** (ex INTEREST, stesso id) aggiunge una scelta a livelli e bottini. L'obiettivo ex "compra 5 cose" (stesso id, sblocca LUCKY CHIP) ora è "raggiungi il livello 8 in una run".
- **Cellule e ostacoli non si sovrappongono mai**: entrambi scorrono alla velocità della pista, quindi chi compare per secondo controlla l'altro; nessuna cellula entro 46 px da un muro nella sua corsia. Le cellule sopra un filo arancio sono permesse apposta: le prendi saltando (rischio). Le file sparse scelgono una corsia senza muri in arrivo.

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

## 14. Stato implementazione

Fatto (v0.4):
- 5 corsie discrete, salto, phase, auto-fire, tap per l'attivo.
- Nemici: Drone, Sweeper, Crusher con telegraph. Ostacoli: barriera bassa, muro, cancello.
- Monete in fila, cuori, cuori blu, drop corrotti (sbloccano l'item se batti il boss successivo).
- 27 item (arma, difesa, economia, rischio, attivi), 7 sinergie nominate.
- Boss (Sentinel, Hive, Warden, poi varianti MK2+) e Black Market alternati ogni 600 m.
- Scelta 1 di 3 dopo il boss, negozio con reroll, riparazione, cuori blu.
- Meta: 20 achievement, 5 board sbloccabili, archivio item e obiettivi, salvataggio versionato.
- Audio procedurale: SFX + sequencer con BPM che sale; tema diverso per boss e negozio.
- PWA (icona, manifest, offline) + GitHub Actions per Pages.

Fatto (v0.5):
- Salto rifatto: ombra a terra, hang in alto, squash, buffer input; onde basse sotto la board.
- Nemici: Hopper (1500 m), Kamikaze (2000 m), Wall (2500 m), Tank (3000 m).
- 5 distretti (Neon Row, Acid Docks, Chrome Spine, Red Sector, The Void) ogni 1000 m.
- Daily run: stesso seed per tutti nella stessa data, board STOCK, best giornaliero.
- Condividi risultato (share sheet su mobile, appunti su desktop), vibrazione (Android).

Fatto (v0.6) — bilanciamento:
- Tutte le curve in `src/game/balance.js`; report numerico con `node scripts/balance.mjs`.
- Item ridimensionati: SLUG +50% danno (era +100%), RAPID +25%, side shot SPLITTER a 50%,
  SEEKER curva solo verso la corsia vicina (2 con stack), HEADSHOT 10%, FRAG 40%, ARC 35%.
- Vita nemici = base × (1 + 0.25·d) × √potenza del giocatore. Boss = 110 × (1 + 0.5·n) × √potenza.
  Risultato: un drone muore sempre in ~0.35 s, un boss in ~15 s; la pressione sale con
  più nemici, élite (dai ~1000 m, fino al 50%), squadre di 2, ritmo fino a +70%.
- Economia più stretta: file da 4 monete, prezzi 22/36/55 +30% per negozio.
- Boss nuovi: HUNTER (mira alla tua corsia all'inizio del telegraph), PRISM (sweep di raggi
  su 4 corsie, la quinta è sempre sicura). Ordine dei boss casuale per run.
- Attivo: bottone arancione dedicato, si carica con le uccisioni. Tutorial contestuale.
- Salto: indicatore JUMP quando arriva qualcosa di basso; swipe giù in aria = caduta rapida.

Fatto (v0.7):
- Grafica: sprite pre-renderizzati (src/render/sprites.js) per player, 7 nemici, 5 boss,
  ostacoli finti 3D, monete, cuori, proiettili. Parti animate live.
- Hitbox dei boss sulla sagoma (PRISM solo cristallo, HIVE le 3 celle, ecc.).
- Proiettili nemici sempre più veloci dei nemici e della pista (260+ px/s).
- 9 item nuovi: WINGMAN, GROUND POUND, SLIPSTREAM, AMBUSH, CHAIN REACTION, LEECH,
  BLOOD PACT, INTEREST, RAIL STRIKE (attivo). 5 sinergie: AFTERSHOCK, SQUADRON,
  DRIFT KING, DOMINO, COUNTERSTRIKE. 7 obiettivi nuovi per sbloccarli.

Fatto (v0.8):
- Il player pilota una navicella, non più una board: 5 sagome (STOCK intercettore,
  GHOST stealth, TANK cannoniera a 4 motori, VIRAL bio-nave, GLITCH frammentata),
  pilota con maschera visibile nel cockpit, fiamme dei motori live.
- Pista: texture per distretto con pannelli, giunture, guide, binari metallici,
  muri con finestre e insegne; luci da tunnel e scie di velocità.
  Rail del primo distretto viola: il magenta resta riservato ai proiettili nemici.
- SEEKER: ogni proiettile insegue solo la corsia da cui parte e le due adiacenti;
  lo stack rende la curva più stretta, non allarga il raggio.

Fatto (v0.9):
- HIVE: i droni evocati sono gregari (2 HP, 1 raffica, più in basso) e non si accumulano.
- Sicurezza corsie: un nemico (o un muro) compare solo se restano almeno 2 corsie libere,
  contando proiettili in volo, l'intero ciclo di attacco dei nemici presenti e i muri.
  Verificato in simulazione: corsie colpite entro 0.5 s mai più di 3 su 5 (fino a 10 km).
- Modalità di fuoco (una alla volta, sostituisce la precedente): LASER, SCATTER,
  RAIL CANNON, ROCKET POD, SINE WAVE. Tutte leggono le stesse statistiche, quindi gli
  altri item cambiano comportamento invece di sparire (stile Isaac):
  SPLITTER = raggi/pallini/razzi/filamenti extra, SEEKER = raggio che si piega,
  mira automatica del rail, razzi a ricerca; PIERCER = più bersagli o +danno sul rail.
- Sinergie: SMART ROCKETS, MELTDOWN, BUCKSHOT, OVERLOAD, HELIX.
- I razzi NON inseguono da soli: lo fanno solo con SEEKER (niente item ridondanti).

Fatto (v1.0) — sinergie vere e statistiche:

**Statistiche** (da Isaac, solo quelle utili a corsie):
| Stat | Effetto |
|---|---|
| DAMAGE | danno di ogni colpo |
| FIRE RATE | colpi al secondo |
| SPEED | velocità del cambio corsia e ricarica phase (la pista scorre da sola) |
| LUCK | +3% critico per punto, rarità item, drop di cuori/cuori blu/item corrotti |
| HP | cuori massimi |
Scartate: SHOT SPEED e RANGE (i colpi attraversano lo schermo in <1 s, i nemici stanno
sempre in alto: non cambierebbero le scelte del giocatore).
Frecce ▲▼ sulle carte (calcolate applicando davvero l'item alla build), pannello in pausa.
Item nuovi: AFTERBURNER (SPEED), LOADED DICE (LUCK). LUCKY CHIP ora dà LUCK +2.

**Motore di colpo componibile** (src/game/weapon.js):
- Vettore: BEAM (laser) > RAIL > ROCKET > BOLT.
- SCATTER = ventaglio del vettore, SINE = onda, ROCKET (se non vettore) = esplosione,
  RAIL (con raggio) = impulsi carichi, SPLITTER = corsie laterali, SEEKER = piega/mira
  nella corsia vicina, PIERCER = più bersagli (o +danno sul rail).
- Nessuna combinazione è scritta a mano: LASER + SCATTER è un raggio con ventaglio.

**Scoperta combinazioni** (src/game/combos.js, 42 coppie):
- Item offerto che reagisce con la build: cornice magenta + "⟡ RESONATES WITH X".
- Prima volta che tieni la coppia: NEW COMBO (nome + effetto), salvato per sempre.
- Poi: la carta mostra nome ed effetto; archivio → scheda COMBOS; pausa → combo attive.
- Le combo che dipendono dal vettore valgono solo se l'effetto esiste davvero.

Fatto (v1.1–1.2) — SHOT SPEED e direzione artistica:
- SHOT SPEED (quinta stat): velocità colpi, portata SCATTER, lunghezza onda, razzi, carica RAIL.
  Le élite scartano di mezza corsia quando colpite: colpi veloci le puniscono.
- Direzione artistica: **Hotline Miami × Fear & Hunger, al neon**. Tutto è biomassa:
  carne color sangue secco, ossa ingiallite e sporche, suture e ferite, vene di sangue,
  occhi gialli malati che seguono la navicella, creature che respirano.
  Navicelle bio (HUSK teschio-scarabeo con mandibole, GHOST medusa, TANK isopode,
  VIRAL spore, GLITCH mutante). Pista sporca (ruggine, olio, sangue), luci fioche,
  oscurità che lascia illuminata solo la zona della navicella.
- Logo: direzione B (script neon "Neon" su blocco cromato "OVERDRIFT", orizzonte arancione)
  anche nel menu. Canvas design: claude.ai/artifact/WAqL1KcuScZXjNKzidUSrR.

## Direzione v2 (in definizione, 2026-10-01)

Decisa con l'utente dopo aver scartato il "corridore con maschere" (esperimento in `git stash`):
- **Tono**: wasteland cosmica, alieni visti in chiave horror, non sci-fi pulita.
  Riferimenti: Astro Squid (Mac, 2002) come spirito, ma più cupo; Carrion per la creatura.
- **Il giocatore**: un simbionte alieno che fluttua (NON un calamaro, NON un corridore).
  Le armi sono suoi organi: giustifica qualsiasi item. Proposte sul canvas di design,
  pagina "Symbiote": MASSA (alla Carrion), LANTERNA, SIFONOFORO, CUORE.
- **Corsie**: 5 correnti cosmiche (flussi di plasma) che il simbionte cavalca.
- **Nemici**: tante razze aliene (ben più di 5), una per settore, ognuna con boss proprio.
- **Palette**: il neon attuale ma più sporco e acido, "Japan neon".
- **Salto e phase**: meccaniche invariate, cambia solo la loro animazione.
- **Logo**: direzione B (script neon + cromato).

Fatto: simbionte MASSA generato esternamente (art/source/symbiote_sheet.jpg), pulito con
scripts/import-sheet.py in public/sprites/symbiote.png (8×4 celle da 128). Usato per volo,
salto (palla), phase, colpo subito, morte; cresce un po' a ogni item. Icone PWA dal suo
primo fotogramma (scripts/icons-from-sheet.py).

Fatto: razza BROOD (settore 1) generata: public/sprites/enemies_brood.png (8×7, celle 128:
riposo 0-3, avviso 4-5, morte 6-7) e bosses_brood.png (4×5, celle 256×114: riposo 0-1,
avviso 2, ferito 3). import-sheet.py ora trova da solo i grigi della scacchiera, toglie solo
lo sfondo connesso ai bordi (con --loose per fogli senza corpi grigi).

Backlog:
- Rinominare le 5 varianti (ora STOCK/GHOST/...) dentro il nuovo tema.
- Altre razze aliene per i settori successivi.
- Sfondi in parallasse (prompt pronti in ART_PROMPTS.md, sezione 5).
- Rivalutare il salto dopo il feedback.
- Impostazione sensibilità swipe.
- Più boss (uno per distretto).
- Classifica condivisa tra amici (serve un backend: valutare).

## 15. Rischi

- **Performance glow su mobile**: mitigare con sprite pre-renderizzati, niente `shadowBlur` live.
- **Leggibilità**: troppi effetti = non vedi proiettili. Regola: proiettili nemici sempre sopra tutto, colore riservato.
- **Bilanciamento sinergie**: alcune combo rompono il gioco. Va bene per un po' (è divertente), ma cap sui stack.
- **Scope creep**: 40 item è tanto. Fase 3 parte con 15, il resto dopo il ship.

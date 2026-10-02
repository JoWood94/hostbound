# NEON OVERDRIFT — Design v1.1: difficoltà, coreografia, nuovi item

> **Stato: implementato** (commit dopo `16c4a21`). Deviazioni rispetto al testo qui sotto, decise misurando:
> - **HP nemici (A.3.7):** la formula "appiattita" faceva scendere il rapporto tempo-per-uccidere / tempo-a-schermo da 0,08 a 0,04 tra 3000 e 8000 m: i nemici morivano prima di sparare le raffiche extra e la nuova difficoltà spariva. Implementato invece `(1 + 0.28·d)·power^0.6` (boss invariati a `^0.5`), che tiene il rapporto costante a 0,07–0,09. Il target "0,45–0,75" del testo era sbagliato per questa metrica (TTK a uptime pieno): conta che il rapporto resti **costante**, banda 0,06–0,10 (`scripts/balance.mjs`).
> - **Rinforzi (A.3.5):** partono dal tier 2 con probabilità bassa, non dal 3: senza, tra il tier 0 e il 2 la pressione calava (33 → 24 raffiche/min).
> - **Sezioni A.4:** alcune coppie di nemici del testo coprivano tutte e 5 le corsie (la guardia delle 2 corsie libere le avrebbe solo fatte slittare): ricombinate, stesso spirito (`trident` con Stalker ai bordi, `net` con Weaver ai lati, `firing-squad` con 3 droni, ecc.).
> - **Trio B.7:** rinominato CHAIN FISSION (MELTDOWN esiste già: LASER + TOXIN).
> - **Frenesia boss (A.3.9):** salta gli attacchi a righe ritmiche (il varco si sposta ogni battuta e una volée potrebbe caderci dentro); le volée della frenesia hanno l'avviso standard di 4 tick.
> - **Bug trovato e corretto durante il lavoro:** alla morte del boss il bottino e un livello in coda si aprivano nello stesso frame e il livello sovrascriveva il bottino.
>
> Strumenti: `node scripts/verify-sections.mjs` (equità di tutte le sezioni, anche specchiate), `node scripts/balance.mjs` (curva), `?debug&mute` nel browser (`__game.tick`, `draw`, `hit`, `boss(def, index)`, `obstacle`, `spawn`).

Documento di design per chi implementa. Due parti indipendenti:

- **Parte A** — perché la difficoltà si appiattisce e come farla crescere senza rompere le regole di equità.
- **Parte B** — 32 item nuovi, 24 sinergie e un trio, con hook di implementazione nel motore attuale.

> **Revisione 2** — correzioni dopo rilettura: (1) il gap di 7 battute tra ostacoli da phase scende sotto i 2 s di cooldown a 220 BPM → **8 battute**; (2) due file saltabili a 2 battute violano `JUMP_GAP` già a 190 BPM → regola delle **3 battute** e verificatore in secondi; (3) il tratto élite "Nervoso" accorciava l'avviso, contro l'invariante 3 → ora accorcia la pausa tra raffiche; (4) la "frenesia" dei boss scendeva sotto il minimo di 1 battuta per fila → tolta la riduzione, resta la volée sovrapposta; (5) l'attivo SURGE aveva lo stesso nome di una sinergia esistente → OVERCHARGE; (6) aggiunti: scelte di livello solo tra una sezione e l'altra e **protette dagli input accidentali** (blocco 0,45 s, scarto del gesto in corso, doppio tocco per confermare) (A.3.11), curva livelli non lineare, chiarezza della morte (A.5), regola "una carta già posseduta" nel pool livelli (B.8), DPS effettivo che deve contare gli item on-kill (B.8).

Leggere prima `GDD.md` (regole del gioco) e, nel codice, `src/game/balance.js`, `src/core/tempo.js`, `src/game/enemies.js` (metronomo, `TELE_TICKS`, `TRAVEL_TICKS`), `src/game/run.js` (direttore `direct()`, `pickSection`, `safeToEnter`), `src/game/sections.js`, `src/game/boss.js` (righe ritmiche), `src/game/items.js`, `src/game/combos.js`, `src/game/weapon.js` (motore di sparo componibile).

Invarianti da non violare mai (sono già verificati da script o simulazione; ogni modifica deve ripassarli):

1. Corsie discrete, uno swipe = una corsia.
2. Almeno **2 corsie libere** in ogni istante (eccezione: la stretta ritmica del Wall, dentro/fuori/dentro).
3. Una corsia accesa significa sempre lo stesso tempo di reazione **al tempo corrente** (`TELE_TICKS` + `TRAVEL_TICKS`); il tempo cambia solo a scalini di distretto.
4. Due file saltabili ad almeno `JUMP_GAP` = 0,65 s.
5. Ostacoli da phase (veli, `P`) ad almeno **8 battute** l'uno dall'altro (7 oggi: a 220 BPM fanno 1,9 s, meno dei 2 s di cooldown; 8 ne fanno 2,18). Da aggiornare in `sections.js` e nel verificatore.
5b. Due file consecutive che richiedono **entrambe un salto sul percorso sicuro** ad almeno **3 battute** (2 battute a 190 BPM sono 0,63 s, già sotto `JUMP_GAP`; a 220 BPM 0,55 s). Il verificatore deve controllarlo **in secondi al tempo massimo a cui la sezione può comparire**, non in battute.
6. Colori: arancio = salta, magenta = schiva, ciano = phase, verde acido = colpi del giocatore.
7. Le sezioni sono scritte a mano e tornano uguali (specchio a parte): si imparano.

---

## Parte A — Difficoltà e coreografia

### A.1 Diagnosi: dove e perché si appiattisce

`d = metri / 400`. Distretto `T = floor(metri / 1000)`.

| Leva | Formula attuale | Cap | Dove si ferma |
|---|---|---|---|
| Tempo (BPM) | `140 + 10·min(5, floor(d/2.5))` | 190 | **5000 m** |
| Tempo di reazione (`TELE 4` + `TRAVEL 8` tick) | 12 tick / BPM | 2,58 s → 1,89 s | 5000 m |
| Élite | `min(0.4, 0.06·(d−2.5))` | 40% | **3670 m** |
| Scroll | `220 + min(260, 40·ln(1+2d))` | ~366 px/s | log: 312 a 1000 m, 337 a 3000 m, 366 a 10 000 m: piatto |
| Libreria sezioni | ultimo `from:` | 3500 m | **3500 m** |
| Raffiche per nemico | fisse per tipo (2–4) | — | **mai** |
| Pausa tra sezioni (`BREATH`) | 2 battute | — | mai |
| Sezioni simultanee | 1 | — | mai |
| Velocità boss | `min(1.75, 1 + 0.12·i)` | 1,75 | **7° boss** |
| HP nemici | `(1 + 0.28d)·√power` | nessuno | cresce sempre |
| HP boss | `120·(1 + 0.5i)·√power` | nessuno | cresce sempre |

Il problema di fondo: **l'unica cosa che cresce senza limite sono gli HP, e gli HP non sono pericolo**. Il pericolo in questo gioco è *quanti colpi devi leggere al secondo e quanto tempo hai per rispondere*. Un nemico spara un numero fisso di raffiche e poi se ne va: una volta che sopravvive abbastanza da sparare tutte le sue raffiche (succede già verso i 2500 m con una build media), ogni HP in più è solo tempo perso a sparargli, non rischio. Tutto ciò che crea pericolo (densità, simultaneità, numero di raffiche, finestra di reazione, varietà) è costante o si ferma entro i 5000 m.

Conseguenza osservata: dopo circa il 4°–5° boss il gioco "non diventa più difficile", si allunga e basta.

### A.2 Principio

**La difficoltà è pressione sull'attenzione per secondo, non HP.** Ogni leva deve leggere un'unica variabile di tier e crescere a scalini riconoscibili (il giocatore deve *sentire* "qui è salito") con una crescita continua dentro al distretto che si rilassa un po' dopo ogni boss (dente di sega: il boss è l'esame, i 150 m dopo sono il respiro).

Definizioni da aggiungere in `balance.js`:

```js
export const tier = (m) => Math.floor(m / 1000);               // T: 0,1,2,...
export const heat = (m) => Math.min(1, ((m % 1000) - 150) / 700); // 0 subito dopo il boss, 1 verso la fine del distretto (clamp a 0 nei primi 150 m)
```

Tutte le curve qui sotto usano `T` e `heat`. `d` resta per compatibilità ma non deve più essere l'unica fonte.

### A.3 Leve, in ordine di impatto

**1. Tempo: togliere il cap a 5000 m.**
`runBpm = 140 + 10·T`, cap a **220** (T = 8, 8000 m). Tempo di reazione: 2,58 s (T0) → 1,64 s (T8). Oltre T8 non si accelera più il tempo: si tocca la finestra (punto 2).
Prerequisiti, perché le sezioni sono scritte in battute e le battute si accorciano: gap phase a 8 battute (invariante 5) e regola delle 3 battute tra salti consecutivi (invariante 5b). Rivedere con il verificatore **tutte** le sezioni esistenti prima di alzare il cap: `c-zipper`, `c-drums`, `c-rift-zip`, `c-chaos`, `c-storm`, `c-phase-run` e le righe `L` dei boss sono le candidate a violarla.

**2. Finestra di reazione: scalino tardivo.**
`TRAVEL_TICKS`: 8 fino a T9, **7 da T10**. `TELE_TICKS` resta 4 sempre (è la promessa di leggibilità). Risultato a T10: 11 tick a 220 BPM = 1,5 s. Sotto non si scende mai.

**3. Raffiche per nemico: la leva mancante.**
`maxVolleys = T.volleys + (T ≥ 3 ? 1 : 0) + (T ≥ 6 ? 1 : 0) + (élite ? 1 : 0)`.
È il modo più economico per aumentare il pericolo reale: lo stesso nemico, lo stesso pattern già imparato, una raffica in più. Le sezioni durano di più, quindi:

**4. Respiro e sovrapposizione del direttore.**
- `BREATH` (battute di calma tra sezioni): 2 a T0–2, **1** a T3–5, **0** da T6.
- Condizione di fine sezione (oggi: nemici all'ultima raffica): da T4 "a due raffiche dalla fine", da T7 "a tre". La sezione successiva entra sulla coda della precedente. `safeToEnter` (2 corsie libere) resta il guardiano e fa slittare quando serve.
- Percorso dopo combattimento: oggi aspetta che tutti i nemici siano usciti. Da T5 basta che siano in `leave`.

**5. Rinforzi: scalare le sezioni esistenti senza riscriverle.**
Regola generica in `startSection`: con probabilità `p = min(1, 0.25·(T−2) + 0.3·heat)` (quindi da T3) la sezione di combattimento riceve **un drone extra** alla battuta 0 in una corsia a distanza ≥ 2 da ogni nemico della sezione; da T6 **due** (il secondo alla battuta 4). Passano da `safeToEnter`, quindi se non c'è spazio non entrano. Da T5 il rinforzo è pescato tra `drone | stalker | hopper` (nemici "stretti" a corsia singola). È il modo per cui una sezione imparata a 1500 m torna a 5000 m con la stessa forma ma più piena.

**6. Élite: togliere il cap, dare un tratto.**
`eliteChance = min(0.7, 0.06·(d − 2.5))·(0.6 + 0.4·heat)` (cap 70% a ~14 000 m).
Da T6 ogni élite ha anche **un tratto** (uno a caso, mostrato da un'icona sopra l'anello ambra):
- **Guscio**: ignora il primo colpo ogni 1,5 s (premia DPS alto / colpi grossi).
- **Nervoso**: pausa tra una raffica e l'altra dimezzata (`rest` / 2) e l'anello lampeggia più veloce. L'avviso resta di 4 tick: la finestra di reazione **non si tocca mai** per singolo nemico (invariante 3), si tocca solo la frequenza.
- **Prolifico**: alla morte lascia 2 minion drone (1 raffica, come quelli del Hive) nelle corsie adiacenti libere.

**7. HP nemici: smettere di gonfiare oltre la soglia utile.**
Obiettivo: con la build mediana del tier (vedi `scripts/balance.mjs`), un nemico muore in circa **il 60% del tempo che resterebbe a schermo**. Oltre, l'HP è tedio. Formula proposta: `enemyHpMul = (1 + 0.28·min(d, 7.5) + 0.08·max(0, d − 7.5))·power^0.5`. Da verificare con lo script: la tabella "kill time / tempo a schermo" per build mediana a T 0, 2, 4, 6, 8 deve stare tra 0,45 e 0,75. Se esce dall'intervallo si tocca il coefficiente, non le raffiche.

**8. Percorsi: file più strette e una fila in più.**
- Spaziatura minima tra file **che non richiedono entrambe un salto**: 4 tick (2 battute) fino a T3, **3 tick** da T4 (permettere battute frazionarie in `r()`, es. `r(9.5, …)`; il verificatore deve lavorare in tick: un cambio corsia dura 0,11 s, 3 tick a 220 BPM sono 0,41 s). Le coppie di file saltabili restano a 3 battute (invariante 5b) e il gap dei phase a 8.
- Da T4 ogni percorso riceve **una fila in più** in coda, scelta tra `TTTTT`, `.B.B.`/`B.B.B` (quella compatibile con l'ultima corsia libera), con le stesse regole di attraversabilità (verificare a runtime con la stessa funzione del test: se la fila aggiunta rende il percorso impossibile, non aggiungerla).

**9. Boss: più fasi, non solo più velocità.**
- `bossSpeed = min(2.2, 1 + 0.12·i)`.
- Al secondo giro (MK2, i ≥ 5) ogni boss ha una **4ª fase "frenesia"** sotto il 15% HP: le righe ritmiche della fase 3 (stesso `beat`: il minimo di 1 battuta per fila non si scende, è il tempo di un cambio corsia con margine) **più** una volée sovrapposta ogni 4 battute su una delle corsie `.` della riga corrente, solo se le corsie libere sono ≥ 2 (ne resta sempre una).
- Da MK2 le righe guadagnano una riga in più per sequenza (`MARCH(n+2)`, `chase(n+2)`, `bounce(…, n+2)`).
- Dal 10° boss (MK3) l'ordine dei boss è mescolato dal seed e due boss consecutivi hanno il **minion summon** del Hive aggiunto alla fase 1.

**10. Dente di sega dopo il boss.**
Nei primi 150 m di ogni distretto (`heat = 0`) il direttore pesca solo sezioni con `from ≤ max(0, T−1)·1000` e nessun rinforzo: 10–12 secondi per leggere il nuovo tempo. Poi `heat` sale e con lui rinforzi ed élite.

**11. Scelte di livello: quando si aprono e come si proteggono.**
Oggi un livello apre la schermata di scelta nel momento esatto in cui raccogli la cellula. Due danni distinti:
- **Apertura a metà schivata.** La cellula spesso sta proprio sulla linea di una schivata o di un salto (le mettiamo noi lì, sui fili, per il rischio): il gioco si ferma mentre il pollice è a metà gesto, e alla ripresa il colpo o il muro sono dove li avevi lasciati ma il tuo ritmo no. Spezza proprio la coreografia che stiamo costruendo, e a fine run (più cellule, GREED, boss) succede sempre più spesso.
- **Scelta accidentale.** Lo swipe o il tap che stavi dando al personaggio atterra sulla schermata appena apparsa e **sceglie una carta a caso**. È irreversibile: una run può essere rovinata da un potenziamento che non volevi. È il problema più grave dei due e vale anche per il bottino dei boss.
- I livelli guadagnati si mettono in coda (già così) ma la scelta si apre **solo tra una sezione e l'altra** (quando `run.sec` è nullo, nel `BREATH`) o subito dopo il bottino del boss. Se la coda ha più livelli, le scelte si aprono una dopo l'altra nello stesso punto.
- Per non far aspettare troppo: se la coda resta piena per più di 25 s (sezioni lunghe), la scelta si apre al prossimo istante in cui nessun colpo è in volo verso il giocatore e nessuna fila è a meno di 2 battute.
- Curva: `xpNeed = 10 + 7·(L−1) + 0.5·(L−1)²` al posto della lineare (L10: 113 cellule invece di 82; L20: 323). Obiettivo misurato: un livello ogni 35–50 s a metà run, non più spesso, con build mediana.
- La barra XP in alto resta; quando un livello è in coda la barra pulsa, così sai che la scelta arriva.

Protezione dagli input accidentali (vale per **ogni** schermata di scelta: livello, boss, e anche pausa/morte):
- **Blocco degli input per 0,45 s** dall'apertura: in `main.js` la schermata registra `openedAt` e ignora tap e swipe finché non è passato il tempo; le carte entrano con un'animazione di 0,3 s (scivolano dal basso) così il blocco è visibile e non sembra un difetto.
- **Scarto del gesto in corso:** se un pointer era già premuto quando la schermata si apre, quel pointer viene ignorato fino al rilascio (`input.js`: `pointerId` marcato come "consumato" al cambio di modalità). Lo swipe a metà non diventa un tap sulla carta.
- **Due tocchi per scegliere:** il primo tap **seleziona** la carta (bordo acceso, descrizione completa e suggerimenti di sinergia in evidenza), il secondo tap sulla stessa carta **conferma**. Un tap su un'altra carta sposta la selezione. Costa mezzo secondo e rende impossibile la scelta cieca; sui telefoni è la convenzione dei roguelike mobile. Il pulsante SKIP resta a tap singolo ma anche lui sotto il blocco iniziale.
- **Niente scelta per swipe:** gli swipe nella schermata di scelta non fanno nulla (oggi `hitTest` risponde al tap, ma un swipe corto sotto `TAP_MAX_MOVE` conta come tap: alzare la soglia a 14 px nelle schermate di scelta).
- **Da tastiera (debug/desktop):** Enter conferma solo la carta selezionata con le frecce; mai la prima.

Dopo queste modifiche verificare a mano sul telefono, con la run in corso: swipe laterale ripetuto mentre arriva il livello → nessuna carta scelta; tap sulla carta → selezione; secondo tap → conferma.

### A.4 Nuove sezioni per i tier alti (3500 m +)

La libreria oggi finisce a 3500 m. Servono sezioni native dei tier 4–8, più dense, e soprattutto le **sezioni miste** (nemici *e* file di ostacoli intrecciati), che sono quelle piaciute di più. Da scrivere in `sections.js` con la stessa sintassi (`e`, `r`, `v`, `c`), tutte da verificare col controllo di attraversabilità già esistente (eseguirlo nel browser come fatto finora, oppure portarlo in `scripts/`):

Combattimento (SECTIONS):
- `trident` (3500): stalker 1, stalker 3, drone 2 alla battuta 4; `r(12,'T.T.T')`.
- `hive-mind` (3500): brooder 0, brooder 4, `r(10,'BB.BB')`, `r(14,'.BBB.')`.
- `pulse` (4000): throb 2, hopper 0; `v(12)`; `r(16,'TBTBT')`.
- `net` (4000): weaver 1, weaver 3 (si incrociano: verificare che le corsie libere dei due varchi non si chiudano mai insieme; se sì, sfalsare di 2 battute).
- `firing-squad` (4500): drone 0,1,3,4 alla battuta 0 (`safeToEnter` garantisce la 2 libera), `r(10,'BBPBB')` (phase al centro mentre ti sparano ai lati).
- `stampede` (4500): kamikaze 1, 2, 3 a battute 0, 2, 4; `r(12,'TTTTT')`.
- `siege` (5000): tank 2, stalker 0; `r(14,'B.B.B')`, `r(18,'TBTBT')`.
- `brood-wall` (5000): wall 2 (solo) poi brooder 0 e 4 alla battuta 8.
- `rift-fight` (5500): sweeper 2, `v(10)`, drone 0 e 4 alla battuta 10 (entrano mentre fai phase), `r(16,'BTBTB')`.
- `the-works` (6000): weaver 2, kamikaze 0, kamikaze 4 battuta 3; `r(12,'TBPBT')`, `v(19)`, `r(22,'BB.BB')`.

Percorsi (COURSES):
- `c-fast-checker` (4000): scacchiera a 3 tick.
- `c-double-snake` (4500): due serpenti in sequenza con direzione opposta e un `P` nel punto di inversione.
- `c-phase-ladder` (5000): `BBPBB`, `BPBBB`, `BBBPB` a 8 battute di distanza, con `TTTTT` tra una e l'altra.
- `c-blender` (5500): zip ×2, scacchiera ×2, `v`, `TTTTT`, snake ×3.
- `c-no-rest` (6000): 9 file a 3 tick, mai due uguali di fila, un `P` e un `v`.

Sezioni introduttive: tutte quelle con `to:` restano com'è.

### A.5 Come misurare che funziona (criteri di accettazione)

Script di simulazione (riusare il pattern già usato nel browser con `__game.tick`): run di 10 minuti con vite infinite, giocatore fermo nella corsia centrale, campionando ogni 10 frame. Per ciascun tier T = 0, 2, 4, 6, 8 riportare:

| Metrica | Come | Deve |
|---|---|---|
| Colpi nemici in volo verso il giocatore al secondo | conta spawn nel pool nemico / s | crescere strettamente con T |
| Corsie "calde" medie | media di `__game.hot().length` | crescere con T, **mai 5** salvo Wall |
| Nemici contemporanei medi | media di `enemies.length` (no boss) | crescere con T |
| Tempo di reazione | `(TELE+TRAVEL)·tick` | 2,58 s (T0) → 1,64 s (T8) → 1,50 s (T10), mai sotto |
| Percorsi impossibili | verificatore sezioni (già esistente) | 0, anche con le file aggiunte di A.3.8 |
| Kill time / tempo a schermo (build mediana) | `scripts/balance.mjs` esteso | tra 0,45 e 0,75 a ogni T |

Più una prova a mano: a 6000 m deve essere *più* difficile che a 3000 m in modo evidente, e un giocatore che muore deve poter dire *cosa* l'ha ucciso.

**Chiarezza della morte (da implementare, è parte della difficoltà "giusta").** Alla morte: 0,6 s di fermo immagine, il colpo o l'ostacolo che ha ucciso cerchiato nel suo colore, la corsia da cui veniva accesa, e nella schermata di fine run una riga "UCCISO DA: Sweeper (corsia 3)" / "Muro" / "Velo (phase mancato)". Serve anche a noi: le statistiche di "ucciso da" dicono quale sezione è ingiusta.

**Determinismo.** Tutto ciò che il direttore decide (sezione, specchio, rinforzi, tratti élite) usa `run.rng`, mai `Math.random`: la daily run deve restare identica per tutti.

### A.6 Ordine di lavoro consigliato

1. `tier`/`heat` in balance; BPM senza cap (A.3.1) e raffiche per tier (A.3.3). Simulare: già qui la curva riparte.
2. Direttore: respiro, sovrapposizione, rinforzi, dente di sega (A.3.4, 5, 10).
3. HP (A.3.7) con la tabella kill-time.
4. Élite con tratti (A.3.6).
5. Percorsi a 3 tick + fila extra (A.3.8).
6. Boss MK2/MK3 (A.3.9).
7. Nuove sezioni (A.4), poi i criteri di A.5.
8. Aggiornare `GDD.md` (sezione 6) con le curve finali.

---

## Parte B — Nuovi item e sinergie

### B.1 Regole già in vigore da rispettare

- Stat visibili: DMG / RATE / SPEED / SHOT SPD / LUCK / HP. Niente stat inutili per un lane runner.
- I **modificatori di colpo compongono** con il carrier (bolt / rocket / rail / beam): ogni modificatore nuovo deve dire cosa fa con **tutti e quattro**. Se con un carrier non ha senso, lo si dice e si sceglie una resa alternativa, mai "non fa niente".
- Fonti: *livelli* = COMMON/RARE di arma, difesa, economia, rischio (niente modalità, attivi, EPIC); *boss* = modalità, attivi, EPIC, almeno una RARE+. Vedi `rollItems`.
- Scoperta delle sinergie: suggerimento vago finché non scoperta, esplicito dopo (`combos.js`, `offerHints`).
- Ogni item ha: `id`, `name`, `code` (3 lettere, unico), `cat`, `rarity` (0/1/2), `max`, `unlock` (achievement id o `null` = base), `desc`, `apply(s, n)`.
- Icone: aggiungere ogni item nuovo al prompt del foglio icone in `ART_PROMPTS.md` §6 (una riga: "N un organo alieno che…").

Sotto, `[L]` = pool livelli, `[B]` = pool boss.

### B.2 Modificatori di colpo (cat `weapon`)

**FISSION** — `fission`, FIS, rare, max 2, [L]
*Alla prima collisione il colpo si divide in due colpi a metà danno verso le corsie adiacenti (stack 2: tre colpi, ±1 e dritto).*
Diverso da SPLITTER, che divide alla bocca. Composizione:
- bolt: alla collisione spawn 2 bolt diagonali (vx verso le corsie vicine, stessa vy) con `flags` ereditati e `lane` ereditata (regola seeker ±1 intatta).
- rocket: l'esplosione spawna 2 mini-razzi (r 3, 60% danno, `F_EXPLODE`, raggio blast 60%).
- rail: al primo bersaglio partono due rail laterali da quel punto verso l'alto (nuovi `pts` in `rails`).
- beam: il raggio **si biforca** al primo bersaglio in due raggi laterali che continuano verso l'alto (aggiungere specs in `updateBeam` dopo `hitsAlong`; larghezza 0,6).
Hook: `resolvePlayerHits` / `blast` / `fireRail` / `updateBeam`. Stat: nessuna.

**SHRAPNEL** — `shrapnel`, SHR, common, max 3, [L]
*Un nemico ucciso esplode in 3 schegge acide (1 per corsia: sua e adiacenti) che salgono. Stack: +2 schegge, danno +50%.*
Schegge = bolt del giocatore (`spawn(playerBullets…)`) con `flags` del carrier corrente: con ROCKET esplodono, con SINE serpeggiano, con PIERCE perforano. Con beam/rail: le schegge sono comunque proiettili (il beam non "spara", quindi le schegge sono l'unico proiettile della build: ottimo con PIERCER). Hook: `onKill` in `run.js`. Danno base 0,6 × DMG.

**BRAND** — `brand`, BRD, common, max 2, [L]
*Il primo colpo su un nemico lo marchia (icona sopra): i nemici marchiati subiscono +20% danno da tutto. Stack: +35%.*
Si applica a qualunque carrier (è on-hit). Il marchio è una proprietà `e.brand` consumata da `damageEnemy`. Boss marchiabili (hitbox intera). Stat: nessuna.

**CHARGE** — `charge`, CHG, rare, max 2, [L]
*Restare 1 s nella stessa corsia carica il colpo successivo: ×2 dimensione e ×1,8 danno. Stack: 0,7 s.*
Tensione con SLIPSTREAM/BLINK (build di movimento vs build di appostamento). Composizione:
- bolt: un glob caricato (sprite ECHO grande, `BIG`).
- rocket: razzo doppio (blast ×1,6).
- rail: rail doppio spessore, `pierce` +99.
- beam: `surge` ×1,8 per 0,4 s allo scadere della carica (riusare il meccanismo `surgeT` di ECHO).
Hook: `updatePlayer` tiene `p.stillT`; `updateWeapon` legge `p.charged`.

**SKYSHOT** — `skyshot`, SKY, common, max 2, [L]
*I colpi sparati in aria (durante un salto) fanno +50% danno e perforano +1. Stack: +90%, +2.*
Premia saltare anche quando non serve: rischio (i colpi alti ti prendono comunque). Vale per ogni carrier (rail e beam: il bonus si applica ai tick di danno mentre `p.jumpT > 0`). Hook: `currentDamage` + `pierce` in `fireProjectiles`.

**GHOSTROUND** — `ghostround`, GHO, rare, max 1, [L]
*I colpi sparati durante il phase sono spettrali: attraversano tutto (pierce ∞) e fanno ×2 danno.*
Il phase dura 0,25 s: con RATE 6 è 1–2 colpi, con beam è un tratto di raggio. Composizione: bolt/rocket perforanti; rail già perfora: diventa ×2; beam: ×2 e `pierce` ∞ nel tratto. Hook: `isPhased(p)` in `fireProjectiles`/`updateBeam`/`fireRail`.

**AFTERGLOW** — `afterglow`, AFG, rare, max 2, [L]
*I colpi lasciano una scia acida per 0,35 s che fa 25% del danno al secondo a chi la tocca. Stack: 0,6 s, 40%.*
Composizione: bolt/rocket: scia lungo il percorso (lista di segmenti con TTL, hit test come `hitsAlong` con larghezza 4); rail: la scia è già "istantanea": diventa una linea che resta 0,35 s e continua a fare danno; beam: il raggio lascia un'immagine residua quando ti sposti di corsia (il vecchio percorso resta 0,35 s). Hook: nuovo array `trails` in `weapon.js`, disegnato in `drawWeaponFx`.

**TWIN LINK** — `twinlink`, TWN, common, max 1, [L]
*Un secondo colpo gemello parte dalla corsia opposta allo swipe appena fatto, per 0,6 s dopo ogni cambio corsia.*
Diverso da SLIPSTREAM (raffica istantanea): qui per 0,6 s spari da due corsie (la tua e quella da cui vieni). Composizione: bolt/rocket: secondo emettitore; rail: secondo rail; beam: secondo raggio parallelo (larghezza 0,7). Hook: `p.laneFromX` + timer; riusare la logica dei WINGMEN per l'emettitore secondario.

### B.3 Modificatori di statistiche (cat `weapon` / `defense` / `economy`)

| id | nome | code | cat | rar | max | fonte | effetto | perché esiste |
|---|---|---|---|---|---|---|---|---|
| `densecore` | DENSE CORE | DNC | weapon | 0 | 3 | L | DMG +0,35 flat per stack | DMG senza i malus di SLUG; scala male con GLASS (flat), bene early |
| `adrenal` | ADRENAL GLAND | ADG | weapon | 0 | 3 | L | RATE +15% | RATE pura; RAPID COIL dà anche SHOT SPD, questo no |
| `hollow` | HOLLOW BONES | HLW | weapon | 0 | 2 | L | SHOT SPD +25%, HP max −0 ma `iframeTime` −0,15 s | velocità con un prezzo di sicurezza |
| `keratin` | KERATIN | KRT | defense | 1 | 2 | L | HP max +1 e cura 1, SPEED −8% | corpo pesante: il tradeoff opposto di BLINK |
| `synapse` | SYNAPSE | SYN | defense | 0 | 3 | L | SPEED +12%, LUCK +1 | la stat "agilità" che manca tra AFTERBURNER (solo SPEED) e DICE (solo LUCK) |
| `focus` | FOCUS LENS | FCL | weapon | 1 | 2 | L | `critMul` +1 (3→4→5); se non hai HEADSHOT dà +5% crit | rende HEADSHOT una build, non un bonus |
| `mitosis` | MITOSIS | MIT | economy | 2 | 1 | B | +1 al `max` di tutti gli item COMMON di arma già posseduti | l'EPIC "stack più in alto": build-defining tardo |
| `momentum` | MOMENTUM | MOM | defense | 0 | 2 | L | SPEED +10%; ogni cambio corsia riduce il cooldown del phase di 0,15 s | movimento che ricarica il phase: sinergia naturale con i veli |

### B.4 Power-up (cat `defense` / `economy`)

**PREMONITION** — `premonition`, PRE, rare, max 1, [L], defense
*Le corsie si accendono 1 tick prima.* Implementazione semplice e onesta: `TELE_TICKS` effettivo 5 invece di 4 quando posseduto (nemici e boss: `tele` +1 tick). Il nemico spara un tick più tardi, cioè è leggermente più lento: è il contro-item della difficoltà A.3.2 e va bene che lo sia. Un solo stack per non svuotare la curva.

**CARAPACE** — `carapace`, CRP, rare, max 1, [L], defense
*Il primo colpo subito in ogni sezione viene ignorato (il guscio si rompe e si riforma alla sezione successiva).* Diverso da BARRIER (a tempo). Hook: `run.sec` cambia → `p.carapace = true`; `hurtPlayer` lo consuma. Mostrare il guscio come anello grigio osseo attorno al simbionte.

**SPORE CLOUD** — `sporecloud`, SPC, common, max 2, [L], defense
*Quando subisci danno, una nuvola di spore cancella i colpi nemici nella tua corsia e nelle adiacenti per 0,8 s. Stack: 1,4 s.* Counterplay dopo l'errore: evita le morti a catena. Hook: `onHurt` → `clearBulletsIn(lanes, dur)`; disegno: cerchio di spore acide.

**CELL WALL** — `cellwall`, CLW, common, max 2, [L], economy
*Ogni 25 cellule raccolte guadagni 1 cuore blu. Stack: ogni 18.* Economia che diventa difesa: fa pesare la scelta "vado a prendere la fila sul filo". Hook: `addCoins`.

**SECOND SKIN** — `secondskin`, SSK, rare, max 1, [L], defense
*Un cuore blu si rigenera ogni 45 s se ne hai meno di quelli iniziali (`blueStart` + ICE WALL).* Rigenerazione lenta che rende ICE WALL più interessante.

**UNDERTOW** — `undertow`, UND, common, max 2, [L], economy
*Durante il phase attiri tutte le cellule a schermo. Stack: anche i cuori.* Dà al phase un uso economico oltre a quello difensivo.

**SYMBIONT EGG** — `egg`, EGG, epic, max 1, [B], defense
*Alla morte ti schiudi da un uovo con 1 cuore, invulnerabile 2 s, una volta per run.* La "extra life" classica, solo dai boss.

### B.5 Attivi (cat `active`, tutti [B], max 1)

| id | nome | code | carica | effetto |
|---|---|---|---|---|
| `blackhole` | BLACK HOLE | BLH | 12 kill | Per 1,5 s tutti i colpi nemici vengono risucchiati verso la tua corsia e distrutti **sempre** almeno 60 px sopra di te (mai un colpo che ti raggiunge a causa del risucchio); i nemici nella tua corsia subiscono 8 danni. |
| `mirrorfield` | MIRROR FIELD | MRF | 10 kill | Per 2 s ogni colpo nemico che ti raggiunge viene riflesso (come MIRROR SKIN, senza phase). |
| `overcharge` | OVERCHARGE | OVC | 8 kill | Le prossime 3 raffiche (o 2 s di beam) sono cariche come CHARGE ×2 (anche senza CHARGE). (Non "SURGE": è già il nome della sinergia LASER + ECHO.) |
| `warp` | WARP | WRP | 14 kill | Salti avanti di 120 m: lo schermo si svuota (nemici, colpi, ostacoli), niente cellule per quel tratto. Non durante i boss. Implementazione: chiude la sezione corrente (`run.sec = null`, calma di 1 battuta), somma la distanza con clamp a `nextEvent − 20` (non deve saltare l'ingresso del boss). |
| `molt` | MOLT | MLT | 16 kill | Cura 2 cuori e rimuove il veleno; per 3 s il simbionte è più piccolo (hitbox −30%). |

### B.6 Rischio (cat `risk`)

**LEAD WEIGHTS** — `leadweights`, LDW, rare, max 1, [L]
*Non puoi più saltare. DMG +60%.* Build-defining: le onde arancio diventano "cambia corsia". Escluso dal pool se possiedi KICKFLIP o GROUND POUND (e viceversa): aggiungere `conflicts: [...]` a `rollItems`.

**FEVER** — `fever`, FVR, rare, max 2, [L]
*RATE +30%. Le cure (cuori, PATCH, LEECH, REPAIR) curano la metà.* Stack: +55%, cure a un terzo.

**DOUBLE OR NOTHING** — `double`, DBL, epic, max 1, [B]
*Cellule ×2. Cuori massimi fissati a 2.* Livelli veloci, margine zero.

**PARASITE** — `parasite`, PRS, rare, max 1, [L]
*Ogni livello ti costa 1 cuore (se ne hai > 1). Ogni livello offre 2 scelte in più.* Il "MUTAGEN cattivo".

### B.7 Sinergie nuove (`combos.js`)

Formato: `pair(a, b, NOME, 'descrizione esplicita')` con `when` carrier-conditional dove indicato. Suggerimento vago prima della scoperta (campo `hint`), come le esistenti.

| # | Coppia | Nome | Effetto | Hook |
|---|---|---|---|---|
| 1 | FISSION + SPLITTER | CASCADE | I colpi di fissione si dividono una seconda volta (max 1 ricorsione). | flag `fissioned` sul proiettile |
| 2 | FISSION + ROCKET POD | MIRV | I mini-razzi della fissione esplodono a raggio pieno. | `blast` |
| 3 | FISSION + SEEKER | HYDRA | I colpi di fissione cercano bersagli (regola ±1 dalla corsia di origine). | `lockTargets` / `steerBullets` |
| 4 | FISSION + LASER | FORK | Il raggio si biforca anche al secondo bersaglio (3 rami). | `updateBeam` |
| 5 | SHRAPNEL + CHAIN REACTION | GRENADE | Le schegge esplodono (raggio 50 px). | `onKill` |
| 6 | SHRAPNEL + TOXIN | SPORE BURST | Le schegge avvelenano 2 stack. | `resolvePlayerHits` |
| 7 | BRAND + HEADSHOT | EXECUTION | I critici sui marchiati fanno ×5 e il marchio salta al nemico più vicino. | `damageEnemy` |
| 8 | BRAND + ARC RELAY | CONDUIT | Gli archi preferiscono i marchiati e non consumano il salto (+1 bersaglio). | `arc` |
| 9 | BRAND + SEEKER | BLOODHOUND | Verso un nemico marchiato l'homing arriva a ±2 corsie. | `steerBullets` (unica eccezione alla regola ±1: va scritta nel GDD) |
| 10 | CHARGE + RAIL CANNON | SIEGE | Il rail caricato stordisce il boss 0,6 s (`b.stateT` fermo) e fa ×2,5. | `fireRail`, `updateBoss` |
| 11 | CHARGE + ECHO | RESONANCE | Un colpo caricato è sempre anche un colpo ECHO. | `fireProjectiles` |
| 12 | SKYSHOT + KICKFLIP | AIR RAID | Atterrando spari una raffica di 3 SKYSHOT nelle 3 corsie centrali attorno a te. | `p.ev.land` |
| 13 | SKYSHOT + GROUND POUND | METEOR | L'onda d'urto del pound ha il bonus SKYSHOT e larghezza 3 corsie. | `groundPound` |
| 14 | GHOSTROUND + MIRROR SKIN | SPECTRE | I colpi riflessi durante il phase sono spettrali (perforanti, ×2). | riflessione in `run.js` |
| 15 | GHOSTROUND + BLINK DRIVE | WRAITH | Il phase dura +0,2 s e i colpi spettrali rallentano i nemici colpiti del 30% per 1 s. | `isPhased`, nuovo `e.slow` |
| 16 | AFTERGLOW + SINE WAVE | RIBBON | La scia segue l'onda e dura ×2: una rete acida nella corsia. | `trails` |
| 17 | AFTERGLOW + LASER | SCAR | Cambiando corsia il raggio lascia una cicatrice ardente 1 s nella corsia lasciata. | `updateBeam` |
| 18 | PREMONITION + ADRENALINE | SIXTH SENSE | All'ultimo cuore le corsie si accendono 2 tick prima. | rendering avviso |
| 19 | CELL WALL + GREED | HIVE MIND | I cuori blu di CELL WALL arrivano ogni 15 cellule. | `addCoins` |
| 20 | CARAPACE + PLATING | EXOSKELETON | Il guscio regge 2 colpi per sezione. | `hurtPlayer` |
| 21 | BLACK HOLE + ORBITAL | EVENT HORIZON | Per 4 s dopo il BLACK HOLE gli orbitali mangiano i colpi a raggio doppio. | `orbitals` |
| 22 | LEAD WEIGHTS + SLUG ROUNDS | ARTILLERY | I colpi diventano BIG di base e ignorano la riduzione di SHOT SPD di SLUG. | `fireProjectiles` |
| 23 | SPORE CLOUD + TOXIN | MIASMA | La nuvola avvelena i nemici che la attraversano. | `clearBulletsIn` |
| 24 | MOMENTUM + SLIPSTREAM | DRIFT | Ogni raffica di SLIPSTREAM è anche caricata (CHARGE) se hai cambiato corsia due volte in 0,5 s. | `slipBurst` |

Trio consigliato (uno solo, raro, da scoprire): **FISSION + SHRAPNEL + CHAIN REACTION = "CHAIN FISSION"** (non "MELTDOWN": è già il nome di LASER + TOXIN): ogni uccisione innesca una catena di schegge che si dividono, con cap di 24 proiettili generati per evento (anti-lag, anti-screen-clear gratuito).

### B.8 Bilanciamento e pool

- Numeri target (build mediana a T4): un modificatore COMMON vale ~+15–20% DPS effettivo; RARE ~+30% con condizione; EPIC cambia la build. Verificare con `scripts/balance.mjs` esteso con i nuovi item (aggiungere 4 build di riferimento: "fissione", "appostamento" (CHARGE+ECHO+RAIL), "aria" (SKYSHOT+KICKFLIP+POUND), "fantasma" (GHOSTROUND+BLINK+MIRROR)).
- `conflicts` in `rollItems`: LEAD WEIGHTS ↔ KICKFLIP/GROUND POUND/SKYSHOT; PARASITE ↔ GLASS CANNON (fine run a 1 cuore garantita = non divertente).
- Sblocchi: i nuovi RARE/EPIC vanno agganciati agli achievement esistenti non ancora usati o a 6 nuovi (es. "fai phase attraverso 30 squarci" → GHOSTROUND; "uccidi 50 nemici in aria" → SKYSHOT; "resta 60 s senza cambiare corsia in una run" → CHARGE; "raccogli 300 cellule in una run" → CELL WALL; "sopravvivi a 3 veli consecutivi senza danni" → PREMONITION; "livello 12 in una run" → MITOSIS).
- Dopo l'aggiunta il pool è di ~76 item: `rollItems` con `source: 'level'` deve continuare a pesare ×1,6 gli item già posseduti e in più garantire che **almeno una carta per offerta sia un item già posseduto e ancora impilabile** (se ne esiste uno), altrimenti con 76 item i livelli diventano una lotteria e le build non chiudono mai.
- `effectiveDps` in `items.js` (usato per scalare gli HP via `powerRatio`) deve contare, almeno in modo approssimato, gli item che fanno danno fuori dal colpo diretto: SHRAPNEL, AFTERGLOW, FISSION, BRAND, SKYSHOT. Se non li conta, quelle build sono "potenza nascosta" e i nemici risultano troppo deboli solo per loro.

### B.9 Ordine di lavoro consigliato

1. Stat mods (B.3) e power-up semplici (CELL WALL, SPORE CLOUD, CARAPACE): nessun nuovo sistema.
2. BRAND, SHRAPNEL, SKYSHOT, GHOSTROUND: hook on-hit/on-kill/on-state già esistenti.
3. FISSION e AFTERGLOW: toccano tutti e 4 i carrier, testare ogni combinazione nel browser (`__game.acquire`).
4. CHARGE, TWIN LINK, MOMENTUM.
5. Attivi e rischio.
6. `combos.js`: le 24 coppie + il trio, con hint vaghi.
7. `ART_PROMPTS.md` §6: righe icone; `GDD.md` §7: tabella item aggiornata; `scripts/balance.mjs`: nuove build.

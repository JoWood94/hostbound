# NEON OVERDRIFT — prompt per ripartire da zero

Incolla questo messaggio all'inizio di una nuova chat aperta nella cartella del progetto.

---

Lavoriamo su **NEON OVERDRIFT**, il mio gioco web mobile (portrait, una mano) in JavaScript vanilla + Vite 6 + Canvas 2D, pubblicato su GitHub Pages: https://jowood94.github.io/neon-overdrift/ (repo pubblico `JoWood94/neon-overdrift`, deploy automatico a ogni push su `main`). Versione attuale: **v1.1.0** (tag su GitHub). Parla in italiano.

**Prima di tutto leggi** `GDD.md` (regole e stato del gioco, aggiornato), `DESIGN_V1.1.md` (difficoltà e item, con le deviazioni annotate in cima), `ART_PROMPTS.md` (prompt degli sprite) e la memoria del progetto.

**Il gioco in breve.** Lane runner a 5 corsie discrete (uno swipe o un tap su una metà = una corsia, mai movimento libero) + bullet hell + sinergie roguelike stile The Binding of Isaac. Il giocatore è MASSA, un simbionte alieno che fluttua sulle "correnti cosmiche". Estetica: cosmic horror alla Carrion / Astro Squid ma più cupa, neon "Japan" sporco e acido. Sprite generati da me altrove con i prompt di `ART_PROMPTS.md`; tu li importi (`scripts/import-chroma.py`, `import-glow.py`, `import-sheet.py`) e li integri. Valuta con me ogni nuovo sprite: se una parte non funziona dimmelo.

**Regole di design che non si toccano:**
- Ogni nemico ha un pattern fisso e un avviso: la corsia si accende sempre **4 tick prima** del colpo e il colpo ci mette sempre lo stesso tempo ad arrivare (7/6/5 tick per distretto). "Corsia accesa" = stesso tempo di reazione per tutti.
- Sempre almeno **2 corsie libere** (eccezione voluta: la stretta del Wall).
- Colori: **arancio = salta**, **magenta = schiva**, **ciano = phase**, **verde acido = colpi del giocatore**.
- Due file da saltare ad almeno 3 battute (0,65 s); ostacoli da phase ad almeno 8 battute (2,3 s per i boss); file di ostacoli dei boss ad almeno 0,65 s; spazzate dei boss ad almeno 0,3 s per corsia.
- Le hitbox seguono il disegno. Il seeker raggiunge solo ±1 corsia (unica eccezione: BLOODHOUND).
- Le sinergie compongono davvero, come in Isaac; scoperta: suggerimento vago prima, spiegazione esplicita dopo.
- Il ritmo è di **gameplay**, non musicale: tutto funziona con l'audio spento, niente effetti da rhythm game. La musica segue l'orologio del gioco solo come abbellimento.

**Architettura chiave:** `src/core/tempo.js` (orologio a tick), `src/game/enemies.js` (metronomo, avvisi), `src/game/run.js` (direttore delle sezioni, livelli, item a runtime), `src/game/generator.js` (sezioni procedurali per intensità `1 + metri/700`, senza tetto), `src/game/sections.js` (sezioni scritte a mano, usate soprattutto all'inizio), `src/game/fairness.js` (attraversabilità), `src/game/boss.js` (10 boss in due cerchi + MK2), `src/game/items.js` / `combos.js` (76 item, combo), `src/game/weapon.js` (motore di sparo componibile per bolt/rocket/rail/beam).

**Come lavoriamo:**
- Prima di una modifica grossa fammi domande se c'è una scelta che spetta a me (uso le domande a scelta multipla).
- **Verifica sempre misurando**, non a occhio: `node scripts/verify-sections.mjs` (equità delle sezioni), `node scripts/balance.mjs` (curva vita/potenza), e nel browser `http://localhost:5173/neon-overdrift/?debug&mute` con `__game` (`tick`, `draw`, `hit`, `spawn`, `obstacle`, `boss(def, index)`, `bot(setup, secondi, {log})` = giocatore di test che dice se qualcosa è impossibile). Nei test usa sempre `&mute` (niente audio).
- `?from=<metri>` fa partire una partita più avanti con una build plausibile: è il modo in cui provo la difficoltà sul telefono.
- Sul telefono provo dal server di sviluppo in rete locale (`npm run dev` già esposto; dammi `http://<ip-del-mac>:5173/neon-overdrift/`).
- **Committa in locale quando vuoi, ma fai `git push` (che pubblica il sito) solo quando dico "pubblica".** Tagga le versioni con semver quando te lo chiedo.
- Tieni aggiornati `GDD.md` e, se tocchi gli sprite, `ART_PROMPTS.md`.

**Stato e prossimi passi aperti:**
- Da provare giocando: rampa di difficoltà procedurale (tra distretto 4 e 6 la pressione misurata è piatta), resistenza dei nemici (un giocatore fermo ne uccide circa un terzo al distretto 5), reattività dei comandi dopo il tap anticipato.
- Da decidere: limitare `?from=` alla sola modalità debug sul sito pubblico.
- Sprite mancanti: foglio icone dei 32 item v1.1 (`ART_PROMPTS.md` §6b) e foglio icone originale (§6) se non ancora fatto.
- Idee in coda: nuove razze aliene per i settori (una per distretto), rinominare le 5 varianti (ancora STOCK/GHOST/TANK/VIRAL/GLITCH, testi da "nave"), sfondi in parallasse (prompt in §5).

# HOSTBOUND v1.2 — item: carrier, tratti, stack, sinergie, evoluzioni

Piano concordato in chat (2026-10-02), **implementato** (fasi 1-6). Il bilanciamento si rifinisce provando il feel sul telefono.

**Deviazioni dal piano** (misurate con `__game.bench`):
- **Tratti e item**:
  - DOWNBEAT diventa **BLOODRUSH**: uccisioni a meno di 1 s l'una dall'altra danno fino a +40% di cadenza. Il ritmo resta di gameplay, non musicale.
  - I colpi di RICOCHET fanno il 45% dopo il rimbalzo (con PIERCER raddoppiavano il danno). A 2 stack deviano solo verso una corsia che ha un nemico.
  - KICKFLIP: la pulizia all'atterraggio si ricarica in 4 s (segnalazione dell'utente: saltando di continuo la corsia restava pulita).
- **Stack e mode x2**:
  - LASER x2: +20% di ramp-up invece di +30%.
  - SCATTER x2: pellet +15% e portata più lunga, invece di +1 pellet (un numero pari di pellet lascia scoperto il centro).
  - FRAG x2: sulla corsia vicina il 25% invece del 40%.
- **Evoluzioni**:
  - THUNDERCLAP: i tre echo minori inseguono i nemici vicini (salendo dritti non colpivano nulla), al 18% ciascuno.
  - BONE LANCE: +15% per nemico attraversato.
  - ARMADA su beam e rail: un raggio per drone al 35%.
- **Fusioni** ricalibrate entro +15% sul migliore dei due carrier: TETHER, CAUTERIZE, HARPOON, KAMA, SEEDER, REAPER (x1,1), EGG CLUTCH, QUEEN, WASP NEST.
- **Trii**:
  - TRIAD è una rotazione a 3 carrier.
  - BARRAGE ignora la penalità di cadenza di SCATTER.
  - POWER GRID spara entrambi i carrier al 70%.
  - CHAKRAM e SAWBLADE colpiscono molte più volte, quindi ogni taglio fa meno danno (75% e 55%).
- **Sblocchi**: gli item nuovi sono disponibili da subito (`unlock: null`), così si possono provare. Gli achievement di sblocco sono da decidere.
- **Sprite**: i carrier nuovi sono disegnati in vettoriale finché non arriva il foglio sprite (ART_PROMPTS.md §4b, icone §6c).

## 0. Vincoli
- **Portata**: i nemici si fermano a holdY 110-160 px, la nave è a H*0.78, quindi stanno a 350-500 px. Ogni carrier deve raggiungere la linea nemica su tutti i formati (stessa regola della correzione di SCATTER, d457cb7). Niente armi a corto raggio: TENDRIL e BILE JET sono scartati.
- **Budget DPS**:
  - carrier da solo: 1-1,15 volte il bolt;
  - fusione: al massimo +15% rispetto al migliore dei due;
  - alternanza: circa la media dei due;
  - insieme: 60% + 60%;
  - trio: al massimo +20% rispetto alla migliore delle sue coppie;
  - evoluzione: circa +25% rispetto all'item base al massimo.
- Tutto entra in `effectiveDps` (items.js) e va verificato con `scripts/balance.mjs` e con il bot (`?debug&mute`).
- **Fairness**: niente tocca i proiettili nemici in volo né il preavviso di 4 tick.
- **Tecnica**: `bullets.flags` è un Uint8 con tutti i bit già usati. Va portato a Uint16 per i nuovi flag.
- **Regola del seeker (HANDOFF)**: la portata ±1 corsia cambia. SEEKER a 2 stack arriva a distanza 2, su richiesta esplicita dell'utente.

## 1. Carrier e forme
- **Carrier** (cosa spari): bolt (base), LASER, RAIL, ROCKET, più i nuovi GLAIVE, SPORE MINE, BROOD, STINGER, SEED MORTAR.
- **Forme** (come si distribuisce): SCATTER e SINE. Si fondono sempre con qualsiasi carrier.

| Nuovo carrier | Comportamento | Stack 2 |
|---|---|---|
| BONE GLAIVE | Sale per la corsia fino alla linea nemica e torna, colpendo all'andata e al ritorno. Cadenza bassa. | Ritorno più rapido, +20% di danno |
| SPORE MINE | Sale e si ferma appena sotto la linea nemica della corsia. Esplode (area di 1 corsia) quando un nemico entra o dopo 2 s. Massimo N mine attive. | +1 mina attiva |
| BROOD | Larve che cercano il nemico più vicino entro ±2 corsie e ci si attaccano facendo danno nel tempo. Danno basso, deboli contro i boss. | +1 larva per salva |
| STINGER | Ago lento che si pianta nel nemico ed esplode dopo 1 s. Gli aghi si sommano. | Esplosione dopo 0,8 s |
| SEED MORTAR | Colpo a parabola che cade sulla linea nemica, con area di 1 corsia, scavalcando la fila davanti. | Area un po' più larga |

**Mode x2** (piccoli, mai broken):

| Mode | Stack 2 |
|---|---|
| LASER | Ramp-up fino a +30% sullo stesso bersaglio |
| RAIL | Carica il 15% più veloce |
| ROCKET | Raggio dell'esplosione +25% |
| SCATTER | +1 pellet, cono più stretto |
| SINE | Rallenta sui picchi dell'onda |

**Forme sui nuovi carrier**:

| Carrier | SCATTER | SINE |
|---|---|---|
| GLAIVE | Ventaglio di 3 lame | La lama zigzaga |
| MINE | Mine su 3 corsie | Nessun effetto |
| BROOD | Più larve | Nessun effetto |
| STINGER | Ventaglio di aghi | Aghi ondulati |
| MORTAR | 3 corsie, meno danno per colpo | Nessun effetto |

### Coppie di carrier
Tipi di relazione: **F** = fusione, **A** = alternanza (salve A/B), **I** = insieme (60% + 60%).

| Coppia | Tipo | Nome | Effetto |
|---|---|---|---|
| LASER + RAIL | F | PULSE LANCE | (esiste già) |
| LASER + ROCKET | F | SCORCHER | (esiste già) |
| RAIL + ROCKET | F | DETONATOR | (esiste già) |
| LASER + GLAIVE | F | TETHER | Il raggio collega nave e glaive in volo e brucia ciò che attraversa |
| LASER + MINE | I | TRIPWIRE | Fili laser tra mine in corsie vicine |
| LASER + BROOD | F | HATCHERY | Le uccisioni del beam schiudono 2 larve |
| LASER + STINGER | F | CAUTERIZE | 1 s di beam sullo stesso bersaglio pianta una carica |
| RAIL + GLAIVE | A | RECOIL | La glaive copre il tempo di carica del rail |
| RAIL + MINE | I | FUSE LINE | Il rail fa esplodere le mine che attraversa |
| RAIL + STINGER | F | HARPOON | Il rail pianta un pungiglione nel primo bersaglio (danno ridotto) |
| ROCKET + GLAIVE | F | KAMA BOMB | La glaive esplode nel punto di inversione |
| ROCKET + MINE | F | CLAYMORE | Le mine si lanciano sul primo nemico che entra nella corsia |
| ROCKET + BROOD | F | WASP NEST | I razzi liberano larve all'impatto |
| ROCKET + MORTAR | F | CARPET | 3 bombe su 3 corsie, -40% di danno ciascuna |
| GLAIVE + MINE | F | SEEDER | Mina lasciata nel punto di inversione |
| GLAIVE + STINGER | A | REAPER | Il ritorno della glaive fa esplodere i pungiglioni (x1,3) |
| MINE + BROOD | F | EGG CLUTCH | Le mine schiudono larve |
| BROOD + STINGER | F | QUEEN | Ogni larva inietta un pungiglione |
| STINGER + MORTAR | A | DEPTH CHARGE | Il mortaio fa esplodere i pungiglioni nella sua area |

**Default** per le coppie non progettate e dal terzo carrier in poi: fusione a priorità beam > rail > mortar > stinger > glaive > rocket > brood > mine > bolt. ROCKET non carrier = tratto "esplode".

### Trii (trasformazioni)
**Regole**:
- Il trio sostituisce le 3 coppie tra i suoi membri.
- Con più trii possibili vince il primo formato.
- Gli altri carrier seguono il default.
- Banner a schermo e voce nel codex.

| Trio | Nome | Effetto |
|---|---|---|
| LASER + RAIL + ROCKET | SUPERNOVA | Beam che si carica e rilascia una nova esplosiva lungo la corsia |
| LASER + RAIL + MINE | POWER GRID | Rete di mine: il rail le fa esplodere a catena |
| RAIL + STINGER + MORTAR | TARGET LOCK | Il rail marca, il mortaio insegue i marcati e fa esplodere i pungiglioni |
| BROOD + STINGER + MINE | NEST | Mine-nido che schiudono larve con pungiglione |
| LASER + GLAIVE + SINE | CHAKRAM | Glaive legata al raggio che spazza 3 corsie fino alla linea nemica |
| ROCKET + MORTAR + SCATTER | BARRAGE | Bombardamento a rullo su 5 corsie, -55% di danno per bomba |
| RAIL + GLAIVE + STINGER | TRIAD | Rotazione a 3 tempi; il terzo colpo del ciclo fa x1,25 |
| GLAIVE + RICOCHET + PIERCER | SAWBLADE | La glaive rimbalza 3 volte prima di tornare |
| STINGER + OVERKILL + CULL | EXECUTIONER | Il danno in eccesso diventa un nuovo pungiglione |
| BROOD + PARALYTIC + TOXIN | INCUBATOR | Larve che intorpidiscono; chi muore intorpidito schiude una larva |

**Da misurare**: quanto spesso una run raccoglie 3 mode. Se succede quasi mai, aumentare i mode nel loot dei boss avanzati.

## 2. Tratti nuovi
| Tratto | Stack 1 | Stack 2 |
|---|---|---|
| RICOCHET | I colpi mancati rimbalzano una volta dal bordo alto (spariscono prima della nave). Il rail si riflette al 50%. | Il rimbalzo devia nella corsia vicina |
| CONVERGENCE (serve SPLITTER o SCATTER) | I colpi laterali convergono sulla tua corsia alla linea nemica | Alterna convergenza e apertura |
| SLINGSHOT | I colpi sparati durante il cambio corsia curvano verso la corsia di arrivo, +30% di velocità e danno | Arrivano anche alla corsia oltre |
| PARALYTIC | Il nemico aspetta il 25% in più tra gli attacchi (effetto dimezzato sui boss) | 5 colpi = blocco di 0,5 s |
| OVERKILL | Il danno in eccesso passa al nemico successivo della corsia | Anche alle corsie vicine (metà ciascuna) |
| HUSK | Il nemico ucciso lascia un guscio che blocca 1 proiettile nella sua corsia (3 s) | Blocca 2 proiettili |
| CULL | Uccide i non-élite sotto il 12% di HP (mai i boss) | 18%, anche le élite |
| METABOLISM | Cadenza fino a +35% in 3 s senza essere colpito; si azzera al colpo | Il colpo dimezza il bonus invece di azzerarlo |
| HEARTBEAT | Ogni 2 s una salva da tutte le sorgenti | Ogni 1,6 s |
| DOWNBEAT | Cadenza agganciata alla musica: i colpi sul tempo forte fanno critico (deve funzionare anche muto: va legato al clock a tick, non all'audio) | I contrattempi danno +25% |

## 3. Stack degli item esistenti
- **Item di statistica pura**: lineari, cap attuali.
- **Item di comportamento**: la soglia al massimo aggiunge una forma nuova.
  - SEEKER: 1 = distanza 1; 2 = distanza 2, solo se le corsie a 0-1 sono vuote, con curva più lenta.
  - UNDERTOW: 1 = celle entro ±1 corsia durante il phase; 2 = entro ±2. Niente cuori.
  - PIERCER 3: +10% di danno per ogni nemico attraversato.
  - FRAG 2: l'esplosione raggiunge la corsia vicina.
  - ARC 3: corsie diverse, danno dal 35% al 45%.
  - TOXIN 3: il veleno passa al vicino alla morte.
  - HEADSHOT 3: i critici perforano +1.
  - TWIN LINK: nuovo stack 2 con finestra di 1 s.
  - GROUND POUND: da verificare (x6 al massimo).
  - Active doppio dal boss: diventa OVERCLOCK (-25% di carica necessaria).
- **Sinergie che scalano**: livello = minimo degli stack dei due item. Il livello 2 vale circa +60% del livello 1. Le sinergie con un membro a max 1 hanno un solo livello.

## 4. Evoluzioni (max stack + partner, immediate)
**Regole**:
- L'evoluzione prende lo slot dell'item base; il partner resta.
- Incorpora e supera la combo che c'era già tra i due.
- Dopo la prima scoperta, la carta del partner mostra "EVOLVES".

| Base | Partner | Evoluzione | Effetto | Supera |
|---|---|---|---|---|
| PIERCER 3 | SLUG | BONE LANCE | Trapassa tutto, +10% per nemico attraversato | RAILGUN |
| TOXIN 3 | FRAG | PANDEMIC | Il veleno si diffonde a ogni morte | PLAGUE |
| SPLITTER 2 | SEEKER | SWARMLORD | Ogni colpo laterale sceglie un bersaglio diverso | SWARM |
| ECHO 2 | RAPID | THUNDERCLAP | L'echo si divide in 3 all'impatto | BURST FIRE |
| ARC 3 | BRAND | STORMCALLER | Gli archi saltano senza limite tra i marchiati | CONDUIT |
| ORBITAL 3 | MIRROR | CORONA | Gli orbitali rilanciano i proiettili nemici | HALO |
| WINGMAN 2 | SPLITTER | ARMADA | I wingmen copiano il carrier principale al 60% (niente trii né fusioni) | SQUADRON |
| AFTERGLOW 2 | SINE | WEB | Rete di scie che intorpidisce | RIBBON |
| UNDERTOW 2 | MAGNET 2 | MAELSTROM | Durante il phase attira tutto lo schermo, cuori compresi | — |
| RICOCHET 2 | PIERCER | PINBALL | 3 rimbalzi | — |
| METABOLISM 2 | FEVER | HYPERMETABOLISM | Fino a +60%, si dimezza al colpo | — |

## 5. Fasi di implementazione
1. **Infrastruttura**: flag a Uint16; livelli delle sinergie; evoluzioni in items.js/combos.js/run.js (banner, codex, hint "EVOLVES").
2. **Stack degli item esistenti** (sezione 3) e sinergie che scalano. Poi `balance.mjs` e bot.
3. **Tratti nuovi** (sezione 2).
4. **Carrier nuovi e mode x2** (sezione 1): sprite per GLAIVE, MINE, BROOD, STINGER, MORTAR da aggiungere ad ART_PROMPTS.md.
5. **Coppie di carrier** e default di priorità.
6. **Trii**, compresi quelli carrier + tratto.
7. **Aggiornare** GDD.md e HANDOFF.md (la regola del seeker cambia).

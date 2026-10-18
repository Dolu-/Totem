# Totem v1 (ex-jColumns) — Plan de modernisation

> **Renommage (18/10/2026)** : le jeu s'appelle désormais **Totem** (le nom « jColumns » évoquait la marque « Columns »). Ce plan conserve l'ancien nom là où il décrit l'historique.
>
> **État : v1 terminée le 17/10/2026** (étapes 0 à 10). Pistes pour la suite : [`ROADMAP.md`](ROADMAP.md). Bilans : calibrage §6, recette §7.

Objectif : réécrire jColumns en application web moderne, jouable sans installation sur PC (clavier, souris) et mobile (glissements, tap), avec **équivalence fonctionnelle** avec la version actuelle (`legacy/`), une base de code testable et évolutive (prochain groupe visible, blocs joker en v2+), et un stockage strictement local.

Décisions validées :

| Sujet | Choix |
|---|---|
| Stack | TypeScript (strict) + Vite, aucune dépendance au runtime |
| Rendu | Plateau sur `<canvas>` (haute densité, `requestAnimationFrame`), menus et HUD en HTML/CSS |
| Distribution | Site statique + PWA (installable, jouable hors ligne) |
| Gestes mobiles | ←/→ déplacer (un glissement long = plusieurs colonnes), ↑ ou tap = permuter, ↓ = accélérer |
| Stockage | `localStorage` uniquement, aucun appel réseau |

---

## 1. Audit de la version actuelle

### 1.1 Règles et comportements à conserver (référence d'équivalence)

| Élément | Comportement legacy (fichier) | v1 |
|---|---|---|
| Pièce | 3 cases empilées verticalement, couleurs tirées au hasard (`columnsBlock.Generate`) | Identique |
| Apparition | Colonne **aléatoire**, au-dessus du plateau | Identique par défaut ; option « colonne centrale » |
| Permutation | Cycle bas→haut des 3 couleurs (`Rotate`) | Identique |
| Déplacement | Une colonne, refusé hors plateau ou si la case cible est occupée ; glissement animé « en cascade » case par case | Identique (animation conservée, purement visuelle) |
| Chute | Par demi-case toutes les `800 − 80 × vitesse` ms (0,625 case/s à la vitesse 0, 6,25 case/s à 9) | Même courbe, exprimée en cases/s, continue (60 i/s) |
| Verrouillage | Quand la pièce ne peut plus descendre, au tick suivant (le joueur peut encore la déplacer entre-temps) | Délai de verrouillage = durée d'un pas de chute (minimum 150 ms) |
| Combinaisons | ≥ 3 cases de même couleur alignées : horizontale, verticale, deux diagonales (`arSquare_CheckCombo`) | Identique, détection par segments |
| Disparition | Fondu vers le noir (16 étapes liées aux FPS) | Animation temporelle (~350 ms) : flash, réduction, fondu |
| Tassement | Les cases sans support tombent case par case, animé (`arSquare_Pack`) | Identique, animé en temps réel |
| Réactions en chaîne | Nouvelle recherche après tassement, coefficient `×2`, `×3`… affiché au centre | Identique |
| Score | 3 points par triplet aligné (4 alignées = 6, 5 = 9) × coefficient de chaîne | Même base × chaîne **× multiplicateur de niveau** (à la Tetris), isolé dans une règle de score remplaçable |
| Accélération | +1 vitesse tous les 11 « premiers enchaînements », vitesse linéaire | **Paliers à la Tetris** : +1 niveau tous les N **alignements** réalisés (ou N blocs effacés, au choix interne ; Tetris : 10 lignes), courbe de vitesse accélérée avec plafond, niveau de départ au choix |
| Fin de partie | Une case verrouillée hors du plateau | Identique |
| Pause | Masque le plateau (anti-triche), boutons Reprendre / Arrêter | Identique + pause automatique si l'onglet/l'app passe en arrière-plan |
| Records | 9 meilleurs scores, pseudo de 5 caractères, saisie si qualifié | 10 meilleurs, pseudo de 12 caractères, + date et paramètres de la partie |
| Paramètres | Lignes 10–20, colonnes 5–12, couleurs 5–9, vitesse de départ 0–9, langue, FPS 15–30 | Mêmes plages (la vitesse de départ devient le niveau de départ) ; FPS supprimé (remplacé par `requestAnimationFrame`) ; ajouts : colonne d'apparition, boutons tactiles, symboles daltoniens. Les réglages de difficulté fins restent internes (cf. §2, « Réglage de la difficulté ») |
| Langues | Français, anglais (aide en dur en français) | FR/EN complets, langue du navigateur par défaut |
| Clavier | ←/→, ↑ permuter, ↓ et Espace descendre, P et N pause | Identique + Échap pause, Entrée démarrer/reprendre, ZQSD/WASD en option |

### 1.2 Défauts constatés (en lisant le code et en jouant via Playwright, PC 1280×800 et Pixel 7)

- **Taille figée** : le canvas fait 220×543 px CSS quel que soit l'écran. Petit sur PC, la moitié de l'écran vide sur mobile.
- **Flou sur mobile** : aucune prise en compte de `devicePixelRatio` (2,6 sur le Pixel 7), texte et cases baveux.
- **Gestes** : le geste est évalué à chaque `touchmove` sans réinitialiser le point de départ. Un seul glissement vers le haut déclenche un nombre aléatoire de permutations. Le gestionnaire est posé sur `body` avec `preventDefault`, ce qui bloque aussi le défilement des menus.
- **Animations liées aux FPS** : fondu, chute et glissement avancent par image. Changer les FPS change la vitesse des animations.
- **Écran de config** : les curseurs n'affichent pas leur valeur. Boutons sous forme d'icônes seules, sans libellé.
- **Mise en page** : dépendance à la CSS de jQuery Mobile 1.4.5 (2014) pour quelques boutons ; bande noire sous la page.
- **Bugs** : `arHigh.lenght` (records jamais tronqués) ; test `arHigh[arHigh.length]` toujours `undefined` ; langue jamais restaurée (plage de validation recopiée de celle des FPS) ; cookies `secure` (persistance impossible en HTTP hors `localhost`).
- **Accessibilité** : couleurs pures saturées, pas de repère pour les daltoniens, aucune information pour les lecteurs d'écran.

---

## 2. Architecture cible

```
Columns/
├─ legacy/                 # version d'origine, intacte, hors build et hors lint
├─ docs/PLAN.md
├─ index.html
├─ public/                 # icônes PWA, favicon
├─ src/
│  ├─ main.ts              # point d'entrée : assemble les modules
│  ├─ app.ts               # machine à états des écrans
│  ├─ core/                # moteur de jeu PUR (aucun accès au DOM, au temps réel ni au hasard global)
│  │  ├─ types.ts          # Cell, Piece, Phase, GameSnapshot…
│  │  ├─ rng.ts            # générateur pseudo-aléatoire à graine (mulberry32)
│  │  ├─ grid.ts           # grille (Int8Array), lecture/écriture, copie
│  │  ├─ piece.ts          # génération, permutation, file des pièces suivantes
│  │  ├─ matcher.ts        # détection des alignements (4 directions)
│  │  ├─ gravity.ts        # tassement des colonnes
│  │  ├─ scoring.ts        # règle de score (legacy par défaut)
│  │  ├─ speed.ts          # niveau ↔ vitesse de chute, progression selon le score
│  │  ├─ events.ts         # émetteur typé (locked, cleared, chain, levelUp, gameOver)
│  │  └─ game.ts           # orchestrateur : update(dtMs), commandes, phases
│  ├─ config/
│  │  ├─ settings.ts       # réglages du joueur : schéma, valeurs par défaut, bornes, validation
│  │  └─ tuning.ts         # réglages INTERNES de difficulté et de rythme (cf. ci-dessous)
│  ├─ storage/store.ts     # localStorage versionné, migrations, import des cookies legacy
│  ├─ render/
│  │  ├─ layout.ts         # calcul de la taille des cases selon la place disponible
│  │  ├─ palette.ts        # couleurs et symboles daltoniens
│  │  └─ canvas-renderer.ts
│  ├─ input/
│  │  ├─ actions.ts        # vocabulaire commun : moveLeft, moveRight, rotate, softDrop(on|off), pause
│  │  ├─ keyboard.ts
│  │  └─ gestures.ts       # Pointer Events : tactile, souris et stylet avec un seul code
│  ├─ ui/                  # écrans HTML (accueil, jeu/HUD, pause, fin, records, réglages, aide)
│  ├─ i18n/                # fr.ts, en.ts, t()
│  ├─ styles/              # CSS (variables, layout, écrans)
│  └─ testing/hooks.ts     # API de test exposée seulement avec ?test=1
├─ tests/
│  ├─ unit/                # Vitest
│  └─ sim/                 # bot + simulations de parties complètes sans navigateur
└─ e2e/                    # Playwright : desktop et mobile
```

### Principes

1. **Moteur pur et déterministe.** `core/` reçoit le temps (`update(dtMs)`) et une graine RNG. Même graine et mêmes commandes = même partie. C'est ce qui permet au bot et aux tests de rejouer des parties exactes et de vérifier des invariants sur des milliers de parties.
2. **Rendu passif.** Le renderer lit un instantané (`GameSnapshot`) et interpole les animations ; il ne modifie jamais l'état.
3. **Entrées unifiées.** Clavier, gestes et boutons produisent les mêmes `actions`. Le moteur ne sait pas d'où vient une commande.
4. **Événements.** Le moteur émet des événements typés ; l'UI, les futurs sons et les futurs jokers s'y abonnent sans toucher au moteur.
5. **Difficulté pilotée par des données.** Aucune constante de difficulté en dur dans le moteur : tout passe par un objet `Tuning` (détail ci-dessous).
6. **Préparé pour la v2 sans l'implémenter.** File de pièces (`peek()` existe, la vue « suivant » n'est pas affichée), valeurs de cellule ≥ 100 réservées aux jokers, règles de correspondance et de score injectables.

### Réglage de la difficulté (`config/tuning.ts`)

Un objet `Tuning` typé, unique source de vérité, injecté dans le moteur à la création d'une partie. Valeurs par défaut dans `DEFAULT_TUNING`, figées et commentées.

| Groupe | Paramètres (valeurs initiales, à calibrer à l'étape 3) |
|---|---|
| Progression | `unit` (`alignments` ou `blocks`) ; `perLevel` (30) ; `maxLevel` (plafond de niveau, ex. 20) ; option `levelThresholds` : tableau explicite de seuils cumulés qui remplace le palier fixe si fourni |
| Vitesse | `gravity` : courbe définie soit par formule (`base`, `factor` ; défaut inspiré de Tetris `secondesParCase = (0,8 − (n−1) × 0,007)^(n−1)`, ajustée pour démarrer près du legacy), soit par une table explicite `cellsPerSecondByLevel[]` ; `maxCellsPerSecond` (plafond) ; `softDropCellsPerSecond` |
| Score | `pointsPerTriplet` (3) ; `chainMultiplier` (fonction ou table : ×1, ×2, ×3…) ; `levelMultiplier` (défaut `niveau + 1`, pour qu'un départ au niveau 0 rapporte quand même) |
| Rythme | délai de verrouillage = max(`lockDelayMinMs`, `lockDelayCells` × durée d'une case ; legacy = 0,5 case) ; durées des animations (`clearMs`, `collapseMsPerCell`, `slideMs`) ; répétition clavier (`dasMs`, `arrMs`) |
| Gestes | seuils de glissement et de tap (en fraction de case et en ms) |

Usage :
- **Préréglages** Facile / Normal / Difficile (repris du legacy) = des `Partial<Tuning>` fusionnés sur les défauts. Le joueur choisit un préréglage, il ne voit pas les paramètres fins.
- **Validation** : `validateTuning()` vérifie la cohérence (courbe croissante, valeurs positives, tables non vides) ; testée.
- **Expérimentation sans recompiler** : en développement et avec `?test=1`, `?tuning=<JSON>` ou `window.__totem.setTuning({...})` surchargent les valeurs ; un panneau de debug (touche `F2`, absent en production) affiche les valeurs courantes, le niveau, la vitesse réelle et les blocs restant avant palier.
- **Comparaison** : `npm run sim -- --tuning=fichier.json` joue les mêmes parties (mêmes graines) avec deux réglages et compare durée moyenne, niveau atteint et score, pour doser la difficulté par mesures et non au jugé.
- Le niveau, le score et les records mémorisent l'identifiant du préréglage utilisé (et une empreinte du `Tuning`), pour ne pas comparer des scores obtenus sous des règles différentes.

### Moteur : phases

```
spawning → falling ⇄ (locking) → resolving:
              clearing (anim) → collapsing (anim) → [nouvelles combinaisons ? clearing, chaîne+1 : spawning]
         → gameOver
paused : drapeau orthogonal, update() ne fait rien
```

Positions en cases (flottants pour la pièce qui tombe). Les animations ont une durée en ms fixée par le moteur (le renderer lit `progress ∈ [0,1]`), donc identiques quelle que soit la fréquence d'affichage.

### Rendu et adaptation à l'écran

- Taille de case = `floor(min(largeurDispo / colonnes, hauteurDispo / lignes))`, recalculée via `ResizeObserver`. Canvas dimensionné en `taille × devicePixelRatio`.
- Unités `dvh` et `env(safe-area-inset-*)` (encoches, barres système). `touch-action: none` uniquement sur la zone de jeu.
- Portrait : HUD (score, niveau) au-dessus du plateau, boutons tactiles optionnels en dessous. Paysage/PC : plateau centré, panneau latéral (score, niveau, emplacement réservé au « suivant » de la v2).
- Blocs : coins arrondis, léger dégradé et reflet ; grille de fond discrète. Palette de 9 couleurs distinguables, plus option « symboles » (forme différente dans chaque couleur).
- `prefers-reduced-motion` : animations raccourcies, pas de secousse.

### Entrées

- **Clavier** : `keydown`/`keyup`, la descente rapide dure tant que la touche est enfoncée ; répétition des déplacements gérée par le jeu (délai initial puis répétition), pas par l'OS.
- **Gestes** (Pointer Events + `setPointerCapture`, inspiré de 2048 qui décide au relâchement) :
  - glissement horizontal : un déplacement chaque fois que le doigt parcourt une largeur de case (glissement long = plusieurs colonnes, suit le doigt) ;
  - glissement vers le bas au-delà d'un seuil : descente rapide jusqu'au relâchement ;
  - glissement vers le haut : une permutation, décidée au relâchement ;
  - tap (< 10 px, < 250 ms) : une permutation ;
  - la direction est verrouillée sur l'axe dominant dès le seuil franchi (pas de diagonale ambiguë).
- **Souris** : mêmes gestes en cliquer-glisser ; clic simple = permuter.
- **Boutons tactiles** (option) : ←, ↓ (maintenu), ⟳, →, pause.

### Stockage local

Une seule clé `jcolumns:v1` : `{ version, settings, highscores[], lastNickname }`. Lecture tolérante (JSON invalide ou champ hors bornes → valeurs par défaut), migrations par numéro de version. Au premier lancement, import des anciens cookies (`highscores`, `pseudo`, `C_*`) s'ils existent sur la même origine. Aucun cookie écrit, aucune requête réseau hors chargement des fichiers.

### PWA

`vite-plugin-pwa` (Workbox) : manifeste (nom, icônes, `display: standalone`, orientation libre, couleurs), précache de tous les fichiers du build, mise à jour discrète (« Nouvelle version disponible — recharger »). `base: './'` pour fonctionner dans n'importe quel sous-dossier (ex. `dolu.fr/columns/`).

---

## 3. Stratégie de test : « jouer soi-même »

| Niveau | Outil | Ce qui est vérifié |
|---|---|---|
| Unitaire | Vitest | rng, grid, matcher (chaque direction, ≥ 4, croisements, bords), gravity, scoring, speed, settings (bornes), store (migrations, JSON corrompu, import cookies), i18n (toutes les clés présentes dans chaque langue), layout, interprétation des gestes (séquences de pointeurs simulées) |
| Propriétés | fast-check | Après chaque résolution, sur grilles et suites de commandes aléatoires : aucune case flottante ; aucun alignement ≥ 3 restant ; cases posées − cases retirées = cases sur la grille ; score croissant ; rien hors grille |
| Scénarios moteur | Vitest + graine fixe | Parties scriptées : verrouillage, chaîne ×2/×3, fin de partie, pause, accélération par palier, parité avec les règles legacy (exemples tirés de `legacy/jcolumns.js`) |
| Simulation | Bot dans `tests/sim` | Un bot (évalue chaque colonne × 3 permutations par heuristique) joue des centaines de parties à graines fixes, en temps simulé, en quelques secondes. Sert à détecter blocages et crashs, et à **calibrer** la progression de vitesse (durée moyenne d'une partie, niveau atteint) |
| E2E | Playwright | Chromium, Firefox, WebKit (desktop) ; Pixel 7 et iPhone 15 (émulation tactile) |
| Visuel | Playwright `toHaveScreenshot` | Captures de référence de chaque écran par profil (PC, mobile portrait, mobile paysage) |
| Accessibilité | `@axe-core/playwright` | Aucune violation sérieuse sur les écrans HTML |

### API de test (`?test=1`, absente du build de production)

`window.__totem` : `getSnapshot()`, `seed(n)`, `setGrid(rows)`, `setPiece(colors, column)`, `setTuning(partial)`, `getTuning()`, `isIdle()`. Combinée à `page.clock` de Playwright pour avancer le temps de façon déterministe.

### Le bot joue dans le vrai navigateur

`e2e/bot.spec.ts` : sur chaque profil, le bot lit l'état via l'API de test, choisit son coup, puis l'exécute **par les vraies entrées** : touches clavier sur desktop, glissements synthétiques (séquences `pointerdown/move/up` de type `touch`) sur mobile, cliquer-glisser souris sur un profil desktop. Assertions : la partie progresse, le score augmente, aucune erreur console, la fin de partie mène à la saisie du record, le record survit à un rechargement. Je relis les captures à chaque étape pour juger le rendu.

---

## 4. Plan d'implémentation, étape par étape

Chaque étape se termine par `npm run check` (lint + types + tests) au vert, et vous est présentée avant la suivante. Je propose un commit par étape, avec votre accord.

### Étape 0 — Socle du projet
1. `git init`, `.gitignore` (`node_modules`, `dist`, `test-results`, `playwright-report`, `.vs`), `.editorconfig`, `.gitattributes` (fins de ligne LF).
2. `package.json` (versions exactes épinglées) : `vite`, `typescript`, `vitest`, `@vitest/coverage-v8`, `fast-check`, `happy-dom`, `@playwright/test`, `@axe-core/playwright`, `vite-plugin-pwa`, `eslint` + `typescript-eslint`, `prettier`.
3. `tsconfig.json` strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint en configuration « flat », Prettier. `legacy/` exclu partout.
4. Scripts : `dev`, `build`, `preview`, `test`, `test:watch`, `coverage`, `sim`, `e2e`, `e2e:update`, `lint`, `format`, `check`.
5. `vite.config.ts` (`base: './'`), `playwright.config.ts` (5 profils, serveur `vite preview`), page vide qui s'affiche.
- **Fini quand** : `npm run check` et `npm run e2e` passent sur une page minimale.

### Étape 1 — Moteur : fondations
1. `rng.ts` (mulberry32, `nextInt(min,max)`), `grid.ts` (largeur, hauteur, `get/set`, `isEmpty`, `clone`, `toRows/fromRows` pour les tests lisibles).
2. `piece.ts` : génération à partir de la RNG, permutation, file des pièces (`next()`, `peek(n)`).
3. `matcher.ts` : renvoie les segments ≥ 3 (direction, cases) et l'ensemble des cases à retirer.
4. `gravity.ts` : tassement instantané + liste des déplacements (pour l'animation).
5. `config/tuning.ts` : type `Tuning`, `DEFAULT_TUNING`, préréglages, fusion, `validateTuning()`.
6. `scoring.ts` : points par triplet × chaîne × multiplicateur de niveau, tous lus dans le `Tuning`, derrière une interface `ScoringRule`.
7. `speed.ts` : `cellsPerSecond(level, tuning)` (formule ou table, plafond) ; `levelFor(blocksCleared, startLevel, tuning)` (palier fixe ou seuils explicites) ; `toNextLevel(...)` pour le HUD.
- **Tests** : unitaires complets de chaque module + propriétés matcher/gravity. Pour `speed`/`scoring` : courbe strictement croissante jusqu'au plafond, passage de palier exact, niveau de départ respecté, table explicite prioritaire sur la formule, multiplicateurs appliqués dans le bon ordre, `Tuning` invalide rejeté. Couverture ≥ 95 % sur `core/`.

### Étape 2 — Moteur : orchestrateur `Game`
1. `game.ts` : phases (cf. §2), `update(dtMs)`, commandes (`moveLeft/Right`, `rotate`, `setSoftDrop`, `pause/resume`), délai de verrouillage, chaînes, fin de partie.
2. `getSnapshot()` immuable pour le renderer (grille, pièce, positions interpolées, phase, progression d'animation, cases en cours de retrait, chaîne, score, niveau).
3. `events.ts` et émission des événements.
- **Tests** : scénarios scriptés à graine fixe ; propriétés sur suites de commandes aléatoires ; test de parité avec des cas issus du legacy (score d'une ligne de 4, d'un « L », d'une chaîne double).

### Étape 3 — Simulation et bot
1. `tests/sim/bot.ts` : énumère les placements (colonne × permutation), simule sur une copie, note (cases retirées, hauteur, trous, alignements de 2 en préparation).
2. `tests/sim/run.ts` (`npm run sim`) : N parties à graines fixes, statistiques (score, durée simulée, niveau max, chaîne max).
3. Option `--tuning=<fichier.json>` et mode comparaison (mêmes graines, deux réglages, tableau des écarts).
4. Calibrage de `DEFAULT_TUNING` et des préréglages Facile/Normal/Difficile : `perLevel`, courbe de vitesse, plafond. Objectif : une partie « moyenne » du bot dure plusieurs minutes et atteint des niveaux où il finit par perdre. Valeurs retenues et mesures documentées dans `tuning.ts`.
- **Tests** : 200 parties sans exception ni invariant violé (exécuté dans `npm test`, < 10 s).

### Étape 4 — Paramètres, stockage, i18n
1. `settings.ts` : schéma, défauts, bornes (lignes 10–20, colonnes 5–12, couleurs 5–9, niveau de départ 0–9, préréglage de difficulté, colonne d'apparition, langue, boutons tactiles, symboles). Les paramètres fins de `Tuning` ne sont pas exposés au joueur.
2. `store.ts` : clé versionnée, lecture tolérante, migrations, import des cookies legacy, records (top 10, tri, égalités, date, paramètres de partie).
3. `i18n` : `fr.ts` (source), `en.ts` typé sur les mêmes clés, détection via `navigator.languages`.
- **Tests** : bornes, JSON corrompu, migration, import de cookies (formats réels du legacy), insertion de records, clés i18n complètes.

### Étape 5 — Rendu canvas
1. `layout.ts` : taille des cases, centrage, HiDPI, paysage/portrait.
2. `palette.ts` : 9 couleurs (contraste vérifié sur fond sombre), symboles optionnels.
3. `canvas-renderer.ts` : fond et grille, cases posées, pièce en chute (glissement en cascade), animation de retrait, tassement, chaîne « ×N », reduced-motion. Boucle `requestAnimationFrame` qui appelle `game.update(dt)` puis `render(snapshot)` ; `dt` plafonné (onglet réveillé).
- **Tests** : unitaires de `layout` ; e2e visuels avec états imposés via `setGrid` (plateau plein, retrait en cours, chaîne).

### Étape 6 — Entrées
1. `keyboard.ts` : correspondance des touches, répétition gérée par le jeu, descente maintenue, ignorée quand un champ texte a le focus.
2. `gestures.ts` : machine à états du pointeur (seuils proportionnels à la taille des cases, verrouillage d'axe, multi-colonnes, tap), un seul pointeur actif, annulation propre (`pointercancel`).
3. Boutons tactiles (optionnels) avec appui maintenu pour ↓.
- **Tests** : unitaires des gestes sur séquences de pointeurs synthétiques ; e2e clavier (desktop) et glissements (mobile) sur une pièce imposée.

### Étape 7 — Interface et parcours
1. Écrans HTML accessibles (titres, `aria-live` pour score et fin de partie, focus géré, navigation clavier) : accueil, jeu + HUD (score, niveau, jauge des blocs restant avant le palier suivant, annonce « Niveau N » au passage), pause, fin de partie avec saisie du pseudo, records (avec remise à zéro, demandée dans le TODO legacy), réglages (valeurs affichées, « valeurs par défaut », préréglages Facile/Normal/Difficile repris du legacy), aide (clavier et gestes, avec visuels).
2. `app.ts` : machine à états des écrans ; pause automatique sur `visibilitychange` et `blur`.
3. Thème sombre, mise en page responsive, safe areas, aucune dépendance CSS externe, polices système.
- **Tests** : e2e de chaque parcours (démarrer, pause/reprise/arrêt, fin → record → liste, réglages persistés après rechargement, changement de langue) ; axe-core ; captures de référence.

### Étape 8 — PWA et build
1. Manifeste, icônes (SVG source → PNG 192/512 + maskable), service worker, invite de mise à jour.
2. Build de production sans l'API de test ; vérification de la taille.
- **Tests** : e2e « hors ligne » (service worker actif, `context.setOffline(true)`, rechargement, partie jouable) ; vérification du manifeste.

### Étape 9 — Recette en jouant
1. `e2e/bot.spec.ts` sur les 5 profils (cf. §3).
2. Revue des captures : desktop 1920×1080 et 1280×800, mobile portrait et paysage, petite hauteur (iPhone SE).
3. Corrections, ajustement des seuils de gestes et des durées d'animation.
4. Rapport : statistiques de simulation, captures, écarts assumés avec le legacy.

### Étape 10 — Documentation
1. `README.md` (jouer, développer, déployer).
2. Réécriture de `CLAUDE.md` pour la nouvelle architecture.
3. Liste des pistes v2 (prochain groupe, jokers, sons, thèmes) rattachées aux points d'extension prévus.

---

## 5. Points ouverts (valeurs par défaut retenues sauf avis contraire)

1. **Progression** *(validé)* : paliers à la Tetris, comptés en alignements (30 par niveau) ou en blocs effacés selon `progression.unit`, courbe de vitesse accélérée, score × niveau. Tous les dosages vivent dans `Tuning` (interne), calibrés à l'étape 3 et ajustables sans toucher au moteur.
2. **Records** : top 10 et pseudo de 12 caractères (au lieu de 9 et 5). Les records ne sont pas séparés par configuration, mais chaque record mémorise ses paramètres.
3. **Boutons tactiles** : désactivés par défaut (les gestes suffisent), activables dans les réglages.
4. **Nom affiché** : « jColumns » et la mention « { dolu.fr } » de l'écran d'accueil sont conservés. *Mise à jour : renommé « Totem » le 18/10/2026, mention « { dolu.fr } » conservée.*
5. **Hébergement** : le build est un dossier statique relatif, déployable tel quel (dolu.fr, GitHub Pages…). Pas de CI prévue en v1 ; une GitHub Action pourra être ajoutée.

---

## 6. Calibrage (étape 3) et constats

Mesures `npm run sim` (40 parties par ligne, plateau 6×15, 6 couleurs, niveau de départ 0). Le bot imite un joueur : temps de réflexion, intervalle minimal entre actions, erreurs occasionnelles (profils débutant, moyen, expert dans `tests/sim/driver.ts`).

| Préréglage | Débutant | Moyen | Expert |
|---|---|---|---|
| Facile | 35 min, niv. 5 | 17 min, niv. 11 | 20 min, niv. 17 |
| Normal | 32 min, niv. 6 | 13 min, niv. 12 | 15 min (p90 26), niv. 18 |
| Difficile | 18 min, niv. 6 | 8 min, niv. 11 | 9 min, niv. 17 |

- **Après les retours de jeu** (animations ralenties comme l'original : disparition 650 ms, chute 160 ms par case, descente rapide temporisée à 250 ms puis 12 cases/s) : moyen ≈ 18 min (niveau 12), expert ≈ 22 min (niveau 19), débutant inchangé. Les parties s'allongent sans changer les niveaux atteints ; on peut raccourcir les paliers (`perLevel`) si besoin.
- **Paliers de 10 alignements, chaînes comptées une seule fois** (demande du 18/10/2026 ; niveaux affichés à partir de 1) : moyen ≈ 8,6 min (≈ 35 s par niveau), expert ≈ 14 min et niveau maximal vers 10 min ; facile 11 / 24 min ; difficile 5,7 / 6,7 min. Le bot enchaîne peu de chaînes : chez un joueur qui en réalise, la montée en niveau est plus lente.
- Le débutant du bot n'utilise jamais la descente rapide : ses parties sont longues mais il progresse peu.
- **Unité de progression** : chez le bot, un alignement vaut 3,03 blocs en moyenne, donc 30 alignements ≈ 90 blocs donnent des parties équivalentes. La différence portera sur les humains qui font de grands alignements (une ligne de 5 compte 1, pas 5/3).
- **Niveau 0** : 1 case/s au lieu de 0,625 (legacy), sinon 24 s par pièce sur 15 lignes. Valeur legacy retrouvable avec `speed.gravity.scale = 1.6`.
- **Réglages du joueur et difficulté** (joueur moyen, Normal), mesuré avant puis après l'adaptation de la vitesse à la hauteur du plateau (`speed.referenceHeight = 15`, temps de traversée constant) :

  | Plateau | Avant | Après |
  |---|---|---|
  | 15 lignes, 6 couleurs | 12 min | 12 min |
  | 20 lignes, 6 couleurs | 18 min | 14 min |
  | 20 lignes, 5 couleurs | sans fin | 40 min |
  | 10 lignes, 6 couleurs | — | 3 min (moins de place pour stocker) |
  | 15 lignes, 5 couleurs | 19 min | 19 min |
  | 15 lignes, 9 couleurs | 1,6 min | 1,6 min |

  **Pour la v2** : le nombre de couleurs reste le facteur dominant ; piste : facteur de vitesse ou de progression selon le nombre de couleurs (et éventuellement la largeur).

---

## 7. Recette en jouant (étape 9)

**Le bot joue en temps réel dans les vrais navigateurs** (`e2e/bot.spec.ts`), uniquement par les entrées d'un joueur, et vérifie après chaque pièce qu'elle a atterri dans la colonne visée avec les bonnes couleurs :

| Profil | Entrées | Partie de 75 s | Précision des commandes |
|---|---|---|---|
| Chromium PC | clavier | 55 pièces, 201 points, niveau 1 | 18/18 |
| WebKit PC | clavier | 48 pièces, 141 points | 16/16 |
| Firefox PC | souris seule | 54 pièces, 201 points | 17/17 |
| Android | doigt (toucher, glissements) | 46 pièces, 135 points | 15/15 |
| iPhone | doigt | 46 pièces, 135 points | 15/15 |

Seconde partie par profil jusqu'à la fin (9 couleurs, niveau 9) : fin de partie, record saisi, conservé après rechargement. Seuils des gestes et durées d'animation conservés : aucune commande manquée ni en trop.

**Formats d'écran** (`e2e/viewports.spec.ts`) : PC 1920×1080, 1280×800, 1024×768, iPhone SE, téléphone paysage, iPad mini portrait et paysage. Contrôles : aucun bouton hors de l'écran, cibles tactiles ≥ 44 px, HUD sans chevauchement et cliquable, plateau qui remplit sa zone.

**Défauts trouvés pendant la recette, corrigés** :
- iPhone SE : bouton pause hors de l'écran (la colonne de la zone de jeu s'élargissait au texte du HUD) ;
- téléphone en paysage : menu d'accueil sous le pli → logo à gauche, menu à droite ;
- PC : HUD éloigné du plateau → calé contre lui, plateau centré ; la zone du plateau recouvrait alors le bouton pause (non cliquable à la souris) → ordre d'empilement explicite ;
- titre « Partie terminée » sur deux lignes sur PC → taille réduite dans les cartes superposées ;
- tests visuels trop tolérants sur thème sombre (un panneau déplacé passait inaperçu) → tolérance par pixel abaissée à 0,1, captures toutes régénérées.

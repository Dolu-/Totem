# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Totem (anciennement jColumns, renommé pour éviter toute confusion avec la marque « Columns » : ne pas réintroduire ce nom) : jeu de blocs colorés à aligner en TypeScript (Vite), rendu canvas, menus HTML, PWA installable et hors ligne, stockage strictement local. Code, commentaires, textes et messages de commit en **français**. Historique et décisions : `docs/PLAN.md` (équivalence avec l'ancienne version, calibrage, recette) ; pistes v2 : `docs/ROADMAP.md`. `legacy/` contient la version d'origine, référence d'équivalence, à ne pas modifier (`jcolumns.css` y est en Windows-1252).

## Commandes

- `npm run dev` ; `npm run build` (→ `dist/`, chemins relatifs, service worker) ; `npm run preview`.
- `npm run check` : lint + Prettier + types + tests unitaires. Doit renvoyer 0 avant tout commit (vérifier le code de retour, pas un filtrage de la sortie).
- Tests unitaires (Vitest, `tests/**/*.test.ts`, y compris `tests/sim/`) : `npx vitest run tests/unit/core/game.test.ts`, `-t "nom du test"`. Fichiers DOM : en-tête `// @vitest-environment happy-dom`. Couverture minimale imposée sur `core`, `config`, `storage`, `i18n`, `input` (`npm run coverage`).
- `npm run e2e` (Playwright, ~3 min, 5 profils : `desktop-chromium|firefox|webkit`, `mobile-android`, `mobile-iphone`) ; un profil : `npx playwright test --project=desktop-chromium e2e/ui.spec.ts`. Tourne sur un build `vite build --mode e2e` (→ `dist-e2e/`, `.env.e2e`) qui expose l'API de test.
- `npm run e2e:update` : régénère les captures (`e2e/*-snapshots/`) après un changement visuel voulu, puis **relire les images**. Si une capture doit changer mais n'est pas réécrite, forcer avec `--update-snapshots=all`.
- `npm run e2e:recette` (~4 min, tests `@recette`, exclus de `e2e`) : le bot joue en temps réel par les vraies entrées et mesure la précision des commandes.
- `npm run sim -- [--games N] [--profile casual] [--set chemin=valeur] [--tuning a.json --compare b.json]` : parties simulées du bot, pour doser la difficulté.
- `npm run icons` : régénère `public/icon*` depuis la palette.
- Sous WSL : WebKit exige `sudo env "PATH=$PATH" npx playwright install-deps webkit`.

## Architecture

Couches, de la plus pure à la plus concrète :

- **`src/core/`** : moteur pur et déterministe. ESLint y interdit DOM, `Math.random`, `Date.now`, minuteries. Le temps entre par `Game.update(dtMs)` (un grand pas équivaut à plusieurs petits), le hasard par une graine (`Rng`, deux suites : pièces et colonnes d'apparition). `Game` enchaîne les phases `falling → clearing → collapsing → (chaîne) → falling | over`, émet des événements typés (`events.on('clear' | 'levelUp' | 'gameOver'…)`) et expose un `snapshot()` immuable. Grille : `Int16Array`, y = 0 en haut ; pièce : `colors[0]` = case du bas, `y` continu de la case du bas. Les tests écrivent les grilles en texte (`Grid.fromRows(['..1', '012'])`).
- **`src/config/tuning.ts`** : unique source des dosages (progression en alignements ou en blocs, courbe de vitesse formule ou table, plafond, vitesse adaptée à la hauteur du plateau, score × chaîne × niveau, délais, seuils des gestes, préréglages). Aucune constante de difficulté en dur ailleurs. Toute modification se mesure avec `npm run sim` ; les valeurs calibrées et les mesures sont commentées en tête de `DEFAULT_TUNING` et dans `docs/PLAN.md` §6. `config/settings.ts` : réglages du joueur (bornés, validés à la lecture).
- **`src/render/`** : `layout.ts` (taille de case entière en pixels physiques), `scene.ts` (description pure de l'image : animations interpolées, testable), `style.ts` (aspect rétro réglable : crans de chute, de tassement et de glissement en cascade, arrondi et espacement des carrés, cadre ; surchargeable sans recompiler par `?style=fallStepsPerCell:3,…`, transmis par `App` → `GameView` → scène et peintre), `canvas-renderer.ts` (peint la scène, blocs en cache), `loop.ts` (requestAnimationFrame, pas plafonné).
- **`src/game-view.ts`** : canvas + boucle. Trois abonnements : `onTick(dt)` (horloge des entrées, réelle ou pilotée par les tests), `onDraw(game)` (HUD), `onLayout(layout)` (taille du plateau → variables CSS `--board-width` / `--board-height` : le HUD s'aligne sur le plateau — ligne au-dessus en général, colonne verticale à gauche sur téléphone en paysage, `@media (orientation: landscape) and (max-height: 500px)`). `refreshLayout()` à l'affichage de la zone de jeu : WebKit ne signale pas ce changement au ResizeObserver.
- **Descente rapide** : `Game.setSoftDrop(actif)` = maintenue (touche, bouton, doigt posé), persiste d'une pièce à l'autre tant qu'elle est tenue ; `Game.softDropUntilLock()` = ponctuelle (geste vif), s'arrête à la pose.
- **`src/input/`** : clavier (par `event.code`, répétition gérée par le jeu via `RepeatTimer`, pas par l'OS), gestes (Pointer Events, un seul code doigt/souris/stylet, axe verrouillé, décision au relâchement), boutons à l'écran. Tout passe par `ActionSink` : le moteur ignore l'origine des commandes.
- **`src/app.ts`** : machine à états des écrans (`home`, `playing`, `paused`, `gameOver`, `scores`, `settings`, `help`), pause automatique en arrière-plan, bandeaux (jamais affichés en pleine partie). Écrans construits par `ui/screens.ts` (fonctions pures + rappels, reconstruites au changement de langue), petit utilitaire DOM `ui/dom.ts` (`h()`), pas de framework.
- **`src/storage/store.ts`** : une clé localStorage versionnée (`totem:v1`, reprise automatique de l'ancienne clé `jcolumns:v1` via `PREVIOUS_STORAGE_KEYS`), lecture tolérante, repli en mémoire, migrations dans `sanitizeData`. Import unique des cookies de l'ancienne version (`legacy-cookies.ts`).
- **`src/i18n/`** : `fr.ts` est la référence (clés plates, `{param}`, pluriels `.one`/`.other`) ; `en.ts` est typé sur les mêmes clés et un test vérifie clés et paramètres.
- **`src/testing/hooks.ts`** : `window.__totem` (instantané, grille et pièce imposées, temps figé `setManualTime`/`advance`, nouvelle partie avec surcharge du tuning…), chargé seulement si `VITE_TEST_HOOKS === 'true'` (éliminé du build de production : vérifiable avec `grep -r __totem dist/`).
- **PWA** : `vite-plugin-pwa` (configuration dans `vite.config.ts`), enregistrement dans `src/pwa.ts`, seulement en production. Bloqué dans les tests e2e sauf `e2e/pwa.spec.ts` (sinon le bandeau « hors ligne » perturbe les captures).

## Conventions et pièges

- Imports relatifs **avec l'extension `.ts`** et `erasableSyntaxOnly` (pas d'`enum`, pas de propriétés de paramètre) : le même code tourne sous Vite et directement sous Node (`npm run sim`, `npm run icons`).
- TypeScript strict avec `noUncheckedIndexedAccess` et `exactOptionalPropertyTypes` ; ESLint `strictTypeChecked` (pas de `!`, pas d'assertion superflue). TypeScript reste en 6.0.x tant que `typescript-eslint` ne supporte pas la 7. Dépendances épinglées.
- Nouveau texte d'interface : l'ajouter à `fr.ts` **et** `en.ts`. Nouveau paramètre de difficulté : dans `Tuning` + `DEFAULT_TUNING` + `validateTuning` + test.
- CSS : grilles à colonne `minmax(0, 1fr)` (une colonne `auto` s'élargit au contenu le plus large et pousse des boutons hors de l'écran) ; couches empilées explicitement (`.game-layer` 0, `.screen-layer` 1, `.notice-bar` 2) ; effets de survol sous `@media (hover: hover)` (sinon « collés » au doigt).
- Tests e2e : textes français (`locale: 'fr-FR'`) ; temps figé pour les situations précises (`openGame`, `setGrid`, `setPiece`, `advanceUntil` dans `e2e/helpers.ts`) ; contrôles d'accessibilité (axe) et de débordement après la fin des animations. Les échecs « Tearing down context exceeded the timeout » signalent une machine saturée, pas un bug.

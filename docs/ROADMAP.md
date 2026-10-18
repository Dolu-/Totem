# Totem — pistes pour la v2 et au-delà

La v1 est terminée (équivalence fonctionnelle avec l'ancienne version, plus les améliorations décrites dans `PLAN.md`). Chaque piste ci-dessous indique les points d'extension déjà prévus dans le code.

## Fonctionnalités annoncées

### 1. Prochain groupe visible
- **Déjà en place** : `PieceQueue.peek(n)` (`src/core/piece.ts`) ; `GameOptions.previewCount` et `snapshot().nextPieces` (`src/core/game.ts`). Consulter les pièces suivantes ne change pas la partie (suites aléatoires séparées), c'est testé.
- **À faire** : un réglage « Afficher la pièce suivante » (`settings.ts`) ; un emplacement dans le HUD (`ui/hud.ts`), dessiné par un petit canvas réutilisant le cache de blocs de `CanvasRenderer` ; textes FR/EN.
- **Équilibrage** : voir le suivant aide beaucoup ; mesurer avec `npm run sim` (le bot peut l'exploiter via `planMove`) et compenser éventuellement par un multiplicateur de score réduit ou un palier plus court.

### 2. Blocs joker
- **Déjà en place** : valeurs de case `≥ JOKER_BASE` (100) réservées (`src/core/types.ts`), ignorées par la détection par défaut ; règle de regroupement injectable `findMatches(grid, { sameGroup })` (`src/core/matcher.ts`) ; règle de score remplaçable (`ScoringRule`, `src/core/scoring.ts`) ; événements du moteur pour déclencher effets et sons ; rendu des valeurs hors palette en gris (`blockStyle`).
- **Idées** : joker « toutes couleurs » (s'aligne avec n'importe quelle couleur → `sameGroup`) ; bombe (efface les cases voisines à la pose) ; « couleur » (efface toutes les cases de la couleur touchée, comme le bijou magique de Columns) ; joker de ralentissement temporaire.
- **À faire** : probabilité d'apparition et effets dans `Tuning` (`jokers: { frequency, kinds }`), génération dans `PieceQueue`, phase de résolution des effets dans `Game` avant la recherche d'alignements, sprites dédiés dans `canvas-renderer.ts`, entrée dans l'aide.

## Équilibrage

- **Nombre de couleurs** : facteur dominant de la difficulté (9 couleurs ≈ 1,6 min pour un joueur moyen, 5 couleurs ≈ 19 min ; mesures dans `PLAN.md` §6). Piste : facteur de vitesse ou de progression selon `colorCount` (et éventuellement la largeur), dans `Tuning`, calibré avec `npm run sim`.
- **Progression** : la règle « alignements » est en place ; à réévaluer avec de vrais joueurs (les grands alignements et les chaînes sont plus fréquents chez un humain que chez le bot).
- **Records par configuration** : chaque record mémorise déjà ses réglages et l'empreinte du tuning (`HighScore.context`) ; on peut filtrer ou séparer les tableaux par configuration.

## Confort et finition

- Sons et retour haptique (`navigator.vibrate`) branchés sur les événements du moteur, avec réglage de volume.
- Descente immédiate (« hard drop ») en option, touches configurables (deux souhaits de la liste TODO d'origine).
- Thèmes de couleurs (la palette est centralisée dans `src/render/palette.ts`).
- Statistiques personnelles (parties jouées, meilleure chaîne, temps de jeu), toujours en local.

## Technique

- Intégration continue (GitHub Actions) : `npm run check` et `npm run e2e` sur Chromium ; la recette `@recette` à la demande.
- Passage à TypeScript 7 quand `typescript-eslint` le prendra en charge.
- Vérifier à la main l'installation sur un vrai iPhone (le test hors ligne automatisé ne tourne que sur Chromium).

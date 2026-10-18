# Totem

Un jeu de blocs colorés dans le navigateur, sur PC et sur mobile, sans rien installer.

Des totems de 3 blocs tombent ; alignez au moins 3 blocs de même couleur (horizontalement, verticalement ou en diagonale) pour les faire disparaître. Les blocs au-dessus retombent et peuvent déclencher des réactions en chaîne, qui multiplient les points. Le niveau monte avec les alignements réalisés, et la chute accélère.

- **Partout** : PC, téléphone, tablette ; le plateau s'adapte à l'écran, en portrait comme en paysage.
- **Installable et hors ligne** (PWA) : « Ajouter à l'écran d'accueil », puis jouable sans réseau.
- **Local uniquement** : réglages et records restent sur l'appareil (aucun compte, aucun envoi de données).
- **Accessible** : navigation au clavier, lecteurs d'écran, symboles pour distinguer les couleurs, animations réduites si le système le demande.
- **Français et anglais**.

## Jouer

| | Clavier | Doigt ou souris |
|---|---|---|
| Déplacer | ← → (ou Q/D, A/D) | glisser à gauche / à droite (un long glissement déplace de plusieurs colonnes) |
| Permuter les couleurs | ↑ (ou Z/W, X) | toucher, ou glisser vers le haut |
| Accélérer la descente | ↓ ou Espace, maintenu | glisser vers le bas (un geste vif accélère jusqu'à la pose) |
| Pause | P ou Échap | bouton pause |

Des boutons de contrôle à l'écran peuvent être activés dans les réglages. Les réglages permettent aussi de choisir la taille du plateau (10 à 20 lignes, 5 à 12 colonnes), le nombre de couleurs (5 à 9), le niveau de départ, la difficulté (facile, normal, difficile) et la langue.

## Développer

Prérequis : Node.js 22 ou plus récent.

```sh
npm ci                 # dépendances (versions épinglées)
npx playwright install # navigateurs des tests de bout en bout
npm run dev            # serveur de développement : http://localhost:5173
```

| Commande | Rôle |
|---|---|
| `npm run check` | lint, formatage, types et tests unitaires : à garder au vert |
| `npm test` | tests unitaires et simulations (Vitest) |
| `npm run coverage` | idem avec couverture de code |
| `npm run e2e` | tests de bout en bout (Playwright) : Chrome, Firefox, Safari, Android, iPhone |
| `npm run e2e:update` | régénère les captures de référence après un changement visuel voulu |
| `npm run e2e:recette` | recette longue : un bot joue de vraies parties dans chaque navigateur |
| `npm run sim` | statistiques de parties jouées par le bot (calibrage de la difficulté) |
| `npm run icons` | régénère les icônes de l'application |
| `npm run build` | build de production dans `dist/` |

### Organisation

```
src/
  core/       moteur de jeu pur et déterministe (aucun accès au DOM)
  config/     réglages du joueur (settings) et dosage interne de la difficulté (tuning)
  render/     rendu canvas : mise en page, scène, peinture, boucle d'animation
  input/      clavier, gestes (Pointer Events), boutons à l'écran
  ui/         écrans HTML, HUD, bandeau d'information
  storage/    stockage local versionné, import des records de l'ancienne version
  i18n/       textes français et anglais
  app.ts      enchaînement des écrans
tests/        tests unitaires et simulations (bot)
e2e/          tests de bout en bout
docs/         plan de modernisation, pistes pour la v2
```

### Doser la difficulté

Tous les dosages (paliers de niveau, courbe de vitesse, score, délais, seuils des gestes) sont dans `src/config/tuning.ts`. Pour les comparer avant de les changer, sur les mêmes parties jouées par le bot :

```sh
npm run sim -- --set progression.perLevel=25
npm run sim -- --tuning essai.json --compare autre.json --games 100
```

## Publier

`npm run build` produit un site statique autonome dans `dist/`, avec des chemins relatifs : il se dépose tel quel sur n'importe quel hébergement, à la racine ou dans un sous-dossier (par exemple `https://dolu.fr/totem/`).

- **HTTPS obligatoire** pour le fonctionnement hors ligne (service worker).
- **Records des versions précédentes** : ceux de l'ancienne version (jColumns, cookies) et ceux enregistrés avant le renommage en Totem sont repris automatiquement au premier lancement, à condition de publier sur le **même domaine** (les navigateurs isolent les données par site).
- **Mises à jour** : à chaque nouvelle publication, les joueurs se voient proposer « Mettre à jour » hors partie.

## Licence

MIT — voir [LICENSE](LICENSE). © 2011-2026 Ludovic L.

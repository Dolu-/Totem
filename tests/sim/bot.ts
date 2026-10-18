/**
 * Bot joueur : choisit, pour la pièce courante, une colonne et un nombre de
 * permutations en simulant chaque placement possible sur une copie de la grille.
 *
 * Pur (aucune dépendance au temps ni au DOM) : utilisé par les simulations
 * (`npm run sim`) et par les tests e2e, où il pilote le vrai navigateur.
 */
import { collapse, removeCells } from '../../src/core/gravity.ts';
import { Grid } from '../../src/core/grid.ts';
import { findMatches } from '../../src/core/matcher.ts';
import { rotatePiece } from '../../src/core/piece.ts';
import type { Rng } from '../../src/core/rng.ts';
import { EMPTY, type CellValue } from '../../src/core/types.ts';

/** Ce que le bot voit de la partie (construit depuis un instantané ou depuis le navigateur). */
export interface BotView {
  readonly width: number;
  readonly height: number;
  get(x: number, y: number): CellValue;
  readonly piece: { readonly colors: readonly CellValue[]; readonly x: number; readonly y: number };
}

export interface BotWeights {
  /** Bonus par bloc effacé. */
  readonly cleared: number;
  /** Bonus par rang de chaîne au-delà du premier. */
  readonly chain: number;
  /** Pénalité par case de hauteur totale. */
  readonly aggregateHeight: number;
  /** Pénalité sur la colonne la plus haute (au carré). */
  readonly maxHeight: number;
  /** Pénalité par différence de hauteur entre colonnes voisines. */
  readonly bumpiness: number;
  /** Bonus par paire de cases voisines de même couleur (préparation d'alignements). */
  readonly pairs: number;
}

export const DEFAULT_WEIGHTS: BotWeights = {
  cleared: 10,
  chain: 15,
  aggregateHeight: 0.5,
  maxHeight: 0.4,
  bumpiness: 0.6,
  pairs: 2,
};

export interface Plan {
  readonly rotations: number;
  readonly targetX: number;
  readonly value: number;
}

export interface PlacementOutcome {
  readonly grid: Grid;
  readonly cleared: number;
  readonly chain: number;
  readonly windows: number;
}

/** Copie la vue en grille modifiable. */
export function viewToGrid(view: BotView): Grid {
  const grid = new Grid(view.width, view.height);
  for (let y = 0; y < view.height; y += 1) {
    for (let x = 0; x < view.width; x += 1) {
      const value = view.get(x, y);
      if (value !== EMPTY) grid.set(x, y, value);
    }
  }
  return grid;
}

/** Pose la pièce dans la colonne `x` et résout toutes les chaînes ; `null` si elle déborde. */
export function simulatePlacement(
  grid: Grid,
  colors: readonly CellValue[],
  x: number,
): PlacementOutcome | null {
  const bottom = grid.topOf(x) - 1;
  if (bottom - (colors.length - 1) < 0) return null;
  let next = grid.clone();
  colors.forEach((color, i) => {
    next.set(x, bottom - i, color);
  });
  let cleared = 0;
  let chain = 0;
  let windows = 0;
  for (;;) {
    const match = findMatches(next);
    if (match.cells.length === 0) break;
    chain += 1;
    cleared += match.cells.length;
    windows += match.windowCount * chain;
    next = collapse(removeCells(next, match.cells)).grid;
  }
  return { grid: next, cleared, chain, windows };
}

/** Évaluation heuristique d'une grille obtenue après un placement. */
export function evaluate(outcome: PlacementOutcome, weights: BotWeights): number {
  const { grid } = outcome;
  const heights = Array.from({ length: grid.width }, (_, x) => grid.height - grid.topOf(x));
  const aggregate = heights.reduce((a, b) => a + b, 0);
  const max = Math.max(...heights);
  let bumpiness = 0;
  for (let x = 1; x < heights.length; x += 1) {
    bumpiness += Math.abs((heights[x] ?? 0) - (heights[x - 1] ?? 0));
  }
  let pairs = 0;
  for (const { x, y } of grid.filledPositions()) {
    const value = grid.get(x, y);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ] as const) {
      if (grid.get(x + dx, y + dy) === value) pairs += 1;
    }
  }
  // Danger : les 4 dernières lignes sont très coûteuses (risque de fin de partie).
  const danger = Math.max(0, max - (grid.height - 4));
  return (
    outcome.cleared * weights.cleared +
    Math.max(0, outcome.chain - 1) * weights.chain -
    aggregate * weights.aggregateHeight -
    max * max * weights.maxHeight -
    bumpiness * weights.bumpiness +
    pairs * weights.pairs -
    danger * 1000
  );
}

/** Colonnes atteignables depuis la position actuelle (chemin libre sous la pièce, avec une marge). */
export function reachableColumns(view: BotView, grid: Grid): number[] {
  const { x: start, y } = view.piece;
  const bottomRow = Math.ceil(y) + 1;
  const free = (x: number): boolean => grid.topOf(x) > bottomRow;
  const columns = [start];
  for (const dir of [-1, 1]) {
    for (let x = start + dir; x >= 0 && x < grid.width && free(x); x += dir) columns.push(x);
  }
  return columns.sort((a, b) => a - b);
}

/**
 * Meilleur placement pour la pièce courante, ou `null` si aucun placement ne
 * survit. `blunder` (0 à 1) : probabilité de choisir au hasard parmi les placements valides.
 */
export function planMove(
  view: BotView,
  weights: BotWeights = DEFAULT_WEIGHTS,
  options: { readonly rng?: Rng; readonly blunder?: number } = {},
): Plan | null {
  const grid = viewToGrid(view);
  const candidates: Plan[] = [];
  let piece = { colors: view.piece.colors };
  for (let rotations = 0; rotations < view.piece.colors.length; rotations += 1) {
    for (const targetX of reachableColumns(view, grid)) {
      const outcome = simulatePlacement(grid, piece.colors, targetX);
      if (outcome) candidates.push({ rotations, targetX, value: evaluate(outcome, weights) });
    }
    piece = rotatePiece(piece);
  }
  if (candidates.length === 0) return null;
  const { rng, blunder = 0 } = options;
  if (rng && blunder > 0 && rng.next() < blunder) {
    return candidates[rng.nextInt(0, candidates.length - 1)] ?? null;
  }
  return candidates.reduce((best, c) => (c.value > best.value ? c : best));
}

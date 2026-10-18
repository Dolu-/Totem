import { Grid } from './grid.ts';
import { EMPTY, type CellValue, type Position } from './types.ts';

/** Déplacement d'une case lors du tassement (utilisé pour l'animation). */
export interface CellMove {
  readonly x: number;
  readonly fromY: number;
  readonly toY: number;
  readonly value: CellValue;
}

/** Nouvelle grille où les cases indiquées sont vidées. */
export function removeCells(grid: Grid, cells: readonly Position[]): Grid {
  const next = grid.clone();
  for (const { x, y } of cells) next.set(x, y, EMPTY);
  return next;
}

/**
 * Fait tomber chaque case jusqu'à reposer sur le fond ou sur une autre case,
 * en conservant l'ordre dans la colonne. Renvoie une nouvelle grille et la
 * liste des cases déplacées (vide si rien ne bouge).
 */
export function collapse(grid: Grid): { grid: Grid; moves: CellMove[] } {
  const next = new Grid(grid.width, grid.height);
  const moves: CellMove[] = [];
  for (let x = 0; x < grid.width; x += 1) {
    let target = grid.height - 1;
    for (let y = grid.height - 1; y >= 0; y -= 1) {
      const value = grid.get(x, y);
      if (value === EMPTY) continue;
      next.set(x, target, value);
      if (target !== y) moves.push({ x, fromY: y, toY: target, value });
      target -= 1;
    }
  }
  return { grid: next, moves };
}

/** Vrai si aucune case ne repose sur du vide. */
export function isSettled(grid: Grid): boolean {
  for (let x = 0; x < grid.width; x += 1) {
    for (let y = grid.topOf(x); y < grid.height; y += 1) {
      if (grid.isEmpty(x, y)) return false;
    }
  }
  return true;
}

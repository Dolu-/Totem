import type { Grid } from './grid.ts';
import { isColor, type CellValue, type Position } from './types.ts';

export type Direction = 'horizontal' | 'vertical' | 'diagonalDown' | 'diagonalUp';

/** Pas (dx, dy) de chaque direction. `diagonalDown` = \ ; `diagonalUp` = /. */
const STEPS: Readonly<Record<Direction, readonly [number, number]>> = {
  horizontal: [1, 0],
  vertical: [0, 1],
  diagonalDown: [1, 1],
  diagonalUp: [1, -1],
};

/** Suite maximale d'au moins `minLength` cases identiques alignées. */
export interface Segment {
  readonly direction: Direction;
  readonly value: CellValue;
  readonly cells: readonly Position[];
}

export interface MatchResult {
  readonly segments: readonly Segment[];
  /** Cases à retirer, sans doublon (une case peut appartenir à plusieurs segments). */
  readonly cells: readonly Position[];
  /**
   * Nombre de fenêtres de `minLength` cases alignées : un segment de longueur L
   * en compte L - minLength + 1. C'est l'unité de score du legacy
   * (3 points par triplet : 3 alignées = 3, 4 = 6, 5 = 9).
   */
  readonly windowCount: number;
}

export interface MatchOptions {
  readonly minLength?: number;
  /** Deux cases voisines font-elles partie du même alignement ? (point d'extension des jokers) */
  readonly sameGroup?: (a: CellValue, b: CellValue) => boolean;
}

const defaultSameGroup = (a: CellValue, b: CellValue): boolean => isColor(a) && a === b;

export function findMatches(grid: Grid, options: MatchOptions = {}): MatchResult {
  const minLength = options.minLength ?? 3;
  const sameGroup = options.sameGroup ?? defaultSameGroup;
  const segments: Segment[] = [];

  for (const direction of Object.keys(STEPS) as Direction[]) {
    const [dx, dy] = STEPS[direction];
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const value = grid.get(x, y);
        if (!sameGroup(value, value)) continue;
        // On ne démarre un segment qu'à son extrémité (la case précédente n'en fait pas partie).
        if (grid.inBounds(x - dx, y - dy) && sameGroup(grid.get(x - dx, y - dy), value)) continue;

        const cells: Position[] = [{ x, y }];
        let cx = x + dx;
        let cy = y + dy;
        while (grid.inBounds(cx, cy) && sameGroup(grid.get(cx, cy), value)) {
          cells.push({ x: cx, y: cy });
          cx += dx;
          cy += dy;
        }
        if (cells.length >= minLength) segments.push({ direction, value, cells });
      }
    }
  }

  const unique = new Map<number, Position>();
  for (const segment of segments) {
    for (const cell of segment.cells) unique.set(cell.y * grid.width + cell.x, cell);
  }
  const cells = [...unique.entries()].sort(([a], [b]) => a - b).map(([, cell]) => cell);
  const windowCount = segments.reduce((sum, s) => sum + s.cells.length - minLength + 1, 0);

  return { segments, cells, windowCount };
}

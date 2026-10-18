import { describe, expect, it } from 'vitest';
import { Grid } from '../../src/core/grid.ts';
import { Rng } from '../../src/core/rng.ts';
import type { CellValue } from '../../src/core/types.ts';
import {
  DEFAULT_WEIGHTS,
  planMove,
  reachableColumns,
  simulatePlacement,
  viewToGrid,
  type BotView,
} from './bot.ts';

const view = (rows: string[], colors: CellValue[], x: number, y = -1): BotView => {
  const grid = Grid.fromRows(rows);
  return {
    width: grid.width,
    height: grid.height,
    get: (cx, cy) => grid.get(cx, cy),
    piece: { colors, x, y },
  };
};

describe('simulatePlacement', () => {
  it('pose la pièce et résout les chaînes', () => {
    const grid = Grid.fromRows(['....', '....', '....', '....', '.22.', '211.']);
    const outcome = simulatePlacement(grid, [1, 3, 4], 3);
    expect(outcome).toMatchObject({ cleared: 6, chain: 2, windows: 1 + 2 });
    expect(outcome?.grid.toRows().slice(-2)).toEqual(['...4', '...3']);
  });

  it('renvoie null si la pièce déborde', () => {
    expect(simulatePlacement(Grid.fromRows(['...', '0..', '1..']), [2, 3, 4], 0)).toBeNull();
  });
});

describe('reachableColumns', () => {
  it('s’arrête aux colonnes trop hautes pour passer sous la pièce', () => {
    const rows = ['......', '......', '..0...', '..1...', '..0...', '..1...'];
    // Pièce en ligne 1 : la colonne 2 (occupée dès la ligne 2) barre le passage, avec la marge d'une ligne.
    const blocked = view(rows, [1, 2, 3], 4, 1);
    expect(reachableColumns(blocked, viewToGrid(blocked))).toEqual([3, 4, 5]);
    // Pièce au-dessus du plateau : tout est accessible.
    const above = view(rows, [1, 2, 3], 4, -1);
    expect(reachableColumns(above, viewToGrid(above))).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('planMove', () => {
  it('choisit le placement qui efface', () => {
    const v = view(['....', '....', '....', '....', '....', '33..'], [0, 1, 3], 3);
    // Une permutation amène le 3 (en haut) en bas : [0, 1, 3] → [3, 0, 1] ; puis colonne 2.
    expect(planMove(v)).toMatchObject({ rotations: 1, targetX: 2 });
  });

  it('renvoie null quand aucun placement n’est possible', () => {
    expect(planMove(view(['..', '00', '11'], [2, 3, 4], 0, -1))).toBeNull();
  });

  it('avec blunder = 1, joue un coup valide au hasard, de façon reproductible', () => {
    const v = view(['....', '....', '....', '....', '....', '33..'], [0, 1, 3], 3);
    const a = planMove(v, DEFAULT_WEIGHTS, { rng: new Rng(5), blunder: 1 });
    const b = planMove(v, DEFAULT_WEIGHTS, { rng: new Rng(5), blunder: 1 });
    expect(a).toEqual(b);
    expect(a?.targetX).toBeGreaterThanOrEqual(0);
  });
});

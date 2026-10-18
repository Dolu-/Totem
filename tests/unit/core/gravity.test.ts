import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { collapse, isSettled, removeCells } from '../../../src/core/gravity.ts';
import { Grid } from '../../../src/core/grid.ts';
import { findMatches } from '../../../src/core/matcher.ts';
import { arbGrid } from '../../helpers/arbitraries.ts';

const columnValues = (grid: Grid, x: number): number[] =>
  Array.from({ length: grid.height }, (_, y) => grid.get(x, y)).filter((v) => v >= 0);

describe('removeCells', () => {
  it('vide les cases indiquées sans toucher à l’original', () => {
    const grid = Grid.fromRows(['12', '34']);
    const next = removeCells(grid, [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
    expect(next.toRows()).toEqual(['1.', '.4']);
    expect(grid.toRows()).toEqual(['12', '34']);
  });
});

describe('collapse', () => {
  it('fait tomber les cases et décrit les déplacements', () => {
    const grid = Grid.fromRows(['1.', '2.', '.3', '..', '4.']);
    const { grid: next, moves } = collapse(grid);
    expect(next.toRows()).toEqual(['..', '..', '1.', '2.', '43']);
    expect(moves).toEqual([
      { x: 0, fromY: 1, toY: 3, value: 2 },
      { x: 0, fromY: 0, toY: 2, value: 1 },
      { x: 1, fromY: 2, toY: 4, value: 3 },
    ]);
  });

  it('ne déplace rien sur une grille déjà tassée', () => {
    const grid = Grid.fromRows(['..', '1.', '23']);
    const { grid: next, moves } = collapse(grid);
    expect(moves).toEqual([]);
    expect(next.equals(grid)).toBe(true);
  });

  it('propriétés : tassée, idempotente, ordre et contenu de chaque colonne conservés', () => {
    fc.assert(
      fc.property(arbGrid(), (grid) => {
        const { grid: next, moves } = collapse(grid);
        expect(isSettled(next)).toBe(true);
        expect(next.countFilled()).toBe(grid.countFilled());
        for (let x = 0; x < grid.width; x += 1) {
          expect(columnValues(next, x)).toEqual(columnValues(grid, x));
        }
        for (const move of moves) expect(move.toY).toBeGreaterThan(move.fromY);
        expect(collapse(next).moves).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });
});

describe('isSettled', () => {
  it('détecte une case flottante', () => {
    expect(isSettled(Grid.fromRows(['1', '.', '2']))).toBe(false);
    expect(isSettled(Grid.fromRows(['.', '1', '2']))).toBe(true);
  });
});

describe('résolution complète (retrait + tassement en boucle)', () => {
  it('se termine sur une grille stable : tassée, sans alignement, cases conservées', () => {
    fc.assert(
      fc.property(arbGrid({ maxW: 8, maxH: 12, colors: 3 }), (start) => {
        let grid = collapse(start).grid;
        let removed = 0;
        for (let chain = 0; chain < 1000; chain += 1) {
          const { cells } = findMatches(grid);
          if (cells.length === 0) break;
          removed += cells.length;
          grid = collapse(removeCells(grid, cells)).grid;
        }
        expect(isSettled(grid)).toBe(true);
        expect(findMatches(grid).cells).toEqual([]);
        expect(grid.countFilled()).toBe(start.countFilled() - removed);
      }),
      { numRuns: 300 },
    );
  });
});

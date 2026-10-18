import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Grid } from '../../../src/core/grid.ts';
import { findMatches } from '../../../src/core/matcher.ts';
import { JOKER_BASE } from '../../../src/core/types.ts';
import { arbGrid, toSquare } from '../../helpers/arbitraries.ts';
import { legacyCheckCombo } from '../../helpers/legacy-check-combo.ts';

/** Grille des cases à retirer, sous forme texte (X = retirée). */
const removedRows = (grid: Grid): string[] => {
  const removed = new Set(findMatches(grid).cells.map((c) => `${c.x},${c.y}`));
  return Array.from({ length: grid.height }, (_, y) =>
    Array.from({ length: grid.width }, (_, x) => (removed.has(`${x},${y}`) ? 'X' : '.')).join(''),
  );
};

describe('findMatches', () => {
  it('ne trouve rien sur une grille vide ou sans alignement', () => {
    expect(findMatches(new Grid(6, 6)).cells).toEqual([]);
    expect(findMatches(Grid.fromRows(['01', '10', '01'])).segments).toEqual([]);
  });

  it('détecte un alignement horizontal', () => {
    const result = findMatches(Grid.fromRows(['....', '.111']));
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.direction).toBe('horizontal');
    expect(result.windowCount).toBe(1);
    expect(removedRows(Grid.fromRows(['....', '.111']))).toEqual(['....', '.XXX']);
  });

  it('détecte un alignement vertical', () => {
    const grid = Grid.fromRows(['2.', '2.', '2.', '1.']);
    expect(findMatches(grid).segments[0]?.direction).toBe('vertical');
    expect(removedRows(grid)).toEqual(['X.', 'X.', 'X.', '..']);
  });

  it('détecte la diagonale descendante (\\)', () => {
    const grid = Grid.fromRows(['3..', '.3.', '..3']);
    expect(findMatches(grid).segments[0]?.direction).toBe('diagonalDown');
    expect(removedRows(grid)).toEqual(['X..', '.X.', '..X']);
  });

  it('détecte la diagonale montante (/)', () => {
    const grid = Grid.fromRows(['..4', '.4.', '4..']);
    expect(findMatches(grid).segments[0]?.direction).toBe('diagonalUp');
    expect(removedRows(grid)).toEqual(['..X', '.X.', 'X..']);
  });

  it('compte L − 2 fenêtres pour un segment de longueur L (score legacy 3, 6, 9)', () => {
    expect(findMatches(Grid.fromRows(['111'])).windowCount).toBe(1);
    expect(findMatches(Grid.fromRows(['1111'])).windowCount).toBe(2);
    expect(findMatches(Grid.fromRows(['11111'])).windowCount).toBe(3);
    expect(findMatches(Grid.fromRows(['11111'])).segments).toHaveLength(1);
  });

  it('une case commune à deux alignements n’est retirée qu’une fois', () => {
    const grid = Grid.fromRows(['1..', '1..', '111']);
    const result = findMatches(grid);
    expect(result.segments).toHaveLength(2);
    expect(result.cells).toHaveLength(5);
    expect(result.windowCount).toBe(2);
  });

  it('gère plusieurs couleurs et les bords de la grille', () => {
    const grid = Grid.fromRows(['222', '.0.', '000']);
    expect(removedRows(grid)).toEqual(['XXX', '...', 'XXX']);
  });

  it('ignore les blocs spéciaux par défaut', () => {
    const grid = new Grid(3, 1);
    for (let x = 0; x < 3; x += 1) grid.set(x, 0, JOKER_BASE);
    expect(findMatches(grid).cells).toEqual([]);
  });

  it('accepte une longueur minimale et une règle de regroupement personnalisées', () => {
    expect(findMatches(Grid.fromRows(['11.']), { minLength: 2 }).windowCount).toBe(1);
    const anyColor = { sameGroup: (a: number, b: number) => a >= 0 && b >= 0 };
    expect(findMatches(Grid.fromRows(['123']), anyColor).cells).toHaveLength(3);
  });

  it('renvoie les cases triées de haut en bas puis de gauche à droite', () => {
    const cells = findMatches(Grid.fromRows(['..1', '.1.', '1..'])).cells;
    expect(cells).toEqual([
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
    ]);
  });

  it('parité avec l’algorithme legacy : mêmes cases retirées, même score de base', () => {
    fc.assert(
      fc.property(arbGrid({ maxW: 12, maxH: 20, colors: 3 }), (grid) => {
        const legacy = legacyCheckCombo(toSquare(grid));
        const result = findMatches(grid);
        const removed = new Set(result.cells.map((c) => `${c.x},${c.y}`));
        legacy.remove.forEach((row, y) => {
          row.forEach((flag, x) => {
            expect(removed.has(`${x},${y}`)).toBe(flag);
          });
        });
        expect(result.windowCount * 3).toBe(legacy.scoreTmp);
      }),
      { numRuns: 500 },
    );
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Grid } from '../../../src/core/grid.ts';
import { EMPTY, JOKER_BASE } from '../../../src/core/types.ts';
import { arbGrid } from '../../helpers/arbitraries.ts';

describe('Grid', () => {
  it('démarre vide', () => {
    const grid = new Grid(3, 2);
    expect(grid.countFilled()).toBe(0);
    expect(grid.toRows()).toEqual(['...', '...']);
  });

  it('refuse des dimensions invalides', () => {
    expect(() => new Grid(0, 5)).toThrow(RangeError);
    expect(() => new Grid(3, 1.5)).toThrow(RangeError);
  });

  it('lit EMPTY hors grille et refuse d’y écrire', () => {
    const grid = new Grid(2, 2);
    expect(grid.get(-1, 0)).toBe(EMPTY);
    expect(grid.get(0, -1)).toBe(EMPTY);
    expect(grid.get(2, 0)).toBe(EMPTY);
    expect(() => {
      grid.set(0, 2, 1);
    }).toThrow(RangeError);
  });

  it('fromRows / toRows sont inverses', () => {
    const rows = ['..1', '0.2', '345'];
    expect(Grid.fromRows(rows).toRows()).toEqual(rows);
  });

  it('fromRows refuse lignes irrégulières et caractères inconnus', () => {
    expect(() => Grid.fromRows(['..', '...'])).toThrow(/Ligne 1/);
    expect(() => Grid.fromRows(['.a'])).toThrow(/Caractère invalide/);
  });

  it('représente les blocs spéciaux par *', () => {
    const grid = new Grid(1, 1);
    grid.set(0, 0, JOKER_BASE);
    expect(grid.toRows()).toEqual(['*']);
  });

  it('topOf donne la case occupée la plus haute ou la hauteur si vide', () => {
    const grid = Grid.fromRows(['...', '.1.', '.2.', '03.']);
    expect(grid.topOf(0)).toBe(3);
    expect(grid.topOf(1)).toBe(1);
    expect(grid.topOf(2)).toBe(4);
  });

  it('countFilled et filledPositions', () => {
    const grid = Grid.fromRows(['1.', '.2']);
    expect(grid.countFilled()).toBe(2);
    expect(grid.filledPositions()).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it('clone est indépendant et égal à l’original', () => {
    fc.assert(
      fc.property(arbGrid(), (grid) => {
        const copy = grid.clone();
        expect(copy.equals(grid)).toBe(true);
        copy.set(0, 0, copy.get(0, 0) === 1 ? 2 : 1);
        expect(copy.equals(grid)).toBe(false);
      }),
    );
  });

  it('equals compare aussi les dimensions', () => {
    expect(new Grid(2, 3).equals(new Grid(3, 2))).toBe(false);
  });
});

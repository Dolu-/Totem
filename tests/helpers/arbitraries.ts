import fc from 'fast-check';
import { Grid } from '../../src/core/grid.ts';
import { EMPTY } from '../../src/core/types.ts';

/** Grille aléatoire (cases vides ou couleurs dans [0, colors[), éventuellement « flottantes »). */
export const arbGrid = (
  opts: { minW?: number; maxW?: number; minH?: number; maxH?: number; colors?: number } = {},
): fc.Arbitrary<Grid> => {
  const { minW = 1, maxW = 8, minH = 1, maxH = 10, colors = 4 } = opts;
  return fc
    .record({ w: fc.integer({ min: minW, max: maxW }), h: fc.integer({ min: minH, max: maxH }) })
    .chain(({ w, h }) =>
      fc
        .array(fc.integer({ min: EMPTY, max: colors - 1 }), { minLength: w * h, maxLength: w * h })
        .map((values) => {
          const grid = new Grid(w, h);
          values.forEach((v, i) => {
            grid.set(i % w, Math.floor(i / w), v);
          });
          return grid;
        }),
    );
};

export function toSquare(grid: Grid): number[][] {
  return Array.from({ length: grid.height }, (_, y) =>
    Array.from({ length: grid.width }, (_, x) => grid.get(x, y)),
  );
}

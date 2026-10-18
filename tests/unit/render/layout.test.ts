import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../../src/render/layout.ts';

describe('computeLayout', () => {
  it('limite par la hauteur sur un écran large (PC)', () => {
    const l = computeLayout({
      availableWidth: 1280,
      availableHeight: 776,
      columns: 6,
      rows: 15,
      devicePixelRatio: 1,
    });
    expect(l.cellSize).toBe(50); // 776 / 15,5 = 50,06
    expect(l.height).toBeLessThanOrEqual(776);
    expect(l.width).toBe(6 * 50 + 2 * l.frame);
  });

  it('limite par la largeur sur un plateau large et un écran étroit', () => {
    const l = computeLayout({
      availableWidth: 360,
      availableHeight: 800,
      columns: 12,
      rows: 10,
      devicePixelRatio: 1,
    });
    expect(l.width).toBeLessThanOrEqual(360);
    expect(l.cellSize).toBe(28); // 360 / 12,5 = 28,8
  });

  it('aligne les cases sur les pixels physiques (HiDPI)', () => {
    const l = computeLayout({
      availableWidth: 412,
      availableHeight: 700,
      columns: 6,
      rows: 15,
      devicePixelRatio: 2.625,
    });
    const devicePixels = l.cellSize * 2.625;
    expect(Math.abs(devicePixels - Math.round(devicePixels))).toBeLessThan(1e-9);
    expect(l.pixelWidth).toBe(Math.round(l.width * 2.625));
    expect(l.pixelHeight).toBeLessThanOrEqual(700 * 2.625);
  });

  it('respecte une taille minimale de case et un ratio invalide', () => {
    const l = computeLayout({
      availableWidth: 10,
      availableHeight: 10,
      columns: 6,
      rows: 15,
      devicePixelRatio: 0,
    });
    expect(l.cellSize).toBe(8);
    expect(l.devicePixelRatio).toBe(1);
  });

  it('tient toujours dans la place disponible (au-delà du minimum)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 4000 }),
        fc.integer({ min: 200, max: 3000 }),
        fc.integer({ min: 5, max: 12 }),
        fc.integer({ min: 10, max: 20 }),
        fc.constantFrom(1, 1.25, 1.5, 2, 2.625, 3),
        (w, h, columns, rows, dpr) => {
          const l = computeLayout({
            availableWidth: w,
            availableHeight: h,
            columns,
            rows,
            devicePixelRatio: dpr,
          });
          expect(l.width).toBeLessThanOrEqual(w + 1e-9);
          expect(l.height).toBeLessThanOrEqual(h + 1e-9);
          // Une case de plus ne tiendrait plus : on utilise bien la place.
          const cell = Math.round(l.cellSize * dpr) + 1;
          const frame = Math.round(cell * 0.25);
          expect(cell * columns + 2 * frame > w * dpr || cell * rows + 2 * frame > h * dpr).toBe(
            true,
          );
        },
      ),
      { numRuns: 2000 },
    );
  });
});

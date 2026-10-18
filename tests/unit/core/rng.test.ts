import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/core/rng.ts';

const draw = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.next());

describe('Rng', () => {
  it('produit la même suite pour la même graine', () => {
    expect(draw(new Rng(42), 20)).toEqual(draw(new Rng(42), 20));
  });

  it('produit des suites différentes pour des graines différentes', () => {
    expect(draw(new Rng(1), 5)).not.toEqual(draw(new Rng(2), 5));
  });

  it('renvoie des flottants dans [0, 1[', () => {
    for (const v of draw(new Rng(7), 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt respecte les bornes incluses et couvre toutes les valeurs de façon équilibrée', () => {
    const rng = new Rng(123);
    const counts = new Map<number, number>();
    const n = 60_000;
    for (let i = 0; i < n; i += 1) {
      const v = rng.nextInt(2, 7);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([2, 3, 4, 5, 6, 7]);
    for (const count of counts.values()) {
      expect(count / n).toBeGreaterThan(1 / 6 - 0.01);
      expect(count / n).toBeLessThan(1 / 6 + 0.01);
    }
  });

  it('nextInt accepte un intervalle réduit à une valeur', () => {
    expect(new Rng(1).nextInt(4, 4)).toBe(4);
  });

  it('refuse des bornes invalides et une graine non finie', () => {
    const rng = new Rng(1);
    expect(() => rng.nextInt(5, 4)).toThrow(RangeError);
    expect(() => rng.nextInt(0.5, 4)).toThrow(RangeError);
    expect(() => new Rng(Number.NaN)).toThrow(RangeError);
  });

  it('clone reprend exactement la suite, sans lien avec l’original', () => {
    const rng = new Rng(99);
    draw(rng, 3);
    const copy = rng.clone();
    expect(copy.state).toBe(rng.state);
    expect(draw(copy, 10)).toEqual(draw(rng, 10));
  });

  it('normalise les graines (troncature, entiers négatifs)', () => {
    expect(draw(new Rng(5.9), 3)).toEqual(draw(new Rng(5), 3));
    expect(() => new Rng(-1)).not.toThrow();
  });
});

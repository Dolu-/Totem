import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, mergeTuning } from '../../../src/config/tuning.ts';
import { cellsPerSecond, levelFor, levelProgress, toNextLevel } from '../../../src/core/speed.ts';

const T = DEFAULT_TUNING;

describe('cellsPerSecond', () => {
  it('niveau 0 : 1 case/s par défaut', () => {
    expect(cellsPerSecond(0, T)).toBeCloseTo(1, 6);
  });

  it('peut retrouver la vitesse 0 du legacy (une demi-case toutes les 800 ms)', () => {
    const legacy = mergeTuning(T, { speed: { gravity: { scale: 1.6 } } });
    expect(cellsPerSecond(0, legacy)).toBeCloseTo(0.625, 6);
  });

  it('accélère à chaque niveau jusqu’au plafond, puis reste au plafond', () => {
    let previous = 0;
    let capped = false;
    for (let level = 0; level <= T.progression.maxLevel; level += 1) {
      const speed = cellsPerSecond(level, T);
      if (capped) expect(speed).toBe(T.speed.maxCellsPerSecond);
      else expect(speed).toBeGreaterThan(previous);
      capped = speed === T.speed.maxCellsPerSecond;
      previous = speed;
    }
    expect(capped).toBe(true);
  });

  it('borne le niveau entre 0 et maxLevel', () => {
    expect(cellsPerSecond(-3, T)).toBe(cellsPerSecond(0, T));
    expect(cellsPerSecond(999, T)).toBe(cellsPerSecond(T.progression.maxLevel, T));
  });

  it('utilise la table quand elle est fournie, dernière valeur au-delà, plafond respecté', () => {
    const t = mergeTuning(T, {
      speed: { gravity: { kind: 'table', cellsPerSecond: [1, 2, 50] }, maxCellsPerSecond: 10 },
    });
    expect(cellsPerSecond(0, t)).toBe(1);
    expect(cellsPerSecond(1, t)).toBe(2);
    expect(cellsPerSecond(2, t)).toBe(10);
    expect(cellsPerSecond(7, t)).toBe(10);
  });
});

describe('levelFor / toNextLevel (palier fixe)', () => {
  const t = mergeTuning(T, { progression: { perLevel: 30, maxLevel: 3 } });

  it('passe un niveau tous les 30 blocs effacés', () => {
    expect(levelFor(0, 0, t)).toBe(0);
    expect(levelFor(29, 0, t)).toBe(0);
    expect(levelFor(30, 0, t)).toBe(1);
    expect(levelFor(59, 0, t)).toBe(1);
    expect(levelFor(60, 0, t)).toBe(2);
  });

  it('part du niveau de départ et plafonne à maxLevel', () => {
    expect(levelFor(0, 2, t)).toBe(2);
    expect(levelFor(30, 2, t)).toBe(3);
    expect(levelFor(10_000, 0, t)).toBe(3);
    expect(levelFor(0, 9, t)).toBe(3);
  });

  it('indique les blocs restants, null au niveau maximal', () => {
    expect(toNextLevel(0, 0, t)).toBe(30);
    expect(toNextLevel(31, 0, t)).toBe(29);
    expect(toNextLevel(30, 2, t)).toBeNull();
    expect(toNextLevel(0, 9, t)).toBeNull();
  });
});

describe('levelFor / toNextLevel (seuils explicites)', () => {
  const t = mergeTuning(T, {
    progression: { perLevel: 50, maxLevel: 10, levelThresholds: [10, 25] },
  });

  it('suit les seuils puis reprend un palier tous les perLevel', () => {
    expect(levelFor(9, 0, t)).toBe(0);
    expect(levelFor(10, 0, t)).toBe(1);
    expect(levelFor(25, 0, t)).toBe(2);
    expect(levelFor(74, 0, t)).toBe(2);
    expect(levelFor(75, 0, t)).toBe(3);
    expect(toNextLevel(12, 0, t)).toBe(13);
    expect(toNextLevel(30, 0, t)).toBe(45);
  });

  it('les seuils comptent à partir du niveau de départ', () => {
    expect(levelFor(10, 4, t)).toBe(5);
    expect(toNextLevel(10, 4, t)).toBe(15);
  });

  it('une liste de seuils vide équivaut au palier fixe', () => {
    const empty = mergeTuning(t, { progression: { levelThresholds: [] } });
    expect(levelFor(50, 0, empty)).toBe(1);
  });
});

describe('levelProgress', () => {
  it('palier fixe : avancement dans le palier en cours', () => {
    const t = mergeTuning(T, { progression: { perLevel: 30, maxLevel: 3 } });
    expect(levelProgress(0, 0, t)).toEqual({ done: 0, total: 30 });
    expect(levelProgress(42, 0, t)).toEqual({ done: 12, total: 30 });
    expect(levelProgress(90, 0, t)).toBeNull();
  });

  it('seuils explicites : taille de chaque palier', () => {
    const t = mergeTuning(T, {
      progression: { perLevel: 50, maxLevel: 10, levelThresholds: [10, 25] },
    });
    expect(levelProgress(4, 0, t)).toEqual({ done: 4, total: 10 });
    expect(levelProgress(12, 0, t)).toEqual({ done: 2, total: 15 });
    expect(levelProgress(30, 0, t)).toEqual({ done: 5, total: 50 });
  });
});

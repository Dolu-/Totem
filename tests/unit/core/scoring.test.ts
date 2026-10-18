import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, mergeTuning } from '../../../src/config/tuning.ts';
import { Grid } from '../../../src/core/grid.ts';
import { findMatches } from '../../../src/core/matcher.ts';
import { createScoringRule } from '../../../src/core/scoring.ts';

const ctx = (windowCount: number, chain = 1, level = 0) => ({
  windowCount,
  cellsCleared: windowCount + 2,
  chain,
  level,
});

describe('règle de score par défaut', () => {
  const rule = createScoringRule(DEFAULT_TUNING);

  it('reprend la base legacy au niveau 0 : 3 alignées = 3, 4 = 6, 5 = 9', () => {
    expect(rule.points(ctx(1))).toBe(3);
    expect(rule.points(ctx(2))).toBe(6);
    expect(rule.points(ctx(3))).toBe(9);
  });

  it('multiplie par le rang de chaîne (×1, ×2, ×3…)', () => {
    expect(rule.chainMultiplier(1)).toBe(1);
    expect(rule.chainMultiplier(3)).toBe(3);
    expect(rule.points(ctx(1, 2))).toBe(6);
    expect(rule.chainMultiplier(0)).toBe(1);
  });

  it('multiplie par (niveau + 1)', () => {
    expect(rule.levelMultiplier(0)).toBe(1);
    expect(rule.levelMultiplier(4)).toBe(5);
    expect(rule.points(ctx(2, 2, 4))).toBe(6 * 2 * 5);
  });

  it('s’applique à un cas réel : un « L » de 5 cases', () => {
    const match = findMatches(Grid.fromRows(['1..', '1..', '111']));
    expect(rule.points({ ...ctx(match.windowCount), cellsCleared: match.cells.length })).toBe(6);
  });
});

describe('règle de score paramétrée', () => {
  it('sans multiplicateur de niveau, retrouve exactement le legacy', () => {
    const legacy = createScoringRule(mergeTuning(DEFAULT_TUNING, { scoring: { levelStep: 0 } }));
    expect(legacy.points(ctx(2, 3, 9))).toBe(6 * 3);
  });

  it('table de chaîne prioritaire, dernière valeur répétée', () => {
    const rule = createScoringRule(
      mergeTuning(DEFAULT_TUNING, { scoring: { chainMultipliers: [1, 1.5, 4] } }),
    );
    expect(rule.chainMultiplier(2)).toBe(1.5);
    expect(rule.chainMultiplier(9)).toBe(4);
    expect(rule.points(ctx(1, 2))).toBe(Math.round(3 * 1.5));
  });
});

import type { Tuning } from '../config/tuning.ts';

/** Données d'un effacement, fournies à la règle de score. */
export interface ClearContext {
  /** Fenêtres de 3 cases alignées (cf. `MatchResult.windowCount`). */
  readonly windowCount: number;
  readonly cellsCleared: number;
  /** Rang dans la réaction en chaîne : 1 pour le premier effacement après la pose. */
  readonly chain: number;
  readonly level: number;
}

export interface ScoringRule {
  points(context: ClearContext): number;
  chainMultiplier(chain: number): number;
  levelMultiplier(level: number): number;
}

/** Règle par défaut : base legacy × chaîne × niveau, entièrement paramétrée par le `Tuning`. */
export function createScoringRule(tuning: Tuning): ScoringRule {
  const s = tuning.scoring;
  const chainMultiplier = (chain: number): number => {
    const table = s.chainMultipliers;
    if (table && table.length > 0) {
      return table[Math.min(chain, table.length) - 1] ?? 1;
    }
    return 1 + (Math.max(1, chain) - 1) * s.chainStep;
  };
  const levelMultiplier = (level: number): number => s.levelBase + Math.max(0, level) * s.levelStep;

  return {
    chainMultiplier,
    levelMultiplier,
    points({ windowCount, chain, level }) {
      const base = windowCount * s.pointsPerTriplet;
      return Math.round(base * chainMultiplier(chain) * levelMultiplier(level));
    },
  };
}

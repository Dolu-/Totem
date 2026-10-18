import type { Tuning } from '../config/tuning.ts';

/** Vitesse de chute (cases par seconde) au niveau donné, plafonnée. */
export function cellsPerSecond(level: number, tuning: Tuning): number {
  const { gravity, maxCellsPerSecond } = tuning.speed;
  const n = Math.max(0, Math.min(level, tuning.progression.maxLevel));
  let speed: number;
  if (gravity.kind === 'formula') {
    const secondsPerCell = gravity.scale * Math.pow(gravity.base - gravity.step * n, n);
    speed = 1 / secondsPerCell;
  } else {
    const table = gravity.cellsPerSecond;
    speed = table[Math.min(n, table.length - 1)] ?? maxCellsPerSecond;
  }
  return Math.min(speed, maxCellsPerSecond);
}

/**
 * Facteur appliqué aux vitesses selon la hauteur du plateau (cf. `speed.referenceHeight`) :
 * le temps de traversée du plateau reste le même quelle que soit sa hauteur.
 */
export function heightFactor(boardHeight: number, tuning: Tuning): number {
  const reference = tuning.speed.referenceHeight;
  return reference === undefined ? 1 : boardHeight / reference;
}

/*
 * La progression se mesure en « unités » : blocs effacés ou alignements réalisés,
 * selon `tuning.progression.unit`. Ces fonctions reçoivent le total déjà compté
 * dans la bonne unité.
 */

/** Total cumulé nécessaire pour le passage de niveau n° `index` (0 = premier). */
function thresholdAt(index: number, tuning: Tuning): number {
  const { perLevel, levelThresholds } = tuning.progression;
  if (!levelThresholds || levelThresholds.length === 0) return (index + 1) * perLevel;
  const explicit = levelThresholds[index];
  if (explicit !== undefined) return explicit;
  const last = levelThresholds[levelThresholds.length - 1] ?? 0;
  return last + (index - levelThresholds.length + 1) * perLevel;
}

/** Niveau courant d'après la progression accumulée depuis le début de la partie. */
export function levelFor(progress: number, startLevel: number, tuning: Tuning): number {
  const { maxLevel } = tuning.progression;
  let level = Math.min(startLevel, maxLevel);
  let passed = 0;
  while (level < maxLevel && progress >= thresholdAt(passed, tuning)) {
    level += 1;
    passed += 1;
  }
  return level;
}

/** Unités restant à accumuler avant le prochain niveau, ou `null` au niveau maximal. */
export function toNextLevel(progress: number, startLevel: number, tuning: Tuning): number | null {
  const level = levelFor(progress, startLevel, tuning);
  if (level >= tuning.progression.maxLevel) return null;
  const passed = level - Math.min(startLevel, tuning.progression.maxLevel);
  return thresholdAt(passed, tuning) - progress;
}

/**
 * Avancement dans le palier en cours, pour une jauge : unités déjà accumulées
 * depuis le dernier passage de niveau, sur la taille du palier. `null` au niveau maximal.
 */
export function levelProgress(
  progress: number,
  startLevel: number,
  tuning: Tuning,
): { done: number; total: number } | null {
  const level = levelFor(progress, startLevel, tuning);
  if (level >= tuning.progression.maxLevel) return null;
  const passed = level - Math.min(startLevel, tuning.progression.maxLevel);
  const start = passed === 0 ? 0 : thresholdAt(passed - 1, tuning);
  const end = thresholdAt(passed, tuning);
  return { done: progress - start, total: end - start };
}

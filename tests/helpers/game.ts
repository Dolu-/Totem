import {
  DEFAULT_TUNING,
  mergeTuning,
  type DeepPartial,
  type Tuning,
} from '../../src/config/tuning.ts';
import { Game, type GameEvents, type GameOptions } from '../../src/core/game.ts';
import { Grid } from '../../src/core/grid.ts';

/**
 * Partie dont la grille est fixée par des lignes texte (cf. `Grid.fromRows`).
 * La hauteur de référence des vitesses est celle de la grille : les vitesses
 * du réglage s'appliquent telles quelles, même sur une petite grille de test.
 */
export function gameWithGrid(
  rows: readonly string[],
  options: Partial<GameOptions> = {},
  tuning: DeepPartial<Tuning> = {},
): Game {
  const grid = Grid.fromRows(rows);
  const game = new Game({
    spawnMode: 'center',
    ...options,
    width: grid.width,
    height: grid.height,
    tuning: mergeTuning(
      options.tuning ?? DEFAULT_TUNING,
      { speed: { referenceHeight: grid.height } },
      tuning,
    ),
  });
  game.debugSetGrid(grid);
  return game;
}

/** Avance le temps par pas de `stepMs` jusqu'à ce que `predicate` soit vrai (ou lève une erreur). */
export function runUntil(
  game: Game,
  predicate: () => boolean,
  stepMs = 16,
  maxMs = 600_000,
): number {
  let elapsed = 0;
  while (!predicate()) {
    if (elapsed >= maxMs) throw new Error(`Condition non atteinte après ${maxMs} ms`);
    game.update(stepMs);
    elapsed += stepMs;
  }
  return elapsed;
}

/** Enregistre tous les événements émis, dans l'ordre. */
export function recordEvents(game: Game): { type: keyof GameEvents; payload: unknown }[] {
  const log: { type: keyof GameEvents; payload: unknown }[] = [];
  const types: (keyof GameEvents)[] = [
    'spawn',
    'move',
    'rotate',
    'lock',
    'clear',
    'levelUp',
    'pause',
    'resume',
    'gameOver',
  ];
  for (const type of types) {
    game.events.on(type, (payload) => log.push({ type, payload }));
  }
  return log;
}

export const gridRows = (game: Game): string[] => game.gridCopy().toRows();

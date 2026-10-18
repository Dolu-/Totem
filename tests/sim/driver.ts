/**
 * Fait jouer le bot à une partie complète, avec un modèle de temps « humain » :
 * temps de réflexion à chaque nouvelle pièce, intervalle minimal entre deux
 * actions, erreurs occasionnelles. C'est ce qui rend la vitesse de chute
 * réellement discriminante, comme pour un joueur.
 */
import { Game, type GameOptions } from '../../src/core/game.ts';
import { Rng } from '../../src/core/rng.ts';
import { DEFAULT_WEIGHTS, planMove, type BotWeights, type Plan } from './bot.ts';

export interface BotProfile {
  readonly name: string;
  /** Délai entre l'apparition d'une pièce et la décision. */
  readonly thinkMs: number;
  /** Intervalle minimal entre deux actions (permutation ou déplacement). */
  readonly actionMs: number;
  /** Probabilité de jouer un placement au hasard. */
  readonly blunder: number;
  /** Utilise la descente rapide une fois la pièce en place. */
  readonly softDrop: boolean;
  readonly weights: BotWeights;
}

export const PROFILES: Readonly<Record<'novice' | 'casual' | 'expert', BotProfile>> = {
  novice: {
    name: 'débutant',
    thinkMs: 900,
    actionMs: 250,
    blunder: 0.15,
    softDrop: false,
    weights: DEFAULT_WEIGHTS,
  },
  casual: {
    name: 'moyen',
    thinkMs: 550,
    actionMs: 160,
    blunder: 0.05,
    softDrop: true,
    weights: DEFAULT_WEIGHTS,
  },
  expert: {
    name: 'expert',
    thinkMs: 300,
    actionMs: 90,
    blunder: 0,
    softDrop: true,
    weights: DEFAULT_WEIGHTS,
  },
};

export interface GameStats {
  readonly score: number;
  readonly level: number;
  readonly blocksCleared: number;
  readonly alignmentsCleared: number;
  readonly piecesPlaced: number;
  readonly durationMs: number;
  readonly maxChain: number;
  /** Instant (ms de jeu) où chaque niveau a été atteint ; index = niveau. */
  readonly levelReachedAt: readonly number[];
  readonly timedOut: boolean;
}

export interface PlayOptions {
  readonly botSeed?: number;
  /** Arrêt de sécurité (temps de jeu simulé). */
  readonly maxMs?: number;
  readonly tickMs?: number;
  /** Rappel après chaque pas (tests d'invariants). */
  readonly onTick?: (game: Game) => void;
}

export function playGame(
  options: Partial<GameOptions>,
  profile: BotProfile,
  play: PlayOptions = {},
): GameStats {
  const { botSeed = 1, maxMs = 4 * 3600_000, tickMs = 20, onTick } = play;
  const game = new Game(options);
  const rng = new Rng(botSeed);
  let now = 0;
  let plan: Plan | null = null;
  let planned = false;
  let planAt = profile.thinkMs;
  let nextActionAt = 0;
  let rotationsLeft = 0;
  let maxChain = 0;
  const levelReachedAt: number[] = [];
  levelReachedAt[game.snapshot().level] = 0;

  game.events.on('spawn', () => {
    plan = null;
    planned = false;
    planAt = now + profile.thinkMs;
    game.setSoftDrop(false);
  });
  game.events.on('clear', ({ chain }) => {
    maxChain = Math.max(maxChain, chain);
  });
  game.events.on('levelUp', ({ level }) => {
    levelReachedAt[level] = now;
  });

  while (game.phase !== 'over' && now < maxMs) {
    const snap = game.snapshot();
    if (snap.phase === 'falling' && snap.piece && now >= planAt) {
      if (!planned) {
        planned = true;
        plan = planMove(
          {
            width: snap.grid.width,
            height: snap.grid.height,
            get: (x, y) => snap.grid.get(x, y),
            piece: snap.piece,
          },
          profile.weights,
          { rng, blunder: profile.blunder },
        );
        rotationsLeft = plan?.rotations ?? 0;
        nextActionAt = now;
      }
      if (now >= nextActionAt) {
        const target: Plan | null = plan;
        if (rotationsLeft > 0) {
          game.rotate();
          rotationsLeft -= 1;
          nextActionAt = now + profile.actionMs;
        } else if (target && snap.piece.x !== target.targetX) {
          const moved = target.targetX < snap.piece.x ? game.moveLeft() : game.moveRight();
          // Chemin bloqué entre-temps : on renonce et on pose ici.
          if (!moved) plan = { ...target, targetX: snap.piece.x };
          nextActionAt = now + profile.actionMs;
        } else if (profile.softDrop) {
          game.setSoftDrop(true);
        }
      }
    }
    game.update(tickMs);
    now += tickMs;
    onTick?.(game);
  }

  const s = game.snapshot();
  return {
    score: s.score,
    level: s.level,
    blocksCleared: s.blocksCleared,
    alignmentsCleared: s.alignmentsCleared,
    piecesPlaced: s.piecesPlaced,
    durationMs: s.elapsedMs,
    maxChain,
    levelReachedAt,
    timedOut: game.phase !== 'over',
  };
}

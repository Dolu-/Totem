/**
 * Parties complètes jouées par le bot, sur toute l'étendue des réglages du
 * joueur (dimensions, couleurs, niveau de départ, préréglages) : aucune
 * exception, invariants respectés, parties qui se terminent.
 */
import { describe, expect, it } from 'vitest';
import { tuningForPreset, type PresetId } from '../../src/config/tuning.ts';
import type { Game } from '../../src/core/game.ts';
import { isSettled } from '../../src/core/gravity.ts';
import { findMatches } from '../../src/core/matcher.ts';
import { Rng } from '../../src/core/rng.ts';
import { PROFILES, playGame } from './driver.ts';

function checkInvariants(game: Game): void {
  const s = game.snapshot();
  if (s.phase !== 'falling') return;
  const grid = game.gridCopy();
  if (!isSettled(grid)) throw new Error('Case flottante');
  if (findMatches(grid).cells.length > 0) throw new Error('Alignement non résolu');
  if (grid.countFilled() !== s.piecesPlaced * 3 - s.blocksCleared) {
    throw new Error('Nombre de cases incohérent');
  }
}

describe('simulations du bot', () => {
  it('60 parties variées, sans erreur ni invariant violé', { timeout: 60_000 }, () => {
    const rng = new Rng(2024);
    const presets: PresetId[] = ['easy', 'normal', 'hard'];
    const profiles = Object.values(PROFILES);
    for (let i = 0; i < 60; i += 1) {
      let tick = 0;
      const stats = playGame(
        {
          seed: i,
          width: rng.nextInt(5, 12),
          height: rng.nextInt(10, 20),
          colorCount: rng.nextInt(5, 9),
          startLevel: rng.nextInt(0, 9),
          spawnMode: rng.next() < 0.5 ? 'random' : 'center',
          tuning: tuningForPreset(presets[i % 3] ?? 'normal'),
        },
        profiles[i % profiles.length] ?? PROFILES.casual,
        {
          botSeed: i,
          // Avec peu de couleurs et un grand plateau, un bon joueur peut tenir indéfiniment :
          // on borne le temps simulé (une partie interrompue n'est pas une erreur).
          maxMs: 10 * 60_000,
          // Contrôle échantillonné pour garder le test rapide.
          onTick: (game) => {
            tick += 1;
            if (tick % 50 === 0) checkInvariants(game);
          },
        },
      );
      expect(stats.piecesPlaced).toBeGreaterThan(0);
    }
  });

  it(
    'avec le réglage par défaut (6×15, 6 couleurs), toutes les parties se terminent',
    { timeout: 60_000 },
    () => {
      for (let i = 0; i < 30; i += 1) {
        const profile = Object.values(PROFILES)[i % 3] ?? PROFILES.casual;
        expect(playGame({ seed: 500 + i }, profile, { botSeed: i }).timedOut).toBe(false);
      }
    },
  );

  it('le bot joue réellement : il marque des points et monte de niveau', () => {
    const stats = playGame({ seed: 7 }, PROFILES.casual, { botSeed: 7 });
    expect(stats.score).toBeGreaterThan(1000);
    expect(stats.level).toBeGreaterThanOrEqual(5);
    expect(stats.maxChain).toBeGreaterThanOrEqual(2);
  });

  it('une partie simulée est reproductible', () => {
    const a = playGame({ seed: 3 }, PROFILES.expert, { botSeed: 9 });
    const b = playGame({ seed: 3 }, PROFILES.expert, { botSeed: 9 });
    expect(a).toEqual(b);
  });

  it(
    'la difficulté est graduée : facile dure plus longtemps que difficile',
    { timeout: 60_000 },
    () => {
      const median = (preset: PresetId): number => {
        const durations = Array.from(
          { length: 15 },
          (_, i) =>
            playGame({ seed: 100 + i, tuning: tuningForPreset(preset) }, PROFILES.casual, {
              botSeed: i,
            }).durationMs,
        ).sort((x, y) => x - y);
        return durations[7] ?? 0;
      };
      expect(median('easy')).toBeGreaterThan(median('hard'));
    },
  );
});

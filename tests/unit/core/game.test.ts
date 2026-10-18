import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, mergeTuning } from '../../../src/config/tuning.ts';
import { Game } from '../../../src/core/game.ts';
import { isSettled } from '../../../src/core/gravity.ts';
import { Grid } from '../../../src/core/grid.ts';
import { findMatches } from '../../../src/core/matcher.ts';
import { cellsPerSecond } from '../../../src/core/speed.ts';
import { gameWithGrid, gridRows, recordEvents, runUntil } from '../../helpers/game.ts';

const EMPTY_6x8 = Array.from({ length: 8 }, () => '......');
/** Durée de chute d'une case au niveau 0 (1 s par défaut ; legacy : 1,6 s). */
const CELL_MS_L0 = 1000 / cellsPerSecond(0, DEFAULT_TUNING);

describe('Game : apparition', () => {
  it('fait apparaître une pièce de 3 couleurs au-dessus du plateau', () => {
    const game = new Game({ seed: 3, colorCount: 5 });
    const { piece, phase } = game.snapshot();
    expect(phase).toBe('falling');
    expect(piece?.y).toBe(-1);
    expect(piece?.colors).toHaveLength(3);
    for (const c of piece?.colors ?? []) expect(c).toBeLessThan(5);
  });

  it('colonne centrale ou aléatoire selon le réglage', () => {
    expect(new Game({ width: 7, spawnMode: 'center' }).snapshot().piece?.x).toBe(3);
    const columns = new Set(
      Array.from({ length: 40 }, (_, seed) => new Game({ seed, width: 6 }).snapshot().piece?.x),
    );
    expect(columns.size).toBeGreaterThan(3);
  });

  it('est déterministe pour une graine donnée', () => {
    expect(new Game({ seed: 11 }).snapshot().piece).toEqual(
      new Game({ seed: 11 }).snapshot().piece,
    );
  });

  it('expose les pièces suivantes sans changer la partie', () => {
    const withPreview = new Game({ seed: 4, previewCount: 2 });
    const without = new Game({ seed: 4 });
    expect(withPreview.snapshot().nextPieces).toHaveLength(2);
    expect(without.snapshot().nextPieces).toEqual([]);
    expect(withPreview.snapshot().piece).toEqual(without.snapshot().piece);
  });

  it('refuse un réglage invalide', () => {
    const tuning = mergeTuning(DEFAULT_TUNING, { progression: { perLevel: 0 } });
    expect(() => new Game({ tuning })).toThrow(/perLevel/);
  });

  it('expose le réglage utilisé', () => {
    const tuning = mergeTuning(DEFAULT_TUNING, { progression: { perLevel: 7 } });
    expect(new Game({ tuning }).tuning).toBe(tuning);
  });
});

describe('Game : chute et verrouillage', () => {
  it('descend à la vitesse du niveau 0', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.update(CELL_MS_L0);
    expect(game.snapshot().piece?.y).toBeCloseTo(0, 6);
    game.update(CELL_MS_L0 / 2);
    expect(game.snapshot().piece?.y).toBeCloseTo(0.5, 6);
  });

  it('repose sur le fond puis se verrouille après une demi-case de chute', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.debugSetPiece([1, 2, 3], 2);
    const log = recordEvents(game);
    game.update(8 * CELL_MS_L0); // de y = -1 à y = 7 (fond)
    expect(game.snapshot()).toMatchObject({ resting: true, piece: { y: 7 } });
    game.update(CELL_MS_L0 / 2 - 1);
    expect(log.some((e) => e.type === 'lock')).toBe(false);
    game.update(2);
    expect(log.map((e) => e.type)).toEqual(['lock', 'spawn']);
    expect(gridRows(game).slice(-3)).toEqual(['..3...', '..2...', '..1...']);
  });

  it('le délai de verrouillage a un minimum (lockDelayMinMs)', () => {
    const game = gameWithGrid(
      EMPTY_6x8,
      {},
      { timing: { lockDelayCells: 0, lockDelayMinMs: 400 } },
    );
    game.debugSetPiece([1, 2, 3], 0, 7);
    game.update(399);
    expect(game.snapshot().piece?.x).toBe(0);
    expect(game.snapshot().piecesPlaced).toBe(0);
    game.update(1);
    expect(game.snapshot().piecesPlaced).toBe(1);
  });

  it('se pose sur les cases existantes', () => {
    const game = gameWithGrid([...EMPTY_6x8.slice(0, 6), '..4...', '..5...']);
    game.debugSetPiece([1, 2, 3], 2);
    runUntil(game, () => game.snapshot().piecesPlaced === 1);
    expect(gridRows(game).slice(-5)).toEqual(['..3...', '..2...', '..1...', '..4...', '..5...']);
  });

  it('la descente rapide accélère et verrouille dès que la pièce repose', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.debugSetPiece([1, 2, 3], 0);
    game.setSoftDrop(true);
    const softMs = runUntil(game, () => game.snapshot().piecesPlaced === 1, 1);
    // Temporisation, puis descente rapide (au plus, sans compter la petite avance pendant la temporisation).
    const { softDropDelayMs } = DEFAULT_TUNING.timing;
    expect(softMs).toBeLessThanOrEqual(
      softDropDelayMs + Math.ceil((8 / DEFAULT_TUNING.speed.softDropCellsPerSecond) * 1000) + 1,
    );
    expect(softMs).toBeGreaterThan(softDropDelayMs);
  });

  it('descente maintenue (touche restée enfoncée) : continue sur les pièces suivantes', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.debugSetPiece([1, 2, 3], 0);
    game.setSoftDrop(true);
    runUntil(game, () => game.snapshot().piecesPlaced === 1, 1);
    // La pièce suivante tombe aussi en accéléré, puis se verrouille dès qu'elle touche.
    expect(game.currentSpeed()).toBe(DEFAULT_TUNING.speed.softDropCellsPerSecond);
    const ms = runUntil(game, () => game.snapshot().piecesPlaced === 2, 1);
    expect(ms).toBeLessThan(1000);
    game.setSoftDrop(false);
    expect(game.currentSpeed()).toBe(cellsPerSecond(0, DEFAULT_TUNING));
  });

  it('descente ponctuelle (geste vif) : s’arrête quand la pièce se pose', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.debugSetPiece([1, 2, 3], 0);
    game.softDropUntilLock();
    game.update(DEFAULT_TUNING.timing.softDropDelayMs);
    expect(game.currentSpeed()).toBe(DEFAULT_TUNING.speed.softDropCellsPerSecond);
    runUntil(game, () => game.snapshot().piecesPlaced === 1, 1);
    expect(game.currentSpeed()).toBe(cellsPerSecond(0, DEFAULT_TUNING));
  });

  it('temporisation : la descente rapide n’accélère qu’après softDropDelayMs', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.debugSetPiece([1, 2, 3], 0, 0);
    game.setSoftDrop(true);
    const { softDropDelayMs } = DEFAULT_TUNING.timing;
    game.update(softDropDelayMs - 10);
    expect(game.currentSpeed()).toBe(cellsPerSecond(0, DEFAULT_TUNING));
    game.update(10);
    expect(game.currentSpeed()).toBe(DEFAULT_TUNING.speed.softDropCellsPerSecond);
    // Relâcher puis rappuyer : nouvelle temporisation.
    game.setSoftDrop(false);
    game.setSoftDrop(true);
    expect(game.currentSpeed()).toBe(cellsPerSecond(0, DEFAULT_TUNING));
  });

  it('une pièce déjà posée se verrouille dès l’appui, sans temporisation', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.debugSetPiece([1, 2, 3], 0, 7);
    game.update(1);
    game.setSoftDrop(true);
    game.update(1);
    expect(game.snapshot().piecesPlaced).toBe(1);
  });

  it('la pause annule toute descente rapide', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.debugSetPiece([1, 2, 3], 0);
    game.setSoftDrop(true);
    game.softDropUntilLock();
    game.pause();
    game.resume();
    expect(game.currentSpeed()).toBe(cellsPerSecond(0, DEFAULT_TUNING));
    game.pause();
    game.softDropUntilLock(); // ignorée en pause
    game.resume();
    expect(game.currentSpeed()).toBe(cellsPerSecond(0, DEFAULT_TUNING));
  });

  it('la descente rapide ne ralentit jamais une chute déjà plus rapide', () => {
    const tuning = mergeTuning(DEFAULT_TUNING, { speed: { softDropCellsPerSecond: 2 } });
    const game = new Game({ startLevel: 20, tuning });
    const fast = game.currentSpeed();
    expect(fast).toBeGreaterThan(2);
    game.setSoftDrop(true);
    expect(game.currentSpeed()).toBe(fast);
  });
});

describe('Game : vitesse adaptée à la hauteur du plateau', () => {
  /** Temps entre l'apparition et le verrouillage de la première pièce, sans action. */
  const firstLockMs = (height: number, tuning = DEFAULT_TUNING): number => {
    const game = new Game({ height, spawnMode: 'center', tuning });
    return runUntil(game, () => game.snapshot().piecesPlaced === 1, 1);
  };

  it('une pièce met le même temps à traverser un plateau de 10, 15 ou 20 lignes', () => {
    const reference = firstLockMs(15);
    // Le plateau de 10 tombe plus lentement par case mais a 2/3 de lignes : la pièce
    // apparaît une ligne au-dessus, d'où un écart d'au plus une case de chute.
    for (const height of [10, 20]) {
      expect(Math.abs(firstLockMs(height) - reference)).toBeLessThanOrEqual(
        1000 / cellsPerSecond(0, DEFAULT_TUNING) / 1.5 + 2,
      );
    }
  });

  it('multiplie toutes les vitesses par hauteur / référence, plafond et descente rapide compris', () => {
    const tall = new Game({ height: 30, startLevel: 20 });
    expect(tall.currentSpeed()).toBeCloseTo(2 * DEFAULT_TUNING.speed.maxCellsPerSecond, 6);
    tall.setSoftDrop(true);
    expect(tall.currentSpeed()).toBeCloseTo(2 * DEFAULT_TUNING.speed.softDropCellsPerSecond, 6);
  });

  it('sans hauteur de référence, la vitesse ne dépend pas du plateau', () => {
    const { gravity, maxCellsPerSecond, softDropCellsPerSecond } = DEFAULT_TUNING.speed;
    const tuning = {
      ...DEFAULT_TUNING,
      speed: { gravity, maxCellsPerSecond, softDropCellsPerSecond },
    };
    expect(new Game({ height: 20, tuning }).currentSpeed()).toBe(
      new Game({ height: 10, tuning }).currentSpeed(),
    );
  });
});

describe('Game : déplacements et permutation', () => {
  it('se déplace d’une colonne, sans sortir du plateau', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.debugSetPiece([1, 2, 3], 0, 2);
    expect(game.moveLeft()).toBe(false);
    expect(game.moveRight()).toBe(true);
    expect(game.snapshot().piece?.x).toBe(1);
    game.debugSetPiece([1, 2, 3], 5, 2);
    expect(game.moveRight()).toBe(false);
  });

  it('est bloqué par une colonne plus haute, y compris à mi-case', () => {
    const rows = [...EMPTY_6x8.slice(0, 5), '...1..', '...2..', '...3..'];
    const game = gameWithGrid(rows);
    game.debugSetPiece([1, 2, 3], 2, 4); // bas de la pièce en ligne 4, colonne 3 libre jusqu'à 4
    expect(game.moveRight()).toBe(true);
    game.debugSetPiece([1, 2, 3], 2, 4.5); // chevauche la ligne 5, occupée en colonne 3
    expect(game.moveRight()).toBe(false);
  });

  it('une pièce qui repose peut glisser vers une colonne plus basse et repart', () => {
    const rows = [...EMPTY_6x8.slice(0, 6), '0.....', '1.....'];
    const game = gameWithGrid(rows);
    game.debugSetPiece([2, 3, 4], 0, 5);
    game.update(10);
    expect(game.snapshot().resting).toBe(true);
    expect(game.moveRight()).toBe(true);
    expect(game.snapshot().resting).toBe(false);
    runUntil(game, () => game.snapshot().piecesPlaced === 1);
    expect(gridRows(game).slice(-3)).toEqual(['.4....', '03....', '12....']);
  });

  it('expose l’animation de glissement, purement visuelle', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.debugSetPiece([1, 2, 3], 2, 0);
    game.moveRight();
    expect(game.snapshot().slide).toEqual({ fromX: 2, progress: 0 });
    game.update(DEFAULT_TUNING.timing.slideMs / 2);
    expect(game.snapshot().slide?.progress).toBeCloseTo(0.5);
    game.update(DEFAULT_TUNING.timing.slideMs);
    expect(game.snapshot().slide).toBeNull();
  });

  it('permute les couleurs (le haut redescend en bas)', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.debugSetPiece([1, 2, 3], 2);
    expect(game.rotate()).toBe(true);
    expect(game.snapshot().piece?.colors).toEqual([3, 1, 2]);
  });
});

describe('Game : effacements, chaînes et score', () => {
  it('efface un alignement, anime, tasse et compte les points', () => {
    const game = gameWithGrid(['....', '....', '....', '....', '....', '00..']);
    const log = recordEvents(game);
    game.debugSetPiece([0, 1, 2], 2, 5);
    game.setSoftDrop(true);
    game.update(1);
    const snap = game.snapshot();
    expect(snap.phase).toBe('clearing');
    expect(snap.clearing).toMatchObject({ chain: 1, points: 3 });
    // La milliseconde restante après le verrouillage est déjà consommée par l'animation.
    expect(snap.clearing?.progress).toBeCloseTo(1 / DEFAULT_TUNING.timing.clearMs, 6);
    expect(snap.clearing?.cells).toHaveLength(3);
    expect(snap.score).toBe(3);

    game.update(DEFAULT_TUNING.timing.clearMs);
    expect(game.snapshot().phase).toBe('collapsing');
    expect(game.snapshot().collapsing?.moves).toHaveLength(2);
    runUntil(game, () => game.phase === 'falling');
    expect(gridRows(game).slice(-2)).toEqual(['..2.', '..1.']);
    expect(game.snapshot()).toMatchObject({ blocksCleared: 3, chain: 0 });
    expect(log.map((e) => e.type)).toEqual(['lock', 'clear', 'spawn']);
  });

  it('réaction en chaîne : ×2 sur le second effacement', () => {
    // La pièce complète « 2 1 1 1 » en bas (chaîne 1) ; les 2 du dessus retombent : « 2 2 2 » (chaîne 2).
    const game = gameWithGrid(['....', '....', '....', '....', '.22.', '211.']);
    const clears: { chain: number; points: number }[] = [];
    game.events.on('clear', ({ chain, points }) => clears.push({ chain, points }));
    game.debugSetPiece([1, 3, 4], 3, 5);
    game.setSoftDrop(true);
    runUntil(game, () => game.phase === 'falling' && game.snapshot().piecesPlaced === 1);
    expect(clears).toEqual([
      { chain: 1, points: 3 },
      { chain: 2, points: 6 },
    ]);
    expect(game.snapshot()).toMatchObject({ score: 9, blocksCleared: 6 });
    expect(gridRows(game).slice(-2)).toEqual(['...4', '...3']);
  });

  it.each([
    // Étapes de chaîne comptées : 3 blocs (niveau 1) puis 3 de plus (niveau 2).
    [true, { score: 3 + 12, level: 2, progress: 6 }, [{ level: 1 }, { level: 2 }]],
    // Réglage par défaut : seule la première étape compte ; la chaîne ×2 ne fait pas monter.
    [false, { score: 3 + 12, level: 1, progress: 3 }, [{ level: 1 }]],
  ] as const)(
    'chaîne : countChainSteps = %s (le niveau compte dès l’effacement suivant, score × niveau)',
    (countChainSteps, expected, levelUps) => {
      const game = gameWithGrid(
        ['....', '....', '....', '....', '.22.', '211.'],
        {},
        { progression: { unit: 'blocks', perLevel: 3, countChainSteps } },
      );
      const log = recordEvents(game);
      game.debugSetPiece([1, 3, 4], 3, 5);
      game.setSoftDrop(true);
      runUntil(game, () => game.phase === 'falling' && game.snapshot().piecesPlaced === 1);
      // Chaîne 1 au niveau 0 : 3 × 1 × 1 ; chaîne 2 au niveau 1 : 3 × 2 × 2.
      expect(game.snapshot()).toMatchObject({ ...expected, blocksCleared: 6 });
      expect(log.filter((e) => e.type === 'levelUp').map((e) => e.payload)).toEqual(levelUps);
    },
  );

  it.each([
    ['blocks', { level: 2, progress: 5, toNextLevel: 1 }],
    ['alignments', { level: 1, progress: 2, toNextLevel: 2 }],
  ] as const)('progression en %s : un « L » = 5 blocs mais 2 alignements', (unit, expected) => {
    const game = gameWithGrid(
      ['....', '....', '....', '....', '11..'],
      {},
      { progression: { unit, perLevel: 2 } },
    );
    game.debugSetPiece([1, 1, 1], 2, 4);
    game.setSoftDrop(true);
    runUntil(game, () => game.phase === 'falling' && game.snapshot().piecesPlaced === 1);
    expect(game.snapshot()).toMatchObject({ blocksCleared: 5, alignmentsCleared: 2, ...expected });
  });

  it('sans multiplicateur de niveau, une ligne de 4 rapporte 6 comme le legacy', () => {
    const game = gameWithGrid(['....', '....', '....', '000.'], {}, { scoring: { levelStep: 0 } });
    game.debugSetPiece([0, 1, 2], 3, 3);
    game.setSoftDrop(true);
    game.update(1);
    expect(game.snapshot().score).toBe(6);
  });

  it('effacement sans tassement (rien au-dessus) : nouvelle pièce sans phase de chute', () => {
    const game = gameWithGrid(['...', '...', '...', '...', '...']);
    const log = recordEvents(game);
    game.debugSetPiece([0, 0, 0], 0, 4);
    game.setSoftDrop(true);
    game.update(1);
    game.update(DEFAULT_TUNING.timing.clearMs);
    expect(game.snapshot()).toMatchObject({ phase: 'falling', blocksCleared: 3 });
    expect(log.map((e) => e.type)).toEqual(['lock', 'clear', 'spawn']);
  });
});

describe('Game : pause et fin de partie', () => {
  it('la pause fige le temps et les commandes', () => {
    const game = gameWithGrid(EMPTY_6x8);
    game.debugSetPiece([1, 2, 3], 2, 0);
    const log = recordEvents(game);
    game.pause();
    game.pause();
    game.update(10_000);
    expect(game.moveLeft()).toBe(false);
    expect(game.rotate()).toBe(false);
    expect(game.snapshot()).toMatchObject({ paused: true, piece: { x: 2, y: 0 }, elapsedMs: 0 });
    game.resume();
    game.resume();
    game.update(100);
    expect(game.snapshot().elapsedMs).toBe(100);
    expect(log.map((e) => e.type)).toEqual(['pause', 'resume']);
  });

  it('se termine quand une pièce se verrouille en dépassant du plateau', () => {
    const game = gameWithGrid(['...', '1..', '0..', '1..']);
    const log = recordEvents(game);
    game.debugSetPiece([2, 3, 4], 0);
    runUntil(game, () => game.phase === 'over');
    expect(log.map((e) => e.type)).toEqual(['lock', 'gameOver']);
    expect(log.at(-1)?.payload).toMatchObject({ score: 0, piecesPlaced: 1 });
    // Plus rien ne se passe ensuite.
    game.update(10_000);
    expect(game.moveLeft()).toBe(false);
    game.pause();
    expect(game.snapshot().paused).toBe(false);
  });

  it('se termine à l’apparition si la colonne est pleine', () => {
    const game = gameWithGrid(['0..', '1..', '0..'], { spawnMode: 'center' });
    game.debugSetPiece([2, 3, 4], 0);
    runUntil(game, () => game.phase === 'over');
    expect(game.snapshot().piece).toBeNull();
  });

  it('end() termine la partie (bouton Stop), une seule fois', () => {
    const game = new Game();
    const log = recordEvents(game);
    game.pause();
    game.end();
    game.end();
    expect(game.phase).toBe('over');
    expect(log.map((e) => e.type)).toEqual(['pause', 'gameOver']);
  });

  it('ignore les pas de temps nuls, négatifs ou invalides', () => {
    const game = new Game();
    game.update(0);
    game.update(-5);
    game.update(Number.NaN);
    expect(game.snapshot().elapsedMs).toBe(0);
  });
});

describe('Game : outils de test', () => {
  it('debugSetGrid refuse une grille de mauvaises dimensions', () => {
    expect(() => {
      new Game({ width: 6, height: 15 }).debugSetGrid(new Grid(5, 15));
    }).toThrow(RangeError);
  });
});

// ─── Propriétés sur des parties jouées au hasard ────────────────────────────

type Command = 'left' | 'right' | 'rotate' | 'softOn' | 'softOff' | 'pause' | 'resume' | number;

const arbCommand: fc.Arbitrary<Command> = fc.oneof(
  fc.constantFrom<Command>('left', 'right', 'rotate', 'softOn', 'softOff', 'pause', 'resume'),
  fc.integer({ min: 1, max: 3000 }),
);

function apply(game: Game, command: Command): void {
  if (typeof command === 'number') game.update(command);
  else if (command === 'left') game.moveLeft();
  else if (command === 'right') game.moveRight();
  else if (command === 'rotate') game.rotate();
  else if (command === 'softOn') game.setSoftDrop(true);
  else if (command === 'softOff') game.setSoftDrop(false);
  else if (command === 'pause') game.pause();
  else game.resume();
}

describe('Game : propriétés', () => {
  it('invariants à chaque instant d’une partie quelconque', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 }),
        fc.integer({ min: 3, max: 8 }),
        fc.integer({ min: 4, max: 12 }),
        fc.integer({ min: 2, max: 6 }),
        fc.array(arbCommand, { maxLength: 300 }),
        (seed, width, height, colorCount, commands) => {
          const game = new Game({ seed, width, height, colorCount, startLevel: 5 });
          let lastScore = 0;
          let lastLevel = 0;
          for (const command of commands) {
            apply(game, command);
            const s = game.snapshot();
            expect(s.score).toBeGreaterThanOrEqual(lastScore);
            expect(s.level).toBeGreaterThanOrEqual(lastLevel);
            lastScore = s.score;
            lastLevel = s.level;
            if (s.piece) {
              expect(s.piece.x).toBeGreaterThanOrEqual(0);
              expect(s.piece.x).toBeLessThan(width);
            }
            if (s.phase === 'falling') {
              const grid = game.gridCopy();
              expect(isSettled(grid)).toBe(true);
              expect(findMatches(grid).cells).toEqual([]);
              expect(grid.countFilled()).toBe(s.piecesPlaced * 3 - s.blocksCleared);
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('même graine et mêmes commandes : même partie', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(arbCommand, { maxLength: 200 }), (seed, commands) => {
        const a = new Game({ seed });
        const b = new Game({ seed });
        for (const command of commands) {
          apply(a, command);
          apply(b, command);
        }
        expect(a.snapshot()).toEqual(b.snapshot());
      }),
      { numRuns: 100 },
    );
  });

  it('un grand pas de temps équivaut à de nombreux petits', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 60_000 }), (seed, total) => {
        const coarse = new Game({ seed, spawnMode: 'center' });
        const fine = new Game({ seed, spawnMode: 'center' });
        coarse.update(total);
        for (let t = 0; t < total; t += 50) fine.update(Math.min(50, total - t));
        const a = coarse.snapshot();
        const b = fine.snapshot();
        expect(a.piecesPlaced).toBe(b.piecesPlaced);
        expect(a.score).toBe(b.score);
        expect(gridRows(coarse)).toEqual(gridRows(fine));
        expect(a.piece?.y ?? 0).toBeCloseTo(b.piece?.y ?? 0, 6);
      }),
      { numRuns: 50 },
    );
  });
});

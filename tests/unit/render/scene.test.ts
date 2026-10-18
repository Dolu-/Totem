import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../../src/config/tuning.ts';
import type { GameSnapshot } from '../../../src/core/game.ts';
import { computeLayout } from '../../../src/render/layout.ts';
import { buildScene, type SceneCell } from '../../../src/render/scene.ts';
import { DEFAULT_STYLE } from '../../../src/render/style.ts';
import { gameWithGrid } from '../../helpers/game.ts';

const LAYOUT = computeLayout({
  availableWidth: 1000,
  availableHeight: 1000,
  columns: 4,
  rows: 6,
  devicePixelRatio: 1,
});
const SIZE = LAYOUT.cellSize;
const MOTION = { reducedMotion: false };
const at = (cells: readonly SceneCell[], x: number, y: number): SceneCell | undefined =>
  cells.find((c) => c.x === x * SIZE && c.y === y * SIZE);

/** Pose la pièce [0, 1, 2] en colonne 2 sur « 00.. » : la ligne du bas s'efface. */
function clearingGame() {
  const game = gameWithGrid(['....', '....', '....', '....', '....', '00..']);
  game.debugSetPiece([0, 1, 2], 2, 5);
  game.setSoftDrop(true);
  game.update(1);
  return game;
}

describe('buildScene', () => {
  it('place les cases posées et la pièce (case du bas en premier)', () => {
    const game = gameWithGrid(['....', '....', '....', '....', '....', '3...']);
    game.debugSetPiece([0, 1, 2], 2, 1.5);
    const { cells, chain } = buildScene(game.snapshot(), LAYOUT, MOTION);
    expect(at(cells, 0, 5)).toMatchObject({ value: 3, alpha: 1, outline: 0 });
    expect(cells.slice(-3).map((c) => [c.x / SIZE, c.y / SIZE, c.value])).toEqual([
      [2, 1.5, 0],
      [2, 0.5, 1],
      [2, -0.5, 2],
    ]);
    expect(chain).toBeNull();
  });

  it('chute affichée par crans (quarts de case par défaut), position logique continue', () => {
    const game = gameWithGrid(['....', '....', '....', '....', '....', '....']);
    game.debugSetPiece([0, 1, 2], 1, 1.7);
    const bottom = buildScene(game.snapshot(), LAYOUT, MOTION).cells.at(-3);
    expect(bottom?.y).toBe(1.5 * SIZE); // 1,7 → cran 1,5 (quarts : 1,5 ; 1,75…)
    expect(game.snapshot().piece?.y).toBe(1.7);
    const thirds = { ...MOTION, style: { ...DEFAULT_STYLE, fallStepsPerCell: 3 } };
    expect(buildScene(game.snapshot(), LAYOUT, thirds).cells.at(-3)?.y).toBeCloseTo((5 / 3) * SIZE);
    const halves = { ...MOTION, style: { ...DEFAULT_STYLE, fallStepsPerCell: 2 } };
    game.debugSetPiece([0, 1, 2], 1, 1.8);
    expect(buildScene(game.snapshot(), LAYOUT, MOTION).cells.at(-3)?.y).toBe(1.75 * SIZE);
    expect(buildScene(game.snapshot(), LAYOUT, halves).cells.at(-3)?.y).toBe(1.5 * SIZE);
    const smooth = { ...MOTION, style: { ...DEFAULT_STYLE, fallStepsPerCell: 0 } };
    expect(buildScene(game.snapshot(), LAYOUT, smooth).cells.at(-3)?.y).toBeCloseTo(1.8 * SIZE);
  });

  it('glissement en cascade par demi-cases : bas, puis milieu, puis haut', () => {
    const game = gameWithGrid(['....', '....', '....', '....', '....', '....']);
    game.debugSetPiece([0, 1, 2], 1, 3);
    game.moveRight();
    const slideMs = DEFAULT_TUNING.timing.slideMs;
    // Colonnes affichées (bas, milieu, haut) à différents moments du glissement de 1 vers 2.
    const columns = (): number[] =>
      buildScene(game.snapshot(), LAYOUT, MOTION)
        .cells.slice(-3)
        .map((c) => c.x / SIZE);
    expect(columns()).toEqual([1, 1, 1]);
    game.update(slideMs * 0.3);
    expect(columns()).toEqual([1.5, 1, 1]);
    game.update(slideMs * 0.25);
    expect(columns()).toEqual([2, 1.5, 1]);
    game.update(slideMs * 0.25);
    expect(columns()).toEqual([2, 2, 1.5]);
    game.update(slideMs * 0.2);
    expect(columns()).toEqual([2, 2, 2]);
  });

  it('glissement sans crans (style continu) : mouvement progressif', () => {
    const game = gameWithGrid(['....', '....', '....', '....', '....', '....']);
    game.debugSetPiece([0, 1, 2], 1, 3);
    game.moveRight();
    game.update(DEFAULT_TUNING.timing.slideMs * 0.3);
    const smooth = { ...MOTION, style: { ...DEFAULT_STYLE, slideStepsPerCell: 0 } };
    const bottom = buildScene(game.snapshot(), LAYOUT, smooth).cells.at(-3);
    expect((bottom?.x ?? 0) / SIZE).toBeGreaterThan(1.5);
    expect((bottom?.x ?? 0) / SIZE).toBeLessThan(2);
  });

  it('disparition : le contour reste, le contenu devient transparent par seizièmes', () => {
    const game = clearingGame();
    const clearMs = DEFAULT_TUNING.timing.clearMs;
    const cell = (): SceneCell | undefined =>
      at(buildScene(game.snapshot(), LAYOUT, MOTION).cells, 0, 5);
    expect(cell()).toMatchObject({ alpha: 1, outline: 1 });
    // clearingGame a consommé 1 ms : on se place à 50 % puis à 97 % de la disparition.
    game.update(clearMs * 0.5 - 1);
    expect(cell()).toMatchObject({ alpha: 0.5, outline: 1 });
    game.update(clearMs * 0.47);
    expect(cell()?.alpha).toBe(1 - 15 / 16);
    expect(cell()?.outline).toBe(1);
  });

  it('disparition sans paliers (style continu)', () => {
    const game = clearingGame();
    game.update(DEFAULT_TUNING.timing.clearMs * 0.3);
    const smooth = { ...MOTION, style: { ...DEFAULT_STYLE, clearFadeSteps: 0 } };
    const cell = at(buildScene(game.snapshot(), LAYOUT, smooth).cells, 0, 5);
    expect(cell?.alpha).toBeCloseTo(
      1 - (DEFAULT_TUNING.timing.clearMs * 0.3 + 1) / DEFAULT_TUNING.timing.clearMs,
      6,
    );
  });

  it('tassement : chute par quarts de case, de la position d’origine vers la destination', () => {
    const game = clearingGame();
    // clearingGame a déjà consommé 1 ms d'effacement : on s'arrête au tout début du tassement.
    game.update(DEFAULT_TUNING.timing.clearMs - 1);
    const snap: GameSnapshot = game.snapshot();
    expect(snap.phase).toBe('collapsing');
    const ys = (s: GameSnapshot, options = MOTION): number[] =>
      buildScene(s, LAYOUT, options)
        .cells.filter((c) => c.x === 2 * SIZE)
        .map((c) => c.y / SIZE)
        .sort();
    const at = (progress: number): GameSnapshot => ({
      ...snap,
      collapsing: snap.collapsing && { ...snap.collapsing, progress },
    });
    expect(ys(snap)).toEqual([3, 4]);
    expect(ys(at(0.2))).toEqual([3, 4]);
    expect(ys(at(0.3))).toEqual([3.25, 4.25]);
    expect(ys(at(0.6))).toEqual([3.5, 4.5]);
    expect(ys(at(1))).toEqual([4, 5]);
    // Mouvement réduit : directement à destination.
    expect(ys(snap, { reducedMotion: true })).toEqual([4, 5]);
    // Style continu : position intermédiaire quelconque.
    const smooth = { ...MOTION, style: { ...DEFAULT_STYLE, collapseStepsPerCell: 0 } };
    expect(ys(at(0.3), smooth)[0]).toBeGreaterThan(3.25);
  });

  it('« ×2 » : apparaît grand et rétrécit pendant la disparition, s’estompe pendant la chute', () => {
    const game = gameWithGrid(['....', '....', '....', '....', '.22.', '211.']);
    game.debugSetPiece([1, 3, 4], 3, 5);
    game.setSoftDrop(true);
    const chainNow = () => buildScene(game.snapshot(), LAYOUT, MOTION).chain;
    for (let t = 0; t < 5000 && !chainNow(); t += 5) game.update(5);
    const first = chainNow();
    expect(first).toMatchObject({ text: '×2', x: 2 * SIZE, y: 3 * SIZE, accent: 0, alpha: 1 });
    expect(first?.size).toBeCloseTo(DEFAULT_STYLE.chainZoomFrom * SIZE, 0);
    game.update(DEFAULT_TUNING.timing.clearMs / 2);
    const middle = chainNow();
    expect(middle?.size).toBeLessThan(first?.size ?? 0);
    expect(middle?.size).toBeGreaterThan(DEFAULT_STYLE.chainZoomTo * SIZE);
    // Pendant la chute qui suit une disparition : taille finale, en s'estompant.
    const snap = game.snapshot();
    const collapsing: GameSnapshot = {
      ...snap,
      phase: 'collapsing',
      clearing: null,
      collapsing: { moves: [], progress: 0.5 },
    };
    const fading = buildScene(collapsing, LAYOUT, MOTION).chain;
    expect(fading?.size).toBeCloseTo(DEFAULT_STYLE.chainZoomTo * SIZE, 6);
    expect(fading?.alpha).toBeCloseTo(0.75, 6);
    // Plus de texte une fois la pièce suivante en jeu.
    for (let t = 0; t < 5000 && game.phase !== 'falling'; t += 5) game.update(5);
    expect(chainNow()).toBeNull();
  });

  it('pas de « ×N » pour un simple effacement', () => {
    const game = clearingGame();
    expect(buildScene(game.snapshot(), LAYOUT, MOTION).chain).toBeNull();
  });
});

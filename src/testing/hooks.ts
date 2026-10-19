/**
 * API de test exposée sur `window.__totem`, uniquement dans le build e2e
 * (`VITE_TEST_HOOKS=true`) : Vite l'élimine du build de production.
 * Permet aux tests Playwright (et au bot) de lire l'état, d'imposer une
 * situation et de piloter le temps de façon déterministe.
 */
import { mergeTuning, type DeepPartial, type Tuning } from '../config/tuning.ts';
import type { Game } from '../core/game.ts';
import { Grid } from '../core/grid.ts';
import type { CellValue } from '../core/types.ts';
import type { GameView } from '../game-view.ts';
import type { LatestVersion } from '../release/version.ts';

/** Instantané sérialisable (la grille devient des lignes texte, cf. `Grid.toRows`). */
export interface TestSnapshot {
  readonly rows: string[];
  readonly phase: string;
  readonly paused: boolean;
  readonly piece: { colors: CellValue[]; x: number; y: number } | null;
  readonly score: number;
  readonly level: number;
  readonly chain: number;
  readonly piecesPlaced: number;
  readonly blocksCleared: number;
  readonly alignmentsCleared: number;
  readonly width: number;
  readonly height: number;
}

export interface TestHooks {
  snapshot(): TestSnapshot | null;
  /** Fige le temps de jeu (true) : seule `advance` le fait progresser. */
  setManualTime(manual: boolean): void;
  advance(ms: number): void;
  setGrid(rows: string[]): void;
  setPiece(colors: CellValue[], x: number, y?: number): void;
  /** Recommence une partie avec ces options (graine, dimensions, réglage interne…). */
  newGame(options?: TestGameOptions): void;
  setColorSymbols(enabled: boolean): void;
  /** Écran affiché (`home`, `playing`, `paused`, `gameOver`…). */
  screen(): string;
  /**
   * Simule l'arrivée d'une nouvelle version (`latest` : contenu de `version.json`, absent s'il
   * n'a pu être lu) ; `updateRequested()` dit si le joueur l'a acceptée.
   */
  simulateUpdate(latest?: LatestVersion): void;
  updateRequested(): boolean;
}

export interface TestGameOptions {
  seed?: number;
  width?: number;
  height?: number;
  colorCount?: number;
  startLevel?: number;
  tuning?: DeepPartial<Tuning>;
}

declare global {
  interface Window {
    __totem?: TestHooks;
  }
}

/** Ce que l'application expose à l'API de test. */
export interface TestTarget {
  readonly view: GameView;
  readonly screen: string;
  /** Lance une partie (écran de jeu) avec ces options. */
  startTestGame(options: TestGameOptions): void;
  notifyUpdate(update: () => void, latest: LatestVersion | null): void;
}

export function installTestHooks(target: TestTarget): void {
  const { view } = target;
  let updateRequested = false;
  const game = (): Game => {
    if (!view.game) throw new Error('Aucune partie en cours');
    return view.game;
  };
  window.__totem = {
    snapshot() {
      if (!view.game) return null;
      const s = view.game.snapshot();
      return {
        rows: view.game.gridCopy().toRows(),
        phase: s.phase,
        paused: s.paused,
        piece: s.piece ? { colors: [...s.piece.colors], x: s.piece.x, y: s.piece.y } : null,
        score: s.score,
        level: s.level,
        chain: s.chain,
        piecesPlaced: s.piecesPlaced,
        blocksCleared: s.blocksCleared,
        alignmentsCleared: s.alignmentsCleared,
        width: s.grid.width,
        height: s.grid.height,
      };
    },
    setManualTime(manual) {
      view.manualTime = manual;
    },
    advance(ms) {
      view.advance(ms);
    },
    setGrid(rows) {
      game().debugSetGrid(Grid.fromRows(rows));
      view.advance(0);
    },
    setPiece(colors, x, y = -1) {
      game().debugSetPiece(colors, x, y);
      view.advance(0);
    },
    newGame(options = {}) {
      target.startTestGame(options);
    },
    setColorSymbols(enabled) {
      view.setRendererOptions({ colorSymbols: enabled });
      view.advance(0);
    },
    screen() {
      return target.screen;
    },
    simulateUpdate(latest) {
      target.notifyUpdate(() => {
        updateRequested = true;
      }, latest ?? null);
    },
    updateRequested() {
      return updateRequested;
    },
  };
}

/** Réglage interne d'une partie de test : défauts fusionnés avec la surcharge. */
export function testTuning(base: Tuning, override: DeepPartial<Tuning> | undefined): Tuning {
  return override ? mergeTuning(base, override) : base;
}

import { assertValidTuning, DEFAULT_TUNING, type Tuning } from '../config/tuning.ts';
import { Emitter } from './events.ts';
import { collapse, removeCells, type CellMove } from './gravity.ts';
import { Grid } from './grid.ts';
import { findMatches } from './matcher.ts';
import { PieceQueue, rotatePiece, spawnColumn, type Piece, type SpawnMode } from './piece.ts';
import { Rng } from './rng.ts';
import { createScoringRule, type ScoringRule } from './scoring.ts';
import { cellsPerSecond, heightFactor, levelFor, levelProgress, toNextLevel } from './speed.ts';
import type { CellValue, Position } from './types.ts';

export interface GameOptions {
  readonly width: number;
  readonly height: number;
  readonly colorCount: number;
  readonly startLevel: number;
  readonly spawnMode: SpawnMode;
  readonly seed: number;
  readonly tuning: Tuning;
  /** Nombre de pièces suivantes exposées dans l'instantané (0 en v1). */
  readonly previewCount: number;
}

export const DEFAULT_GAME_OPTIONS: GameOptions = {
  width: 6,
  height: 15,
  colorCount: 6,
  startLevel: 0,
  spawnMode: 'random',
  seed: 1,
  tuning: DEFAULT_TUNING,
  previewCount: 0,
};

/**
 * - `falling` : une pièce descend (ou repose en attendant le verrouillage) ;
 * - `clearing` : animation de disparition des cases alignées ;
 * - `collapsing` : animation de chute des cases sans support ;
 * - `over` : partie terminée.
 */
export type Phase = 'falling' | 'clearing' | 'collapsing' | 'over';

/** Grille en lecture seule, telle que vue par le rendu. */
export interface ReadonlyGrid {
  readonly width: number;
  readonly height: number;
  get(x: number, y: number): CellValue;
}

export interface ActivePiece {
  readonly colors: readonly CellValue[];
  readonly x: number;
  /**
   * Position verticale continue de la case du BAS : elle couvre les lignes [y, y + 1[.
   * La case `i` (0 = bas) est à `y − i`. Négatif = au-dessus du plateau.
   */
  readonly y: number;
}

export interface GameSnapshot {
  readonly grid: ReadonlyGrid;
  readonly phase: Phase;
  readonly paused: boolean;
  readonly piece: ActivePiece | null;
  /** La pièce repose et attend son verrouillage. */
  readonly resting: boolean;
  /** Glissement latéral en cours (purement visuel) : colonne de départ et avancement [0, 1]. */
  readonly slide: { readonly fromX: number; readonly progress: number } | null;
  readonly clearing: {
    readonly cells: readonly Position[];
    readonly progress: number;
    readonly chain: number;
    readonly points: number;
  } | null;
  readonly collapsing: { readonly moves: readonly CellMove[]; readonly progress: number } | null;
  readonly nextPieces: readonly Piece[];
  readonly score: number;
  readonly level: number;
  readonly blocksCleared: number;
  readonly alignmentsCleared: number;
  /** Progression vers le niveau suivant, dans l'unité du réglage (`tuning.progression.unit`). */
  readonly progress: number;
  readonly toNextLevel: number | null;
  /** Avancement dans le palier en cours (jauge), `null` au niveau maximal. */
  readonly levelProgress: { readonly done: number; readonly total: number } | null;
  readonly chain: number;
  readonly piecesPlaced: number;
  readonly elapsedMs: number;
}

export interface GameEvents {
  spawn: { readonly piece: ActivePiece };
  move: { readonly from: number; readonly to: number };
  rotate: { readonly colors: readonly CellValue[] };
  lock: { readonly cells: readonly Position[] };
  clear: {
    readonly cells: readonly Position[];
    readonly chain: number;
    readonly points: number;
    readonly windowCount: number;
    /** Alignements distincts effacés (un « L » = 2). */
    readonly alignments: number;
  };
  levelUp: { readonly level: number };
  pause: Record<string, never>;
  resume: Record<string, never>;
  gameOver: GameResult;
}

export interface GameResult {
  readonly score: number;
  readonly level: number;
  readonly blocksCleared: number;
  readonly alignmentsCleared: number;
  readonly piecesPlaced: number;
  readonly durationMs: number;
}

/**
 * Orchestrateur d'une partie. Pur et déterministe : le temps est fourni par
 * `update(dtMs)`, le hasard vient de la graine. Aucune dépendance au DOM.
 */
export class Game {
  readonly events = new Emitter<GameEvents>();
  readonly options: GameOptions;

  readonly #tuning: Tuning;
  readonly #scoring: ScoringRule;
  readonly #queue: PieceQueue;
  readonly #spawnRng: Rng;

  #grid: Grid;
  #phase: Phase = 'falling';
  #paused = false;
  #piece: { colors: CellValue[]; x: number; y: number } | null = null;
  /** Descente rapide maintenue (touche, bouton ou doigt posé) : persiste d'une pièce à l'autre. */
  #softDrop = false;
  /** Descente rapide ponctuelle (geste vif) : s'arrête quand la pièce se pose. */
  #softDropOnce = false;
  /** Temps écoulé depuis le début de la descente rapide (temporisation avant accélération). */
  #softDropHeldMs = 0;
  #lockTimer = 0;
  #slide: { fromX: number; elapsed: number } | null = null;
  #phaseTimer = 0;
  #phaseDuration = 0;
  #clearing: { cells: Position[]; chain: number; points: number; alignments: number } | null = null;
  #collapsing: { moves: CellMove[]; grid: Grid } | null = null;
  #score = 0;
  #blocksCleared = 0;
  #alignmentsCleared = 0;
  /** Unités comptées pour la progression de niveau (cf. `tuning.progression`). */
  #progressUnits = 0;
  #level: number;
  #chain = 0;
  #piecesPlaced = 0;
  #elapsedMs = 0;

  constructor(options: Partial<GameOptions> = {}) {
    this.options = { ...DEFAULT_GAME_OPTIONS, ...options };
    const { width, height, colorCount, seed, tuning, startLevel } = this.options;
    this.#tuning = assertValidTuning(tuning);
    this.#scoring = createScoringRule(tuning);
    // Deux suites indépendantes : consulter les pièces suivantes ne doit pas changer les colonnes d'apparition.
    this.#queue = new PieceQueue(new Rng(seed), colorCount);
    this.#spawnRng = new Rng(seed ^ 0x9e3779b9);
    this.#grid = new Grid(width, height);
    this.#level = levelFor(0, startLevel, tuning);
    this.#spawn();
  }

  // ─── Commandes ────────────────────────────────────────────────────────────

  moveLeft(): boolean {
    return this.#move(-1);
  }

  moveRight(): boolean {
    return this.#move(1);
  }

  rotate(): boolean {
    if (!this.#canControl() || !this.#piece) return false;
    this.#piece.colors = [...rotatePiece(this.#piece).colors];
    this.events.emit('rotate', { colors: [...this.#piece.colors] });
    return true;
  }

  /**
   * Descente rapide maintenue : active tant que la commande est tenue, y compris pour
   * les pièces suivantes (touche ou doigt restés appuyés, comme dans l'original).
   * Une pièce qui repose est verrouillée aussitôt. `immediate` (tactile) supprime la
   * temporisation avant l'accélération : la pièce accompagne le doigt dès qu'il descend.
   */
  setSoftDrop(active: boolean, immediate = false): void {
    if (active && !this.#dropping()) {
      this.#softDropHeldMs = immediate ? this.#tuning.timing.softDropDelayMs : 0;
    }
    this.#softDrop = active;
  }

  /** Descente rapide ponctuelle (geste vif) : jusqu'à ce que la pièce courante se pose. */
  softDropUntilLock(): void {
    if (!this.#canControl()) return;
    if (!this.#dropping()) this.#softDropHeldMs = 0;
    this.#softDropOnce = true;
  }

  pause(): void {
    if (this.#paused || this.#phase === 'over') return;
    this.#paused = true;
    this.#softDrop = false;
    this.#softDropOnce = false;
    this.events.emit('pause', {});
  }

  resume(): void {
    if (!this.#paused) return;
    this.#paused = false;
    this.events.emit('resume', {});
  }

  /** Arrêt volontaire (bouton « Stop » de l'écran de pause) : termine la partie. */
  end(): void {
    if (this.#phase === 'over') return;
    this.#paused = false;
    this.#gameOver();
  }

  // ─── Temps ────────────────────────────────────────────────────────────────

  update(dtMs: number): void {
    if (this.#paused || this.#phase === 'over' || !(dtMs > 0)) return;
    this.#elapsedMs += dtMs;
    if (this.#dropping()) this.#softDropHeldMs += dtMs;
    this.#advanceSlide(dtMs);
    let remaining = dtMs;
    // Un même pas de temps peut couvrir plusieurs phases (utile aux simulations accélérées).
    while (remaining > 0) {
      switch (this.#phase) {
        case 'falling':
          remaining = this.#updateFalling(remaining);
          break;
        case 'clearing':
        case 'collapsing':
          remaining = this.#updateAnimation(remaining);
          break;
        default:
          // Partie terminée pendant ce pas de temps.
          return;
      }
    }
  }

  // ─── Lecture ──────────────────────────────────────────────────────────────

  get phase(): Phase {
    return this.#phase;
  }

  get tuning(): Tuning {
    return this.#tuning;
  }

  snapshot(): GameSnapshot {
    const piece = this.#piece;
    const { slideMs } = this.#tuning.timing;
    return {
      grid: this.#grid,
      phase: this.#phase,
      paused: this.#paused,
      piece: piece ? { colors: [...piece.colors], x: piece.x, y: piece.y } : null,
      resting: piece !== null && this.#phase === 'falling' && piece.y >= this.#restY(piece.x),
      slide: this.#slide
        ? {
            fromX: this.#slide.fromX,
            progress: slideMs > 0 ? Math.min(1, this.#slide.elapsed / slideMs) : 1,
          }
        : null,
      clearing: this.#clearing
        ? { ...this.#clearing, cells: [...this.#clearing.cells], progress: this.#phaseProgress() }
        : null,
      collapsing: this.#collapsing
        ? { moves: [...this.#collapsing.moves], progress: this.#phaseProgress() }
        : null,
      nextPieces: this.options.previewCount > 0 ? this.#queue.peek(this.options.previewCount) : [],
      score: this.#score,
      level: this.#level,
      blocksCleared: this.#blocksCleared,
      alignmentsCleared: this.#alignmentsCleared,
      progress: this.#progress(),
      toNextLevel: toNextLevel(this.#progress(), this.options.startLevel, this.#tuning),
      levelProgress: levelProgress(this.#progress(), this.options.startLevel, this.#tuning),
      chain: this.#chain,
      piecesPlaced: this.#piecesPlaced,
      elapsedMs: this.#elapsedMs,
    };
  }

  /** Copie de la grille (pour le bot et les tests). */
  gridCopy(): Grid {
    return this.#grid.clone();
  }

  /** Vitesse de chute actuelle (cases par seconde), descente rapide incluse. */
  currentSpeed(): number {
    const base = cellsPerSecond(this.#level, this.#tuning);
    // La descente rapide n'accélère qu'après la temporisation (comme la répétition clavier d'origine).
    const accelerated =
      this.#dropping() && this.#softDropHeldMs >= this.#tuning.timing.softDropDelayMs;
    const speed = accelerated ? Math.max(base, this.#tuning.speed.softDropCellsPerSecond) : base;
    return speed * heightFactor(this.#grid.height, this.#tuning);
  }

  // ─── Outils de test (API de test, jamais utilisés par le jeu) ──────────────

  /** Remplace la grille. La grille doit être tassée et sans alignement. */
  debugSetGrid(grid: Grid): void {
    if (grid.width !== this.#grid.width || grid.height !== this.#grid.height) {
      throw new RangeError('Dimensions de grille différentes de celles de la partie');
    }
    this.#grid = grid.clone();
  }

  /** Remplace la pièce courante (couleurs du bas vers le haut). */
  debugSetPiece(colors: readonly CellValue[], x: number, y = -1): void {
    this.#phase = 'falling';
    this.#clearing = null;
    this.#collapsing = null;
    this.#piece = { colors: [...colors], x, y };
    this.#lockTimer = 0;
    this.#slide = null;
  }

  // ─── Interne ──────────────────────────────────────────────────────────────

  #dropping(): boolean {
    return this.#softDrop || this.#softDropOnce;
  }

  /** Progression accumulée dans l'unité du réglage. */
  #progress(): number {
    return this.#progressUnits;
  }

  #canControl(): boolean {
    return !this.#paused && this.#phase === 'falling' && this.#piece !== null;
  }

  #spawn(): void {
    const colors = [...this.#queue.next().colors];
    const x = spawnColumn(this.#spawnRng, this.#grid.width, this.options.spawnMode);
    this.#piece = { colors, x, y: -1 };
    this.#phase = 'falling';
    this.#lockTimer = 0;
    this.#slide = null;
    this.#chain = 0;
    this.events.emit('spawn', { piece: { colors: [...colors], x, y: -1 } });
  }

  /** Ligne de repos de la case du bas dans la colonne `x`. */
  #restY(x: number): number {
    return this.#grid.topOf(x) - 1;
  }

  /** La pièce tiendrait-elle dans la colonne `x` à sa hauteur actuelle ? */
  #fits(x: number, y: number, size: number): boolean {
    if (x < 0 || x >= this.#grid.width) return false;
    for (let i = 0; i < size; i += 1) {
      const top = Math.floor(y - i);
      const bottom = Math.ceil(y - i);
      for (const row of top === bottom ? [top] : [top, bottom]) {
        if (row >= this.#grid.height) return false;
        if (row >= 0 && !this.#grid.isEmpty(x, row)) return false;
      }
    }
    return true;
  }

  #move(direction: -1 | 1): boolean {
    const piece = this.#piece;
    if (!this.#canControl() || !piece) return false;
    const to = piece.x + direction;
    if (!this.#fits(to, piece.y, piece.colors.length)) return false;
    const from = piece.x;
    piece.x = to;
    this.#slide = { fromX: from, elapsed: 0 };
    // La pièce repart si la nouvelle colonne est plus profonde : le délai de verrouillage repart de zéro.
    if (piece.y < this.#restY(to)) this.#lockTimer = 0;
    this.events.emit('move', { from, to });
    return true;
  }

  #advanceSlide(dtMs: number): void {
    if (!this.#slide) return;
    this.#slide.elapsed += dtMs;
    if (this.#slide.elapsed >= this.#tuning.timing.slideMs) this.#slide = null;
  }

  /** Calculé sur la vitesse non adaptée à la hauteur : même délai ressenti sur tout plateau. */
  #lockDelayMs(): number {
    const { lockDelayMinMs, lockDelayCells } = this.#tuning.timing;
    return Math.max(
      lockDelayMinMs,
      (lockDelayCells * 1000) / cellsPerSecond(this.#level, this.#tuning),
    );
  }

  /** Fait avancer la chute ; renvoie le temps non consommé. */
  #updateFalling(dtMs: number): number {
    const piece = this.#piece;
    if (!piece) return 0;
    const restY = this.#restY(piece.x);

    if (piece.y < restY) {
      const speed = this.currentSpeed();
      const msToRest = ((restY - piece.y) / speed) * 1000;
      if (dtMs < msToRest) {
        piece.y += (speed * dtMs) / 1000;
        return 0;
      }
      piece.y = restY;
      this.#lockTimer = 0;
      return this.#updateResting(dtMs - msToRest);
    }
    return this.#updateResting(dtMs);
  }

  #updateResting(dtMs: number): number {
    if (this.#dropping()) {
      this.#lock();
      return dtMs;
    }
    const delay = this.#lockDelayMs();
    this.#lockTimer += dtMs;
    if (this.#lockTimer < delay) return 0;
    const leftover = this.#lockTimer - delay;
    this.#lock();
    return leftover;
  }

  #lock(): void {
    const piece = this.#piece;
    if (!piece) return;
    const bottom = Math.round(piece.y);
    const cells: Position[] = [];
    let overflow = false;
    for (const [i, color] of piece.colors.entries()) {
      const y = bottom - i;
      if (y < 0) {
        overflow = true;
        continue;
      }
      this.#grid.set(piece.x, y, color);
      cells.push({ x: piece.x, y });
    }
    this.#piece = null;
    this.#slide = null;
    // La descente maintenue continue sur la pièce suivante ; la ponctuelle s'arrête ici.
    this.#softDropOnce = false;
    this.#piecesPlaced += 1;
    this.events.emit('lock', { cells });
    if (overflow) {
      this.#gameOver();
      return;
    }
    this.#resolve();
  }

  /** Cherche des alignements : lance l'effacement, ou fait apparaître la pièce suivante. */
  #resolve(): void {
    const match = findMatches(this.#grid);
    if (match.cells.length === 0) {
      this.#spawn();
      return;
    }
    this.#chain += 1;
    const points = this.#scoring.points({
      windowCount: match.windowCount,
      cellsCleared: match.cells.length,
      chain: this.#chain,
      level: this.#level,
    });
    this.#score += points;
    const alignments = match.segments.length;
    this.#clearing = { cells: [...match.cells], chain: this.#chain, points, alignments };
    this.#startAnimation('clearing', this.#tuning.timing.clearMs);
    this.events.emit('clear', {
      cells: [...match.cells],
      chain: this.#chain,
      points,
      windowCount: match.windowCount,
      alignments,
    });
  }

  #startAnimation(phase: 'clearing' | 'collapsing', durationMs: number): void {
    this.#phase = phase;
    this.#phaseTimer = 0;
    this.#phaseDuration = durationMs;
  }

  #phaseProgress(): number {
    return this.#phaseDuration > 0 ? Math.min(1, this.#phaseTimer / this.#phaseDuration) : 1;
  }

  #updateAnimation(dtMs: number): number {
    this.#phaseTimer += dtMs;
    if (this.#phaseTimer < this.#phaseDuration) return 0;
    const leftover = this.#phaseTimer - this.#phaseDuration;
    if (this.#phase === 'clearing') this.#finishClearing();
    else this.#finishCollapsing();
    return leftover;
  }

  #finishClearing(): void {
    const clearing = this.#clearing;
    if (!clearing) return;
    this.#clearing = null;
    this.#blocksCleared += clearing.cells.length;
    this.#alignmentsCleared += clearing.alignments;
    // Progression vers le niveau suivant : selon le réglage, les étapes de chaîne ne comptent pas.
    const { unit, countChainSteps } = this.#tuning.progression;
    if (clearing.chain === 1 || countChainSteps) {
      this.#progressUnits += unit === 'alignments' ? clearing.alignments : clearing.cells.length;
    }
    const level = levelFor(this.#progress(), this.options.startLevel, this.#tuning);
    if (level > this.#level) {
      this.#level = level;
      this.events.emit('levelUp', { level });
    }
    const { grid, moves } = collapse(removeCells(this.#grid, clearing.cells));
    if (moves.length === 0) {
      this.#grid = grid;
      this.#resolve();
      return;
    }
    // La grille affichée garde les cases à leur place d'origine pendant l'animation.
    this.#grid = removeCells(this.#grid, clearing.cells);
    this.#collapsing = { moves, grid };
    const distance = Math.max(...moves.map((m) => m.toY - m.fromY));
    this.#startAnimation('collapsing', distance * this.#tuning.timing.collapseMsPerCell);
  }

  #finishCollapsing(): void {
    const collapsing = this.#collapsing;
    if (!collapsing) return;
    this.#collapsing = null;
    this.#grid = collapsing.grid;
    this.#resolve();
  }

  #gameOver(): void {
    this.#phase = 'over';
    this.#piece = null;
    this.#slide = null;
    this.#clearing = null;
    this.#collapsing = null;
    this.events.emit('gameOver', {
      score: this.#score,
      level: this.#level,
      blocksCleared: this.#blocksCleared,
      alignmentsCleared: this.#alignmentsCleared,
      piecesPlaced: this.#piecesPlaced,
      durationMs: this.#elapsedMs,
    });
  }
}

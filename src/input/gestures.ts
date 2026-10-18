/**
 * Gestes au doigt, à la souris ou au stylet (Pointer Events, un seul code) :
 * - glisser à gauche / à droite : une colonne par largeur de case parcourue
 *   (la pièce suit le doigt, un long glissement déplace de plusieurs colonnes) ;
 * - glisser vers le haut : permuter (décidé au relâchement, comme 2048) ;
 * - toucher (tap) ou clic bref : permuter ;
 * - glisser vers le bas : descente rapide tant que le doigt reste posé (même pour
 *   les pièces suivantes) ; un geste vif (relâché rapidement) la garde jusqu'à ce
 *   que la pièce courante se pose.
 * L'axe est verrouillé dès que le geste est reconnu : pas de diagonale ambiguë.
 */
import { capturePointer, type ActionSink } from './actions.ts';

export interface GestureOptions {
  /** Côté d'une case à l'écran, en pixels CSS (les seuils en dépendent). */
  readonly cellSize: () => number;
  /** Distance horizontale, en cases, pour un déplacement d'une colonne. */
  readonly moveCells: number;
  /** Distance verticale, en cases, pour reconnaître un glissement haut ou bas. */
  readonly swipeCells: number;
  readonly tapMaxPx: number;
  readonly tapMaxMs: number;
  /** Horloge en ms (injectable pour les tests). */
  readonly now?: () => number;
}

type Axis = 'horizontal' | 'vertical';

interface Track {
  readonly id: number;
  readonly startX: number;
  readonly startY: number;
  readonly startTime: number;
  /** Abscisse de référence du dernier déplacement effectué. */
  anchorX: number;
  axis: Axis | null;
  dropping: boolean;
  swipedUp: boolean;
}

export class GestureController {
  readonly #element: HTMLElement;
  readonly #sink: ActionSink;
  readonly #options: GestureOptions;
  readonly #now: () => number;
  #track: Track | null = null;
  #enabled = true;

  constructor(element: HTMLElement, sink: ActionSink, options: GestureOptions) {
    this.#element = element;
    this.#sink = sink;
    this.#options = options;
    this.#now = options.now ?? (() => performance.now());
    element.addEventListener('pointerdown', this.#onDown);
    element.addEventListener('pointermove', this.#onMove);
    element.addEventListener('pointerup', this.#onUp);
    element.addEventListener('pointercancel', this.#onCancel);
    element.addEventListener('lostpointercapture', this.#onCancel);
    element.addEventListener('contextmenu', this.#preventDefault);
  }

  set enabled(enabled: boolean) {
    this.#enabled = enabled;
    if (!enabled) this.#cancel();
  }

  destroy(): void {
    this.#element.removeEventListener('pointerdown', this.#onDown);
    this.#element.removeEventListener('pointermove', this.#onMove);
    this.#element.removeEventListener('pointerup', this.#onUp);
    this.#element.removeEventListener('pointercancel', this.#onCancel);
    this.#element.removeEventListener('lostpointercapture', this.#onCancel);
    this.#element.removeEventListener('contextmenu', this.#preventDefault);
  }

  readonly #preventDefault = (event: Event): void => {
    event.preventDefault();
  };

  #thresholds(): { lock: number; move: number; swipe: number } {
    const cell = Math.max(1, this.#options.cellSize());
    return {
      // Distance à partir de laquelle le geste n'est plus un tap et choisit son axe.
      lock: Math.max(this.#options.tapMaxPx, cell * 0.3),
      move: cell * this.#options.moveCells,
      swipe: cell * this.#options.swipeCells,
    };
  }

  readonly #onDown = (event: PointerEvent): void => {
    if (!this.#enabled || this.#track !== null) return; // un seul doigt à la fois
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    capturePointer(this.#element, event.pointerId);
    this.#track = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: this.#now(),
      anchorX: event.clientX,
      axis: null,
      dropping: false,
      swipedUp: false,
    };
  };

  readonly #onMove = (event: PointerEvent): void => {
    const track = this.#track;
    if (track?.id !== event.pointerId) return;
    event.preventDefault();
    const { lock, move, swipe } = this.#thresholds();
    const dx = event.clientX - track.startX;
    const dy = event.clientY - track.startY;

    if (track.axis === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < lock) return;
      track.axis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    if (track.axis === 'horizontal') {
      let offset = event.clientX - track.anchorX;
      while (Math.abs(offset) >= move) {
        const direction = offset > 0 ? 1 : -1;
        if (direction > 0) this.#sink.moveRight();
        else this.#sink.moveLeft();
        track.anchorX += direction * move;
        offset = event.clientX - track.anchorX;
      }
    } else if (dy >= swipe && !track.dropping) {
      track.dropping = true;
      this.#sink.setSoftDrop(true);
    } else if (dy <= -swipe) {
      track.swipedUp = true;
    }
  };

  readonly #onUp = (event: PointerEvent): void => {
    const track = this.#track;
    if (track?.id !== event.pointerId) return;
    // La position finale compte comme un dernier mouvement (geste vif sans pointermove).
    this.#onMove(event);
    this.#track = null;
    const duration = this.#now() - track.startTime;
    const distance = Math.hypot(event.clientX - track.startX, event.clientY - track.startY);
    const quick = duration <= this.#options.tapMaxMs;

    if (track.axis === null) {
      if (quick && distance <= this.#options.tapMaxPx) this.#sink.rotate();
    } else if (track.axis === 'vertical') {
      if (track.swipedUp && !track.dropping) this.#sink.rotate();
      if (track.dropping) {
        this.#sink.setSoftDrop(false);
        // Geste vif vers le bas : la descente rapide continue jusqu'à la pose de la pièce.
        if (quick) this.#sink.softDropUntilLock();
      }
    }
  };

  readonly #onCancel = (event: Event): void => {
    const track = this.#track;
    if (!track) return;
    if (event instanceof PointerEvent && event.pointerId !== track.id) return;
    this.#cancel();
  };

  #cancel(): void {
    const track = this.#track;
    this.#track = null;
    if (track?.dropping) this.#sink.setSoftDrop(false);
  }
}

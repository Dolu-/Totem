/**
 * Clavier. Les touches sont identifiées par leur position physique (`code`) :
 * flèches, et WASD en QWERTY = ZQSD en AZERTY.
 * - ← → (A D) : déplacer, répété tant que la touche est maintenue ;
 * - ↑ (W) ou X : permuter ;
 * - ↓ (S) ou Espace : descente rapide tant que la touche est maintenue ;
 * - P ou Échap : pause.
 */
import { RepeatTimer, type ActionSink } from './actions.ts';

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const ROTATE = new Set(['ArrowUp', 'KeyW', 'KeyX']);
const DROP = new Set(['ArrowDown', 'KeyS', 'Space']);
const PAUSE = new Set(['KeyP', 'Escape']);

export interface KeyboardOptions {
  readonly repeatDelayMs: number;
  readonly repeatIntervalMs: number;
}

/** Vrai si la frappe vise un champ de saisie (on ne la détourne pas). */
function isTyping(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return (
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
    null
  );
}

export class KeyboardController {
  readonly #target: EventTarget;
  readonly #sink: ActionSink;
  readonly #repeat: RepeatTimer;
  /** Touches de déplacement enfoncées, la dernière en fin de liste (elle l'emporte). */
  readonly #held: string[] = [];
  readonly #dropKeys = new Set<string>();
  #enabled = true;

  constructor(target: EventTarget, sink: ActionSink, options: KeyboardOptions) {
    this.#target = target;
    this.#sink = sink;
    this.#repeat = new RepeatTimer(options.repeatDelayMs, options.repeatIntervalMs);
    target.addEventListener('keydown', this.#onKeyDown as EventListener);
    target.addEventListener('keyup', this.#onKeyUp as EventListener);
    target.addEventListener('blur', this.#releaseAll);
  }

  /** Désactivé (menus ouverts…), toutes les touches maintenues sont relâchées. */
  set enabled(enabled: boolean) {
    this.#enabled = enabled;
    if (!enabled) this.#releaseAll();
  }

  /** Appelé à chaque pas de temps de jeu : répétition des déplacements maintenus. */
  update(dtMs: number): void {
    const steps = this.#repeat.update(dtMs);
    for (let i = 0; i < steps; i += 1) this.#move(this.#repeat.direction);
  }

  destroy(): void {
    this.#target.removeEventListener('keydown', this.#onKeyDown as EventListener);
    this.#target.removeEventListener('keyup', this.#onKeyUp as EventListener);
    this.#target.removeEventListener('blur', this.#releaseAll);
  }

  #move(direction: -1 | 1 | null): void {
    if (direction === -1) this.#sink.moveLeft();
    else if (direction === 1) this.#sink.moveRight();
  }

  #directionOf(code: string): -1 | 1 | null {
    if (LEFT.has(code)) return -1;
    if (RIGHT.has(code)) return 1;
    return null;
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (!this.#enabled || event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
    const { code } = event;
    const direction = this.#directionOf(code);
    if (direction !== null) {
      event.preventDefault();
      if (event.repeat || this.#held.includes(code)) return; // répétition gérée par le jeu
      this.#held.push(code);
      this.#move(direction);
      this.#repeat.press(direction);
    } else if (ROTATE.has(code)) {
      event.preventDefault();
      if (!event.repeat) this.#sink.rotate();
    } else if (DROP.has(code)) {
      event.preventDefault();
      if (this.#dropKeys.size === 0) this.#sink.setSoftDrop(true);
      this.#dropKeys.add(code);
    } else if (PAUSE.has(code)) {
      event.preventDefault();
      if (!event.repeat) this.#sink.togglePause();
    }
  };

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    const { code } = event;
    const index = this.#held.indexOf(code);
    if (index >= 0) {
      this.#held.splice(index, 1);
      // On reprend la direction encore maintenue, sans pas immédiat supplémentaire.
      const remaining = this.#held[this.#held.length - 1];
      const direction = remaining === undefined ? null : this.#directionOf(remaining);
      if (direction === null) this.#repeat.release();
      else this.#repeat.press(direction);
    }
    if (this.#dropKeys.delete(code) && this.#dropKeys.size === 0) this.#sink.setSoftDrop(false);
  };

  readonly #releaseAll = (): void => {
    this.#held.length = 0;
    this.#repeat.release();
    if (this.#dropKeys.size > 0) {
      this.#dropKeys.clear();
      this.#sink.setSoftDrop(false);
    }
  };
}

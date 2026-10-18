/**
 * Boutons de contrôle à l'écran (option des réglages), en complément des gestes :
 * ← et → répétés tant qu'ils sont maintenus, ↓ maintenu = descente rapide,
 * permuter, pause.
 */
import { icon } from '../ui/icons.ts';
import { RepeatTimer, capturePointer, type ActionSink } from './actions.ts';

export interface TouchButtonLabels {
  readonly left: string;
  readonly right: string;
  readonly rotate: string;
  readonly down: string;
  readonly pause: string;
}

type ButtonId = keyof TouchButtonLabels;

export class TouchButtons {
  readonly element: HTMLElement;
  readonly #sink: ActionSink;
  readonly #repeat: RepeatTimer;
  readonly #buttons = new Map<ButtonId, HTMLButtonElement>();

  constructor(
    sink: ActionSink,
    labels: TouchButtonLabels,
    repeat: { delayMs: number; intervalMs: number },
  ) {
    this.#sink = sink;
    this.#repeat = new RepeatTimer(repeat.delayMs, repeat.intervalMs);
    this.element = document.createElement('div');
    this.element.className = 'touch-buttons';
    for (const id of ['left', 'down', 'rotate', 'right', 'pause'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `touch-button touch-button--${id}`;
      button.dataset['action'] = id;
      button.append(icon(id));
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        capturePointer(button, event.pointerId);
        this.#press(id);
      });
      const release = (): void => {
        this.#release(id);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      // Activation au clavier (Tab + Entrée) : une action simple.
      button.addEventListener('click', (event) => {
        if (event.detail === 0) this.#activateOnce(id);
      });
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
      });
      this.#buttons.set(id, button);
      this.element.append(button);
    }
    this.setLabels(labels);
  }

  setLabels(labels: TouchButtonLabels): void {
    for (const [id, button] of this.#buttons) {
      button.setAttribute('aria-label', labels[id]);
      button.title = labels[id];
    }
  }

  /** Répétition des déplacements maintenus (appelé à chaque pas de temps de jeu). */
  update(dtMs: number): void {
    const steps = this.#repeat.update(dtMs);
    for (let i = 0; i < steps; i += 1) {
      if (this.#repeat.direction === -1) this.#sink.moveLeft();
      else if (this.#repeat.direction === 1) this.#sink.moveRight();
    }
  }

  #press(id: ButtonId): void {
    switch (id) {
      case 'left':
        this.#sink.moveLeft();
        this.#repeat.press(-1);
        break;
      case 'right':
        this.#sink.moveRight();
        this.#repeat.press(1);
        break;
      case 'down':
        this.#sink.setSoftDrop(true);
        break;
      case 'rotate':
        this.#sink.rotate();
        break;
      case 'pause':
        this.#sink.togglePause();
        break;
    }
  }

  #release(id: ButtonId): void {
    if (id === 'left' || id === 'right') this.#repeat.release();
    else if (id === 'down') this.#sink.setSoftDrop(false);
  }

  #activateOnce(id: ButtonId): void {
    if (id === 'down') return;
    this.#press(id);
    this.#release(id);
  }
}

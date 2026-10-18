/**
 * Bandeau d'information discret en bas de l'écran (nouvelle version disponible,
 * jeu disponible hors ligne). Il ne masque jamais le plateau d'une partie en cours :
 * l'application décide quand l'afficher.
 */
import { h } from './dom.ts';

export interface NoticeAction {
  readonly label: string;
  readonly onClick: () => void;
}

export class NoticeBar {
  readonly element: HTMLElement;
  readonly #text = h('span', { class: 'notice-bar__text' });
  readonly #actions = h('div', { class: 'notice-bar__actions' });
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.element = h(
      'div',
      { class: 'notice-bar', role: 'status', hidden: true },
      this.#text,
      this.#actions,
    );
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  /** Affiche un message ; sans action, il disparaît seul après `durationMs`. */
  show(text: string, action?: NoticeAction, durationMs = 4000): void {
    this.#clearTimer();
    this.#text.textContent = text;
    this.#actions.replaceChildren();
    if (action) {
      const button = h(
        'button',
        { type: 'button', class: 'btn btn--primary btn--small' },
        action.label,
      );
      button.addEventListener('click', action.onClick);
      this.#actions.append(button);
    } else {
      this.#timer = setTimeout(() => {
        this.hide();
      }, durationMs);
    }
    this.element.hidden = false;
  }

  hide(): void {
    this.#clearTimer();
    this.element.hidden = true;
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }
}

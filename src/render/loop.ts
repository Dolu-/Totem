/**
 * Boucle d'animation : à chaque image, fait avancer le temps de jeu puis dessine.
 * Le pas de temps est plafonné (onglet réveillé, machine lente) pour éviter
 * qu'une pièce « saute » plusieurs cases d'un coup.
 */
export const MAX_FRAME_MS = 100;

export interface FrameScheduler {
  request(callback: (timeMs: number) => void): number;
  cancel(handle: number): void;
}

const browserScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => {
    cancelAnimationFrame(handle);
  },
};

export class GameLoop {
  readonly #onFrame: (dtMs: number) => void;
  readonly #scheduler: FrameScheduler;
  #handle: number | null = null;
  #last: number | null = null;

  /** @param onFrame reçoit le temps écoulé depuis l'image précédente (0 à la première). */
  constructor(onFrame: (dtMs: number) => void, scheduler: FrameScheduler = browserScheduler) {
    this.#onFrame = onFrame;
    this.#scheduler = scheduler;
  }

  get running(): boolean {
    return this.#handle !== null;
  }

  start(): void {
    if (this.#handle !== null) return;
    this.#last = null;
    this.#handle = this.#scheduler.request(this.#tick);
  }

  stop(): void {
    if (this.#handle === null) return;
    this.#scheduler.cancel(this.#handle);
    this.#handle = null;
  }

  readonly #tick = (time: number): void => {
    const dt = this.#last === null ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, time - this.#last));
    this.#last = time;
    this.#handle = this.#scheduler.request(this.#tick);
    this.#onFrame(dt);
  };
}

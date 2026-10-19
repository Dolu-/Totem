/**
 * Vocabulaire commun des entrées : clavier, gestes et boutons produisent les
 * mêmes actions ; le moteur ne sait pas d'où vient une commande.
 */
export interface ActionSink {
  moveLeft(): void;
  moveRight(): void;
  rotate(): void;
  /** Descente rapide maintenue (tant que la commande est tenue, y compris pour les pièces suivantes). */
  setSoftDrop(active: boolean): void;
  /** Descend la pièce d'une case sans l'accélérer (le doigt qui glisse vers le bas la suit). */
  stepDown(): void;
  /** Descente rapide ponctuelle (geste vif) : jusqu'à ce que la pièce courante se pose. */
  softDropUntilLock(): void;
  togglePause(): void;
}

/** Répétition d'un déplacement maintenu : premier pas immédiat, puis délai, puis intervalle. */
export class RepeatTimer {
  readonly #delayMs: number;
  readonly #intervalMs: number;
  #direction: -1 | 1 | null = null;
  #elapsed = 0;
  #nextAt = 0;

  constructor(delayMs: number, intervalMs: number) {
    this.#delayMs = delayMs;
    this.#intervalMs = intervalMs;
  }

  get direction(): -1 | 1 | null {
    return this.#direction;
  }

  /** Commence (ou change) la direction maintenue ; le premier pas est fait par l'appelant. */
  press(direction: -1 | 1): void {
    this.#direction = direction;
    this.#elapsed = 0;
    this.#nextAt = this.#delayMs;
  }

  release(): void {
    this.#direction = null;
  }

  /** Avance le temps ; renvoie le nombre de pas de répétition à effectuer. */
  update(dtMs: number): number {
    if (this.#direction === null || !(dtMs > 0)) return 0;
    this.#elapsed += dtMs;
    let steps = 0;
    while (this.#elapsed >= this.#nextAt) {
      steps += 1;
      this.#nextAt += this.#intervalMs;
    }
    return steps;
  }
}

/**
 * Capture le pointeur pour suivre le geste hors de l'élément. Peut échouer
 * (pointeur déjà relâché, événement synthétique) : le geste reste alors suivi
 * tant qu'il reste sur l'élément.
 */
export function capturePointer(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Sans capture, on continue.
  }
}

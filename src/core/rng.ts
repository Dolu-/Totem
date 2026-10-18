/**
 * Générateur pseudo-aléatoire à graine (mulberry32).
 * Même graine = même suite de tirages : indispensable pour rejouer une partie
 * à l'identique (tests, bot, simulations).
 */
export class Rng {
  #state: number;

  constructor(seed: number) {
    this.#state = normalizeSeed(seed);
  }

  /** Nombre flottant dans [0, 1[. */
  next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entier dans [min, max], bornes incluses. */
  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Bornes invalides : [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** État interne, pour sauvegarder puis reprendre la suite exacte. */
  get state(): number {
    return this.#state;
  }

  clone(): Rng {
    const copy = new Rng(0);
    copy.#state = this.#state;
    return copy;
  }
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`Graine invalide : ${seed}`);
  }
  return Math.trunc(seed) >>> 0;
}

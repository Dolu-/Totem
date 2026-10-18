import type { Rng } from './rng.ts';
import { MAX_COLORS, type CellValue } from './types.ts';

/** Nombre de cases d'une pièce (un « totem » : 3 cases empilées). */
export const PIECE_SIZE = 3;

/**
 * Pièce : couleurs des cases empilées, `colors[0]` = case du BAS
 * (même convention que le legacy, `Bloc.c[0]`).
 */
export interface Piece {
  readonly colors: readonly CellValue[];
}

export type SpawnMode = 'random' | 'center';

export function generatePiece(rng: Rng, colorCount: number, size = PIECE_SIZE): Piece {
  if (!Number.isInteger(colorCount) || colorCount < 1 || colorCount > MAX_COLORS) {
    throw new RangeError(`Nombre de couleurs invalide : ${colorCount}`);
  }
  const colors: CellValue[] = [];
  for (let i = 0; i < size; i += 1) {
    colors.push(rng.nextInt(0, colorCount - 1));
  }
  return { colors };
}

/**
 * Permutation des couleurs : chaque couleur monte d'un cran, celle du haut
 * redescend en bas (comportement legacy `columnsBlock.Rotate`).
 */
export function rotatePiece(piece: Piece): Piece {
  const { colors } = piece;
  const top = colors[colors.length - 1];
  if (top === undefined) return piece;
  return { colors: [top, ...colors.slice(0, -1)] };
}

/** Colonne d'apparition d'une nouvelle pièce. */
export function spawnColumn(rng: Rng, width: number, mode: SpawnMode): number {
  return mode === 'center' ? Math.floor((width - 1) / 2) : rng.nextInt(0, width - 1);
}

/**
 * File des pièces à venir. `peek` permet d'afficher les suivantes (v2)
 * sans modifier l'ordre de tirage.
 */
export class PieceQueue {
  readonly #rng: Rng;
  readonly #colorCount: number;
  readonly #size: number;
  readonly #pending: Piece[] = [];

  constructor(rng: Rng, colorCount: number, size = PIECE_SIZE) {
    this.#rng = rng;
    this.#colorCount = colorCount;
    this.#size = size;
  }

  next(): Piece {
    return this.#pending.shift() ?? generatePiece(this.#rng, this.#colorCount, this.#size);
  }

  /** Les `count` prochaines pièces, sans les retirer de la file. */
  peek(count = 1): readonly Piece[] {
    while (this.#pending.length < count) {
      this.#pending.push(generatePiece(this.#rng, this.#colorCount, this.#size));
    }
    return this.#pending.slice(0, count);
  }
}

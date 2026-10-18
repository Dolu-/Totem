import { EMPTY, type CellValue, type Position } from './types.ts';

/**
 * Grille de jeu : `width` colonnes × `height` lignes, y = 0 en haut.
 * Les lectures hors grille renvoient `EMPTY` (pratique pour la détection des
 * alignements et pour la pièce qui apparaît au-dessus du plateau) ; les
 * écritures hors grille sont refusées.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  readonly #cells: Int16Array;

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError(`Dimensions invalides : ${width}×${height}`);
    }
    this.width = width;
    this.height = height;
    this.#cells = new Int16Array(width * height).fill(EMPTY);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): CellValue {
    return this.inBounds(x, y) ? (this.#cells[y * this.width + x] ?? EMPTY) : EMPTY;
  }

  set(x: number, y: number, value: CellValue): void {
    if (!this.inBounds(x, y)) {
      throw new RangeError(`Case hors grille : (${x}, ${y})`);
    }
    this.#cells[y * this.width + x] = value;
  }

  isEmpty(x: number, y: number): boolean {
    return this.get(x, y) === EMPTY;
  }

  /** Ligne de la case occupée la plus haute de la colonne, ou `height` si la colonne est vide. */
  topOf(x: number): number {
    for (let y = 0; y < this.height; y += 1) {
      if (!this.isEmpty(x, y)) return y;
    }
    return this.height;
  }

  countFilled(): number {
    let count = 0;
    for (const value of this.#cells) {
      if (value !== EMPTY) count += 1;
    }
    return count;
  }

  /** Toutes les cases occupées, de haut en bas puis de gauche à droite. */
  filledPositions(): Position[] {
    const positions: Position[] = [];
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (!this.isEmpty(x, y)) positions.push({ x, y });
      }
    }
    return positions;
  }

  clone(): Grid {
    const copy = new Grid(this.width, this.height);
    copy.#cells.set(this.#cells);
    return copy;
  }

  equals(other: Grid): boolean {
    if (other.width !== this.width || other.height !== this.height) return false;
    return this.#cells.every((value, i) => value === other.#cells[i]);
  }

  /**
   * Représentation texte, une chaîne par ligne : `.` = vide, `0`-`9` = couleur,
   * `*` = bloc spécial. Sert surtout à écrire des tests lisibles.
   */
  toRows(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < this.height; y += 1) {
      let row = '';
      for (let x = 0; x < this.width; x += 1) {
        const value = this.get(x, y);
        row += value === EMPTY ? '.' : value <= 9 ? String(value) : '*';
      }
      rows.push(row);
    }
    return rows;
  }

  /** Inverse de `toRows` (sans les blocs spéciaux). */
  static fromRows(rows: readonly string[]): Grid {
    const width = rows[0]?.length ?? 0;
    const grid = new Grid(width, rows.length);
    rows.forEach((row, y) => {
      if (row.length !== width) {
        throw new RangeError(`Ligne ${y} de longueur ${row.length}, attendu ${width}`);
      }
      for (let x = 0; x < width; x += 1) {
        const char = row.charAt(x);
        if (char === '.') continue;
        if (!/^[0-9]$/.test(char)) {
          throw new RangeError(`Caractère invalide « ${char} » en (${x}, ${y})`);
        }
        grid.set(x, y, Number(char));
      }
    });
    return grid;
  }
}

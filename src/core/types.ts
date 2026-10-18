/**
 * Valeur d'une case de la grille.
 * - `EMPTY` (-1) : case vide ;
 * - 0 à `MAX_COLORS - 1` : index de couleur ;
 * - `JOKER_BASE` et au-delà : réservé aux blocs spéciaux (v2).
 */
export type CellValue = number;

export const EMPTY: CellValue = -1;
export const MAX_COLORS = 9;
export const JOKER_BASE: CellValue = 100;

/** Coordonnées dans la grille : x = colonne (0 à gauche), y = ligne (0 en haut). */
export interface Position {
  readonly x: number;
  readonly y: number;
}

export function isColor(value: CellValue): boolean {
  return value >= 0 && value < JOKER_BASE;
}

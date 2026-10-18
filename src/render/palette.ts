/**
 * Couleurs des blocs (même ordre que le legacy : rouge, vert, bleu, jaune,
 * magenta, cyan, orange, gris, blanc), adoucies pour un fond sombre, et
 * symboles optionnels pour distinguer les couleurs sans les voir.
 */
export type SymbolShape =
  'circle' | 'triangle' | 'square' | 'diamond' | 'star' | 'plus' | 'hexagon' | 'ring' | 'cross';

export interface BlockStyle {
  readonly base: string;
  readonly light: string;
  readonly dark: string;
  readonly symbol: SymbolShape;
}

const GREY: BlockStyle = { base: '#94a3b8', light: '#e2e8f0', dark: '#475569', symbol: 'ring' };

export const BLOCK_STYLES: readonly BlockStyle[] = [
  { base: '#ef4444', light: '#fca5a5', dark: '#991b1b', symbol: 'circle' },
  { base: '#22c55e', light: '#86efac', dark: '#166534', symbol: 'triangle' },
  // Bleu foncé et cyan clair : on les distingue surtout par la luminosité (comme à l'origine).
  { base: '#1d4ed8', light: '#6d8ff0', dark: '#132f86', symbol: 'square' },
  { base: '#facc15', light: '#fef08a', dark: '#a16207', symbol: 'diamond' },
  { base: '#d946ef', light: '#f0abfc', dark: '#86198f', symbol: 'star' },
  { base: '#4ee6f7', light: '#c4f8ff', dark: '#0f9bb3', symbol: 'plus' },
  { base: '#f97316', light: '#fdba74', dark: '#9a3412', symbol: 'hexagon' },
  GREY,
  { base: '#f1f5f9', light: '#ffffff', dark: '#94a3b8', symbol: 'cross' },
];

/** Style d'une valeur de case (les valeurs hors palette, ex. jokers v2, retombent sur le gris). */
export function blockStyle(value: number): BlockStyle {
  return BLOCK_STYLES[value] ?? GREY;
}

export const BOARD_COLORS = {
  /** Fond de l'aire de jeu : une colonne sur deux plus foncée (pas de quadrillage). */
  columnDark: '#111a3a',
  columnDarker: '#0a1128',
  frame: '#1c2650',
  chainText: '#ffffff',
} as const;

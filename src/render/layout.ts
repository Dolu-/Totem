/**
 * Dimensions du plateau à l'écran. La taille d'une case est un nombre entier de
 * pixels physiques : bords nets quel que soit le `devicePixelRatio`.
 */
export interface LayoutInput {
  /** Place disponible, en pixels CSS. */
  readonly availableWidth: number;
  readonly availableHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly devicePixelRatio: number;
  /** Marge intérieure du cadre du plateau, en fraction de case. */
  readonly frameCells?: number;
  /** Taille minimale d'une case, en pixels CSS. */
  readonly minCellSize?: number;
}

export interface Layout {
  /** Côté d'une case, en pixels CSS (multiple exact d'un pixel physique). */
  readonly cellSize: number;
  /** Épaisseur du cadre autour de la grille, en pixels CSS. */
  readonly frame: number;
  /** Taille du canvas en pixels CSS (cadre compris). */
  readonly width: number;
  readonly height: number;
  /** Taille du canvas en pixels physiques. */
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly devicePixelRatio: number;
  readonly columns: number;
  readonly rows: number;
}

export function computeLayout(input: LayoutInput): Layout {
  const { availableWidth, availableHeight, columns, rows } = input;
  const dpr = input.devicePixelRatio > 0 ? input.devicePixelRatio : 1;
  const frameCells = input.frameCells ?? 0.25;
  const minCell = input.minCellSize ?? 8;

  // La grille et son cadre (frameCells de chaque côté) doivent tenir dans la place disponible.
  const fit = Math.min(
    availableWidth / (columns + 2 * frameCells),
    availableHeight / (rows + 2 * frameCells),
  );
  const minDevice = Math.round(minCell * dpr);
  const frameOf = (cell: number): number => Math.round(cell * frameCells);
  const fits = (cell: number): boolean =>
    cell * columns + 2 * frameOf(cell) <= availableWidth * dpr &&
    cell * rows + 2 * frameOf(cell) <= availableHeight * dpr;
  // L'arrondi du cadre peut faire gagner ou perdre un pixel : on part d'un peu au-dessus
  // de l'estimation et on réduit jusqu'à ce que tout tienne.
  let cellDevice = Math.max(minDevice, Math.floor(fit * dpr) + 2);
  while (cellDevice > minDevice && !fits(cellDevice)) cellDevice -= 1;
  const frameDevice = frameOf(cellDevice);
  const pixelWidth = cellDevice * columns + 2 * frameDevice;
  const pixelHeight = cellDevice * rows + 2 * frameDevice;
  return {
    cellSize: cellDevice / dpr,
    frame: frameDevice / dpr,
    width: pixelWidth / dpr,
    height: pixelHeight / dpr,
    pixelWidth,
    pixelHeight,
    devicePixelRatio: dpr,
    columns,
    rows,
  };
}

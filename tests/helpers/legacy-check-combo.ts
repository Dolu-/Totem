/**
 * Transcription fidèle de `arSquare_CheckCombo` (legacy/jcolumns.js),
 * utilisée comme oracle pour vérifier la parité de `findMatches`.
 * `square[y][x]` : -1 = vide, sinon index de couleur.
 */
export function legacyCheckCombo(square: number[][]): { remove: boolean[][]; scoreTmp: number } {
  const lines = square.length - 1;
  const columns = (square[0]?.length ?? 0) - 1;
  const at = (y: number, x: number): number => square[y]?.[x] ?? -1;
  const remove = square.map((row) => row.map(() => false));
  const mark = (...cells: [number, number][]): void => {
    for (const [y, x] of cells) {
      const row = remove[y];
      if (row) row[x] = true;
    }
  };
  let scoreTmp = 0;

  for (let y = 0; y <= lines; y += 1) {
    for (let x = 0; x <= columns; x += 1) {
      const c = at(y, x);
      if (c === -1) continue;
      if (x >= 2) {
        if (at(y, x - 2) === c && at(y, x - 1) === c) {
          mark([y, x], [y, x - 1], [y, x - 2]);
          scoreTmp += 3;
        }
        if (y >= 2 && at(y - 2, x - 2) === c && at(y - 1, x - 1) === c) {
          mark([y, x], [y - 1, x - 1], [y - 2, x - 2]);
          scoreTmp += 3;
        }
      }
      if (y <= lines - 2) {
        if (at(y + 2, x) === c && at(y + 1, x) === c) {
          mark([y, x], [y + 2, x], [y + 1, x]);
          scoreTmp += 3;
        }
        if (x >= 2 && at(y + 2, x - 2) === c && at(y + 1, x - 1) === c) {
          mark([y, x], [y + 2, x - 2], [y + 1, x - 1]);
          scoreTmp += 3;
        }
      }
    }
  }
  return { remove, scoreTmp };
}

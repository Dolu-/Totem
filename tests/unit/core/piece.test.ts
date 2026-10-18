import { describe, expect, it } from 'vitest';
import {
  PIECE_SIZE,
  PieceQueue,
  generatePiece,
  rotatePiece,
  spawnColumn,
} from '../../../src/core/piece.ts';
import { Rng } from '../../../src/core/rng.ts';

describe('generatePiece', () => {
  it('tire 3 couleurs dans [0, colorCount[ et les utilise toutes à la longue', () => {
    const rng = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const piece = generatePiece(rng, 6);
      expect(piece.colors).toHaveLength(PIECE_SIZE);
      for (const c of piece.colors) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(6);
        seen.add(c);
      }
    }
    expect(seen.size).toBe(6);
  });

  it('refuse un nombre de couleurs invalide', () => {
    expect(() => generatePiece(new Rng(1), 0)).toThrow(RangeError);
    expect(() => generatePiece(new Rng(1), 10)).toThrow(RangeError);
  });
});

describe('rotatePiece', () => {
  it('fait monter chaque couleur, celle du haut redescend en bas (legacy)', () => {
    // colors[0] = bas : [bas=1, milieu=2, haut=3] → [3, 1, 2]
    expect(rotatePiece({ colors: [1, 2, 3] }).colors).toEqual([3, 1, 2]);
  });

  it('revient à l’identique après 3 permutations', () => {
    const piece = { colors: [4, 0, 7] };
    expect(rotatePiece(rotatePiece(rotatePiece(piece)))).toEqual(piece);
  });

  it('ne modifie pas la pièce d’origine et tolère une pièce vide', () => {
    const piece = { colors: [1, 2, 3] };
    rotatePiece(piece);
    expect(piece.colors).toEqual([1, 2, 3]);
    const empty = { colors: [] };
    expect(rotatePiece(empty)).toBe(empty);
  });
});

describe('spawnColumn', () => {
  it('centre : colonne du milieu (à gauche si largeur paire)', () => {
    expect(spawnColumn(new Rng(1), 6, 'center')).toBe(2);
    expect(spawnColumn(new Rng(1), 7, 'center')).toBe(3);
  });

  it('aléatoire : toutes les colonnes possibles, jamais hors plateau', () => {
    const rng = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i += 1) seen.add(spawnColumn(rng, 6, 'random'));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('PieceQueue', () => {
  it('est déterministe pour une graine donnée', () => {
    const a = new PieceQueue(new Rng(5), 5);
    const b = new PieceQueue(new Rng(5), 5);
    for (let i = 0; i < 10; i += 1) expect(a.next()).toEqual(b.next());
  });

  it('peek ne consomme pas et ne change pas l’ordre de tirage', () => {
    const withPeek = new PieceQueue(new Rng(8), 5);
    const without = new PieceQueue(new Rng(8), 5);
    const peeked = withPeek.peek(3);
    expect(peeked).toHaveLength(3);
    expect(withPeek.peek(1)[0]).toEqual(peeked[0]);
    for (let i = 0; i < 6; i += 1) {
      const piece = withPeek.next();
      expect(piece).toEqual(without.next());
      if (i < 3) expect(piece).toEqual(peeked[i]);
    }
  });
});

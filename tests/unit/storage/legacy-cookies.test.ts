import { describe, expect, it } from 'vitest';
import { readLegacyCookies } from '../../../src/storage/legacy-cookies.ts';

/** Reproduit l'écriture de legacy/columnsCookie.js : nom=encodeURIComponent(JSON.stringify(valeur)). */
const legacyCookie = (name: string, value: unknown): string =>
  `${name}=${encodeURIComponent(JSON.stringify(value))}`;

describe('readLegacyCookies', () => {
  it('ne renvoie rien sans cookie legacy', () => {
    expect(readLegacyCookies('')).toBeNull();
    expect(readLegacyCookies('autre=1; _ga=GA1.2.3')).toBeNull();
  });

  it('importe réglages, records et pseudo au format réel du legacy', () => {
    const cookies = [
      legacyCookie('C_LINES', 14),
      legacyCookie('C_COLUMNS', 7),
      legacyCookie('C_COLORS', 5),
      legacyCookie('C_SPEED', 3),
      legacyCookie('C_FPS', 25),
      legacyCookie('I_LANG', 1),
      legacyCookie('highscores', [
        { P: 'LUDO', S: 120 },
        { P: 'ANNE', S: 87 },
      ]),
      legacyCookie('pseudo', 'LUDO'),
    ].join('; ');
    expect(readLegacyCookies(cookies)).toEqual({
      settings: { lines: 15, columns: 8, colors: 6, startLevel: 3, language: 'en' },
      highScores: [
        { name: 'LUDO', score: 120 },
        { name: 'ANNE', score: 87 },
      ],
      lastName: 'LUDO',
    });
  });

  it('ignore les entrées invalides ou illisibles', () => {
    const cookies = [
      'C_LINES=%E0%A4%A', // encodage invalide
      legacyCookie('C_COLUMNS', 'six'),
      legacyCookie('I_LANG', 7),
      legacyCookie('highscores', [
        { P: '', S: 10 },
        { P: 'X', S: 0 },
        null,
        'abc',
        { P: 'OK', S: 5 },
      ]),
      legacyCookie('pseudo', '  '),
      'sansvaleur',
    ].join('; ');
    expect(readLegacyCookies(cookies)).toEqual({
      settings: {},
      highScores: [{ name: 'OK', score: 5 }],
      lastName: null,
    });
  });
});

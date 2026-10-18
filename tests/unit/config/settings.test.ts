import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_BOUNDS,
  gameOptionsFromSettings,
  sanitizeSettings,
} from '../../../src/config/settings.ts';
import { tuningForPreset } from '../../../src/config/tuning.ts';

describe('sanitizeSettings', () => {
  it('renvoie les valeurs par défaut pour une entrée absente ou invalide', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('texte')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ lines: 'beaucoup', preset: 'extrême', touchButtons: 1 })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('ramène les nombres dans les bornes et les arrondit', () => {
    const s = sanitizeSettings({ lines: 99, columns: 1, colors: 7.6, startLevel: -3 });
    expect(s).toMatchObject({ lines: 20, columns: 5, colors: 8, startLevel: 0 });
  });

  it('conserve des valeurs valides', () => {
    const valid = {
      lines: 12,
      columns: 8,
      colors: 9,
      startLevel: 4,
      preset: 'hard',
      spawnMode: 'center',
      language: 'en',
      touchButtons: true,
      colorSymbols: true,
    } as const;
    expect(sanitizeSettings(valid)).toEqual(valid);
  });

  it('produit toujours des réglages valides, quelle que soit l’entrée', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const s = sanitizeSettings(raw);
        for (const [key, { min, max }] of Object.entries(SETTINGS_BOUNDS)) {
          const value = s[key as keyof typeof SETTINGS_BOUNDS];
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(min);
          expect(value).toBeLessThanOrEqual(max);
        }
        expect(['easy', 'normal', 'hard']).toContain(s.preset);
      }),
    );
  });
});

describe('gameOptionsFromSettings', () => {
  it('traduit les réglages en options de partie', () => {
    const options = gameOptionsFromSettings(
      { ...DEFAULT_SETTINGS, lines: 12, columns: 7, colors: 8, startLevel: 3, preset: 'easy' },
      42,
    );
    expect(options).toEqual({
      width: 7,
      height: 12,
      colorCount: 8,
      startLevel: 3,
      spawnMode: 'random',
      tuning: tuningForPreset('easy'),
      seed: 42,
    });
  });
});

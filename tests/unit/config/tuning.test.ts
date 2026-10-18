import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNING,
  PRESETS,
  assertValidTuning,
  mergeTuning,
  tuningFingerprint,
  tuningForPreset,
  validateTuning,
  type PresetId,
} from '../../../src/config/tuning.ts';

describe('DEFAULT_TUNING', () => {
  it('est valide et figé', () => {
    expect(validateTuning(DEFAULT_TUNING)).toEqual([]);
    expect(Object.isFrozen(DEFAULT_TUNING.speed.gravity)).toBe(true);
  });
});

describe('préréglages', () => {
  it.each(Object.keys(PRESETS) as PresetId[])('%s est valide', (preset) => {
    expect(validateTuning(tuningForPreset(preset))).toEqual([]);
  });

  it('facile progresse moins vite que difficile', () => {
    expect(tuningForPreset('easy').progression.perLevel).toBeGreaterThan(
      tuningForPreset('hard').progression.perLevel,
    );
    expect(tuningForPreset('normal')).toEqual(DEFAULT_TUNING);
  });
});

describe('mergeTuning', () => {
  it('fusionne en profondeur sans modifier la base', () => {
    const merged = mergeTuning(DEFAULT_TUNING, { scoring: { levelStep: 0 } });
    expect(merged.scoring.levelStep).toBe(0);
    expect(merged.scoring.pointsPerTriplet).toBe(DEFAULT_TUNING.scoring.pointsPerTriplet);
    expect(DEFAULT_TUNING.scoring.levelStep).toBe(1);
  });

  it('remplace les tableaux et les unions entières, applique les surcharges dans l’ordre', () => {
    const merged = mergeTuning(
      DEFAULT_TUNING,
      { speed: { gravity: { kind: 'table', cellsPerSecond: [1, 2] } } },
      { progression: { levelThresholds: [10, 30] } },
      { progression: { levelThresholds: [5] } },
    );
    expect(merged.speed.gravity).toEqual({ kind: 'table', cellsPerSecond: [1, 2] });
    expect(merged.progression.levelThresholds).toEqual([5]);
  });

  it('ignore les valeurs undefined d’une surcharge', () => {
    const override = { scoring: { levelStep: undefined } } as unknown as Parameters<
      typeof mergeTuning
    >[1];
    expect(mergeTuning(DEFAULT_TUNING, override).scoring.levelStep).toBe(1);
  });
});

describe('validateTuning', () => {
  const invalid = (override: Parameters<typeof mergeTuning>[1]): string[] =>
    validateTuning(mergeTuning(DEFAULT_TUNING, override));

  it.each([
    ['palier nul', { progression: { perLevel: 0 } }, /perLevel/],
    ['niveau max négatif', { progression: { maxLevel: -1 } }, /maxLevel/],
    ['seuils non croissants', { progression: { levelThresholds: [10, 10] } }, /levelThresholds/],
    ['base hors ]0,1[', { speed: { gravity: { base: 1.2 } } }, /gravity.base/],
    ['courbe qui s’annule', { speed: { gravity: { step: 0.1 } } }, /maxLevel doit rester/],
    ['échelle nulle', { speed: { gravity: { scale: 0 } } }, /gravity.scale/],
    ['pas négatif', { speed: { gravity: { step: -1 } } }, /gravity.step/],
    ['table vide', { speed: { gravity: { kind: 'table', cellsPerSecond: [] } } }, /vide/],
    [
      'table décroissante',
      { speed: { gravity: { kind: 'table', cellsPerSecond: [2, 1] } } },
      /croissante/,
    ],
    ['plafond nul', { speed: { maxCellsPerSecond: 0 } }, /maxCellsPerSecond/],
    ['descente rapide nulle', { speed: { softDropCellsPerSecond: 0 } }, /softDrop/],
    ['hauteur de référence nulle', { speed: { referenceHeight: 0 } }, /referenceHeight/],
    ['points négatifs', { scoring: { pointsPerTriplet: -1 } }, /pointsPerTriplet/],
    ['pas de chaîne négatif', { scoring: { chainStep: -1 } }, /chainStep/],
    ['table de chaîne invalide', { scoring: { chainMultipliers: [0] } }, /chainMultipliers/],
    ['base de niveau nulle', { scoring: { levelBase: 0 } }, /levelBase/],
    ['pas de niveau négatif', { scoring: { levelStep: -1 } }, /levelStep/],
    ['durée négative', { timing: { clearMs: -5 } }, /timing.clearMs/],
    ['répétition nulle', { timing: { repeatIntervalMs: 0 } }, /repeatIntervalMs/],
    ['geste nul', { gestures: { tapMaxMs: 0 } }, /gestures.tapMaxMs/],
  ] as const)('signale : %s', (_label, override, pattern) => {
    const errors = invalid(override);
    expect(errors.some((e) => pattern.test(e))).toBe(true);
  });

  it('signale : unité de progression inconnue', () => {
    const override = { progression: { unit: 'lines' } } as unknown as Parameters<
      typeof mergeTuning
    >[1];
    expect(invalid(override).some((e) => e.includes('progression.unit'))).toBe(true);
  });

  it('signale : countChainSteps non booléen', () => {
    const override = { progression: { countChainSteps: 'oui' } } as unknown as Parameters<
      typeof mergeTuning
    >[1];
    expect(invalid(override).some((e) => e.includes('countChainSteps'))).toBe(true);
  });

  it('assertValidTuning lève une erreur détaillée', () => {
    expect(() =>
      assertValidTuning(mergeTuning(DEFAULT_TUNING, { progression: { perLevel: 0 } })),
    ).toThrow(/perLevel/);
    expect(assertValidTuning(DEFAULT_TUNING)).toBe(DEFAULT_TUNING);
  });
});

describe('tuningFingerprint', () => {
  it('est stable et indépendante de l’ordre des clés', () => {
    const reordered = JSON.parse(JSON.stringify(DEFAULT_TUNING)) as typeof DEFAULT_TUNING;
    expect(tuningFingerprint(reordered)).toBe(tuningFingerprint(DEFAULT_TUNING));
    expect(tuningFingerprint(DEFAULT_TUNING)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('change dès qu’une valeur change, y compris dans un tableau', () => {
    expect(tuningFingerprint(tuningForPreset('hard'))).not.toBe(tuningFingerprint(DEFAULT_TUNING));
    const a = mergeTuning(DEFAULT_TUNING, { progression: { levelThresholds: [10, 20] } });
    const b = mergeTuning(DEFAULT_TUNING, { progression: { levelThresholds: [10, 21] } });
    expect(tuningFingerprint(a)).not.toBe(tuningFingerprint(b));
  });
});

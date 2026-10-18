import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, quantize, styleFromQuery } from '../../../src/render/style.ts';

describe('quantize', () => {
  it('arrondit au cran inférieur', () => {
    expect(quantize(1.7, 2)).toBe(1.5);
    expect(quantize(1.49, 2)).toBe(1);
    expect(quantize(0.3, 4)).toBe(0.25);
    expect(quantize(-0.3, 2)).toBe(-0.5);
  });

  it('tolère les imprécisions flottantes et désactive les crans à 0', () => {
    expect(quantize(0.1 + 0.2 + 0.7, 2)).toBe(1);
    expect(quantize(1.7, 0)).toBe(1.7);
  });
});

describe('styleFromQuery', () => {
  it('sans paramètre : style par défaut', () => {
    expect(styleFromQuery('')).toBe(DEFAULT_STYLE);
    expect(styleFromQuery('?autre=1')).toBe(DEFAULT_STYLE);
  });

  it('surcharge les valeurs données, garde les autres', () => {
    const style = styleFromQuery('?style=fallStepsPerCell:3,cornerRadius:0.05');
    expect(style).toEqual({ ...DEFAULT_STYLE, fallStepsPerCell: 3, cornerRadius: 0.05 });
    expect(Object.isFrozen(style)).toBe(true);
  });

  it('ignore les clés inconnues et les valeurs invalides', () => {
    const style = styleFromQuery(
      '?style=inconnu:2,fallStepsPerCell:abc,frameCells:-1,slideStagger:',
    );
    expect(style).toEqual(DEFAULT_STYLE);
  });
});

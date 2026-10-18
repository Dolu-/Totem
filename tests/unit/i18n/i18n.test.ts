import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../../../src/config/settings.ts';
import { MESSAGES, createTranslator, detectLanguage } from '../../../src/i18n/index.ts';
import { fr } from '../../../src/i18n/fr.ts';

describe('messages', () => {
  it.each(LANGUAGES)('%s : mêmes clés que le français, aucun texte vide', (language) => {
    const messages = MESSAGES[language];
    expect(Object.keys(messages).sort()).toEqual(Object.keys(fr).sort());
    for (const text of Object.values(messages)) expect(text.trim()).not.toBe('');
  });

  it.each(LANGUAGES)('%s : mêmes paramètres {…} que le français', (language) => {
    const params = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const [key, text] of Object.entries(fr)) {
      expect(params(MESSAGES[language][key as keyof typeof fr]), key).toEqual(params(text));
    }
  });

  it('chaque clé plurielle a ses deux formes', () => {
    const keys = Object.keys(fr);
    for (const key of keys.filter((k) => k.endsWith('.one'))) {
      expect(keys).toContain(key.replace(/\.one$/, '.other'));
    }
  });
});

describe('createTranslator', () => {
  it('interpole les paramètres et laisse les inconnus intacts', () => {
    const { t } = createTranslator('fr');
    expect(t('gameOver.score', { score: 42 })).toBe('Score : 42');
    expect(t('gameOver.score')).toBe('Score : {score}');
  });

  it('gère les pluriels selon la langue', () => {
    const fr = createTranslator('fr');
    expect(fr.plural('hud.next.alignments', 1)).toBe('Encore 1 alignement');
    expect(fr.plural('hud.next.alignments', 0)).toBe('Encore 0 alignement');
    expect(fr.plural('hud.next.alignments', 12)).toBe('Encore 12 alignements');
    const en = createTranslator('en');
    expect(en.plural('hud.next.alignments', 0)).toBe('0 more matches');
    expect(en.plural('hud.next.blocks', 1)).toBe('1 more block');
  });

  it('formate nombres et dates selon la langue', () => {
    expect(createTranslator('fr').formatNumber(12345)).toBe('12 345');
    expect(createTranslator('en').formatNumber(12345)).toBe('12,345');
    expect(createTranslator('fr').formatDate('2026-10-17T12:00:00Z')).toBe('17/10/2026');
    expect(createTranslator('fr').formatDate('pas une date')).toBe('');
  });
});

describe('detectLanguage', () => {
  it('prend la première langue disponible du navigateur, anglais sinon', () => {
    expect(detectLanguage(['fr-FR', 'en'])).toBe('fr');
    expect(detectLanguage(['de-DE', 'EN-gb'])).toBe('en');
    expect(detectLanguage(['de', 'es'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });
});

import { LANGUAGES, type Language } from '../config/settings.ts';
import { en } from './en.ts';
import { fr, type MessageKey, type Messages } from './fr.ts';

export type { MessageKey } from './fr.ts';

export const MESSAGES: Readonly<Record<Language, Messages>> = { fr, en };

/** Clés plurielles, sans le suffixe `.one` / `.other`. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}.one` ? Base : never;
}[MessageKey];

export type Params = Readonly<Record<string, string | number>>;

/** Fonctions indépendantes de `this` : on peut les extraire (`const { t } = translator`). */
export interface Translator {
  readonly language: Language;
  readonly t: (key: MessageKey, params?: Params) => string;
  /** Pluriel selon `count` (règles de la langue), `{count}` disponible dans le texte. */
  readonly plural: (key: PluralKey, count: number, params?: Params) => string;
  readonly formatNumber: (value: number) => string;
  readonly formatDate: (iso: string) => string;
}

/** Langue du navigateur parmi celles disponibles (`navigator.languages`), anglais par défaut. */
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    const match = LANGUAGES.find((l) => l === base);
    if (match) return match;
  }
  return 'en';
}

function interpolate(text: string, params: Params = {}): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

export function createTranslator(language: Language): Translator {
  const messages = MESSAGES[language];
  const plurals = new Intl.PluralRules(language);
  const numbers = new Intl.NumberFormat(language);
  const dates = new Intl.DateTimeFormat(language, { dateStyle: 'short' });
  return {
    language,
    t: (key, params) => interpolate(messages[key], params),
    plural: (key, count, params) => {
      const category = plurals.select(count) === 'one' ? 'one' : 'other';
      const text = messages[`${key}.${category}` as MessageKey];
      return interpolate(text, { count: numbers.format(count), ...params });
    },
    formatNumber: (value) => numbers.format(value),
    formatDate: (iso) => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? '' : dates.format(date);
    },
  };
}

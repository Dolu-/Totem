/**
 * Lecture des cookies de l'ancienne version (legacy/columnsCookie.js), pour
 * importer records, pseudo et réglages au premier lancement.
 *
 * Format legacy : `nom=encodeURIComponent(JSON.stringify(valeur))`.
 * - `C_LINES`, `C_COLUMNS`, `C_COLORS` : dimension « moins un » (14 = 15 lignes) ;
 * - `C_SPEED` : vitesse de départ 0–9 ; `C_FPS` : ignoré ;
 * - `I_LANG` : 0 = français, 1 = anglais ;
 * - `highscores` : `[{ P: pseudo, S: score }]` ; `pseudo` : dernier pseudo saisi.
 */
import type { Language, Settings } from '../config/settings.ts';

export interface LegacyHighScore {
  readonly name: string;
  readonly score: number;
}

export interface LegacyData {
  readonly settings: Partial<Settings>;
  readonly highScores: readonly LegacyHighScore[];
  readonly lastName: string | null;
}

function parseCookies(cookieString: string): Map<string, unknown> {
  const values = new Map<string, unknown>();
  for (const part of cookieString.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    try {
      values.set(name, JSON.parse(decodeURIComponent(part.slice(index + 1).trim())));
    } catch {
      // Cookie illisible ou d'une autre application : ignoré.
    }
  }
  return values;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Données legacy trouvées dans `document.cookie`, ou `null` s'il n'y en a aucune. */
export function readLegacyCookies(cookieString: string): LegacyData | null {
  const cookies = parseCookies(cookieString);
  const settings: { -readonly [K in keyof Settings]?: Settings[K] } = {};

  const lines = cookies.get('C_LINES');
  if (isInt(lines)) settings.lines = lines + 1;
  const columns = cookies.get('C_COLUMNS');
  if (isInt(columns)) settings.columns = columns + 1;
  const colors = cookies.get('C_COLORS');
  if (isInt(colors)) settings.colors = colors + 1;
  const speed = cookies.get('C_SPEED');
  if (isInt(speed)) settings.startLevel = speed;
  const lang = cookies.get('I_LANG');
  const languages: Record<number, Language> = { 0: 'fr', 1: 'en' };
  if (isInt(lang) && languages[lang]) settings.language = languages[lang];

  const highScores: LegacyHighScore[] = [];
  const rawScores = cookies.get('highscores');
  if (Array.isArray(rawScores)) {
    for (const entry of rawScores as unknown[]) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { P, S } = entry as { P?: unknown; S?: unknown };
      if (typeof P === 'string' && P.trim() !== '' && typeof S === 'number' && S > 0) {
        highScores.push({ name: P.trim(), score: Math.round(S) });
      }
    }
  }

  const pseudo = cookies.get('pseudo');
  const lastName = typeof pseudo === 'string' && pseudo.trim() !== '' ? pseudo.trim() : null;

  if (Object.keys(settings).length === 0 && highScores.length === 0 && lastName === null) {
    return null;
  }
  return { settings, highScores, lastName };
}

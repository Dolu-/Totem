/**
 * Stockage local (localStorage) : réglages, records, dernier pseudo, dernière version vue.
 * Une seule clé versionnée ; lecture tolérante (données absentes, corrompues
 * ou anciennes → valeurs par défaut) ; si le stockage est indisponible
 * (navigation privée, quota), le jeu fonctionne en mémoire.
 * Rien ne quitte l'appareil.
 */
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../config/settings.ts';
import type { PresetId } from '../config/tuning.ts';
import { isVersion } from '../release/version.ts';
import { readLegacyCookies } from './legacy-cookies.ts';

export const STORAGE_KEY = 'totem:v1';
/**
 * Clés des noms précédents du jeu (avant le renommage « jColumns » → « Totem ») :
 * relues une fois si la clé actuelle est absente, puis réécrites sous `STORAGE_KEY`.
 */
export const PREVIOUS_STORAGE_KEYS: readonly string[] = ['jcolumns:v1'];
export const STORAGE_VERSION = 1;
export const MAX_HIGH_SCORES = 10;
export const MAX_NAME_LENGTH = 12;
/** Version des données enregistrées avant le suivi des versions (sans `seenVersion`). */
export const UNVERSIONED_RELEASE = '1.0.0';

/** Sous-ensemble de l'API Storage (injectable pour les tests). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Paramètres de la partie, mémorisés avec le record (les scores ne sont comparables qu'à réglages égaux). */
export interface ScoreContext {
  readonly lines: number;
  readonly columns: number;
  readonly colors: number;
  readonly startLevel: number;
  readonly preset: PresetId;
  /** Empreinte du réglage interne (`tuningFingerprint`). */
  readonly tuning: string;
}

export interface HighScore {
  readonly name: string;
  readonly score: number;
  /** Absents pour les records importés de l'ancienne version. */
  readonly level: number | null;
  readonly date: string | null;
  readonly context: ScoreContext | null;
}

export interface SavedData {
  readonly version: number;
  readonly settings: Settings;
  readonly highScores: readonly HighScore[];
  readonly lastName: string;
  /** Les cookies de l'ancienne version ont déjà été examinés. */
  readonly legacyImported: boolean;
  /** Dernière version du jeu présentée au joueur (« Quoi de neuf ») ; `null` : première visite. */
  readonly seenVersion: string | null;
}

const EMPTY_DATA: SavedData = {
  version: STORAGE_VERSION,
  settings: DEFAULT_SETTINGS,
  highScores: [],
  lastName: '',
  legacyImported: false,
  seenVersion: null,
};

export function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trimEnd();
}

function sanitizeHighScore(raw: unknown): HighScore | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r['name'] === 'string' ? normalizeName(r['name']) : '';
  const score = r['score'];
  if (name === '' || typeof score !== 'number' || !Number.isFinite(score) || score <= 0) {
    return null;
  }
  const level = typeof r['level'] === 'number' && Number.isInteger(r['level']) ? r['level'] : null;
  const date = typeof r['date'] === 'string' ? r['date'] : null;
  const c = r['context'];
  let context: ScoreContext | null = null;
  if (typeof c === 'object' && c !== null) {
    const s = sanitizeSettings(c);
    const tuning = (c as Record<string, unknown>)['tuning'];
    context = {
      lines: s.lines,
      columns: s.columns,
      colors: s.colors,
      startLevel: s.startLevel,
      preset: s.preset,
      tuning: typeof tuning === 'string' ? tuning : '',
    };
  }
  return { name, score: Math.round(score), level, date, context };
}

/** Tri décroissant ; à score égal, le plus ancien reste devant (tri stable). */
function rank(scores: readonly HighScore[]): HighScore[] {
  return [...scores].sort((a, b) => b.score - a.score).slice(0, MAX_HIGH_SCORES);
}

/** Données valides à partir de n'importe quel contenu stocké. Point d'entrée des migrations futures. */
export function sanitizeData(raw: unknown): SavedData {
  if (typeof raw !== 'object' || raw === null) return EMPTY_DATA;
  const r = raw as Record<string, unknown>;
  // Migrations : `version` < STORAGE_VERSION → transformer ici avant validation.
  const highScores = Array.isArray(r['highScores'])
    ? rank((r['highScores'] as unknown[]).map(sanitizeHighScore).filter((h) => h !== null))
    : [];
  return {
    version: STORAGE_VERSION,
    settings: sanitizeSettings(r['settings']),
    highScores,
    lastName: typeof r['lastName'] === 'string' ? normalizeName(r['lastName']) : '',
    legacyImported: r['legacyImported'] === true,
    // Données antérieures au suivi des versions : le joueur a connu la 1.0.0.
    seenVersion: !('seenVersion' in r)
      ? UNVERSIONED_RELEASE
      : isVersion(r['seenVersion'])
        ? r['seenVersion']
        : null,
  };
}

export class Store {
  readonly #storage: StorageLike | null;
  readonly #now: () => Date;
  #data: SavedData;
  #persistent = true;

  /**
   * @param storage `localStorage` (ou `null` s'il est inaccessible).
   * @param legacyCookies contenu de `document.cookie`, lu une seule fois pour l'import.
   */
  constructor(storage: StorageLike | null, legacyCookies = '', now: () => Date = () => new Date()) {
    this.#storage = storage;
    this.#now = now;
    const { data, migrated } = this.#read();
    this.#data = data;
    if (migrated) this.#write();
    if (!this.#data.legacyImported) {
      this.#importLegacy(legacyCookies);
      this.#write();
    }
  }

  /** Faux si les données ne peuvent pas être conservées (stockage indisponible ou plein). */
  get persistent(): boolean {
    return this.#persistent;
  }

  get settings(): Settings {
    return this.#data.settings;
  }

  get highScores(): readonly HighScore[] {
    return this.#data.highScores;
  }

  get lastName(): string {
    return this.#data.lastName;
  }

  get seenVersion(): string | null {
    return this.#data.seenVersion;
  }

  setSeenVersion(version: string): void {
    this.#data = { ...this.#data, seenVersion: version };
    this.#write();
  }

  saveSettings(settings: Settings): void {
    this.#data = { ...this.#data, settings: sanitizeSettings(settings) };
    this.#write();
  }

  /** Le score entre-t-il dans le tableau des records ? */
  qualifies(score: number): boolean {
    if (score <= 0) return false;
    const scores = this.#data.highScores;
    return scores.length < MAX_HIGH_SCORES || score > (scores[scores.length - 1]?.score ?? 0);
  }

  /** Enregistre un record ; renvoie son rang (0 = premier), ou `null` s'il n'est pas retenu. */
  addHighScore(entry: {
    name: string;
    score: number;
    level: number;
    context: ScoreContext;
  }): number | null {
    const name = normalizeName(entry.name);
    if (name === '' || !this.qualifies(entry.score)) return null;
    const record: HighScore = {
      name,
      score: Math.round(entry.score),
      level: entry.level,
      date: this.#now().toISOString(),
      context: entry.context,
    };
    // Le nouveau record passe derrière les scores égaux déjà présents.
    const highScores = rank([...this.#data.highScores, record]);
    this.#data = { ...this.#data, highScores, lastName: name };
    this.#write();
    const index = highScores.indexOf(record);
    return index >= 0 ? index : null;
  }

  clearHighScores(): void {
    this.#data = { ...this.#data, highScores: [] };
    this.#write();
  }

  /** Données enregistrées ; `migrated` si elles proviennent d'une clé d'un ancien nom du jeu. */
  #read(): { data: SavedData; migrated: boolean } {
    try {
      for (const key of [STORAGE_KEY, ...PREVIOUS_STORAGE_KEYS]) {
        const text = this.#storage?.getItem(key) ?? null;
        if (text !== null) {
          return { data: sanitizeData(JSON.parse(text)), migrated: key !== STORAGE_KEY };
        }
      }
    } catch {
      // Stockage illisible ou corrompu : valeurs par défaut.
    }
    return { data: EMPTY_DATA, migrated: false };
  }

  #write(): void {
    if (!this.#storage) {
      this.#persistent = false;
      return;
    }
    try {
      this.#storage.setItem(STORAGE_KEY, JSON.stringify(this.#data));
      this.#persistent = true;
    } catch {
      this.#persistent = false;
    }
  }

  #importLegacy(cookieString: string): void {
    const legacy = readLegacyCookies(cookieString);
    this.#data = { ...this.#data, legacyImported: true };
    if (!legacy) return;
    const imported: HighScore[] = legacy.highScores.map(({ name, score }) => ({
      name: normalizeName(name),
      score,
      level: null,
      date: null,
      context: null,
    }));
    this.#data = {
      ...this.#data,
      settings: sanitizeSettings({ ...this.#data.settings, ...legacy.settings }),
      highScores: rank([...this.#data.highScores, ...imported]),
      lastName: this.#data.lastName || normalizeName(legacy.lastName ?? ''),
    };
  }
}

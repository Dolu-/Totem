/**
 * Versions du jeu : comparaison SemVer (`X.Y.Z`), extraits du journal entre deux
 * versions, et lecture tolérante de `version.json` (publié à chaque build, hors
 * précache : la version déjà installée y découvre la suivante et ses nouveautés).
 */
import { LANGUAGES } from '../config/settings.ts';
import type { Change, Release } from './changelog.ts';

/** Nom du fichier publié à côté de `index.html`. */
export const VERSION_FILE = 'version.json';

/** Contenu de `version.json` : dernière version publiée et son journal complet. */
export interface LatestVersion {
  readonly version: string;
  readonly changelog: readonly Release[];
}

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION_PATTERN.test(value);
}

/** Négatif si `a` < `b`, 0 si égales, positif si `a` > `b` (une version invalide vaut 0.0.0). */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string): number[] =>
    (VERSION_PATTERN.exec(v) ?? ['', '0', '0', '0']).slice(1).map(Number);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Versions strictement postérieures à `after`, jusqu'à `upTo` incluse, de la plus récente à la plus ancienne. */
export function releasesBetween(
  changelog: readonly Release[],
  after: string,
  upTo: string,
): Release[] {
  return changelog
    .filter((r) => compareVersions(r.version, after) > 0 && compareVersions(r.version, upTo) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

function sanitizeChange(raw: unknown): Change | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const kind = r['kind'];
  const fr = r['fr'];
  if ((kind !== 'feature' && kind !== 'fix') || typeof fr !== 'string' || fr === '') return null;
  // Une langue manquante (version plus récente qui en ajoute une) retombe sur le français.
  const texts = Object.fromEntries(
    LANGUAGES.map((l) => [l, typeof r[l] === 'string' && r[l] !== '' ? r[l] : fr]),
  ) as Record<(typeof LANGUAGES)[number], string>;
  return { kind, ...texts };
}

function sanitizeRelease(raw: unknown): Release | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const { version, date, changes } = r;
  if (!isVersion(version) || typeof date !== 'string' || !DATE_PATTERN.test(date)) return null;
  return {
    version,
    date,
    changes: Array.isArray(changes) ? changes.map(sanitizeChange).filter((c) => c !== null) : [],
  };
}

/** `version.json` lu depuis le réseau : `null` s'il est inexploitable, entrées invalides ignorées. */
export function sanitizeLatest(raw: unknown): LatestVersion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isVersion(r['version'])) return null;
  const changelog = Array.isArray(r['changelog'])
    ? (r['changelog'] as unknown[]).map(sanitizeRelease).filter((rel) => rel !== null)
    : [];
  return { version: r['version'], changelog };
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../../../src/config/settings.ts';
import { APP_VERSION } from '../../../src/release/app-version.ts';
import { CHANGELOG, type Release } from '../../../src/release/changelog.ts';
import {
  compareVersions,
  isVersion,
  releasesBetween,
  sanitizeLatest,
} from '../../../src/release/version.ts';

const packageVersion = (
  JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

const release = (version: string): Release => ({
  version,
  date: '2026-10-19',
  changes: [{ kind: 'fix', fr: `correctif ${version}`, en: `fix ${version}` }],
});

describe('journal des versions', () => {
  it('la version de package.json est la plus récente du journal, et celle du build', () => {
    expect(isVersion(packageVersion)).toBe(true);
    expect(CHANGELOG[0]?.version).toBe(packageVersion);
    expect(APP_VERSION).toBe(packageVersion);
  });

  it('versions valides, uniques et strictement décroissantes, dates au format AAAA-MM-JJ', () => {
    for (const r of CHANGELOG) {
      expect(isVersion(r.version), r.version).toBe(true);
      expect(r.date, r.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (let i = 1; i < CHANGELOG.length; i++) {
      const [newer, older] = [CHANGELOG[i - 1], CHANGELOG[i]];
      expect(compareVersions(newer?.version ?? '', older?.version ?? '')).toBeGreaterThan(0);
      expect((newer?.date ?? '') >= (older?.date ?? '')).toBe(true);
    }
  });

  it('chaque version décrit au moins un changement, dans toutes les langues', () => {
    for (const r of CHANGELOG) {
      expect(r.changes.length, r.version).toBeGreaterThan(0);
      for (const change of r.changes) {
        for (const language of LANGUAGES) expect(change[language].trim(), r.version).not.toBe('');
      }
    }
  });

  it('se relit tel quel après un aller-retour par version.json', () => {
    const latest = { version: packageVersion, changelog: CHANGELOG };
    expect(sanitizeLatest(JSON.parse(JSON.stringify(latest)))).toEqual(latest);
  });
});

describe('compareVersions', () => {
  it('compare numériquement chaque composante', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('2.0.1', '2.0.0')).toBeGreaterThan(0);
  });

  it('une version invalide vaut 0.0.0', () => {
    expect(compareVersions('n’importe quoi', '0.0.0')).toBe(0);
    expect(compareVersions('0.0.1', 'v1')).toBeGreaterThan(0);
  });

  it('isVersion n’accepte que X.Y.Z', () => {
    expect(isVersion('1.0.0')).toBe(true);
    for (const v of ['1.0', '1.0.0-dev', 'v1.0.0', '01.0.0', 1, null])
      expect(isVersion(v)).toBe(false);
  });
});

describe('releasesBetween', () => {
  const log = ['1.0.0', '1.2.0', '1.1.0', '2.0.0'].map(release);

  it('garde ]après, jusqu’à], de la plus récente à la plus ancienne', () => {
    expect(releasesBetween(log, '1.0.0', '1.2.0').map((r) => r.version)).toEqual([
      '1.2.0',
      '1.1.0',
    ]);
    expect(releasesBetween(log, '1.2.0', '9.0.0').map((r) => r.version)).toEqual(['2.0.0']);
  });

  it('rien si la version est à jour ou plus récente', () => {
    expect(releasesBetween(log, '2.0.0', '2.0.0')).toEqual([]);
    expect(releasesBetween(log, '3.0.0', '2.0.0')).toEqual([]);
  });
});

describe('sanitizeLatest', () => {
  it('refuse un contenu sans version valide', () => {
    expect(sanitizeLatest(null)).toBeNull();
    expect(sanitizeLatest('1.2.0')).toBeNull();
    expect(sanitizeLatest({ version: 'demain' })).toBeNull();
  });

  it('écarte les entrées invalides et complète les langues manquantes par le français', () => {
    const latest = sanitizeLatest({
      version: '1.3.0',
      changelog: [
        {
          version: '1.3.0',
          date: '2026-11-01',
          changes: [
            { kind: 'feature', fr: 'Nouveau', en: 'New' },
            { kind: 'fix', fr: 'Corrigé' },
            { kind: 'autre', fr: 'Ignoré' },
            { kind: 'fix', fr: '' },
            'texte',
          ],
        },
        { version: '1.2.0', date: '2026-10-25' },
        { version: 'x', date: '2026-10-20', changes: [] },
        { version: '1.1.0', date: 'hier', changes: [] },
        42,
      ],
    });
    expect(latest).toEqual({
      version: '1.3.0',
      changelog: [
        {
          version: '1.3.0',
          date: '2026-11-01',
          changes: [
            { kind: 'feature', fr: 'Nouveau', en: 'New' },
            { kind: 'fix', fr: 'Corrigé', en: 'Corrigé' },
          ],
        },
        { version: '1.2.0', date: '2026-10-25', changes: [] },
      ],
    });
    expect(sanitizeLatest({ version: '1.3.0' })).toEqual({ version: '1.3.0', changelog: [] });
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../src/config/settings.ts';
import {
  MAX_HIGH_SCORES,
  PREVIOUS_STORAGE_KEYS,
  STORAGE_KEY,
  Store,
  normalizeName,
  sanitizeData,
  type ScoreContext,
  type StorageLike,
} from '../../../src/storage/store.ts';

class MemoryStorage implements StorageLike {
  readonly items = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('Quota dépassé', 'QuotaExceededError');
    this.items.set(key, value);
  }
}

const CONTEXT: ScoreContext = {
  lines: 15,
  columns: 6,
  colors: 6,
  startLevel: 0,
  preset: 'normal',
  tuning: 'abcd1234',
};
const NOW = (): Date => new Date('2026-10-17T12:00:00Z');
const legacyCookie = (name: string, value: unknown): string =>
  `${name}=${encodeURIComponent(JSON.stringify(value))}`;

const add = (store: Store, name: string, score: number): number | null =>
  store.addHighScore({ name, score, level: 3, context: CONTEXT });

describe('Store : lecture', () => {
  it('démarre avec les valeurs par défaut', () => {
    const store = new Store(new MemoryStorage());
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
    expect(store.highScores).toEqual([]);
    expect(store.lastName).toBe('');
    expect(store.persistent).toBe(true);
  });

  it('tolère un contenu corrompu', () => {
    const storage = new MemoryStorage();
    storage.items.set(STORAGE_KEY, '{pas du json');
    expect(new Store(storage).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('relit ce qui a été écrit (persistance entre deux lancements)', () => {
    const storage = new MemoryStorage();
    const first = new Store(storage, '', NOW);
    first.saveSettings({ ...DEFAULT_SETTINGS, lines: 12, language: 'en' });
    add(first, 'Ludo', 50);
    const second = new Store(storage, '', NOW);
    expect(second.settings).toMatchObject({ lines: 12, language: 'en' });
    expect(second.highScores).toEqual([
      { name: 'Ludo', score: 50, level: 3, date: '2026-10-17T12:00:00.000Z', context: CONTEXT },
    ]);
    expect(second.lastName).toBe('Ludo');
  });

  it('écarte les records invalides et trie les autres', () => {
    const data = sanitizeData({
      highScores: [
        { name: 'A', score: 10 },
        { name: '', score: 99 },
        { name: 'B', score: -5 },
        { name: 'C', score: 'beaucoup' },
        'texte',
        { name: 'D', score: 30, level: 2.5, context: { lines: 99, tuning: 7 } },
      ],
    });
    expect(data.highScores.map((h) => h.name)).toEqual(['D', 'A']);
    expect(data.highScores[0]).toMatchObject({
      level: null,
      date: null,
      context: { lines: 20, tuning: '' },
    });
  });
});

describe('Store : renommage du jeu (jColumns → Totem)', () => {
  it('reprend les données de l’ancienne clé et les réécrit sous la nouvelle', () => {
    const storage = new MemoryStorage();
    const old = new Store(storage, '', NOW);
    add(old, 'Ludo', 42);
    old.saveSettings({ ...DEFAULT_SETTINGS, lines: 12 });
    // Simule une installation de l'ancien nom : données uniquement sous l'ancienne clé.
    const saved = storage.items.get(STORAGE_KEY) ?? '';
    storage.items.clear();
    storage.items.set(PREVIOUS_STORAGE_KEYS[0] ?? '', saved);

    const store = new Store(storage, '', NOW);
    expect(store.highScores.map((h) => h.name)).toEqual(['Ludo']);
    expect(store.settings.lines).toBe(12);
    expect(storage.items.get(STORAGE_KEY)).toBeDefined();
  });

  it('la clé actuelle est prioritaire sur l’ancienne', () => {
    const storage = new MemoryStorage();
    storage.items.set(PREVIOUS_STORAGE_KEYS[0] ?? '', JSON.stringify({ lastName: 'Ancien' }));
    storage.items.set(STORAGE_KEY, JSON.stringify({ lastName: 'Actuel' }));
    expect(new Store(storage).lastName).toBe('Actuel');
  });
});

describe('Store : records', () => {
  it('qualifie tout score positif tant que le tableau n’est pas plein', () => {
    const store = new Store(new MemoryStorage());
    expect(store.qualifies(0)).toBe(false);
    expect(store.qualifies(1)).toBe(true);
  });

  it('garde les 10 meilleurs, triés ; à égalité, l’ancien reste devant', () => {
    const store = new Store(new MemoryStorage(), '', NOW);
    for (let i = 1; i <= MAX_HIGH_SCORES; i += 1) add(store, `J${i}`, i * 10);
    expect(store.qualifies(10)).toBe(false);
    expect(store.qualifies(11)).toBe(true);
    expect(add(store, 'Égal', 50)).toBe(6);
    expect(store.highScores).toHaveLength(MAX_HIGH_SCORES);
    expect(store.highScores.map((h) => h.score)).toEqual([100, 90, 80, 70, 60, 50, 50, 40, 30, 20]);
    expect(store.highScores[5]?.name).toBe('J5');
    expect(add(store, 'Trop bas', 5)).toBeNull();
  });

  it('refuse un nom vide et normalise les noms', () => {
    const store = new Store(new MemoryStorage());
    expect(add(store, '   ', 10)).toBeNull();
    expect(add(store, '  Jean   Claude Van Damme ', 10)).toBe(0);
    expect(store.highScores[0]?.name).toBe('Jean Claude');
    expect(normalizeName('  a  b ')).toBe('a b');
  });

  it('efface les records', () => {
    const store = new Store(new MemoryStorage());
    add(store, 'A', 10);
    store.clearHighScores();
    expect(store.highScores).toEqual([]);
  });
});

describe('Store : stockage indisponible', () => {
  it('fonctionne en mémoire sans localStorage', () => {
    const store = new Store(null);
    add(store, 'A', 10);
    expect(store.highScores).toHaveLength(1);
    expect(store.persistent).toBe(false);
  });

  it('signale un échec d’écriture (quota, navigation privée) sans planter', () => {
    const storage = new MemoryStorage();
    const store = new Store(storage);
    storage.failWrites = true;
    add(store, 'A', 10);
    expect(store.persistent).toBe(false);
    expect(store.highScores).toHaveLength(1);
    storage.failWrites = false;
    add(store, 'B', 20);
    expect(store.persistent).toBe(true);
  });

  it('tolère un getItem qui lève une erreur', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('Accès refusé');
      },
      setItem: () => undefined,
    };
    expect(new Store(storage).settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('Store : import de l’ancienne version', () => {
  const cookies = [
    legacyCookie('C_LINES', 11),
    legacyCookie('I_LANG', 0),
    legacyCookie('highscores', [
      { P: 'LUDO', S: 120 },
      { P: 'ANNE', S: 87 },
    ]),
    legacyCookie('pseudo', 'LUDO'),
  ].join('; ');

  it('importe une seule fois réglages, records et pseudo', () => {
    const storage = new MemoryStorage();
    const store = new Store(storage, cookies);
    expect(store.settings).toMatchObject({ lines: 12, language: 'fr' });
    expect(store.highScores).toEqual([
      { name: 'LUDO', score: 120, level: null, date: null, context: null },
      { name: 'ANNE', score: 87, level: null, date: null, context: null },
    ]);
    expect(store.lastName).toBe('LUDO');

    store.clearHighScores();
    // Second lancement : les cookies sont toujours là mais déjà importés.
    expect(new Store(storage, cookies).highScores).toEqual([]);
  });

  it('marque l’import comme fait même sans cookie legacy', () => {
    const storage = new MemoryStorage();
    expect(new Store(storage, '').highScores).toEqual([]);
    expect(new Store(storage, cookies).highScores).toEqual([]);
  });
});

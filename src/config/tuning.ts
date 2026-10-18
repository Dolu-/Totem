/**
 * Réglages INTERNES de difficulté et de rythme.
 *
 * Unique source de vérité pour tous les dosages du jeu : le moteur ne contient
 * aucune constante de difficulté en dur. Les valeurs par défaut seront
 * calibrées par simulation (étape 3 du plan, `npm run sim`).
 *
 * Unités : niveaux à partir de 0, vitesses en cases par seconde, durées en ms.
 */

/**
 * Courbe de vitesse de chute.
 * - `formula` : inspirée de Tetris, secondes par case = scale × (base − step × niveau)^niveau.
 *   Avec scale = 1,6 le niveau 0 retrouve la vitesse 0 du legacy (une demi-case toutes les 800 ms).
 * - `table` : vitesse explicite par niveau ; au-delà de la table, la dernière valeur s'applique.
 */
export type GravityCurve =
  | {
      readonly kind: 'formula';
      readonly scale: number;
      readonly base: number;
      readonly step: number;
    }
  | { readonly kind: 'table'; readonly cellsPerSecond: readonly number[] };

export const PROGRESS_UNITS = ['blocks', 'alignments'] as const;
export type ProgressUnit = (typeof PROGRESS_UNITS)[number];

export interface Tuning {
  readonly progression: {
    /**
     * Ce qui fait progresser vers le niveau suivant :
     * - `blocks` : chaque bloc effacé compte 1 ;
     * - `alignments` : chaque alignement distinct compte 1, quelle que soit sa longueur
     *   (une ligne de 5 = 1 ; un « L » ou une croix = 2 ; une chaîne ×2 = au moins 2).
     */
    readonly unit: ProgressUnit;
    /** Unités (cf. `unit`) à accumuler pour chaque niveau (équivalent des 10 lignes de Tetris). */
    readonly perLevel: number;
    readonly maxLevel: number;
    /**
     * Optionnel : seuils cumulés (en `unit`) pour chaque passage de niveau
     * (strictement croissants). Prioritaires sur `perLevel` ; après le
     * dernier seuil, on reprend un palier tous les `perLevel`.
     */
    readonly levelThresholds?: readonly number[];
    /**
     * Les étapes suivantes d'une réaction en chaîne (×2, ×3…) comptent-elles pour la
     * progression ? `false` : seul le premier effacement après la pose compte ; la chaîne
     * rapporte ses points multipliés sans accélérer la montée en niveau (elle est récompensée).
     */
    readonly countChainSteps: boolean;
  };
  readonly speed: {
    readonly gravity: GravityCurve;
    /** Plafond de la vitesse de chute, quel que soit le niveau. */
    readonly maxCellsPerSecond: number;
    /** Vitesse pendant la descente rapide (si supérieure à la vitesse du niveau). */
    readonly softDropCellsPerSecond: number;
    /**
     * Hauteur de plateau (en lignes) pour laquelle les vitesses ci-dessus sont définies.
     * Sur un autre plateau, toutes les vitesses (plafond et descente rapide compris)
     * sont multipliées par hauteur / referenceHeight : une pièce met le même temps à
     * traverser le plateau, quelle que soit sa hauteur. Absent = pas d'adaptation.
     */
    readonly referenceHeight?: number;
  };
  readonly scoring: {
    /** Points par fenêtre de 3 cases alignées (legacy : 3). */
    readonly pointsPerTriplet: number;
    /** Multiplicateur de chaîne = 1 + (chaîne − 1) × chainStep (legacy : ×1, ×2, ×3…). */
    readonly chainStep: number;
    /** Table optionnelle de multiplicateurs de chaîne (index 0 = chaîne 1), prioritaire ; la dernière valeur se répète. */
    readonly chainMultipliers?: readonly number[];
    /** Multiplicateur de niveau = levelBase + niveau × levelStep. */
    readonly levelBase: number;
    readonly levelStep: number;
  };
  readonly timing: {
    /**
     * Délai avant verrouillage d'une pièce posée
     * = max(lockDelayMinMs, lockDelayCells × durée de chute d'une case au niveau courant).
     * Legacy : verrouillage au tick suivant, soit une demi-case (lockDelayCells = 0,5).
     */
    readonly lockDelayMinMs: number;
    readonly lockDelayCells: number;
    /** Durée de la disparition des alignements (legacy : 16 étapes à 25 i/s ≈ 640 ms). */
    readonly clearMs: number;
    /** Durée de chute d'une case après un effacement (legacy : 4 images ≈ 160 ms). */
    readonly collapseMsPerCell: number;
    /**
     * Temporisation avant que la descente rapide accélère (legacy : délai de répétition
     * du clavier). Une pièce déjà posée est verrouillée sans attendre.
     */
    readonly softDropDelayMs: number;
    /**
     * Durée de l'animation de glissement latéral (purement visuelle) : les trois carrés
     * partent l'un après l'autre (cf. `render/style.ts`), comme dans l'original (~160 ms).
     */
    readonly slideMs: number;
    /** Répétition des déplacements clavier : délai initial puis intervalle. */
    /**
     * Répétition d'un déplacement maintenu (clavier, boutons) : délai avant la première
     * répétition, puis intervalle. Original : délai de répétition du clavier, puis un pas par
     * animation de glissement (~160 ms) ; ici ~6,5 colonnes/s, glissements enchaînés sans télescopage.
     */
    readonly repeatDelayMs: number;
    readonly repeatIntervalMs: number;
  };
  readonly gestures: {
    /** Distance (en largeur de case) déclenchant un déplacement latéral. */
    readonly moveCells: number;
    /** Distance verticale (en hauteur de case) pour reconnaître un glissement haut/bas. */
    readonly swipeCells: number;
    /** Un tap : déplacement inférieur à tapMaxPx et durée inférieure à tapMaxMs. */
    readonly tapMaxPx: number;
    readonly tapMaxMs: number;
  };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/*
 * Calibrage (étape 3, `npm run sim`, plateau 6×15, 6 couleurs, 40 parties par profil) :
 * bot « moyen » ≈ 12 min et niveau 12 ; « expert » ≈ 15 min (p90 ≈ 25 min) et niveau 19.
 * Après les animations ralenties à la façon de l'original (disparition 650 ms, chute
 * 160 ms par case, descente rapide temporisée) : « moyen » ≈ 18 min, « expert » ≈ 22 min,
 * mêmes niveaux atteints.
 * Puis paliers de 10 alignements (étapes de chaîne non comptées, countChainSteps = false) :
 * « moyen » ≈ 8,6 min, « expert » ≈ 14 min (niveau max vers 10 min) ; facile 11 / 24 min,
 * difficile 5,7 / 6,7 min.
 * 30 alignements ≈ 90 blocs ≈ 30 pièces par niveau (Tetris : ~25 pièces).
 * Le niveau 0 démarre à 1 case/s (legacy : 0,625) : 15 s par pièce au lieu de 24 s.
 */
export const DEFAULT_TUNING: Tuning = deepFreeze({
  progression: { unit: 'alignments', perLevel: 10, maxLevel: 20, countChainSteps: false },
  speed: {
    // Cases/s : niveau 0 → 1 ; 3 → 1,4 ; 6 → 2,2 ; 9 → 3,7 ; 12 → 6,8 ; 14 → 10,7 ; 15 et plus → 12 (plafond).
    gravity: { kind: 'formula', scale: 1, base: 0.9, step: 0.004 },
    maxCellsPerSecond: 12,
    softDropCellsPerSecond: 12,
    referenceHeight: 15,
  },
  scoring: { pointsPerTriplet: 3, chainStep: 1, levelBase: 1, levelStep: 1 },
  timing: {
    lockDelayMinMs: 150,
    lockDelayCells: 0.5,
    clearMs: 650,
    collapseMsPerCell: 160,
    softDropDelayMs: 250,
    slideMs: 160,
    repeatDelayMs: 250,
    repeatIntervalMs: 150,
  },
  gestures: { moveCells: 0.8, swipeCells: 1, tapMaxPx: 10, tapMaxMs: 250 },
});

export type PresetId = 'easy' | 'normal' | 'hard';

/** Préréglages proposés au joueur : variations fusionnées sur `DEFAULT_TUNING`. */
export const PRESETS: Readonly<Record<PresetId, DeepPartial<Tuning>>> = deepFreeze({
  easy: {
    progression: { perLevel: 13 },
    speed: { maxCellsPerSecond: 9 },
    timing: { lockDelayMinMs: 300 },
  },
  normal: {},
  hard: {
    progression: { perLevel: 7 },
    speed: {
      gravity: { kind: 'formula', scale: 0.8, base: 0.9, step: 0.004 },
      maxCellsPerSecond: 15,
    },
    timing: { lockDelayMinMs: 100 },
  },
});

/** Fusion profonde : les objets sont fusionnés, les tableaux et valeurs simples remplacés. */
export function mergeTuning(base: Tuning, ...overrides: readonly DeepPartial<Tuning>[]): Tuning {
  let result: unknown = base;
  for (const override of overrides) result = deepMerge(result, override);
  return deepFreeze(result as Tuning);
}

export function tuningForPreset(preset: PresetId, base: Tuning = DEFAULT_TUNING): Tuning {
  return mergeTuning(base, PRESETS[preset]);
}

/** Liste des incohérences (vide si le réglage est valide). */
export function validateTuning(t: Tuning): string[] {
  const errors: string[] = [];
  const check = (ok: boolean, message: string): void => {
    if (!ok) errors.push(message);
  };
  const positive = (n: number): boolean => Number.isFinite(n) && n > 0;
  const nonNegative = (n: number): boolean => Number.isFinite(n) && n >= 0;

  const { progression, speed, scoring, timing, gestures } = t;
  check(
    // Un réglage peut venir d'un JSON (`?tuning=`) : la valeur n'est pas garantie par le typage.
    (PROGRESS_UNITS as readonly string[]).includes(progression.unit),
    'progression.unit doit valoir « blocks » ou « alignments »',
  );
  check(
    typeof progression.countChainSteps === 'boolean',
    'progression.countChainSteps doit être un booléen',
  );
  check(
    Number.isInteger(progression.perLevel) && progression.perLevel > 0,
    'progression.perLevel doit être un entier > 0',
  );
  check(
    Number.isInteger(progression.maxLevel) && progression.maxLevel >= 0,
    'progression.maxLevel doit être un entier ≥ 0',
  );
  if (progression.levelThresholds) {
    const th = progression.levelThresholds;
    check(
      th.every((v) => Number.isInteger(v) && v > 0) && isIncreasing(th, true),
      'progression.levelThresholds doit être une suite d’entiers > 0 strictement croissante',
    );
  }

  const g = speed.gravity;
  if (g.kind === 'formula') {
    check(positive(g.scale), 'speed.gravity.scale doit être > 0');
    check(positive(g.base) && g.base < 1, 'speed.gravity.base doit être dans ]0, 1[');
    check(nonNegative(g.step), 'speed.gravity.step doit être ≥ 0');
    check(
      g.base - g.step * progression.maxLevel > 0,
      'speed.gravity : base − step × maxLevel doit rester > 0',
    );
  } else {
    check(g.cellsPerSecond.length > 0, 'speed.gravity.cellsPerSecond ne doit pas être vide');
    check(
      g.cellsPerSecond.every(positive) && isIncreasing(g.cellsPerSecond, false),
      'speed.gravity.cellsPerSecond doit être positive et croissante',
    );
  }
  check(positive(speed.maxCellsPerSecond), 'speed.maxCellsPerSecond doit être > 0');
  check(positive(speed.softDropCellsPerSecond), 'speed.softDropCellsPerSecond doit être > 0');
  if (speed.referenceHeight !== undefined) {
    check(positive(speed.referenceHeight), 'speed.referenceHeight doit être > 0');
  }

  check(nonNegative(scoring.pointsPerTriplet), 'scoring.pointsPerTriplet doit être ≥ 0');
  check(nonNegative(scoring.chainStep), 'scoring.chainStep doit être ≥ 0');
  if (scoring.chainMultipliers) {
    check(
      scoring.chainMultipliers.length > 0 && scoring.chainMultipliers.every(positive),
      'scoring.chainMultipliers doit contenir des valeurs > 0',
    );
  }
  check(positive(scoring.levelBase), 'scoring.levelBase doit être > 0');
  check(nonNegative(scoring.levelStep), 'scoring.levelStep doit être ≥ 0');

  for (const [key, value] of Object.entries(timing)) {
    check(nonNegative(value), `timing.${key} doit être ≥ 0`);
  }
  check(positive(timing.repeatIntervalMs), 'timing.repeatIntervalMs doit être > 0');
  for (const [key, value] of Object.entries(gestures)) {
    check(positive(value), `gestures.${key} doit être > 0`);
  }
  return errors;
}

export function assertValidTuning(t: Tuning): Tuning {
  const errors = validateTuning(t);
  if (errors.length > 0) throw new Error(`Tuning invalide :\n- ${errors.join('\n- ')}`);
  return t;
}

/**
 * Empreinte courte et stable d'un réglage (FNV-1a sur un JSON à clés triées).
 * Mémorisée avec les records pour ne pas comparer des scores obtenus sous des règles différentes.
 */
export function tuningFingerprint(t: Tuning): string {
  const json = stableStringify(t);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isIncreasing(values: readonly number[], strict: boolean): boolean {
  let previous = -Infinity;
  for (const value of values) {
    if (strict ? value <= previous : value < previous) return false;
    previous = value;
  }
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  // Union discriminée (ex. courbe `formula` → `table`) : on remplace au lieu de mélanger.
  if ('kind' in override && override['kind'] !== base['kind']) return override;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    result[key] = deepMerge(base[key], value);
  }
  return result;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

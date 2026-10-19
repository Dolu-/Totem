/**
 * Réglages choisis par le joueur (écran « Réglages »), mémorisés localement.
 * Les dosages fins de difficulté restent dans `tuning.ts` (internes) : le joueur
 * choisit seulement un préréglage.
 */
import type { GameOptions } from '../core/game.ts';
import type { SpawnMode } from '../core/piece.ts';
import { tuningForPreset, type PresetId } from './tuning.ts';

export const LANGUAGES = ['fr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface Settings {
  readonly lines: number;
  readonly columns: number;
  readonly colors: number;
  readonly startLevel: number;
  readonly preset: PresetId;
  readonly spawnMode: SpawnMode;
  /** `auto` : langue du navigateur. */
  readonly language: Language | 'auto';
  /** Boutons de contrôle à l'écran (en plus des gestes). */
  readonly touchButtons: boolean;
  /** Symboles sur les blocs, pour distinguer les couleurs sans les voir. */
  readonly colorSymbols: boolean;
  /** Geste vif vers le bas : la pièce descend jusqu'à la pose (sinon la descente suit le doigt). */
  readonly flickToLock: boolean;
}

/** Bornes des réglages numériques (reprises du legacy). */
export const SETTINGS_BOUNDS = {
  lines: { min: 10, max: 20 },
  columns: { min: 5, max: 12 },
  colors: { min: 5, max: 9 },
  startLevel: { min: 0, max: 9 },
} as const satisfies Record<string, { min: number; max: number }>;

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  lines: 15,
  columns: 6,
  colors: 6,
  startLevel: 0,
  preset: 'normal',
  spawnMode: 'random',
  language: 'auto',
  touchButtons: false,
  colorSymbols: false,
  flickToLock: false,
});

const PRESET_IDS: readonly PresetId[] = ['easy', 'normal', 'hard'];
const SPAWN_MODES: readonly SpawnMode[] = ['random', 'center'];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function boundedInt(
  value: unknown,
  bounds: { min: number; max: number },
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Réglages valides à partir de n'importe quelle valeur (stockage ancien,
 * altéré ou incomplet) : champ invalide → valeur par défaut, nombre hors
 * bornes → ramené dans les bornes.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  const b = SETTINGS_BOUNDS;
  return {
    lines: boundedInt(r['lines'], b.lines, d.lines),
    columns: boundedInt(r['columns'], b.columns, d.columns),
    colors: boundedInt(r['colors'], b.colors, d.colors),
    startLevel: boundedInt(r['startLevel'], b.startLevel, d.startLevel),
    preset: oneOf(r['preset'], PRESET_IDS, d.preset),
    spawnMode: oneOf(r['spawnMode'], SPAWN_MODES, d.spawnMode),
    language: oneOf<Language | 'auto'>(r['language'], [...LANGUAGES, 'auto'], d.language),
    touchButtons: bool(r['touchButtons'], d.touchButtons),
    colorSymbols: bool(r['colorSymbols'], d.colorSymbols),
    flickToLock: bool(r['flickToLock'], d.flickToLock),
  };
}

/** Options d'une nouvelle partie à partir des réglages du joueur. */
export function gameOptionsFromSettings(settings: Settings, seed: number): Partial<GameOptions> {
  return {
    width: settings.columns,
    height: settings.lines,
    colorCount: settings.colors,
    startLevel: settings.startLevel,
    spawnMode: settings.spawnMode,
    tuning: tuningForPreset(settings.preset),
    seed,
  };
}

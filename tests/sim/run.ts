/**
 * Simulations de parties par le bot, pour doser la difficulté par la mesure.
 *
 *   npm run sim                                   # réglage par défaut, 3 profils
 *   npm run sim -- --games 100 --profile casual
 *   npm run sim -- --tuning a.json --compare b.json   # mêmes graines, deux réglages
 *   npm run sim -- --set progression.unit=alignments --set progression.perLevel=10
 *
 * Un fichier --tuning / --compare contient un `DeepPartial<Tuning>` (JSON),
 * fusionné sur le préréglage choisi (--preset, « normal » par défaut).
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  mergeTuning,
  tuningForPreset,
  type DeepPartial,
  type PresetId,
  type Tuning,
} from '../../src/config/tuning.ts';
import { PROFILES, playGame, type BotProfile, type GameStats } from './driver.ts';

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '40' },
    seed: { type: 'string', default: '1' },
    profile: { type: 'string', default: 'all' },
    preset: { type: 'string', default: 'normal' },
    tuning: { type: 'string' },
    compare: { type: 'string' },
    set: { type: 'string', multiple: true, default: [] },
    width: { type: 'string', default: '6' },
    height: { type: 'string', default: '15' },
    colors: { type: 'string', default: '6' },
    'start-level': { type: 'string', default: '0' },
  },
});

const games = Number(values.games);
const seed0 = Number(values.seed);
const base = tuningForPreset(values.preset as PresetId);

/** `--set chemin.vers.cle=valeur` → objet partiel (valeur JSON si possible, sinon texte). */
function setToPartial(assignments: readonly string[]): DeepPartial<Tuning> {
  const root: Record<string, unknown> = {};
  for (const assignment of assignments) {
    const [path = '', raw = ''] = assignment.split('=');
    const keys = path.split('.');
    let node = root;
    keys.slice(0, -1).forEach((key) => {
      node[key] ??= {};
      node = node[key] as Record<string, unknown>;
    });
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      // texte brut
    }
    node[keys[keys.length - 1] ?? ''] = value;
  }
  return root;
}

const readPartial = (file: string | undefined): DeepPartial<Tuning> =>
  file ? (JSON.parse(readFileSync(file, 'utf8')) as DeepPartial<Tuning>) : {};

const configs: { label: string; tuning: Tuning }[] = [
  {
    label: values.tuning ?? (values.set.length > 0 ? values.set.join(' ') : values.preset),
    tuning: mergeTuning(base, readPartial(values.tuning), setToPartial(values.set)),
  },
];
if (values.compare) {
  configs.push({ label: values.compare, tuning: mergeTuning(base, readPartial(values.compare)) });
}

const profiles: BotProfile[] =
  values.profile === 'all'
    ? Object.values(PROFILES)
    : [PROFILES[values.profile as keyof typeof PROFILES]];

const quantile = (sorted: readonly number[], q: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

function summarize(stats: readonly GameStats[]): Record<string, string> {
  const pick = (f: (s: GameStats) => number): number[] => stats.map(f).sort((a, b) => a - b);
  const fmt = (sorted: number[], digits = 0): string =>
    `${quantile(sorted, 0.5).toFixed(digits)} [${quantile(sorted, 0.1).toFixed(digits)}–${quantile(sorted, 0.9).toFixed(digits)}]`;
  const minutes = pick((s) => s.durationMs / 60_000);
  const reach = (level: number): string => {
    const times = stats
      .map((s) => s.levelReachedAt[level])
      .filter((t): t is number => t !== undefined)
      .sort((a, b) => a - b);
    if (times.length === 0) return '—';
    return `${(quantile(times, 0.5) / 60_000).toFixed(1)} (${Math.round((100 * times.length) / stats.length)} %)`;
  };
  return {
    'durée (min)': fmt(minutes, 1),
    score: fmt(pick((s) => s.score)),
    'niveau final': fmt(pick((s) => s.level)),
    pièces: fmt(pick((s) => s.piecesPlaced)),
    'chaîne max': fmt(pick((s) => s.maxChain)),
    'niv. 3 atteint à (min)': reach(3),
    'niv. 6': reach(6),
    'niv. 9': reach(9),
    'niv. 12': reach(12),
    'parties non finies': String(stats.filter((s) => s.timedOut).length),
  };
}

const t0 = performance.now();
const rows: Record<string, Record<string, string>> = {};
for (const { label, tuning } of configs) {
  for (const profile of profiles) {
    const stats = Array.from({ length: games }, (_, i) =>
      playGame(
        {
          seed: seed0 + i,
          width: Number(values.width),
          height: Number(values.height),
          colorCount: Number(values.colors),
          startLevel: Number(values['start-level']),
          tuning,
        },
        profile,
        { botSeed: 1000 + seed0 + i },
      ),
    );
    rows[`${label} · ${profile.name}`] = summarize(stats);
  }
}
console.log(
  `${games} parties par ligne, plateau ${values.width}×${values.height}, ${values.colors} couleurs, ` +
    `niveau de départ ${values['start-level']} — médiane [p10–p90]`,
);
console.table(rows);
console.log(`Simulé en ${((performance.now() - t0) / 1000).toFixed(1)} s`);

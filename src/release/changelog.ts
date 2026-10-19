/**
 * Journal des versions, écrit à la main pour le joueur (pas une copie des commits) :
 * ce qui change pour lui, en français et en anglais. Du plus récent au plus ancien ;
 * la première entrée porte la version de `package.json` (vérifié par les tests).
 * Règles de rédaction et de numérotation : CLAUDE.md, « Versions et journal ».
 */
import type { Language } from '../config/settings.ts';

/** `feature` : nouveauté ou évolution ; `fix` : correction. */
export type ChangeKind = 'feature' | 'fix';

export type Change = { readonly kind: ChangeKind } & Readonly<Record<Language, string>>;

export interface Release {
  /** `X.Y.Z` (SemVer). */
  readonly version: string;
  /** Date de publication, `AAAA-MM-JJ`. */
  readonly date: string;
  readonly changes: readonly Change[];
}

export const CHANGELOG: readonly Release[] = [
  {
    version: '1.1.1',
    date: '2026-10-19',
    changes: [
      {
        kind: 'fix',
        fr: 'Sur les iPhone restés sous iOS 15 (iPhone 6s, 7…), le bouton « Jouer » lance de nouveau la partie.',
        en: 'On iPhones still running iOS 15 (iPhone 6s, 7…), the “Play” button starts the game again.',
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-19',
    changes: [
      {
        kind: 'feature',
        fr: 'Écran tactile : en glissant vers le bas, la pièce suit le doigt case par case, sans s’emballer.',
        en: 'Touch screen: when swiping down, the piece follows your finger one cell at a time, without running away.',
      },
      {
        kind: 'feature',
        fr: 'Nouveau réglage « Geste vif vers le bas : poser la pièce ».',
        en: 'New setting “Quick swipe down: drop the piece”.',
      },
      {
        kind: 'feature',
        fr: 'Numéro de version affiché, historique des versions dans l’aide, et mise à jour au moment choisi, avec la liste des nouveautés.',
        en: 'Version number shown, version history in the help, and updates when you choose, with the list of changes.',
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-18',
    changes: [
      {
        kind: 'feature',
        fr: 'Première version publique de Totem : jouable sur PC et mobile, installable, même hors ligne.',
        en: 'First public release of Totem: playable on PC and mobile, installable, even offline.',
      },
    ],
  },
];

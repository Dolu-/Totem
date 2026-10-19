/**
 * Écrans de l'application. Chaque fonction construit une section complète à
 * partir des textes traduits et de rappels ; l'application l'affiche et la
 * reconstruit si la langue change.
 */
import {
  DEFAULT_SETTINGS,
  LANGUAGES,
  SETTINGS_BOUNDS,
  type Language,
  type Settings,
} from '../config/settings.ts';
import type { PresetId } from '../config/tuning.ts';
import type { GameResult } from '../core/game.ts';
import type { SpawnMode } from '../core/piece.ts';
import type { MessageKey, Translator } from '../i18n/index.ts';
import type { Release } from '../release/changelog.ts';
import { BLOCK_STYLES } from '../render/palette.ts';
import { MAX_NAME_LENGTH, type HighScore } from '../storage/store.ts';
import { button, h } from './dom.ts';
import { displayLevel, internalLevel } from './format.ts';

// ─── Accueil ──────────────────────────────────────────────────────────────

export interface HomeProps {
  readonly onPlay: () => void;
  readonly onScores: () => void;
  readonly onSettings: () => void;
  readonly onHelp: () => void;
  readonly storageWarning: boolean;
  /** Version installée, affichée sous le menu. */
  readonly version: string;
  /** Mise à jour prête (version annoncée si connue) : bouton dédié. */
  readonly update: { readonly version: string | null; readonly onClick: () => void } | null;
}

export function homeScreen(t: Translator, props: HomeProps): HTMLElement {
  // Logo : les couleurs du jeu en damier (comme l'écran d'accueil d'origine).
  const logo = h(
    'div',
    { class: 'logo', 'aria-hidden': 'true' },
    BLOCK_STYLES.map((style) =>
      h('span', {
        class: 'logo__block',
        style: `--block: ${style.base}; --block-light: ${style.light}; --block-dark: ${style.dark}`,
      }),
    ),
  );
  return h(
    'section',
    { class: 'screen screen--home', 'aria-labelledby': 'home-title' },
    h(
      'div',
      { class: 'card card--home' },
      logo,
      h('h1', { id: 'home-title', class: 'title' }, t.t('app.title')),
      h('p', { class: 'tagline' }, t.t('app.tagline')),
      h(
        'nav',
        { class: 'menu' },
        button(t.t('menu.play'), props.onPlay, {
          class: 'btn btn--primary',
          'data-autofocus': true,
          'data-action': 'play',
        }),
        button(t.t('menu.highScores'), props.onScores, { 'data-action': 'scores' }),
        button(t.t('menu.settings'), props.onSettings, { 'data-action': 'settings' }),
        button(t.t('menu.help'), props.onHelp, { 'data-action': 'help' }),
        props.update &&
          button(
            props.update.version === null
              ? t.t('menu.update')
              : t.t('menu.updateTo', { version: props.update.version }),
            props.update.onClick,
            { class: 'btn btn--update', 'data-action': 'update' },
          ),
      ),
      props.storageWarning &&
        h('p', { class: 'notice', role: 'status' }, t.t('notice.storageUnavailable')),
      h('p', { class: 'app-version' }, t.t('app.version', { version: props.version })),
    ),
  );
}

// ─── Réglages ─────────────────────────────────────────────────────────────

export interface SettingsProps {
  readonly settings: Settings;
  readonly onSave: (settings: Settings) => void;
  readonly onCancel: () => void;
}

type NumericKey = keyof typeof SETTINGS_BOUNDS;

export function settingsScreen(t: Translator, props: SettingsProps): HTMLElement {
  const form = h('form', { class: 'card card--settings', novalidate: true });
  const draft: { -readonly [K in keyof Settings]: Settings[K] } = { ...props.settings };

  const range = (key: NumericKey, label: MessageKey): HTMLElement => {
    const id = `setting-${key}`;
    // Le niveau de départ s'affiche à partir de 1 (le moteur compte à partir de 0).
    const shown = (v: number): number => (key === 'startLevel' ? displayLevel(v) : v);
    const stored = (v: number): number => (key === 'startLevel' ? internalLevel(v) : v);
    const { min, max } = SETTINGS_BOUNDS[key];
    const output = h('output', { for: id, class: 'field__value' }, shown(draft[key]));
    const input = h('input', {
      id,
      name: key,
      type: 'range',
      min: shown(min),
      max: shown(max),
      step: 1,
      value: shown(draft[key]),
    });
    input.addEventListener('input', () => {
      draft[key] = stored(Number(input.value));
      output.textContent = input.value;
    });
    return h('div', { class: 'field' }, h('label', { for: id }, t.t(label)), input, output);
  };

  const select = (
    key: 'preset' | 'spawnMode' | 'language',
    label: MessageKey,
    options: readonly { value: string; label: string }[],
  ): HTMLElement => {
    const id = `setting-${key}`;
    const el = h(
      'select',
      { id, name: key },
      options.map((o) =>
        h('option', { value: o.value, selected: draft[key] === o.value }, o.label),
      ),
    );
    el.addEventListener('change', () => {
      (draft as Record<string, unknown>)[key] = el.value;
    });
    return h('div', { class: 'field field--select' }, h('label', { for: id }, t.t(label)), el);
  };

  const checkbox = (
    key: 'touchButtons' | 'colorSymbols' | 'flickToLock',
    label: MessageKey,
  ): HTMLElement => {
    const id = `setting-${key}`;
    const input = h('input', { id, name: key, type: 'checkbox', checked: draft[key] });
    input.addEventListener('change', () => {
      draft[key] = input.checked;
    });
    return h('div', { class: 'field field--check' }, input, h('label', { for: id }, t.t(label)));
  };

  const presets: readonly PresetId[] = ['easy', 'normal', 'hard'];
  const spawns: readonly SpawnMode[] = ['random', 'center'];
  const languages: readonly (Language | 'auto')[] = ['auto', ...LANGUAGES];

  const render = (): void => {
    form.replaceChildren(
      h('h1', { class: 'title title--small', id: 'settings-title' }, t.t('settings.title')),
      h(
        'fieldset',
        {},
        h('legend', {}, t.t('settings.game')),
        range('lines', 'settings.lines'),
        range('columns', 'settings.columns'),
        range('colors', 'settings.colors'),
        range('startLevel', 'settings.startLevel'),
        select(
          'preset',
          'settings.preset',
          presets.map((p) => ({ value: p, label: t.t(`settings.preset.${p}`) })),
        ),
        select(
          'spawnMode',
          'settings.spawnMode',
          spawns.map((s) => ({ value: s, label: t.t(`settings.spawnMode.${s}`) })),
        ),
      ),
      h(
        'fieldset',
        {},
        h('legend', {}, t.t('settings.display')),
        select(
          'language',
          'settings.language',
          languages.map((l) => ({ value: l, label: t.t(`settings.language.${l}`) })),
        ),
        checkbox('touchButtons', 'settings.touchButtons'),
        checkbox('colorSymbols', 'settings.colorSymbols'),
        checkbox('flickToLock', 'settings.flickToLock'),
      ),
      h(
        'div',
        { class: 'actions' },
        button(
          t.t('settings.defaults'),
          () => {
            Object.assign(draft, DEFAULT_SETTINGS);
            render();
          },
          { 'data-action': 'defaults' },
        ),
        button(t.t('settings.cancel'), props.onCancel, { 'data-action': 'cancel' }),
        h(
          'button',
          { type: 'submit', class: 'btn btn--primary', 'data-action': 'save' },
          t.t('settings.save'),
        ),
      ),
    );
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    props.onSave({ ...draft });
  });
  render();
  return h(
    'section',
    { class: 'screen screen--settings', 'aria-labelledby': 'settings-title' },
    form,
  );
}

// ─── Records ──────────────────────────────────────────────────────────────

export interface ScoresProps {
  readonly scores: readonly HighScore[];
  /** Rang à mettre en valeur (record qui vient d'être enregistré). */
  readonly highlight: number | null;
  readonly onBack: () => void;
  readonly onReset: () => void;
}

export function scoresScreen(t: Translator, props: ScoresProps): HTMLElement {
  const content =
    props.scores.length === 0
      ? h('p', { class: 'empty' }, t.t('scores.empty'))
      : h(
          'table',
          { class: 'scores' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', { scope: 'col' }, t.t('scores.rank')),
              h('th', { scope: 'col' }, t.t('scores.name')),
              h('th', { scope: 'col', class: 'num' }, t.t('scores.score')),
              h('th', { scope: 'col', class: 'num' }, t.t('scores.level')),
              h('th', { scope: 'col', class: 'date' }, t.t('scores.date')),
            ),
          ),
          h(
            'tbody',
            {},
            props.scores.map((s, i) =>
              h(
                'tr',
                {
                  class: i === props.highlight ? 'is-new' : false,
                  'aria-current': i === props.highlight ? 'true' : false,
                },
                h('td', {}, i + 1),
                h(
                  'th',
                  { scope: 'row' },
                  s.name,
                  s.context === null &&
                    h(
                      'small',
                      { class: 'legacy', title: t.t('scores.legacy') },
                      ` (${t.t('scores.legacyMark')})`,
                    ),
                ),
                h('td', { class: 'num' }, t.formatNumber(s.score)),
                h('td', { class: 'num' }, s.level === null ? '—' : displayLevel(s.level)),
                h('td', { class: 'date' }, s.date ? t.formatDate(s.date) : '—'),
              ),
            ),
          ),
        );
  return h(
    'section',
    { class: 'screen screen--scores', 'aria-labelledby': 'scores-title' },
    h(
      'div',
      { class: 'card' },
      h('h1', { class: 'title title--small', id: 'scores-title' }, t.t('scores.title')),
      content,
      h(
        'div',
        { class: 'actions' },
        props.scores.length > 0 &&
          button(t.t('scores.reset'), props.onReset, {
            class: 'btn btn--danger',
            'data-action': 'reset',
          }),
        button(t.t('menu.back'), props.onBack, {
          class: 'btn btn--primary',
          'data-autofocus': true,
          'data-action': 'back',
        }),
      ),
    ),
  );
}

// ─── Aide ─────────────────────────────────────────────────────────────────

export interface HelpProps {
  readonly version: string;
  readonly onHistory: () => void;
  readonly onBack: () => void;
}

export function helpScreen(t: Translator, props: HelpProps): HTMLElement {
  const list = (keys: readonly MessageKey[]): HTMLElement =>
    h(
      'ul',
      {},
      keys.map((k) => h('li', {}, t.t(k))),
    );
  return h(
    'section',
    { class: 'screen screen--help', 'aria-labelledby': 'help-title' },
    h(
      'div',
      { class: 'card card--text' },
      h('h1', { class: 'title title--small', id: 'help-title' }, t.t('help.title')),
      h('p', {}, t.t('help.goal')),
      h('p', {}, t.t('help.levels')),
      h('h2', {}, t.t('help.keyboard')),
      list([
        'help.keyboard.move',
        'help.keyboard.rotate',
        'help.keyboard.drop',
        'help.keyboard.pause',
      ]),
      h('h2', {}, t.t('help.touch')),
      list(['help.touch.move', 'help.touch.rotate', 'help.touch.drop']),
      h('p', { class: 'app-version' }, t.t('app.version', { version: props.version })),
      h(
        'div',
        { class: 'actions' },
        button(t.t('help.history'), props.onHistory, { 'data-action': 'history' }),
        button(t.t('menu.back'), props.onBack, {
          class: 'btn btn--primary',
          'data-autofocus': true,
          'data-action': 'back',
        }),
      ),
    ),
  );
}

// ─── Versions (historique, nouveautés, mise à jour) ──────────────────────

export interface ReleasesProps {
  readonly title: string;
  /** Paragraphes avant la liste des versions. */
  readonly intro: readonly string[];
  readonly releases: readonly Release[];
  /** Boutons, le dernier est le bouton principal. */
  readonly actions: readonly {
    readonly label: string;
    readonly id: string;
    readonly onClick: () => void;
  }[];
}

export function releasesScreen(t: Translator, props: ReleasesProps): HTMLElement {
  const releases = props.releases.map((release) =>
    h(
      'section',
      { class: 'release', 'data-version': release.version },
      h(
        'h2',
        {},
        t.t('releases.heading', { version: release.version }),
        ' ',
        // Midi local : la date reste la même quel que soit le fuseau.
        h(
          'time',
          { class: 'release__date', datetime: release.date },
          t.formatDate(`${release.date}T12:00:00`),
        ),
      ),
      h(
        'ul',
        { class: 'release__changes' },
        release.changes.map((change) =>
          h(
            'li',
            {},
            h(
              'span',
              { class: `release__kind release__kind--${change.kind}` },
              t.t(`releases.${change.kind}`),
            ),
            ' ',
            change[t.language],
          ),
        ),
      ),
    ),
  );
  const last = props.actions.length - 1;
  return h(
    'section',
    { class: 'screen screen--releases', 'aria-labelledby': 'releases-title' },
    h(
      'div',
      { class: 'card card--text' },
      h('h1', { class: 'title title--small', id: 'releases-title' }, props.title),
      props.intro.map((text) => h('p', {}, text)),
      releases,
      h(
        'div',
        { class: 'actions' },
        props.actions.map((action, i) =>
          button(action.label, action.onClick, {
            class: i === last ? 'btn btn--primary' : 'btn',
            'data-autofocus': i === last,
            'data-action': action.id,
          }),
        ),
      ),
    ),
  );
}

// ─── Pause ────────────────────────────────────────────────────────────────

export function pauseScreen(t: Translator, onResume: () => void, onStop: () => void): HTMLElement {
  return h(
    'section',
    {
      class: 'screen screen--overlay screen--pause',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'pause-title',
    },
    h(
      'div',
      { class: 'card' },
      h('h1', { class: 'title', id: 'pause-title' }, t.t('pause.title')),
      h(
        'div',
        { class: 'menu' },
        button(t.t('pause.resume'), onResume, {
          class: 'btn btn--primary',
          'data-autofocus': true,
          'data-action': 'resume',
        }),
        button(t.t('pause.stop'), onStop, { 'data-action': 'stop' }),
      ),
      h('p', { class: 'hint' }, t.t('pause.hint')),
    ),
  );
}

// ─── Fin de partie ────────────────────────────────────────────────────────

export interface GameOverProps {
  readonly result: GameResult;
  readonly qualifies: boolean;
  readonly lastName: string;
  readonly onSave: (name: string) => void;
  readonly onReplay: () => void;
  readonly onHome: () => void;
}

export function gameOverScreen(t: Translator, props: GameOverProps): HTMLElement {
  let record: HTMLElement | null = null;
  if (props.qualifies) {
    const input = h('input', {
      id: 'record-name',
      name: 'name',
      type: 'text',
      maxlength: MAX_NAME_LENGTH,
      value: props.lastName,
      autocomplete: 'nickname',
      enterkeyhint: 'done',
      required: true,
      'data-autofocus': true,
    });
    const form = h(
      'form',
      { class: 'record' },
      h('p', { class: 'record__title' }, t.t('gameOver.newRecord')),
      h('label', { for: 'record-name' }, t.t('gameOver.nameLabel')),
      h(
        'div',
        { class: 'record__row' },
        input,
        h(
          'button',
          { type: 'submit', class: 'btn btn--primary', 'data-action': 'save' },
          t.t('gameOver.save'),
        ),
      ),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (input.value.trim() === '') {
        input.focus();
        return;
      }
      props.onSave(input.value);
    });
    record = form;
  }
  return h(
    'section',
    {
      class: 'screen screen--overlay screen--gameover',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'gameover-title',
    },
    h(
      'div',
      { class: 'card' },
      h('h1', { class: 'title', id: 'gameover-title' }, t.t('gameOver.title')),
      h(
        'p',
        { class: 'result', 'data-testid': 'final-score' },
        t.t('gameOver.score', { score: t.formatNumber(props.result.score) }),
      ),
      h(
        'p',
        { class: 'result result--small' },
        t.t('gameOver.level', { level: displayLevel(props.result.level) }),
      ),
      record,
      h(
        'div',
        { class: 'menu' },
        button(t.t('gameOver.playAgain'), props.onReplay, {
          class: props.qualifies ? 'btn' : 'btn btn--primary',
          'data-autofocus': !props.qualifies,
          'data-action': 'replay',
        }),
        button(t.t('gameOver.home'), props.onHome, { 'data-action': 'home' }),
      ),
    ),
  );
}

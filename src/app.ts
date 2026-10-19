/**
 * Application : enchaînement des écrans (machine à états), partie en cours,
 * entrées, HUD, stockage et langue.
 *
 *   home ─→ playing ⇄ paused ─→ gameOver ─→ scores
 *     ├─→ scores / settings / help ─→ home
 */
import { gameOptionsFromSettings, type Settings } from './config/settings.ts';
import { tuningFingerprint, tuningForPreset, type Tuning } from './config/tuning.ts';
import { Game, type GameOptions, type GameResult } from './core/game.ts';
import { GameView } from './game-view.ts';
import { createTranslator, detectLanguage, type Translator } from './i18n/index.ts';
import type { ActionSink } from './input/actions.ts';
import { GestureController } from './input/gestures.ts';
import { KeyboardController } from './input/keyboard.ts';
import { TouchButtons } from './input/touch-buttons.ts';
import { DEFAULT_STYLE, type RenderStyle } from './render/style.ts';
import type { Store } from './storage/store.ts';
import { focusFirst, h } from './ui/dom.ts';
import { displayLevel } from './ui/format.ts';
import { Hud } from './ui/hud.ts';
import { NoticeBar, type NoticeAction } from './ui/notice.ts';
import {
  gameOverScreen,
  helpScreen,
  homeScreen,
  pauseScreen,
  scoresScreen,
  settingsScreen,
} from './ui/screens.ts';

export type ScreenId = 'home' | 'playing' | 'paused' | 'gameOver' | 'scores' | 'settings' | 'help';

/** Écrans où le plateau est visible. */
const GAME_SCREENS: ReadonlySet<ScreenId> = new Set(['playing', 'paused', 'gameOver']);
/** Délai avant l'écran de fin (laisse voir la dernière pièce). */
const GAME_OVER_DELAY_MS = 700;

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now();
}

export class App {
  readonly view: GameView;
  readonly #root: HTMLElement;
  readonly #store: Store;
  readonly #gameLayer: HTMLElement;
  readonly #screenLayer: HTMLElement;
  readonly #controls: HTMLElement;
  readonly #toast: HTMLElement;
  readonly #announcer: HTMLElement;
  readonly #hud: Hud;
  readonly #keyboard: KeyboardController;
  readonly #gestures: GestureController;
  readonly #buttons: TouchButtons;
  readonly #notice = new NoticeBar();
  /** Message en attente : jamais affiché en pleine partie. */
  #pendingNotice: { text: () => string; action?: () => NoticeAction } | null = null;
  #shownNotice: { text: () => string; action?: () => NoticeAction } | null = null;
  #settings: Settings;
  #t: Translator;
  #screen: ScreenId = 'home';
  #lastResult: GameResult | null = null;
  #highlight: number | null = null;
  #detachGame: (() => void) | null = null;
  #gameOverTimer: ReturnType<typeof setTimeout> | null = null;

  /** @param style aspect du plateau (par défaut `DEFAULT_STYLE`, surchargeable par l'adresse). */
  constructor(root: HTMLElement, store: Store, style: RenderStyle = DEFAULT_STYLE) {
    this.#root = root;
    this.#store = store;
    this.#settings = store.settings;
    this.#t = createTranslator(this.#language());

    const sink: ActionSink = {
      moveLeft: () => {
        this.#whenPlaying((g) => g.moveLeft());
      },
      moveRight: () => {
        this.#whenPlaying((g) => g.moveRight());
      },
      rotate: () => {
        this.#whenPlaying((g) => g.rotate());
      },
      setSoftDrop: (active, immediate) => {
        this.view.game?.setSoftDrop(active && this.#screen === 'playing', immediate);
      },
      softDropUntilLock: () => {
        this.#whenPlaying((g) => {
          g.softDropUntilLock();
        });
      },
      togglePause: () => {
        this.togglePause();
      },
    };

    const boardHost = h('div', { class: 'board-host' });
    this.#toast = h('div', { class: 'toast', 'aria-hidden': 'true' });
    this.#hud = new Hud(this.#t, () => {
      this.togglePause();
    });
    this.#controls = h('div', { class: 'controls' });
    this.#gameLayer = h(
      'div',
      { class: 'game-layer', hidden: true },
      this.#hud.element,
      boardHost,
      this.#controls,
    );
    this.#screenLayer = h('div', { class: 'screen-layer' });
    this.#announcer = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
    root.replaceChildren(this.#gameLayer, this.#screenLayer, this.#notice.element, this.#announcer);

    this.view = new GameView(boardHost, { colorSymbols: this.#settings.colorSymbols }, style);
    boardHost.append(this.#toast);

    const { timing, gestures } = this.#tuning();
    this.#keyboard = new KeyboardController(window, sink, {
      repeatDelayMs: timing.repeatDelayMs,
      repeatIntervalMs: timing.repeatIntervalMs,
    });
    this.#gestures = new GestureController(boardHost, sink, {
      ...gestures,
      cellSize: () => this.view.cellSize,
      flickToLock: () => this.#settings.flickToLock,
    });
    this.#buttons = new TouchButtons(sink, this.#buttonLabels(), {
      delayMs: timing.repeatDelayMs,
      intervalMs: timing.repeatIntervalMs,
    });
    this.#controls.append(this.#buttons.element);

    this.view.onTick((dt) => {
      this.#keyboard.update(dt);
      this.#buttons.update(dt);
    });
    // Largeur du plateau à l'écran : le HUD se cale contre lui en paysage (CSS).
    this.view.onLayout((layout) => {
      this.#gameLayer.style.setProperty('--board-width', `${layout.width}px`);
      this.#gameLayer.style.setProperty('--board-height', `${layout.height}px`);
    });
    this.view.onDraw((game) => {
      this.#hud.update(game.snapshot(), game.tuning.progression.unit);
    });

    // Échap revient à l'accueil depuis les menus.
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && ['scores', 'settings', 'help'].includes(this.#screen)) {
        event.preventDefault();
        this.#show('home');
      }
    });
    // L'application passe en arrière-plan (onglet, appel, autre appli) : pause automatique.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.#autoPause();
    });
    window.addEventListener('blur', () => {
      this.#autoPause();
    });

    this.#applySettings();
  }

  get screen(): ScreenId {
    return this.#screen;
  }

  start(): void {
    this.#show('home');
  }

  /** Nouvelle partie avec les réglages du joueur (et d'éventuelles surcharges, pour les tests). */
  startGame(overrides: Partial<GameOptions> = {}): void {
    this.#clearGameOverTimer();
    this.#detachGame?.();
    const game = new Game({
      ...gameOptionsFromSettings(this.#settings, randomSeed()),
      ...overrides,
    });
    const offLevel = game.events.on('levelUp', ({ level }) => {
      const text = this.#t.t('hud.levelUp', { level: displayLevel(level) });
      this.#announce(text);
      this.#flashToast(text);
    });
    const offOver = game.events.on('gameOver', (result) => {
      this.#lastResult = result;
      // Arrêt volontaire : écran de fin immédiat ; sinon, on laisse voir la dernière pièce.
      const delay = this.#screen === 'paused' ? 0 : GAME_OVER_DELAY_MS;
      this.#gameOverTimer = setTimeout(() => {
        this.#gameOverTimer = null;
        this.#show('gameOver');
      }, delay);
    });
    this.#detachGame = () => {
      offLevel();
      offOver();
    };
    this.view.setGame(game);
    this.#show('playing');
  }

  /** Le jeu est disponible hors ligne (service worker installé). */
  notifyOfflineReady(): void {
    this.#queueNotice({ text: () => this.#t.t('notice.offlineReady') });
  }

  /** Une nouvelle version est prête ; `update` l'installe et recharge la page. */
  notifyUpdate(update: () => void): void {
    this.#queueNotice({
      text: () => this.#t.t('notice.updateAvailable'),
      action: () => ({ label: this.#t.t('notice.reload'), onClick: update }),
    });
  }

  togglePause(): void {
    const game = this.view.game;
    if (!game) return;
    if (this.#screen === 'playing') {
      game.pause();
      this.#show('paused');
    } else if (this.#screen === 'paused') {
      game.resume();
      this.#show('playing');
    }
  }

  // ─── Interne ──────────────────────────────────────────────────────────────

  #tuning(): Tuning {
    return tuningForPreset(this.#settings.preset);
  }

  #language() {
    return this.#settings.language === 'auto'
      ? detectLanguage(navigator.languages)
      : this.#settings.language;
  }

  #whenPlaying(action: (game: Game) => void): void {
    const game = this.view.game;
    if (game && this.#screen === 'playing') action(game);
  }

  #autoPause(): void {
    if (this.#screen === 'playing' && this.view.game?.phase !== 'over') this.togglePause();
  }

  #clearGameOverTimer(): void {
    if (this.#gameOverTimer !== null) clearTimeout(this.#gameOverTimer);
    this.#gameOverTimer = null;
  }

  #buttonLabels() {
    const { t } = this.#t;
    return {
      left: t('controls.left'),
      right: t('controls.right'),
      rotate: t('controls.rotate'),
      down: t('controls.down'),
      pause: t('controls.pause'),
    };
  }

  /** Langue, symboles et boutons à l'écran selon les réglages. */
  #applySettings(): void {
    this.#t = createTranslator(this.#language());
    document.documentElement.lang = this.#t.language;
    this.#hud.setTranslator(this.#t);
    this.#buttons.setLabels(this.#buttonLabels());
    this.view.canvas.setAttribute('aria-label', this.#t.t('board.label'));
    this.view.setRendererOptions({ colorSymbols: this.#settings.colorSymbols });
    this.#controls.hidden = !this.#settings.touchButtons;
  }

  #queueNotice(notice: { text: () => string; action?: () => NoticeAction }): void {
    this.#pendingNotice = notice;
    this.#flushNotice();
  }

  #flushNotice(): void {
    const notice = this.#pendingNotice;
    if (!notice || this.#screen === 'playing') return;
    this.#pendingNotice = null;
    this.#shownNotice = notice;
    this.#notice.show(notice.text(), notice.action?.());
  }

  #announce(text: string): void {
    this.#announcer.textContent = text;
  }

  #flashToast(text: string): void {
    this.#toast.textContent = text;
    this.#toast.classList.remove('toast--show');
    // Relance l'animation CSS.
    this.#toast.getBoundingClientRect();
    this.#toast.classList.add('toast--show');
  }

  #show(screen: ScreenId): void {
    this.#screen = screen;
    const inGame = GAME_SCREENS.has(screen);
    const wasHidden = this.#gameLayer.hidden;
    this.#gameLayer.hidden = !inGame;
    if (inGame && wasHidden) this.view.refreshLayout();
    this.#root.dataset['screen'] = screen;
    this.#keyboard.enabled = screen === 'playing' || screen === 'paused';
    this.#gestures.enabled = screen === 'playing';
    // En partie, aucun bandeau ne gêne le jeu ; il réapparaîtra à l'écran suivant.
    if (screen === 'playing' && this.#notice.visible) {
      this.#notice.hide();
      // Une mise à jour en attente sera reproposée ; un simple message informatif, non.
      if (this.#shownNotice?.action) this.#pendingNotice ??= this.#shownNotice;
    }
    this.#flushNotice();

    const content = this.#build(screen);
    this.#screenLayer.replaceChildren(...(content ? [content] : []));
    if (content) focusFirst(content);
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (screen === 'gameOver' && this.#lastResult) {
      this.#announce(
        `${this.#t.t('gameOver.title')}. ${this.#t.t('gameOver.score', { score: this.#lastResult.score })}`,
      );
    }
  }

  #build(screen: ScreenId): HTMLElement | null {
    const t = this.#t;
    const home = (): void => {
      this.#show('home');
    };
    switch (screen) {
      case 'home':
        return homeScreen(t, {
          onPlay: () => {
            this.startGame();
          },
          onScores: () => {
            this.#highlight = null;
            this.#show('scores');
          },
          onSettings: () => {
            this.#show('settings');
          },
          onHelp: () => {
            this.#show('help');
          },
          storageWarning: !this.#store.persistent,
        });
      case 'playing':
        return null;
      case 'paused':
        return pauseScreen(
          t,
          () => {
            this.togglePause();
          },
          () => {
            this.view.game?.end();
          },
        );
      case 'gameOver': {
        const result = this.#lastResult;
        if (!result) return null;
        return gameOverScreen(t, {
          result,
          qualifies: this.#store.qualifies(result.score),
          lastName: this.#store.lastName,
          onSave: (name) => {
            this.#highlight = this.#store.addHighScore({
              name,
              score: result.score,
              level: result.level,
              context: {
                lines: this.#settings.lines,
                columns: this.#settings.columns,
                colors: this.#settings.colors,
                startLevel: this.#settings.startLevel,
                preset: this.#settings.preset,
                tuning: tuningFingerprint(this.view.game?.tuning ?? this.#tuning()),
              },
            });
            this.#show('scores');
          },
          onReplay: () => {
            this.startGame();
          },
          onHome: home,
        });
      }
      case 'scores':
        return scoresScreen(t, {
          scores: this.#store.highScores,
          highlight: this.#highlight,
          onBack: home,
          onReset: () => {
            if (window.confirm(t.t('scores.resetConfirm'))) {
              this.#store.clearHighScores();
              this.#show('scores');
            }
          },
        });
      case 'settings':
        return settingsScreen(t, {
          settings: this.#settings,
          onSave: (settings) => {
            this.#store.saveSettings(settings);
            this.#settings = this.#store.settings;
            this.#applySettings();
            home();
          },
          onCancel: home,
        });
      case 'help':
        return helpScreen(t, home);
    }
  }
}

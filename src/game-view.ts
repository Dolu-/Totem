/**
 * Vue d'une partie : canvas adapté à la place disponible, boucle d'animation,
 * rendu de chaque image. Ne connaît ni les menus ni les entrées.
 */
import type { Game } from './core/game.ts';
import { CanvasRenderer, type RendererOptions } from './render/canvas-renderer.ts';
import { computeLayout, type Layout } from './render/layout.ts';
import { GameLoop } from './render/loop.ts';
import { buildScene } from './render/scene.ts';
import { DEFAULT_STYLE, type RenderStyle } from './render/style.ts';

export class GameView {
  readonly canvas: HTMLCanvasElement;
  readonly #host: HTMLElement;
  readonly #renderer: CanvasRenderer;
  readonly #loop: GameLoop;
  readonly #resizeObserver: ResizeObserver;
  readonly #reducedMotion: MediaQueryList;
  #game: Game | null = null;
  /** Temps figé : la partie n'avance que par `advance()` (tests). */
  #manualTime = false;
  readonly #tickListeners = new Set<(dtMs: number, game: Game) => void>();
  readonly #drawListeners = new Set<(game: Game) => void>();
  readonly #layoutListeners = new Set<(layout: Layout) => void>();

  readonly #style: RenderStyle;

  /** @param style aspect du plateau (crans, arrondis, cadre), fixé pour la durée de la vue. */
  constructor(host: HTMLElement, options: RendererOptions, style: RenderStyle = DEFAULT_STYLE) {
    this.#host = host;
    this.#style = style;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board';
    this.canvas.setAttribute('role', 'img');
    host.append(this.canvas);
    this.#renderer = new CanvasRenderer(this.canvas, options, style);
    this.#reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.#loop = new GameLoop((dt) => {
      this.#frame(dt);
    });
    this.#resizeObserver = new ResizeObserver(() => {
      this.#resize();
    });
    this.#resizeObserver.observe(host);
    matchMedia(`(resolution: ${String(devicePixelRatio)}dppx)`).addEventListener('change', () => {
      this.#resize();
    });
  }

  get game(): Game | null {
    return this.#game;
  }

  setGame(game: Game): void {
    this.#game = game;
    this.#resize();
    this.#loop.start();
  }

  setRendererOptions(options: RendererOptions): void {
    this.#renderer.setOptions(options);
  }

  set manualTime(manual: boolean) {
    this.#manualTime = manual;
  }

  /** Côté d'une case à l'écran, en pixels CSS (seuils des gestes). */
  get cellSize(): number {
    return this.#renderer.layout?.cellSize ?? 32;
  }

  /** Fait avancer la partie de `ms` puis redessine (mode temps manuel). */
  advance(ms: number): void {
    this.#tick(ms);
    this.#draw();
  }

  /**
   * Abonnement à chaque pas de temps de jeu (réel, ou `advance` en temps manuel) :
   * c'est l'horloge des répétitions d'entrées.
   */
  onTick(listener: (dtMs: number, game: Game) => void): () => void {
    this.#tickListeners.add(listener);
    return () => this.#tickListeners.delete(listener);
  }

  /** Abonnement à chaque dessin du plateau (affichages qui suivent l'état : HUD…). */
  onDraw(listener: (game: Game) => void): () => void {
    this.#drawListeners.add(listener);
    return () => this.#drawListeners.delete(listener);
  }

  /** Abonnement aux changements de mise en page (taille du plateau à l'écran). */
  onLayout(listener: (layout: Layout) => void): () => void {
    this.#layoutListeners.add(listener);
    return () => this.#layoutListeners.delete(listener);
  }

  destroy(): void {
    this.#loop.stop();
    this.#resizeObserver.disconnect();
    this.canvas.remove();
  }

  /**
   * Recalcule la mise en page. Nécessaire quand la zone redevient visible :
   * tous les navigateurs ne signalent pas ce changement au ResizeObserver (WebKit).
   */
  refreshLayout(): void {
    this.#resize();
  }

  #resize(): void {
    const game = this.#game;
    if (!game) return;
    const style = getComputedStyle(this.#host);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    this.#renderer.resize(
      computeLayout({
        availableWidth: Math.max(0, this.#host.clientWidth - padX),
        availableHeight: Math.max(0, this.#host.clientHeight - padY),
        columns: game.options.width,
        rows: game.options.height,
        devicePixelRatio: window.devicePixelRatio || 1,
        frameCells: this.#style.frameCells,
      }),
    );
    const layout = this.#renderer.layout;
    if (layout) for (const listener of this.#layoutListeners) listener(layout);
    this.#draw();
  }

  #frame(dt: number): void {
    if (!this.#manualTime) this.#tick(dt);
    this.#draw();
  }

  #tick(dt: number): void {
    const game = this.#game;
    if (!game) return;
    // Les entrées d'abord (répétitions), puis le temps de jeu.
    for (const listener of this.#tickListeners) listener(dt, game);
    game.update(dt);
  }

  #draw(): void {
    const game = this.#game;
    const layout = this.#renderer.layout;
    if (!game || !layout) return;
    this.#renderer.render(
      buildScene(game.snapshot(), layout, {
        reducedMotion: this.#reducedMotion.matches,
        style: this.#style,
      }),
    );
    for (const listener of this.#drawListeners) listener(game);
  }
}

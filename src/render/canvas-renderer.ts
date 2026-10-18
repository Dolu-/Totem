/**
 * Peint une `Scene` sur un canvas haute densité. Les blocs sont pré-dessinés
 * une fois par couleur et par taille (cache), puis recopiés à chaque image.
 */
import type { CellValue } from '../core/types.ts';
import type { Layout } from './layout.ts';
import { BOARD_COLORS, blockStyle, type SymbolShape } from './palette.ts';
import type { Scene } from './scene.ts';
import { DEFAULT_STYLE, type RenderStyle } from './style.ts';

export interface RendererOptions {
  readonly colorSymbols: boolean;
}

export class CanvasRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  #layout: Layout | null = null;
  #options: RendererOptions;
  readonly #sprites = new Map<CellValue, HTMLCanvasElement>();

  readonly #style: RenderStyle;

  constructor(
    canvas: HTMLCanvasElement,
    options: RendererOptions,
    style: RenderStyle = DEFAULT_STYLE,
  ) {
    this.#style = style;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.#canvas = canvas;
    this.#ctx = ctx;
    this.#options = options;
  }

  get layout(): Layout | null {
    return this.#layout;
  }

  setOptions(options: RendererOptions): void {
    this.#options = options;
    this.#sprites.clear();
  }

  /** Applique une nouvelle mise en page (taille de l'écran, dimensions du plateau). */
  resize(layout: Layout): void {
    this.#layout = layout;
    this.#canvas.width = layout.pixelWidth;
    this.#canvas.height = layout.pixelHeight;
    this.#canvas.style.width = `${layout.width}px`;
    this.#canvas.style.height = `${layout.height}px`;
    this.#sprites.clear();
  }

  render(scene: Scene): void {
    const layout = this.#layout;
    if (!layout) return;
    const ctx = this.#ctx;
    const { devicePixelRatio: dpr, cellSize, frame, columns, rows } = layout;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);

    // Cadre, puis fond de l'aire de jeu : colonnes alternées foncé / très foncé.
    ctx.fillStyle = BOARD_COLORS.frame;
    roundRect(ctx, 0, 0, layout.width, layout.height, cellSize * this.#style.frameRadiusCells);
    ctx.fill();
    for (let x = 0; x < columns; x += 1) {
      ctx.fillStyle = x % 2 === 0 ? BOARD_COLORS.columnDark : BOARD_COLORS.columnDarker;
      ctx.fillRect(frame + x * cellSize, frame, cellSize, rows * cellSize);
    }

    // Contenu limité à la grille : la pièce qui apparaît au-dessus reste cachée.
    ctx.save();
    ctx.beginPath();
    ctx.rect(frame, frame, columns * cellSize, rows * cellSize);
    ctx.clip();
    ctx.translate(frame, frame);
    const radius = cellSize * this.#style.cornerRadius;
    const inset = cellSize * this.#style.blockInset;
    for (const cell of scene.cells) {
      ctx.globalAlpha = cell.alpha;
      if (cell.alpha > 0)
        ctx.drawImage(this.#sprite(cell.value), cell.x, cell.y, cellSize, cellSize);
      if (cell.outline > 0) {
        // Contour clair qui reste visible pendant que le contenu s'efface (rendu d'origine).
        const line = Math.max(1, cellSize * 0.035);
        ctx.globalAlpha = cell.outline;
        ctx.strokeStyle = blockStyle(cell.value).light;
        ctx.lineWidth = line;
        roundRect(
          ctx,
          cell.x + inset + line / 2,
          cell.y + inset + line / 2,
          cellSize - 2 * inset - line,
          cellSize - 2 * inset - line,
          radius,
        );
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    if (scene.chain) {
      // « ×N » dans la couleur de la chaîne, contour blanc (comme à l'origine), ombre pour la lisibilité.
      const { text, x, y, size, alpha, accent } = scene.chain;
      const maxWidth = columns * cellSize * 0.92;
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = size * 0.25;
      ctx.lineWidth = Math.max(2, size * 0.1);
      ctx.strokeStyle = BOARD_COLORS.chainText;
      ctx.strokeText(text, x, y, maxWidth);
      ctx.shadowBlur = 0;
      ctx.fillStyle = blockStyle(accent).base;
      ctx.fillText(text, x, y, maxWidth);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** Bloc pré-dessiné, à la résolution physique de l'écran. */
  #sprite(value: CellValue): HTMLCanvasElement {
    const cached = this.#sprites.get(value);
    if (cached) return cached;
    const layout = this.#layout;
    const px = Math.max(1, Math.round((layout?.cellSize ?? 32) * (layout?.devicePixelRatio ?? 1)));
    const sprite = document.createElement('canvas');
    sprite.width = px;
    sprite.height = px;
    const ctx = sprite.getContext('2d');
    if (ctx) drawBlock(ctx, px, value, this.#options.colorSymbols, this.#style);
    this.#sprites.set(value, sprite);
    return sprite;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/**
 * Dessine un bloc « gemme » : dégradé, reflet, liseré sombre (qui sépare des carrés
 * jointifs), symbole optionnel. Marge et arrondi : `RenderStyle`.
 */
function drawBlock(
  ctx: CanvasRenderingContext2D,
  px: number,
  value: CellValue,
  symbols: boolean,
  renderStyle: RenderStyle,
): void {
  const style = blockStyle(value);
  // Le liseré est tracé entièrement à l'intérieur de la case (rien n'est rogné par le bord).
  // Liseré fin : deux carrés voisins forment un trait double, à peine visible.
  const lineWidth = Math.max(1, px * 0.022);
  const inset = px * renderStyle.blockInset + lineWidth / 2;
  const size = px - 2 * inset;
  const radius = px * renderStyle.cornerRadius;

  const gradient = ctx.createLinearGradient(inset, inset, inset + size, inset + size);
  gradient.addColorStop(0, style.light);
  gradient.addColorStop(0.45, style.base);
  gradient.addColorStop(1, style.dark);
  ctx.fillStyle = gradient;
  roundRect(ctx, inset, inset, size, size, radius);
  ctx.fill();

  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  roundRect(ctx, inset, inset, size, size, radius);
  ctx.stroke();

  // Reflet en haut du bloc.
  const shine = ctx.createLinearGradient(0, inset, 0, inset + size * 0.5);
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = shine;
  roundRect(ctx, inset + size * 0.1, inset + size * 0.06, size * 0.8, size * 0.42, radius * 0.8);
  ctx.fill();

  if (symbols) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = px * 0.08;
    drawSymbol(ctx, style.symbol, px / 2, px / 2, px * 0.2);
  }
}

function polygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  sides: number,
  rotation: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = rotation + (i * 2 * Math.PI) / sides;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

function drawSymbol(
  ctx: CanvasRenderingContext2D,
  shape: SymbolShape,
  cx: number,
  cy: number,
  r: number,
): void {
  switch (shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.fill();
      break;
    case 'ring':
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.85, 0, 2 * Math.PI);
      ctx.stroke();
      break;
    case 'triangle':
      polygon(ctx, cx, cy + r * 0.15, r * 1.15, 3, -Math.PI / 2);
      ctx.fill();
      break;
    case 'square':
      ctx.fillRect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
      break;
    case 'diamond':
      polygon(ctx, cx, cy, r * 1.15, 4, 0);
      ctx.fill();
      break;
    case 'hexagon':
      polygon(ctx, cx, cy, r, 6, 0);
      ctx.fill();
      break;
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const radius = i % 2 === 0 ? r * 1.15 : r * 0.5;
        ctx.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'plus':
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      break;
    case 'cross':
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.8, cy - r * 0.8);
      ctx.lineTo(cx + r * 0.8, cy + r * 0.8);
      ctx.moveTo(cx + r * 0.8, cy - r * 0.8);
      ctx.lineTo(cx - r * 0.8, cy + r * 0.8);
      ctx.stroke();
      break;
  }
}

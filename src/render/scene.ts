/**
 * Description de ce qu'il faut dessiner pour un instantané de partie :
 * positions (animations interpolées), transparence, effets. Pur et testable ;
 * le canvas ne fait qu'exécuter cette description.
 */
import type { GameSnapshot } from '../core/game.ts';
import { EMPTY, type CellValue } from '../core/types.ts';
import type { Layout } from './layout.ts';
import { DEFAULT_STYLE, quantize, type RenderStyle } from './style.ts';

export interface SceneCell {
  /** Coin haut-gauche, en pixels CSS, relatif à l'origine de la grille (intérieur du cadre). */
  readonly x: number;
  readonly y: number;
  readonly value: CellValue;
  /** Opacité du carré (son contenu). */
  readonly alpha: number;
  /**
   * Opacité du contour clair dessiné par-dessus, de 0 à 1 : pendant la disparition,
   * le contenu s'efface mais le contour reste visible (rendu d'origine).
   */
  readonly outline: number;
}

export interface SceneText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  /** Taille de police en pixels CSS. */
  readonly size: number;
  readonly alpha: number;
  /** Couleur du texte (index de couleur), contour blanc (rendu d'origine). */
  readonly accent: CellValue;
}

export interface Scene {
  readonly cells: readonly SceneCell[];
  readonly chain: SceneText | null;
}

export interface SceneOptions {
  readonly reducedMotion: boolean;
  /** Style visuel (crans de mouvement…) ; `DEFAULT_STYLE` par défaut. */
  readonly style?: RenderStyle;
}

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInQuad = (t: number): number => t * t;

export function buildScene(snap: GameSnapshot, layout: Layout, options: SceneOptions): Scene {
  const size = layout.cellSize;
  const style = options.style ?? DEFAULT_STYLE;
  const cells: SceneCell[] = [];
  const plain = (x: number, y: number, value: CellValue): SceneCell => ({
    x: x * size,
    y: y * size,
    value,
    alpha: 1,
    outline: 0,
  });

  // Cases qui tombent après un effacement : de fromY vers toY, à vitesse constante et par crans
  // (rendu d'origine) ; sans crans, mouvement continu adouci.
  const falling = new Map<string, number>();
  if (snap.collapsing) {
    const p = options.reducedMotion ? 1 : snap.collapsing.progress;
    for (const m of snap.collapsing.moves) {
      const distance = m.toY - m.fromY;
      const offset =
        style.collapseStepsPerCell > 0
          ? Math.min(distance, quantize(distance * p, style.collapseStepsPerCell))
          : distance * easeOutCubic(p);
      falling.set(`${m.x},${m.fromY}`, m.fromY + offset);
    }
  }
  const clearing = new Set(snap.clearing?.cells.map((c) => `${c.x},${c.y}`) ?? []);
  const clearProgress = snap.clearing?.progress ?? 0;

  const { grid } = snap;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const value = grid.get(x, y);
      if (value === EMPTY) continue;
      const key = `${x},${y}`;
      if (clearing.has(key)) {
        // Le contenu devient transparent par paliers ; le contour reste jusqu'au retrait.
        const fade = quantize(clearProgress, style.clearFadeSteps);
        cells.push({ ...plain(x, y, value), alpha: 1 - fade, outline: 1 });
      } else {
        cells.push(plain(x, falling.get(key) ?? y, value));
      }
    }
  }

  const { piece, slide } = snap;
  if (piece) {
    // Chute affichée par crans (une demi-case dans l'original) ; la position logique reste continue.
    const y = quantize(piece.y, style.fallStepsPerCell);
    const count = piece.colors.length;
    // Chaque carré glisse pendant `window` ; le suivant part `slideStagger` plus tard.
    const window = Math.max(0.01, 1 - (count - 1) * style.slideStagger);
    piece.colors.forEach((value, i) => {
      let px = piece.x;
      if (slide && !options.reducedMotion) {
        // Le carré du bas part le premier, puis celui du milieu, puis celui du haut.
        const local = clamp01((slide.progress - i * style.slideStagger) / window);
        const t =
          style.slideStepsPerCell > 0
            ? quantize(local, style.slideStepsPerCell)
            : easeOutCubic(local);
        px = slide.fromX + (piece.x - slide.fromX) * t;
      }
      cells.push(plain(px, y - i, value));
    });
  }

  // Coefficient de chaîne « ×N » : apparaît grand et rétrécit pendant la disparition
  // (comme à l'origine), puis reste affiché en s'estompant pendant la chute qui suit.
  let chain: SceneText | null = null;
  const text = (zoom: number, alpha: number): SceneText => ({
    text: `×${snap.chain}`,
    x: (grid.width * size) / 2,
    y: (grid.height * size) / 2,
    size: size * zoom,
    alpha,
    accent: snap.chain - 2,
  });
  if (snap.chain >= 2 && snap.clearing) {
    const shrink = options.reducedMotion ? 1 : easeOutCubic(snap.clearing.progress);
    chain = text(style.chainZoomFrom + (style.chainZoomTo - style.chainZoomFrom) * shrink, 1);
  } else if (snap.chain >= 2 && snap.collapsing) {
    chain = text(style.chainZoomTo, 1 - easeInQuad(snap.collapsing.progress));
  }

  return { cells, chain };
}

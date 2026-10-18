import { expect, test } from '@playwright/test';
import {
  advance,
  advanceUntil,
  boardRows,
  collectErrors,
  openGame,
  setGrid,
  setPiece,
} from './helpers.ts';

/** Plateau de démonstration (6×15) : les 6 couleurs, sans alignement. */
const SCENIC = boardRows(6, 15, ['4.....', '15.2..', '230415', '012345']);

test.describe('rendu du plateau', () => {
  test('remplit sa zone au mieux, net à toute densité de pixels', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    const metrics = await page.locator('canvas.board').evaluate((canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      const host = canvas.parentElement;
      if (!host) throw new Error('Plateau hors du document');
      const style = getComputedStyle(host);
      return {
        cssWidth: rect.width,
        cssHeight: rect.height,
        pixelWidth: canvas.width,
        pixelHeight: canvas.height,
        dpr: window.devicePixelRatio,
        availableWidth:
          host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        availableHeight:
          host.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
      };
    });
    // Le canvas a autant de pixels que l'écran physique en affiche : pas de flou.
    expect(metrics.pixelWidth).toBe(Math.round(metrics.cssWidth * metrics.dpr));
    expect(metrics.pixelHeight).toBe(Math.round(metrics.cssHeight * metrics.dpr));
    // Il tient dans sa zone et l'occupe presque entièrement dans au moins une direction.
    expect(metrics.cssWidth).toBeLessThanOrEqual(metrics.availableWidth + 0.5);
    expect(metrics.cssHeight).toBeLessThanOrEqual(metrics.availableHeight + 0.5);
    expect(
      Math.max(
        metrics.cssWidth / metrics.availableWidth,
        metrics.cssHeight / metrics.availableHeight,
      ),
    ).toBeGreaterThan(0.93);
    expect(errors).toEqual([]);
  });

  test('le style se règle par l’adresse (?style=…) pour essayer un autre aspect', async ({
    page,
  }) => {
    const ratio = async (query: string): Promise<number> => {
      await openGame(page, { seed: 1 }, query);
      const box = await page.locator('canvas.board').boundingBox();
      return (box?.height ?? 0) / (box?.width ?? 1);
    };
    // Plateau 6×15 : hauteur / largeur = (15 + 2f) / (6 + 2f), f = épaisseur du cadre en cases.
    expect(await ratio('')).toBeCloseTo(15.2 / 6.2, 1);
    expect(await ratio('?style=frameCells:1')).toBeCloseTo(17 / 8, 1);
  });

  test('s’adapte quand la fenêtre change de taille', async ({ page }) => {
    await openGame(page);
    const board = page.locator('canvas.board');
    const before = await board.boundingBox();
    const viewport = page.viewportSize() ?? { width: 800, height: 600 };
    await page.setViewportSize({ width: viewport.width, height: Math.round(viewport.height / 2) });
    await expect
      .poll(async () => (await board.boundingBox())?.height ?? 0)
      .toBeLessThan((before?.height ?? 0) * 0.7);
  });

  test('plateau et pièce en chute', async ({ page }) => {
    await openGame(page);
    await setGrid(page, SCENIC);
    await setPiece(page, [0, 1, 2], 2, 6.5);
    await expect(page.locator('canvas.board')).toHaveScreenshot('board-falling.png');
  });

  test('disparition : contenu à moitié transparent, contour conservé', async ({ page }) => {
    await openGame(page);
    await setGrid(page, boardRows(6, 15, ['00....']));
    await setPiece(page, [0, 3, 4], 2, 14);
    await advanceUntil(page, (s) => s.phase === 'clearing', 10);
    await advance(page, 330); // mi-parcours de la disparition (650 ms)
    await expect(page.locator('canvas.board')).toHaveScreenshot('board-clearing.png');
  });

  test('réaction en chaîne : « ×2 » affiché', async ({ page }) => {
    await openGame(page);
    await setGrid(page, boardRows(6, 15, ['.22...', '211...']));
    await setPiece(page, [1, 3, 4], 3, 14);
    await advanceUntil(page, (s) => s.phase === 'clearing' && s.chain === 2, 10);
    await advance(page, 140);
    await expect(page.locator('canvas.board')).toHaveScreenshot('board-chain.png');
  });

  test('symboles pour daltoniens : une forme par couleur', async ({ page }) => {
    await openGame(page, { seed: 1, colorCount: 9 });
    await page.evaluate(() => window.__totem?.setColorSymbols(true));
    await setGrid(page, boardRows(6, 15, ['678...', '012345']));
    await setPiece(page, [6, 7, 8], 4, 9);
    await expect(page.locator('canvas.board')).toHaveScreenshot('board-symbols.png');
  });
});

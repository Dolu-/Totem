import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_TUNING } from '../src/config/tuning.ts';
import { DEFAULT_STYLE } from '../src/render/style.ts';
import {
  advance,
  advanceUntil,
  boardRows,
  collectErrors,
  openGame,
  setGrid,
  setPiece,
  snapshot,
} from './helpers.ts';

const EMPTY = boardRows(6, 15, []);

/** Place une pièce [0, 1, 2] en colonne 2, ligne 3, sur un plateau vide, temps figé. */
async function ready(page: Page, query = ''): Promise<void> {
  await openGame(page, { seed: 1 }, query);
  await setGrid(page, EMPTY);
  await setPiece(page, [0, 1, 2], 2, 3);
}

/** Centre et taille de case du plateau, en pixels CSS de la page. */
async function boardGeometry(page: Page): Promise<{ x: number; y: number; cell: number }> {
  const box = await page.locator('canvas.board').boundingBox();
  if (!box) throw new Error('Plateau introuvable');
  const cell = box.width / (6 + 2 * DEFAULT_STYLE.frameCells);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, cell };
}

/**
 * Glissement tactile : séquence d'événements Pointer de type « touch » sur la
 * zone de jeu, comme les produit un navigateur mobile.
 */
async function touchSwipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  durationMs: number,
): Promise<void> {
  await page.evaluate(
    async ({ from, to, durationMs }) => {
      const target = document.querySelector('.board-host');
      if (!target) throw new Error('Zone de jeu introuvable');
      const fire = (type: string, x: number, y: number): void => {
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      };
      const steps = 8;
      fire('pointerdown', from.x, from.y);
      for (let i = 1; i <= steps; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, durationMs / steps));
        fire(
          'pointermove',
          from.x + ((to.x - from.x) * i) / steps,
          from.y + ((to.y - from.y) * i) / steps,
        );
      }
      fire('pointerup', to.x, to.y);
    },
    { from, to, durationMs },
  );
}

test.describe('clavier et souris (PC)', () => {
  test.skip(({ isMobile }) => isMobile, 'Profils PC uniquement');

  test('← → avec répétition, ↑ permute, ↓ maintenu accélère, P met en pause', async ({ page }) => {
    const errors = collectErrors(page);
    await ready(page);
    await page.keyboard.press('ArrowLeft');
    expect((await snapshot(page)).piece?.x).toBe(1);

    // Maintenu : premier pas immédiat (1 → 2), puis répétition pilotée par le temps de jeu.
    const { repeatDelayMs, repeatIntervalMs } = DEFAULT_TUNING.timing;
    await page.keyboard.down('ArrowRight');
    await advance(page, repeatDelayMs - 10);
    expect((await snapshot(page)).piece?.x).toBe(2); // pas encore de répétition
    await advance(page, 10 + repeatIntervalMs * 2);
    await page.keyboard.up('ArrowRight');
    expect((await snapshot(page)).piece?.x).toBe(5);

    await page.keyboard.press('ArrowUp');
    expect((await snapshot(page)).piece?.colors).toEqual([2, 0, 1]);

    const y0 = (await snapshot(page)).piece?.y ?? 0;
    await page.keyboard.down('ArrowDown');
    await advance(page, 500); // temporisation (250 ms) puis descente rapide
    await page.keyboard.up('ArrowDown');
    expect((await snapshot(page)).piece?.y ?? 0).toBeGreaterThan(y0 + 2.5);

    await page.keyboard.press('KeyP');
    expect((await snapshot(page)).paused).toBe(true);
    await page.keyboard.press('Escape');
    expect((await snapshot(page)).paused).toBe(false);
    expect(errors).toEqual([]);
  });

  test('Espace maintenue : les pièces suivantes tombent aussi en accéléré', async ({ page }) => {
    await ready(page);
    await page.keyboard.down('Space');
    // Sans descente rapide, une seule pièce mettrait ~15 s à traverser le plateau.
    await advanceUntil(page, (s) => s.piecesPlaced >= 3, 20, 6000);
    await page.keyboard.up('Space');
    const placed = (await snapshot(page)).piecesPlaced;
    await advance(page, 2000);
    // Touche relâchée : retour à la vitesse normale (aucune pièce de plus en 2 s).
    expect((await snapshot(page)).piecesPlaced).toBe(placed);
  });

  test('souris : cliquer-glisser déplace, clic simple permute', async ({ page }) => {
    await ready(page);
    const { x, y, cell } = await boardGeometry(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 2 * cell, y, { steps: 10 });
    await page.mouse.up();
    expect((await snapshot(page)).piece?.x).toBe(0);

    await page.mouse.click(x, y);
    expect((await snapshot(page)).piece?.colors).toEqual([2, 0, 1]);
  });
});

test.describe('écran tactile (mobile)', () => {
  test.skip(({ isMobile }) => !isMobile, 'Profils mobiles uniquement');

  test('toucher : permute', async ({ page }) => {
    await ready(page);
    const { x, y } = await boardGeometry(page);
    await page.touchscreen.tap(x, y);
    expect((await snapshot(page)).piece?.colors).toEqual([2, 0, 1]);
  });

  test('glisser à gauche puis à droite : plusieurs colonnes', async ({ page }) => {
    await ready(page);
    const { x, y, cell } = await boardGeometry(page);
    await touchSwipe(page, { x, y }, { x: x - 2 * cell, y }, 200);
    expect((await snapshot(page)).piece?.x).toBe(0);
    await touchSwipe(page, { x: x - 2 * cell, y }, { x: x + 2.3 * cell, y: y + 10 }, 300);
    expect((await snapshot(page)).piece?.x).toBe(5);
  });

  test('glisser vers le haut : une seule permutation', async ({ page }) => {
    await ready(page);
    const { x, y, cell } = await boardGeometry(page);
    await touchSwipe(page, { x, y }, { x, y: y - 3 * cell }, 200);
    expect((await snapshot(page)).piece?.colors).toEqual([2, 0, 1]);
  });

  test('geste vif vers le bas, par défaut : la pièce suit le doigt', async ({ page }) => {
    await ready(page);
    const { x, y, cell } = await boardGeometry(page);
    await touchSwipe(page, { x, y }, { x, y: y + 3 * cell }, 120);
    await advance(page, 300); // vitesse normale : la pièce a seulement suivi le doigt (4 cases)
    const snap = await snapshot(page);
    expect(snap.piecesPlaced).toBe(0);
    expect(snap.piece?.y).toBeGreaterThanOrEqual(7);
    expect(snap.piece?.y).toBeLessThan(8);
  });

  test('geste vif vers le bas, réglage activé : la pièce descend jusqu’à se poser', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'totem:v1',
        JSON.stringify({ version: 1, settings: { flickToLock: true }, legacyImported: true }),
      );
    });
    await ready(page);
    const { x, y, cell } = await boardGeometry(page);
    await touchSwipe(page, { x, y }, { x, y: y + 3 * cell }, 120);
    await advance(page, 1000); // 15 cases/s : la pièce atteint le fond et se pose
    const snap = await snapshot(page);
    expect(snap.piecesPlaced).toBe(1);
    expect(snap.rows.slice(-3)).toEqual(['..2...', '..1...', '..0...']);
  });

  test('doigt maintenu après un glissement vers le bas : la pièce ne s’emballe pas', async ({
    page,
  }) => {
    await ready(page);
    const { x, y, cell } = await boardGeometry(page);
    // Glissement vers le bas sans relâcher le doigt.
    await page.evaluate(
      ({ x, y, cell }) => {
        const target = document.querySelector('.board-host');
        const fire = (type: string, cy: number): void => {
          target?.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 9,
              pointerType: 'touch',
              isPrimary: true,
              clientX: x,
              clientY: cy,
              bubbles: true,
              cancelable: true,
            }),
          );
        };
        fire('pointerdown', y);
        fire('pointermove', y + 2 * cell);
      },
      { x, y, cell },
    );
    await advance(page, 500); // pas d'accélération : seulement les 3 cases suivies + chute normale
    const snap = await snapshot(page);
    expect(snap.piecesPlaced).toBe(0);
    expect(snap.piece?.y).toBeGreaterThanOrEqual(6);
    expect(snap.piece?.y).toBeLessThan(7.5);
  });

  test('boutons à l’écran : ← et ⟳', async ({ page }) => {
    // Option activée dans les réglages enregistrés.
    await page.addInitScript(() => {
      localStorage.setItem(
        'totem:v1',
        JSON.stringify({ version: 1, settings: { touchButtons: true }, legacyImported: true }),
      );
    });
    await ready(page);
    await page.locator('[data-action="left"]').tap();
    await page.locator('[data-action="rotate"]').tap();
    const snap = await snapshot(page);
    expect(snap.piece?.x).toBe(1);
    expect(snap.piece?.colors).toEqual([2, 0, 1]);
  });

  test('la page ne défile ni ne zoome pendant les gestes', async ({ page }) => {
    await ready(page);
    const { x, y, cell } = await boardGeometry(page);
    await touchSwipe(page, { x, y }, { x, y: y - 4 * cell }, 200);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
    expect(
      await page.locator('.board-host').evaluate((el) => getComputedStyle(el).touchAction),
    ).toBe('none');
  });
});

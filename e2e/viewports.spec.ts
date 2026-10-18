/**
 * Revue des formats d'écran (émulés dans Chromium) : PC de plusieurs tailles,
 * petit téléphone, téléphone en paysage, tablette. Vérifie la mise en page de
 * l'accueil, du jeu et des réglages ; les captures sont jointes au rapport.
 */
import { devices, expect, test, type Page } from '@playwright/test';
import { boardRows, openGame, setGrid, setPiece } from './helpers.ts';

/** Profils d'appareil sans `defaultBrowserType` (non modifiable dans un groupe). */
function device(name: string) {
  const descriptor = devices[name];
  if (!descriptor) throw new Error(`Appareil inconnu : ${name}`);
  const { defaultBrowserType, ...rest } = descriptor;
  return rest;
}

const FORMATS = [
  { name: 'PC 1920×1080', use: { viewport: { width: 1920, height: 1080 } } },
  { name: 'PC 1280×800', use: { viewport: { width: 1280, height: 800 } } },
  { name: 'PC 1024×768', use: { viewport: { width: 1024, height: 768 } } },
  { name: 'iPhone SE', use: device('iPhone SE') },
  { name: 'téléphone paysage', use: device('Pixel 7 landscape') },
  { name: 'iPad mini', use: device('iPad Mini') },
  { name: 'iPad mini paysage', use: device('iPad Mini landscape') },
] as const;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function checkCommon(page: Page): Promise<void> {
  const report = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
    const small = [...document.querySelectorAll('button, select, input')]
      .filter(visible)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        // Cases à cocher : leur étiquette (cliquable) agrandit la zone de toucher.
        return (el as HTMLInputElement).type !== 'checkbox' && r.height < 43.5;
      })
      .map((el) => el.outerHTML.slice(0, 60));
    // Tout bouton visible doit être entièrement à l'écran, sans défilement
    // (les conteneurs masquent ce qui dépasse : la page seule ne suffit pas à le voir).
    const outside = [...document.querySelectorAll('button')]
      .filter(visible)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < -0.5 || r.top < -0.5 || r.right > width + 0.5 || r.bottom > height + 0.5;
      })
      .map((el) => el.getAttribute('aria-label') ?? el.textContent);
    return {
      outside,
      overflowX: document.documentElement.scrollWidth > width,
      overflowY: document.documentElement.scrollHeight > height,
      small,
    };
  });
  expect(report.outside, 'boutons hors de l’écran').toEqual([]);
  expect(report.overflowX, 'débordement horizontal').toBe(false);
  expect(report.overflowY, 'débordement vertical').toBe(false);
  expect(report.small, 'cibles tactiles trop petites').toEqual([]);
}

for (const format of FORMATS) {
  test.describe(format.name, () => {
    test.use(format.use);
    // Formats émulés une seule fois, dans le projet Chromium PC.
    test.skip(
      () => test.info().project.name !== 'desktop-chromium',
      'Émulation des formats : projet desktop-chromium',
    );

    test('accueil, jeu et réglages bien disposés', async ({ page }, testInfo) => {
      const shot = (step: string) =>
        page.screenshot({ path: testInfo.outputPath(`${format.name}-${step}.png`) });

      await page.goto('./');
      await checkCommon(page);
      await shot('1-accueil');

      await openGame(page);
      await setGrid(page, boardRows(6, 15, ['4.....', '15.2..', '230415', '012345']));
      await setPiece(page, [0, 1, 2], 2, 6.5);
      await checkCommon(page);
      const board = await page.locator('canvas.board').boundingBox();
      const hud = await page.locator('.hud').boundingBox();
      expect(board).not.toBeNull();
      expect(hud).not.toBeNull();
      if (board && hud) {
        expect(overlaps(board, hud), 'le HUD chevauche le plateau').toBe(false);
        // Le plateau occupe l'essentiel de la hauteur disponible.
        const viewport = page.viewportSize() ?? { width: 0, height: 0 };
        expect(board.height + hud.height).toBeGreaterThan(viewport.height * 0.6);
      }
      // Niveau, pause et score ne se chevauchent pas entre eux.
      const parts = await Promise.all(
        ['.hud__stat--level', '.hud__pause', '.hud__stat--score'].map((selector) =>
          page.locator(selector).boundingBox(),
        ),
      );
      const [levelBox, pauseBox, scoreBox] = parts;
      if (levelBox && pauseBox && scoreBox) {
        expect(overlaps(levelBox, pauseBox), 'niveau sous la pause').toBe(false);
        expect(overlaps(pauseBox, scoreBox), 'score sous la pause').toBe(false);
      }
      // Le bouton pause est réellement cliquable (rien ne le recouvre).
      await page.locator('.hud__pause').click({ trial: true, timeout: 2000 });
      await shot('2-jeu');

      await page.goto('./');
      await page.getByRole('button', { name: 'Réglages' }).click();
      // Les réglages peuvent défiler sur un petit écran : on vérifie seulement la largeur.
      const overflowX = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflowX).toBe(false);
      await shot('3-reglages');
    });
  });
}

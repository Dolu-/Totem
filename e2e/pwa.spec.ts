import { expect, test } from '@playwright/test';
import { openGame } from './helpers.ts';

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}

test.describe('application installable (PWA)', () => {
  test('manifeste complet et icônes servies', async ({ page, request }) => {
    await page.goto('./');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifestUrl = new URL(href ?? '', page.url()).toString();
    const manifest = (await (await request.get(manifestUrl)).json()) as Manifest;
    expect(manifest).toMatchObject({
      name: 'Totem',
      short_name: 'Totem',
      display: 'standalone',
      theme_color: '#0b1020',
    });
    const sizes = manifest.icons.map((i) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ''}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512:maskable']));
    for (const icon of manifest.icons) {
      const response = await request.get(new URL(icon.src, manifestUrl).toString());
      expect(response.ok(), icon.src).toBe(true);
      expect(response.headers()['content-type']).toContain(icon.type.split('+')[0]);
    }
    for (const link of ['link[rel="icon"]', 'link[rel="apple-touch-icon"]']) {
      const iconHref = await page.locator(link).getAttribute('href');
      expect((await request.get(new URL(iconHref ?? '', page.url()).toString())).ok()).toBe(true);
    }
  });

  test('une mise à jour n’interrompt jamais une partie : proposée hors du jeu', async ({
    page,
  }) => {
    await openGame(page);
    await page.evaluate(() => window.__totem?.simulateUpdate());
    const bar = page.locator('.notice-bar');
    await expect(bar).toBeHidden();
    await page.locator('.hud__pause').click();
    await expect(bar).toContainText('Une nouvelle version est disponible.');
    // Retour en jeu : le bandeau s'efface, puis revient à la pause suivante.
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await expect(bar).toBeHidden();
    await page.locator('.hud__pause').click();
    await bar.getByRole('button', { name: 'Mettre à jour' }).click();
    expect(await page.evaluate(() => window.__totem?.updateRequested())).toBe(true);
  });
});

test.describe('hors ligne', () => {
  test.use({ serviceWorkers: 'allow' });
  // Service workers pilotés de façon fiable par Playwright dans Chromium uniquement.
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium uniquement');

  test('après une première visite, le jeu se lance et se joue sans réseau', async ({
    page,
    context,
  }) => {
    await page.goto('./');
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active !== null && navigator.serviceWorker.controller !== null;
    });
    await expect(page.locator('.notice-bar')).toContainText('Le jeu est disponible hors ligne.');

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Jouer' })).toBeVisible();
    await page.getByRole('button', { name: 'Jouer' }).click();
    await expect(page.locator('canvas.board')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__totem?.snapshot()?.piece?.y ?? -1))
      .toBeGreaterThan(0);
    // Les icônes aussi viennent du cache.
    const iconOk = await page.evaluate(async () => (await fetch('./icon-192.png')).ok);
    expect(iconOk).toBe(true);
  });
});

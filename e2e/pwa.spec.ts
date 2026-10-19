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

  test('une mise à jour n’interrompt jamais une partie : proposée à l’accueil, nouveautés à l’appui', async ({
    page,
  }) => {
    await openGame(page);
    await page.evaluate(() =>
      window.__totem?.simulateUpdate({
        version: '99.0.0',
        changelog: [
          {
            version: '99.0.0',
            date: '2099-01-02',
            changes: [{ kind: 'fix', fr: 'Correction future', en: 'Future fix' }],
          },
          {
            version: '98.0.0',
            date: '2099-01-01',
            changes: [{ kind: 'feature', fr: 'Nouveauté future', en: 'Future feature' }],
          },
          {
            version: '1.0.0',
            date: '2026-10-18',
            changes: [{ kind: 'feature', fr: 'Déjà installée', en: 'Already installed' }],
          },
        ],
      }),
    );
    // Rien en pleine partie, ni à la pause.
    await expect(page.locator('.notice-bar')).toBeHidden();
    await page.locator('.hud__pause').click();
    await expect(page.locator('.notice-bar')).toBeHidden();
    await page.getByRole('button', { name: 'Arrêter la partie' }).click();
    await page.getByRole('button', { name: 'Accueil' }).click();

    await page.getByRole('button', { name: 'Mettre à jour (v99.0.0)' }).click();
    await expect(page.getByRole('heading', { name: 'Nouvelle version' })).toBeVisible();
    const versions = page.locator('.release');
    await expect(versions).toHaveCount(2);
    await expect(versions.first()).toContainText('Correction future');
    await expect(versions.last()).toContainText('Nouveauté future');
    expect(await page.evaluate(() => window.__totem?.updateRequested())).toBe(false);

    await page.getByRole('button', { name: 'Mettre à jour', exact: true }).click();
    expect(await page.evaluate(() => window.__totem?.updateRequested())).toBe(true);
    // Nouveautés déjà vues : pas de « Quoi de neuf » après le rechargement.
    const seen = await page.evaluate(
      () =>
        (JSON.parse(localStorage.getItem('totem:v1') ?? '{}') as { seenVersion?: string })
          .seenVersion,
    );
    expect(seen).toBe('99.0.0');
  });

  test('mise à jour sans version.json lisible : proposée sans détail', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => window.__totem !== undefined);
    await page.evaluate(() => window.__totem?.simulateUpdate());
    await page.getByRole('button', { name: 'Mettre à jour', exact: true }).click();
    await expect(page.getByText('Une nouvelle version est disponible.')).toBeVisible();
    await expect(page.locator('.release')).toHaveCount(0);
    await page.getByRole('button', { name: 'Plus tard' }).click();
    await expect(page.getByRole('button', { name: 'Jouer' })).toBeVisible();
  });
});

test.describe('versions', () => {
  test('version affichée, historique dans l’aide', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.app-version')).toHaveText(/^Version \d+\.\d+\.\d+$/);
    await page.getByRole('button', { name: 'Aide' }).click();
    await page.getByRole('button', { name: 'Historique des versions' }).click();
    await expect(page.getByRole('heading', { name: 'Historique des versions' })).toBeVisible();
    await expect(page.locator('.release[data-version="1.0.0"]')).toBeVisible();
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page.getByRole('heading', { name: 'Aide' })).toBeVisible();
  });

  test('première visite : pas de « Quoi de neuf »', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Jouer' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Jouer' })).toBeVisible();
  });

  test('joueur de la 1.0.0 : « Quoi de neuf » une seule fois', async ({ page }) => {
    // Données de la 1.0.0 : aucune version vue enregistrée.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded') === null) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('totem:v1', JSON.stringify({ version: 1, legacyImported: true }));
      }
    });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Quoi de neuf ?' })).toBeVisible();
    await expect(page.locator('.release[data-version="1.1.0"]')).toBeVisible();
    await expect(page.locator('.release[data-version="1.0.0"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByRole('button', { name: 'Jouer' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Jouer' })).toBeVisible();
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

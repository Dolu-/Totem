import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  advanceUntil,
  boardRows,
  collectErrors,
  openGame,
  setGrid,
  setPiece,
  snapshot,
} from './helpers.ts';

const screenId = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => window.__totem?.screen());

async function expectScreen(page: Page, id: string): Promise<void> {
  await expect.poll(() => screenId(page)).toBe(id);
}

/** Aucun débordement horizontal, aucune violation d'accessibilité sérieuse ou critique. */
async function expectAccessible(page: Page): Promise<void> {
  // Les contrastes se mesurent une fois les fondus d'apparition terminés.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  // Rien ne déborde horizontalement de l'écran (cartes, HUD, page).
  const overflowing = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out = [...document.querySelectorAll<HTMLElement>('.card, .hud, .touch-buttons')]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < -0.5 || r.right > width + 0.5;
      })
      .map((el) => el.className);
    if (document.documentElement.scrollWidth > width) out.push('page');
    return out;
  });
  expect(overflowing).toEqual([]);
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(serious).toEqual([]);
}

/** Partie (temps figé) où la pièce efface une ligne : 3 points au niveau 0. */
async function scoreThreePoints(page: Page): Promise<void> {
  await openGame(page);
  await setGrid(page, boardRows(6, 15, ['00....']));
  await setPiece(page, [0, 1, 2], 2, 14);
  await advanceUntil(page, (s) => s.score > 0 && s.phase === 'falling');
}

/** Pause puis « Arrêter la partie » (fonctionne au doigt comme à la souris). */
async function endGame(page: Page): Promise<void> {
  await page.locator('.hud__pause').click();
  await expectScreen(page, 'paused');
  await page.getByRole('button', { name: 'Arrêter la partie' }).click();
  await expectScreen(page, 'gameOver');
}

test.describe('parcours', () => {
  test('accueil → jeu → pause → reprise → arrêt → fin → accueil', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await expect(page.locator('.hud')).toBeVisible();
    await expect(page.getByTestId('score')).toHaveText('0');
    await expect(page.getByTestId('level')).toHaveText('1');
    // Alignements restants : barre seule à l'écran, nombre donné aux lecteurs d'écran.
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      'Encore 10 alignements',
    );

    await page.locator('.hud__pause').click();
    await expectScreen(page, 'paused');
    expect((await snapshot(page)).paused).toBe(true);
    // En pause, le plateau est masqué par l'écran opaque.
    await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible();

    await page.getByRole('button', { name: 'Reprendre' }).click();
    await expectScreen(page, 'playing');
    expect((await snapshot(page)).paused).toBe(false);

    await endGame(page);
    await expect(page.getByTestId('final-score')).toHaveText('Score : 0');
    await expect(page.locator('#record-name')).toHaveCount(0);
    await page.getByRole('button', { name: 'Accueil' }).click();
    await expectScreen(page, 'home');
    expect(errors).toEqual([]);
  });

  test('nouveau record : saisie du nom, tableau, conservé après rechargement', async ({ page }) => {
    await scoreThreePoints(page);
    await expect(page.getByTestId('score')).toHaveText('3');
    await endGame(page);

    const name = page.locator('#record-name');
    await expect(name).toBeFocused();
    await name.fill('Ludo');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expectScreen(page, 'scores');
    const row = page.locator('tr[aria-current="true"]');
    await expect(row).toContainText('Ludo');
    await expect(row).toContainText('3');

    await page.reload();
    await page.getByRole('button', { name: 'Records' }).click();
    await expect(page.locator('table.scores tbody tr')).toHaveCount(1);
    await expect(page.locator('table.scores')).toContainText('Ludo');

    // Le nom est proposé à la partie suivante.
    await scoreThreePoints(page);
    await endGame(page);
    await expect(page.locator('#record-name')).toHaveValue('Ludo');
  });

  test('effacer les records (avec confirmation)', async ({ page }) => {
    await scoreThreePoints(page);
    await endGame(page);
    await page.locator('#record-name').fill('A');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Effacer les records' }).click();
    await expect(page.getByText('Aucun record pour l’instant')).toBeVisible();
  });

  test('réglages : modifiés, enregistrés, appliqués et conservés', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expectScreen(page, 'settings');
    await page.getByLabel('Lignes').fill('12');
    await expect(page.locator('output[for="setting-lines"]')).toHaveText('12');
    await page.getByLabel('Colonnes').fill('8');
    // Niveau de départ affiché à partir de 1 (1 par défaut).
    await expect(page.getByLabel('Niveau de départ')).toHaveValue('1');
    await page.getByLabel('Niveau de départ').fill('3');
    await page.getByLabel('Boutons de contrôle à l’écran').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expectScreen(page, 'home');

    await page.reload();
    await page.getByRole('button', { name: 'Jouer' }).click();
    await expectScreen(page, 'playing');
    const snap = await snapshot(page);
    expect([snap.width, snap.height]).toEqual([8, 12]);
    expect(snap.level).toBe(2); // niveau interne 2 = « Niveau 3 »
    await expect(page.getByTestId('level')).toHaveText('3');
    await expect(page.locator('.touch-buttons')).toBeVisible();
  });

  test('réglages : valeurs par défaut, annulation', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.getByLabel('Lignes').fill('20');
    await page.getByRole('button', { name: 'Valeurs par défaut' }).click();
    await expect(page.getByLabel('Lignes')).toHaveValue('15');
    await page.getByLabel('Lignes').fill('11');
    await page.getByRole('button', { name: 'Annuler' }).click();
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.getByLabel('Lignes')).toHaveValue('15');
  });

  test('langue : passage en anglais, conservé', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.getByLabel('Langue').selectOption('en');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  });

  test('aide, puis retour (bouton ou Échap)', async ({ page, isMobile }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Aide' }).click();
    await expect(page.getByRole('heading', { name: 'Aide' })).toBeVisible();
    await page.getByRole('button', { name: 'Retour' }).click();
    await expectScreen(page, 'home');
    if (!isMobile) {
      await page.getByRole('button', { name: 'Aide' }).click();
      await page.keyboard.press('Escape');
      await expectScreen(page, 'home');
    }
  });

  test('pause automatique quand l’application passe en arrière-plan', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expectScreen(page, 'paused');
    expect((await snapshot(page)).paused).toBe(true);
  });

  test('le niveau suivant est annoncé', async ({ page }) => {
    await openGame(page, { seed: 1, tuning: { progression: { perLevel: 1 } } });
    await setGrid(page, boardRows(6, 15, ['00....']));
    await setPiece(page, [0, 1, 2], 2, 14);
    await advanceUntil(page, (s) => s.level === 1);
    // Niveau interne 1 = deuxième niveau, affiché « Niveau 2 » (numérotation à partir de 1).
    await expect(page.locator('.toast')).toHaveText('Niveau 2 !');
    await expect(page.getByRole('status').filter({ hasText: 'Niveau 2 !' })).toHaveCount(1);
  });
});

test.describe('accessibilité et apparence', () => {
  test('accueil', async ({ page }) => {
    await page.goto('./');
    await expectAccessible(page);
    await expect(page).toHaveScreenshot('screen-home.png');
  });

  test('réglages', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expectAccessible(page);
    await expect(page).toHaveScreenshot('screen-settings.png', { fullPage: true });
  });

  test('aide', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Aide' }).click();
    await expectAccessible(page);
    await expect(page).toHaveScreenshot('screen-help.png', { fullPage: true });
  });

  test('jeu (HUD) et pause', async ({ page }) => {
    await openGame(page);
    await setGrid(page, boardRows(6, 15, ['4.....', '15.2..', '230415', '012345']));
    await setPiece(page, [0, 1, 2], 2, 6.5);
    await expectAccessible(page);
    await expect(page).toHaveScreenshot('screen-playing.png');
    await page.locator('.hud__pause').click();
    await expectAccessible(page);
    await expect(page).toHaveScreenshot('screen-pause.png');
  });

  test('fin de partie avec record, puis tableau des records', async ({ page }) => {
    await scoreThreePoints(page);
    await endGame(page);
    await page.locator('#record-name').fill('Ludo');
    await page.locator('#record-name').blur();
    await expectAccessible(page);
    await expect(page).toHaveScreenshot('screen-gameover.png');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expectAccessible(page);
    await expect(page).toHaveScreenshot('screen-scores.png', { mask: [page.locator('td.date')] });
  });
});

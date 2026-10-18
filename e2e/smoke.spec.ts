import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers.ts';

test('l’accueil s’affiche sans erreur ni défilement', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');

  await expect(page).toHaveTitle('Totem');
  await expect(page.getByRole('heading', { name: 'Totem' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jouer' })).toBeFocused();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth ||
      document.documentElement.scrollHeight > document.documentElement.clientHeight,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test('« Jouer » lance une partie qui avance en temps réel', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Jouer' }).click();
  await expect(page.locator('canvas.board')).toBeVisible();
  await page.waitForFunction(() => window.__totem?.screen() === 'playing');
  const y0 = await page.evaluate(() => window.__totem?.snapshot()?.piece?.y ?? 0);
  await page.waitForTimeout(1500);
  const y1 = await page.evaluate(() => window.__totem?.snapshot()?.piece?.y ?? 0);
  expect(y1).toBeGreaterThan(y0 + 0.5);
  expect(errors).toEqual([]);
});

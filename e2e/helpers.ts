import type { Page } from '@playwright/test';
import type { TestGameOptions, TestSnapshot } from '../src/testing/hooks.ts';

/** Collecte les erreurs JavaScript et console de la page. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Ouvre le jeu et attend l'API de test ; le temps de jeu est figé (avancé par `advance`). */
export async function openGame(
  page: Page,
  options: TestGameOptions = { seed: 1 },
  query = '',
): Promise<void> {
  await page.goto(`./${query}`);
  await page.waitForFunction(() => window.__totem !== undefined);
  await page.evaluate((o) => {
    const hooks = window.__totem;
    hooks?.setManualTime(true);
    hooks?.newGame(o);
  }, options);
}

export async function setGrid(page: Page, rows: string[]): Promise<void> {
  await page.evaluate((r) => window.__totem?.setGrid(r), rows);
}

export async function setPiece(page: Page, colors: number[], x: number, y = -1): Promise<void> {
  await page.evaluate(([c, px, py]) => window.__totem?.setPiece(c, px, py), [
    colors,
    x,
    y,
  ] as const);
}

export async function advance(page: Page, ms: number): Promise<void> {
  await page.evaluate((t) => window.__totem?.advance(t), ms);
}

export async function snapshot(page: Page): Promise<TestSnapshot> {
  const snap = await page.evaluate(() => window.__totem?.snapshot() ?? null);
  if (!snap) throw new Error('Aucune partie en cours');
  return snap;
}

/** Avance le temps par pas jusqu'à ce que la condition (évaluée dans la page) soit vraie. */
export async function advanceUntil(
  page: Page,
  condition: (snap: TestSnapshot) => boolean,
  stepMs = 20,
  maxMs = 20_000,
): Promise<void> {
  for (let t = 0; t < maxMs; t += stepMs) {
    if (condition(await snapshot(page))) return;
    await advance(page, stepMs);
  }
  throw new Error(`Condition non atteinte après ${maxMs} ms`);
}

/** Lignes d'une grille de `rows` lignes, dont les dernières sont fournies. */
export function boardRows(width: number, height: number, bottom: string[]): string[] {
  return [...Array.from({ length: height - bottom.length }, () => '.'.repeat(width)), ...bottom];
}

/**
 * Recette « en jouant » : le bot joue de vraies parties, en temps réel, dans
 * chaque navigateur, uniquement par les entrées d'un joueur :
 * - clavier (Chromium et WebKit sur PC) ;
 * - souris seule (Firefox) : clic, cliquer-glisser, geste vif vers le bas ;
 * - écran tactile (Android, iPhone) : toucher et glissements.
 * Il lit l'état par l'API de test, décide avec le même bot que les simulations,
 * puis vérifie que chaque pièce atterrit là où il l'a envoyée.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { Grid } from '../src/core/grid.ts';
import { DEFAULT_STYLE } from '../src/render/style.ts';
import type { TestGameOptions, TestSnapshot } from '../src/testing/hooks.ts';
import { DEFAULT_WEIGHTS, planMove, type Plan } from '../tests/sim/bot.ts';
import { collectErrors, snapshot } from './helpers.ts';

type InputMode = 'keyboard' | 'mouse' | 'touch';

function inputModeFor(info: TestInfo, browserName: string): InputMode {
  if (info.project.use.isMobile) return 'touch';
  return browserName === 'firefox' ? 'mouse' : 'keyboard';
}

/** Lance une partie en temps réel (pas de temps figé). */
async function startRealGame(page: Page, options: TestGameOptions): Promise<void> {
  // Le bot pose ses pièces par un geste vif : réglage « poser la pièce » activé.
  await page.addInitScript(() => {
    localStorage.setItem(
      'totem:v1',
      JSON.stringify({ version: 1, settings: { flickToLock: true }, legacyImported: true }),
    );
  });
  await page.goto('./');
  await page.waitForFunction(() => window.__totem !== undefined);
  await page.evaluate((o) => window.__totem?.newGame(o), options);
}

interface Geometry {
  x: number;
  y: number;
  cell: number;
}

async function geometry(page: Page, columns: number): Promise<Geometry> {
  const box = await page.locator('canvas.board').boundingBox();
  if (!box) throw new Error('Plateau introuvable');
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height * 0.45,
    cell: box.width / (columns + 2 * DEFAULT_STYLE.frameCells),
  };
}

/** Séquence d'événements Pointer « touch » sur la zone de jeu (glissement au doigt). */
async function touchDrag(
  page: Page,
  dx: number,
  dy: number,
  from: Geometry,
  durationMs: number,
): Promise<void> {
  await page.evaluate(
    async ({ dx, dy, x, y, durationMs }) => {
      const target = document.querySelector('.board-host');
      if (!target) return;
      const fire = (type: string, cx: number, cy: number): void => {
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 11,
            pointerType: 'touch',
            isPrimary: true,
            clientX: cx,
            clientY: cy,
            bubbles: true,
            cancelable: true,
          }),
        );
      };
      const steps = 6;
      fire('pointerdown', x, y);
      for (let i = 1; i <= steps; i += 1) {
        await new Promise((r) => setTimeout(r, durationMs / steps));
        fire('pointermove', x + (dx * i) / steps, y + (dy * i) / steps);
      }
      fire('pointerup', x + dx, y + dy);
    },
    { dx, dy, x: from.x, y: from.y, durationMs },
  );
}

/** Distance de glissement pour `columns` colonnes (un pas tous les 0,8 case, avec marge). */
const dragDistance = (columns: number, cell: number): number =>
  Math.sign(columns) * (Math.abs(columns) * 0.8 + 0.4) * cell;

/** Exécute un coup par les entrées du joueur : permutations, déplacement, descente rapide. */
async function play(page: Page, mode: InputMode, plan: Plan, snap: TestSnapshot): Promise<void> {
  const piece = snap.piece;
  if (!piece) return;
  const columns = plan.targetX - piece.x;
  const g = await geometry(page, snap.width);

  if (mode === 'keyboard') {
    for (let i = 0; i < plan.rotations; i += 1) await page.keyboard.press('ArrowUp');
    const key = columns < 0 ? 'ArrowLeft' : 'ArrowRight';
    for (let i = 0; i < Math.abs(columns); i += 1) await page.keyboard.press(key);
    await page.keyboard.down('ArrowDown');
    await waitForLock(page, snap.piecesPlaced);
    await page.keyboard.up('ArrowDown');
    return;
  }

  if (mode === 'mouse') {
    for (let i = 0; i < plan.rotations; i += 1) await page.mouse.click(g.x, g.y);
    if (columns !== 0) {
      await page.mouse.move(g.x, g.y);
      await page.mouse.down();
      await page.mouse.move(g.x + dragDistance(columns, g.cell), g.y, { steps: 8 });
      await page.mouse.up();
    }
    // Geste vif vers le bas : la descente rapide continue jusqu'à la pose.
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x, g.y + 2 * g.cell, { steps: 3 });
    await page.mouse.up();
  } else {
    for (let i = 0; i < plan.rotations; i += 1) await page.touchscreen.tap(g.x, g.y);
    if (columns !== 0) await touchDrag(page, dragDistance(columns, g.cell), 0, g, 120);
    await touchDrag(page, 0, 2 * g.cell, g, 90);
  }
  await waitForLock(page, snap.piecesPlaced);
}

async function waitForLock(page: Page, placed: number): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const s = window.__totem?.snapshot();
      return !s || s.piecesPlaced > n || s.phase === 'over';
    },
    placed,
    { timeout: 30_000 },
  );
}

/** Où la dernière pièce s'est posée : colonne et couleurs (bas → haut), d'après la grille. */
function landed(before: TestSnapshot, after: TestSnapshot): { x: number; colors: number[] } | null {
  const a = Grid.fromRows(before.rows);
  const b = Grid.fromRows(after.rows);
  for (let x = 0; x < a.width; x += 1) {
    const top = a.topOf(x);
    if (b.topOf(x) === top - 3) {
      return { x, colors: [0, 1, 2].map((i) => b.get(x, top - 1 - i)) };
    }
  }
  return null; // effacement immédiat : vérification impossible pour ce coup
}

interface Session {
  pieces: number;
  checked: number;
  onTarget: number;
}

/** Joue jusqu'à la fin de la partie ou l'échéance ; renvoie la précision des commandes. */
async function botSession(page: Page, mode: InputMode, durationMs: number): Promise<Session> {
  const session: Session = { pieces: 0, checked: 0, onTarget: 0 };
  const end = Date.now() + durationMs;
  let lastPlanned = -1;
  while (Date.now() < end) {
    const snap = await snapshot(page);
    if (snap.phase === 'over') break;
    if (
      snap.phase !== 'falling' ||
      !snap.piece ||
      snap.piecesPlaced === lastPlanned ||
      snap.piece.y > 1
    ) {
      await page.waitForTimeout(25);
      continue;
    }
    lastPlanned = snap.piecesPlaced;
    const grid = Grid.fromRows(snap.rows);
    const plan = planMove(
      { width: grid.width, height: grid.height, get: (x, y) => grid.get(x, y), piece: snap.piece },
      DEFAULT_WEIGHTS,
    );
    if (!plan) {
      await waitForLock(page, snap.piecesPlaced);
      continue;
    }
    await play(page, mode, plan, snap);
    session.pieces += 1;

    // Vérifie que la pièce est arrivée dans la bonne colonne, avec les bonnes couleurs.
    const after = await snapshot(page);
    const result = landed(snap, after);
    if (result && after.phase === 'falling' && after.score === snap.score) {
      session.checked += 1;
      let colors = [...snap.piece.colors];
      for (let i = 0; i < plan.rotations; i += 1)
        colors = [colors[2] ?? -1, colors[0] ?? -1, colors[1] ?? -1];
      if (result.x === plan.targetX && result.colors.join() === colors.join())
        session.onTarget += 1;
    }
  }
  return session;
}

// Recette longue (plusieurs minutes) : `npm run e2e:recette`, hors de la suite courante.
test.describe('le bot joue de vraies parties @recette', () => {
  test.describe.configure({ timeout: 240_000 });

  test('partie normale : il marque des points, chaque commande atteint sa cible', async ({
    page,
    browserName,
  }, testInfo) => {
    const errors = collectErrors(page);
    const mode = inputModeFor(testInfo, browserName);
    await startRealGame(page, { seed: 42 });
    const session = await botSession(page, mode, 90_000);
    const snap = await snapshot(page);
    await page.screenshot({ path: testInfo.outputPath(`partie-${mode}.png`) });
    testInfo.annotations.push({
      type: 'bilan',
      description: `${mode} : ${session.pieces} pièces, score ${snap.score}, niveau ${snap.level}, précision ${session.onTarget}/${session.checked}`,
    });

    // Volume minimal (les animations d'origine, volontairement lentes, limitent le rythme).
    expect(session.pieces).toBeGreaterThanOrEqual(10);
    expect(snap.score).toBeGreaterThan(0);
    // Précision des entrées réelles : au moins 95 % des coups vérifiables exactement réussis.
    expect(session.checked).toBeGreaterThanOrEqual(5);
    expect(session.onTarget / session.checked).toBeGreaterThanOrEqual(0.95);
    expect(errors).toEqual([]);
  });

  test('jusqu’au bout : fin de partie, record enregistré, conservé', async ({
    page,
    browserName,
  }, testInfo) => {
    const mode = inputModeFor(testInfo, browserName);
    // Partie courte et difficile (9 couleurs, niveau 9) pour atteindre la fin rapidement.
    await startRealGame(page, { seed: 7, colorCount: 9, startLevel: 9, height: 12 });
    await botSession(page, mode, 150_000);
    let snap = await snapshot(page);
    if (snap.phase !== 'over') {
      // Le bot a tenu : on arrête la partie par le menu pause.
      await page.locator('.hud__pause').click();
      await page.getByRole('button', { name: 'Arrêter la partie' }).click();
      snap = await snapshot(page);
    }
    testInfo.annotations.push({
      type: 'bilan',
      description: `${mode} : ${snap.piecesPlaced} pièces, score ${snap.score}, fin ${snap.phase}`,
    });
    await expect.poll(() => page.evaluate(() => window.__totem?.screen())).toBe('gameOver');
    await page.screenshot({ path: testInfo.outputPath(`fin-${mode}.png`) });
    if (snap.score > 0) {
      await page.locator('#record-name').fill('Bot');
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.locator('tr[aria-current="true"]')).toContainText('Bot');
      await page.reload();
      await page.getByRole('button', { name: 'Records' }).click();
      await expect(page.locator('table.scores')).toContainText('Bot');
    }
  });
});

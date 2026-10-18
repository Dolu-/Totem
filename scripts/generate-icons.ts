/**
 * Génère les icônes de l'application (SVG sources + PNG) dans `public/` :
 * le damier des 9 couleurs du jeu, comme le logo de l'écran d'accueil.
 *
 *   npm run icons
 *
 * Les PNG sont rendus par Chromium (Playwright, déjà utilisé pour les tests) :
 * aucune dépendance de traitement d'images. Les fichiers produits sont versionnés.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { BLOCK_STYLES } from '../src/render/palette.ts';

interface IconOptions {
  /** Côté d'un bloc et espace entre blocs, sur une toile de 512. */
  readonly block: number;
  readonly gap: number;
  /** Rayon du fond (0 = carré plein, pour l'icône « maskable » découpée par le système). */
  readonly radius: number;
}

function iconSvg({ block, gap, radius }: IconOptions): string {
  const total = 3 * block + 2 * gap;
  const offset = (512 - total) / 2;
  const gradients = BLOCK_STYLES.map(
    (s, i) =>
      `<linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${s.light}"/><stop offset=".45" stop-color="${s.base}"/>` +
      `<stop offset="1" stop-color="${s.dark}"/></linearGradient>`,
  ).join('');
  const blocks = BLOCK_STYLES.map((_, i) => {
    const x = offset + (i % 3) * (block + gap);
    const y = offset + Math.floor(i / 3) * (block + gap);
    const r = block * 0.2;
    return (
      `<rect x="${x}" y="${y}" width="${block}" height="${block}" rx="${r}" fill="url(#g${i})"/>` +
      `<rect x="${x + block * 0.12}" y="${y + block * 0.08}" width="${block * 0.76}" height="${block * 0.38}" rx="${r * 0.8}" fill="#fff" opacity=".3"/>`
    );
  }).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#1a2452"/><stop offset="1" stop-color="#0b1020"/></linearGradient>${gradients}</defs>` +
    `<rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>${blocks}</svg>\n`
  );
}

const standard = iconSvg({ block: 112, gap: 24, radius: 112 });
// Zone sûre d'une icône maskable : le cercle central de 80 % ; le motif reste dedans.
const maskable = iconSvg({ block: 80, gap: 18, radius: 0 });

writeFileSync('public/icon.svg', standard);
writeFileSync('public/icon-maskable.svg', maskable);

const browser = await chromium.launch();
const page = await browser.newPage();
const render = async (svg: string, size: number, file: string): Promise<void> => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  await page.screenshot({ path: file, omitBackground: true });
  console.log(`${file} (${size}×${size})`);
};
await render(standard, 192, 'public/icon-192.png');
await render(standard, 512, 'public/icon-512.png');
await render(maskable, 512, 'public/icon-maskable-512.png');
// iOS n'applique pas de masque : fond plein, coins arrondis par le système.
await render(maskable, 180, 'public/apple-touch-icon.png');
await browser.close();

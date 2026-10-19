import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { CHANGELOG } from './src/release/changelog.ts';
import { VERSION_FILE, type LatestVersion } from './src/release/version.ts';

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Publie `version.json` (version et journal) à côté de `index.html`. Hors précache
 * (les motifs Workbox excluent `.json`) : la version installée le lit sur le réseau
 * pour annoncer la suivante et ses nouveautés.
 */
function versionFile(): Plugin {
  return {
    name: 'totem-version-file',
    apply: 'build',
    generateBundle() {
      const latest: LatestVersion = { version, changelog: CHANGELOG };
      this.emitFile({ type: 'asset', fileName: VERSION_FILE, source: JSON.stringify(latest) });
    },
  };
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Chemins relatifs : le build fonctionne dans n'importe quel sous-dossier (ex. dolu.fr/totem/).
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
  plugins: [
    versionFile(),
    VitePWA({
      // Mise à jour proposée au joueur (jamais imposée en pleine partie) ; enregistrement dans src/pwa.ts.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Totem',
        short_name: 'Totem',
        description:
          'Alignez les couleurs ! Des totems de trois blocs tombent : jouable sur PC et mobile, même hors ligne.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b1020',
        theme_color: '#0b1020',
        categories: ['games'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Tout le jeu est précaché : il fonctionne entièrement hors ligne.
        // Pas de `.json` : `version.json` doit toujours venir du réseau.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Le premier service worker prend la main sans attendre un rechargement.
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
      // Branches à 90 % : `noUncheckedIndexedAccess` impose des replis `??` inatteignables.
      thresholds: {
        'src/core/**': { statements: 95, branches: 90, functions: 95, lines: 95 },
        'src/config/**': { statements: 95, branches: 90, functions: 95, lines: 95 },
        'src/storage/**': { statements: 95, branches: 90, functions: 95, lines: 95 },
        'src/i18n/**': { statements: 95, branches: 90, functions: 95, lines: 95 },
        'src/input/**': { statements: 95, branches: 90, functions: 95, lines: 95 },
        'src/release/**': { statements: 95, branches: 90, functions: 95, lines: 95 },
      },
    },
  },
});

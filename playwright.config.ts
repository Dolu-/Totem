import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // Langue des joueurs visés ; l'anglais est couvert par les tests unitaires d'i18n.
    locale: 'fr-FR',
    // Service worker bloqué par défaut (bandeau « hors ligne » imprévisible dans les captures) ;
    // autorisé dans e2e/pwa.spec.ts.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  expect: {
    // Tolérance par pixel abaissée (défaut 0,2) : sur un thème sombre, un panneau
    // déplacé ne serait sinon pas détecté (couleurs trop proches du fond).
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.1 },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-android', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-iphone', use: { ...devices['iPhone 15'] } },
  ],
  // Build de production + API de test (`.env.e2e`), servi localement comme en vrai.
  webServer: {
    command: `npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});

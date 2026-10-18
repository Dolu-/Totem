/** Point d'entrée : stockage local, application, puis API de test (build e2e uniquement). */
import { App } from './app.ts';
import { DEFAULT_TUNING } from './config/tuning.ts';
import { styleFromQuery } from './render/style.ts';
import { Store } from './storage/store.ts';

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // stockage bloqué (réglages du navigateur, iframe…)
  }
}

const root = document.getElementById('app');
if (root) {
  const store = new Store(localStorageOrNull(), document.cookie);
  // `?style=fallStepsPerCell:3,…` : essai d'un autre aspect sans recompiler (cf. render/style.ts).
  const app = new App(root, store, styleFromQuery(location.search));
  app.start();

  // Service worker : hors ligne et mises à jour (absent en développement).
  if (import.meta.env.PROD) {
    const { setupPwa } = await import('./pwa.ts');
    setupPwa({
      onOfflineReady: () => {
        app.notifyOfflineReady();
      },
      onUpdateAvailable: (update) => {
        app.notifyUpdate(update);
      },
    });
  }

  if (import.meta.env.VITE_TEST_HOOKS === 'true') {
    const { installTestHooks, testTuning } = await import('./testing/hooks.ts');
    installTestHooks({
      view: app.view,
      get screen() {
        return app.screen;
      },
      notifyUpdate: (update) => {
        app.notifyUpdate(update);
      },
      startTestGame: ({ tuning, ...options }) => {
        app.startGame({
          seed: 1,
          ...options,
          ...(tuning ? { tuning: testTuning(DEFAULT_TUNING, tuning) } : {}),
        });
      },
    });
  }
}

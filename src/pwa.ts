/**
 * Service worker (PWA) : jeu disponible hors ligne et mise à jour proposée.
 * La nouvelle version n'est jamais installée en pleine partie : le joueur la
 * déclenche depuis le bandeau, affiché hors du jeu.
 */
import { registerSW } from 'virtual:pwa-register';

export interface PwaCallbacks {
  /** Le jeu est en cache : il fonctionnera sans réseau. */
  readonly onOfflineReady: () => void;
  /** Une nouvelle version est prête ; `update()` l'active et recharge la page. */
  readonly onUpdateAvailable: (update: () => void) => void;
}

/** Vérifie les mises à jour toutes les heures (application laissée ouverte longtemps). */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function setupPwa(callbacks: PwaCallbacks): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onOfflineReady: callbacks.onOfflineReady,
    onNeedRefresh: () => {
      callbacks.onUpdateAvailable(() => {
        void updateSW(true);
      });
    },
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_MS);
    },
  });
}

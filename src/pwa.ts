/**
 * Service worker (PWA) : jeu disponible hors ligne et mise à jour proposée.
 * La nouvelle version n'est jamais installée en pleine partie : le joueur la
 * déclenche depuis l'accueil, après avoir vu ses nouveautés (`version.json`).
 * Le navigateur l'active aussi de lui-même quand toutes les fenêtres du jeu sont
 * fermées : l'écran « Quoi de neuf » prend alors le relais au lancement suivant.
 */
import { registerSW } from 'virtual:pwa-register';
import { sanitizeLatest, VERSION_FILE, type LatestVersion } from './release/version.ts';

export interface PwaCallbacks {
  /** Le jeu est en cache : il fonctionnera sans réseau. */
  readonly onOfflineReady: () => void;
  /**
   * Une nouvelle version est prête ; `update()` l'active et recharge la page.
   * `latest` : sa version et son journal, ou `null` si `version.json` est illisible.
   */
  readonly onUpdateAvailable: (update: () => void, latest: LatestVersion | null) => void;
}

/** Vérifie les mises à jour toutes les heures (application laissée ouverte longtemps). */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** Version publiée sur le serveur, toujours lue sur le réseau (fichier hors précache). */
async function fetchLatest(): Promise<LatestVersion | null> {
  try {
    const response = await fetch(`./${VERSION_FILE}`, { cache: 'no-store' });
    return response.ok ? sanitizeLatest(await response.json()) : null;
  } catch {
    return null; // réseau coupé entre-temps : la mise à jour reste proposée, sans le détail
  }
}

export function setupPwa(callbacks: PwaCallbacks): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onOfflineReady: callbacks.onOfflineReady,
    onNeedRefresh: () => {
      void fetchLatest().then((latest) => {
        callbacks.onUpdateAvailable(() => {
          void updateSW(true);
        }, latest);
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

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** « true » dans le build e2e : expose l'API de test (`window.__totem`). */
  readonly VITE_TEST_HOOKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

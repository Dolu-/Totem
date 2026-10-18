/**
 * Numérotation des niveaux pour le joueur : le moteur compte à partir de 0 (indice de la
 * courbe de vitesse), l'affichage à partir de 1. Le multiplicateur de score par défaut
 * (niveau interne + 1) est ainsi égal au niveau affiché.
 */
export function displayLevel(level: number): number {
  return level + 1;
}

/** Inverse de `displayLevel` (réglage du niveau de départ). */
export function internalLevel(displayed: number): number {
  return displayed - 1;
}

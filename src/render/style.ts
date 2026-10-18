/**
 * Style visuel du plateau, réglable en un seul endroit (le pendant de
 * `config/tuning.ts` pour l'aspect). Les valeurs par défaut reprennent le
 * rendu « rétro » de la version d'origine : déplacements par crans, carrés
 * jointifs, coins peu arrondis.
 */
export interface RenderStyle {
  /**
   * Crans d'affichage par case pour la pièce qui tombe (legacy : 2, une demi-case par tick ;
   * 3 = tiers, 4 = quarts). 0 = mouvement continu. Purement visuel : la vitesse de chute et
   * la position logique ne changent pas.
   */
  readonly fallStepsPerCell: number;
  /** Crans par case pour la chute des blocs après un effacement (legacy : 4). 0 = continu. */
  readonly collapseStepsPerCell: number;
  /** Crans par case pour le glissement latéral de chaque carré (legacy : 2). 0 = continu. */
  readonly slideStepsPerCell: number;
  /**
   * Décalage de départ entre les carrés d'une pièce qui glisse, en fraction de la durée
   * du glissement : le carré du bas part d'abord, puis celui du milieu, puis celui du haut.
   */
  readonly slideStagger: number;
  /** Paliers de transparence pendant la disparition des alignements (legacy : 16). 0 = continu. */
  readonly clearFadeSteps: number;
  /** Taille du « ×N » des chaînes, en cases : au début puis à la fin du zoom (il rétrécit). */
  readonly chainZoomFrom: number;
  readonly chainZoomTo: number;
  /** Rayon des coins d'un carré, en fraction de son côté. */
  readonly cornerRadius: number;
  /** Marge autour d'un carré dans sa case, en fraction du côté (0 = carrés jointifs). */
  readonly blockInset: number;
  /** Épaisseur du cadre autour de l'aire de jeu, en fraction de case. */
  readonly frameCells: number;
  /** Rayon des coins du cadre, en fraction de case. */
  readonly frameRadiusCells: number;
}

export const DEFAULT_STYLE: RenderStyle = Object.freeze({
  fallStepsPerCell: 4,
  collapseStepsPerCell: 4,
  slideStepsPerCell: 2,
  slideStagger: 0.25,
  clearFadeSteps: 16,
  chainZoomFrom: 3,
  chainZoomTo: 1.6,
  cornerRadius: 0.08,
  blockInset: 0,
  frameCells: 0.1,
  frameRadiusCells: 0.12,
});

/**
 * Surcharges du style lues dans l'adresse de la page, pour essayer un réglage
 * sans recompiler : `?style=fallStepsPerCell:3,cornerRadius:0.05`.
 * Les clés inconnues et les valeurs non numériques ou négatives sont ignorées.
 */
export function styleFromQuery(search: string, base: RenderStyle = DEFAULT_STYLE): RenderStyle {
  const raw = new URLSearchParams(search).get('style');
  if (!raw) return base;
  const overrides: Partial<Record<keyof RenderStyle, number>> = {};
  for (const pair of raw.split(',')) {
    const [key = '', value = ''] = pair.split(':').map((part) => part.trim());
    const number = Number(value);
    if (key in base && value !== '' && Number.isFinite(number) && number >= 0) {
      overrides[key as keyof RenderStyle] = number;
    }
  }
  return Object.freeze({ ...base, ...overrides });
}

/** Arrondit `value` au cran inférieur (`steps` crans par unité) ; 0 = pas de crans. */
export function quantize(value: number, steps: number): number {
  if (steps <= 0) return value;
  // Petite marge : 0,999999… issu d'un calcul flottant compte comme le cran 1.
  return Math.floor(value * steps + 1e-9) / steps;
}

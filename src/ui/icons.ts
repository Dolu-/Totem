/** Icônes SVG (24×24, couleur du texte), pour un rendu identique sur tous les appareils. */
export type IconName =
  'left' | 'right' | 'down' | 'rotate' | 'pause' | 'play' | 'home' | 'gauge' | 'star';

const PATHS: Readonly<Record<IconName, string>> = {
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  down: 'M12 4v15M5 12l7 7 7-7',
  rotate: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
  pause: 'M9 5v14M15 5v14',
  play: 'M7 4l13 8-13 8z',
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  // Compteur de vitesse (le niveau, c'est la vitesse de chute) : cadran aux trois quarts,
  // aiguille et pivot, qui occupe toute la hauteur de l'icône.
  gauge: 'M6.2 18.3A8.2 8.2 0 1 1 17.8 18.3M12 12.5l3.6-3.6M12 12.5h.01',
  star: 'M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon', `icon--${name}`);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
}

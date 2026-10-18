/** Petits utilitaires de construction du DOM (pas de framework). */

type AttrValue = string | number | boolean | null | undefined;
export type Child = Node | string | number | null | undefined | false;

/**
 * Crée un élément. Attributs : `false`, `null` et `undefined` sont ignorés,
 * `true` donne un attribut booléen vide. Les enfants `null`/`false` sont ignorés.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, AttrValue>> = {},
  ...children: (Child | readonly Child[])[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === 'number' ? String(child) : child);
  }
  return element;
}

/** Bouton texte (et icône optionnelle) qui appelle `onClick`. */
export function button(
  label: string,
  onClick: () => void,
  attrs: Readonly<Record<string, AttrValue>> = {},
  icon?: Node,
): HTMLButtonElement {
  const el = h('button', { type: 'button', class: 'btn', ...attrs }, icon, h('span', {}, label));
  el.addEventListener('click', onClick);
  return el;
}

/** Premier élément focalisable d'un conteneur (priorité à `[data-autofocus]`). */
export function focusFirst(container: HTMLElement): void {
  const target =
    container.querySelector<HTMLElement>('[data-autofocus]') ??
    container.querySelector<HTMLElement>('button, input, select, [tabindex="0"]');
  target?.focus();
}

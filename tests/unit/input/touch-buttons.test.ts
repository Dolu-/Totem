// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { TouchButtons } from '../../../src/input/touch-buttons.ts';
import { recordingSink } from '../../helpers/sink.ts';

const LABELS = {
  left: 'Gauche',
  right: 'Droite',
  rotate: 'Permuter',
  down: 'Descendre',
  pause: 'Pause',
};

function setup() {
  const sink = recordingSink();
  const buttons = new TouchButtons(sink, LABELS, { delayMs: 170, intervalMs: 60 });
  document.body.replaceChildren(buttons.element);
  const button = (action: string): HTMLButtonElement => {
    const el = buttons.element.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!el) throw new Error(action);
    return el;
  };
  const press = (action: string, type: 'pointerdown' | 'pointerup'): void => {
    button(action).dispatchEvent(
      new PointerEvent(type, { pointerId: 1, bubbles: true, cancelable: true }),
    );
  };
  return { sink, buttons, button, press };
}

describe('TouchButtons', () => {
  it('affiche 5 boutons étiquetés pour les lecteurs d’écran', () => {
    const { button, buttons } = setup();
    expect(button('left').getAttribute('aria-label')).toBe('Gauche');
    buttons.setLabels({ ...LABELS, left: 'Left' });
    expect(button('left').getAttribute('aria-label')).toBe('Left');
    expect(buttons.element.querySelectorAll('button')).toHaveLength(5);
  });

  it('← maintenu : déplacement immédiat puis répété', () => {
    const { sink, buttons, press } = setup();
    press('left', 'pointerdown');
    buttons.update(170 + 60);
    press('left', 'pointerup');
    buttons.update(1000);
    expect(sink.log).toEqual(['left', 'left', 'left']);
  });

  it('↓ maintenu : descente rapide jusqu’au relâchement', () => {
    const { sink, press } = setup();
    press('down', 'pointerdown');
    press('down', 'pointerup');
    expect(sink.log).toEqual(['drop:on', 'drop:off']);
  });

  it('⟳, → et pause', () => {
    const { sink, buttons, press } = setup();
    press('rotate', 'pointerdown');
    press('right', 'pointerdown');
    press('right', 'pointerup');
    buttons.update(1000);
    press('pause', 'pointerdown');
    expect(sink.log).toEqual(['rotate', 'right', 'pause']);
  });

  it('activation au clavier (Entrée sur un bouton focalisé) : une action', () => {
    const { sink, button } = setup();
    button('right').dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
    button('down').dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
    button('rotate').dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
    expect(sink.log).toEqual(['right']);
  });

  it('→ maintenu : répété ; appui long sans menu contextuel', () => {
    const { sink, buttons, button, press } = setup();
    press('right', 'pointerdown');
    buttons.update(170);
    press('right', 'pointerup');
    expect(sink.log).toEqual(['right', 'right']);
    const menu = new Event('contextmenu', { cancelable: true });
    button('rotate').dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });
});

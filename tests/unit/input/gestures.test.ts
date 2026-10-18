// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { GestureController } from '../../../src/input/gestures.ts';
import { recordingSink } from '../../helpers/sink.ts';

const CELL = 40;
let clock = 0;
let controller: GestureController | null = null;

function setup() {
  clock = 0;
  const element = document.createElement('div');
  document.body.append(element);
  const sink = recordingSink();
  controller = new GestureController(element, sink, {
    cellSize: () => CELL,
    moveCells: 0.8,
    swipeCells: 1,
    tapMaxPx: 10,
    tapMaxMs: 250,
    now: () => clock,
  });
  return { element, sink, gestures: controller };
}

type PointerKind = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';

function pointer(
  element: HTMLElement,
  type: PointerKind,
  x: number,
  y: number,
  init: PointerEventInit = {},
): void {
  element.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
}

/** Glissement de (x0, y0) à (x1, y1) en `steps` mouvements sur `durationMs`. */
function swipe(
  element: HTMLElement,
  from: [number, number],
  to: [number, number],
  durationMs = 400,
  steps = 8,
): void {
  pointer(element, 'pointerdown', ...from);
  for (let i = 1; i <= steps; i += 1) {
    clock += durationMs / steps;
    pointer(
      element,
      'pointermove',
      from[0] + ((to[0] - from[0]) * i) / steps,
      from[1] + ((to[1] - from[1]) * i) / steps,
    );
  }
  pointer(element, 'pointerup', ...to);
}

afterEach(() => {
  controller?.destroy();
  controller = null;
  document.body.innerHTML = '';
});

describe('GestureController', () => {
  it('tap bref : permuter', () => {
    const { element, sink } = setup();
    pointer(element, 'pointerdown', 100, 100);
    clock += 120;
    pointer(element, 'pointerup', 104, 103);
    expect(sink.log).toEqual(['rotate']);
  });

  it('appui long sans bouger : rien', () => {
    const { element, sink } = setup();
    pointer(element, 'pointerdown', 100, 100);
    clock += 600;
    pointer(element, 'pointerup', 100, 100);
    expect(sink.log).toEqual([]);
  });

  it('glissement horizontal : une colonne par 0,8 case parcourue, la pièce suit le doigt', () => {
    const { element, sink } = setup();
    swipe(element, [100, 100], [100 + 3 * 0.8 * CELL + 5, 104]);
    expect(sink.log).toEqual(['right', 'right', 'right']);
  });

  it('aller-retour pendant le même geste', () => {
    const { element, sink } = setup();
    pointer(element, 'pointerdown', 200, 100);
    pointer(element, 'pointermove', 270, 100); // +70 px : 2 colonnes (32 px chacune)
    pointer(element, 'pointermove', 200, 100); // retour
    pointer(element, 'pointerup', 200, 100);
    expect(sink.log).toEqual(['right', 'right', 'left', 'left']);
  });

  it('l’axe est verrouillé : un glissement surtout horizontal ne déclenche pas la descente', () => {
    const { element, sink } = setup();
    swipe(element, [100, 100], [180, 140]);
    expect(sink.log).toEqual(['right', 'right']);
  });

  it('glissement vers le haut : une seule permutation, au relâchement', () => {
    const { element, sink } = setup();
    pointer(element, 'pointerdown', 100, 300);
    pointer(element, 'pointermove', 100, 200);
    pointer(element, 'pointermove', 100, 100);
    expect(sink.log).toEqual([]);
    pointer(element, 'pointerup', 100, 100);
    expect(sink.log).toEqual(['rotate']);
  });

  it('glissement vers le bas maintenu : descente rapide jusqu’au relâchement', () => {
    const { element, sink } = setup();
    pointer(element, 'pointerdown', 100, 100);
    clock += 100;
    pointer(element, 'pointermove', 100, 150);
    expect(sink.log).toEqual(['drop:on']);
    clock += 600;
    pointer(element, 'pointermove', 100, 300);
    pointer(element, 'pointerup', 100, 300);
    expect(sink.log).toEqual(['drop:on', 'drop:off']);
  });

  it('geste vif vers le bas : la descente rapide continue jusqu’à la pose de la pièce', () => {
    const { element, sink } = setup();
    swipe(element, [100, 100], [100, 220], 150, 3);
    expect(sink.log).toEqual(['drop:on', 'drop:off', 'drop:untilLock']);
  });

  it('geste vif sans mouvement intermédiaire : la position finale compte', () => {
    const { element, sink } = setup();
    pointer(element, 'pointerdown', 100, 100);
    clock += 80;
    pointer(element, 'pointerup', 40, 100); // −60 px : une colonne
    expect(sink.log).toEqual(['left']);
  });

  it('un seul doigt suivi ; un autre doigt est ignoré', () => {
    const { element, sink } = setup();
    pointer(element, 'pointerdown', 100, 100);
    pointer(element, 'pointerdown', 300, 300, { pointerId: 2 });
    pointer(element, 'pointermove', 400, 300, { pointerId: 2 });
    pointer(element, 'pointerup', 400, 300, { pointerId: 2 });
    clock += 50;
    pointer(element, 'pointerup', 100, 100);
    expect(sink.log).toEqual(['rotate']);
  });

  it('souris : clic gauche = tap ; autres boutons ignorés', () => {
    const { element, sink } = setup();
    pointer(element, 'pointerdown', 100, 100, { pointerType: 'mouse', button: 2 });
    pointer(element, 'pointerup', 100, 100, { pointerType: 'mouse', button: 2 });
    pointer(element, 'pointerdown', 100, 100, { pointerType: 'mouse', button: 0 });
    pointer(element, 'pointerup', 100, 100, { pointerType: 'mouse', button: 0 });
    expect(sink.log).toEqual(['rotate']);
  });

  it('annulation (appel entrant, geste système) : la descente rapide s’arrête', () => {
    const { element, sink } = setup();
    pointer(element, 'pointerdown', 100, 100);
    pointer(element, 'pointermove', 100, 200);
    pointer(element, 'pointercancel', 100, 200);
    pointer(element, 'pointerup', 100, 200);
    expect(sink.log).toEqual(['drop:on', 'drop:off']);
  });

  it('désactivé : ignore les gestes et interrompt le geste en cours', () => {
    const { element, sink, gestures } = setup();
    pointer(element, 'pointerdown', 100, 100);
    pointer(element, 'pointermove', 100, 200);
    gestures.enabled = false;
    pointer(element, 'pointerup', 100, 200);
    pointer(element, 'pointerdown', 100, 100);
    pointer(element, 'pointerup', 100, 100);
    expect(sink.log).toEqual(['drop:on', 'drop:off']);
  });

  it('empêche le menu contextuel (appui long)', () => {
    const { element } = setup();
    const event = new Event('contextmenu', { cancelable: true });
    element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('destroy : ne réagit plus aux gestes', () => {
    const { element, sink, gestures } = setup();
    gestures.destroy();
    controller = null;
    pointer(element, 'pointerdown', 100, 100);
    pointer(element, 'pointerup', 100, 100);
    expect(sink.log).toEqual([]);
  });
});

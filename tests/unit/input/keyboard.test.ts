// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { RepeatTimer } from '../../../src/input/actions.ts';
import { KeyboardController } from '../../../src/input/keyboard.ts';
import { recordingSink } from '../../helpers/sink.ts';

const OPTIONS = { repeatDelayMs: 170, repeatIntervalMs: 60 };
let controller: KeyboardController | null = null;

function setup() {
  const sink = recordingSink();
  controller = new KeyboardController(window, sink, OPTIONS);
  return { sink, keyboard: controller };
}

const key = (
  type: 'keydown' | 'keyup',
  code: string,
  init: KeyboardEventInit = {},
): KeyboardEvent => {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
};

afterEach(() => {
  controller?.destroy();
  controller = null;
  document.body.innerHTML = '';
});

describe('RepeatTimer', () => {
  it('répète après le délai initial, puis à intervalle régulier', () => {
    const timer = new RepeatTimer(170, 60);
    expect(timer.update(100)).toBe(0);
    timer.press(1);
    expect(timer.update(169)).toBe(0);
    expect(timer.update(1)).toBe(1);
    expect(timer.update(120)).toBe(2);
    timer.release();
    expect(timer.update(1000)).toBe(0);
    expect(timer.update(-5)).toBe(0);
  });
});

describe('KeyboardController', () => {
  it('déplace immédiatement, puis répète tant que la touche est maintenue', () => {
    const { sink, keyboard } = setup();
    const event = key('keydown', 'ArrowLeft');
    expect(event.defaultPrevented).toBe(true);
    expect(sink.log).toEqual(['left']);
    key('keydown', 'ArrowLeft', { repeat: true }); // auto-répétition du système ignorée
    keyboard.update(169);
    expect(sink.log).toEqual(['left']);
    keyboard.update(1 + 60 * 2);
    expect(sink.log).toEqual(['left', 'left', 'left', 'left']);
    key('keyup', 'ArrowLeft');
    keyboard.update(1000);
    expect(sink.log).toHaveLength(4);
  });

  it('la dernière direction pressée l’emporte, puis on revient à l’autre', () => {
    const { sink, keyboard } = setup();
    key('keydown', 'ArrowLeft');
    key('keydown', 'ArrowRight');
    keyboard.update(170);
    expect(sink.log).toEqual(['left', 'right', 'right']);
    key('keyup', 'ArrowRight');
    keyboard.update(170);
    expect(sink.log.at(-1)).toBe('left');
  });

  it('WASD / ZQSD par position physique, X pour permuter', () => {
    const { sink } = setup();
    for (const code of ['KeyA', 'KeyD', 'KeyW', 'KeyX']) {
      key('keydown', code);
      key('keyup', code);
    }
    expect(sink.log).toEqual(['left', 'right', 'rotate', 'rotate']);
  });

  it('permute une seule fois par appui', () => {
    const { sink } = setup();
    key('keydown', 'ArrowUp');
    key('keydown', 'ArrowUp', { repeat: true });
    expect(sink.log).toEqual(['rotate']);
  });

  it('descente rapide tant qu’une touche de descente est maintenue', () => {
    const { sink } = setup();
    key('keydown', 'ArrowDown');
    key('keydown', 'Space');
    key('keyup', 'ArrowDown');
    expect(sink.log).toEqual(['drop:on']);
    key('keyup', 'Space');
    expect(sink.log).toEqual(['drop:on', 'drop:off']);
  });

  it('P ou Échap : pause', () => {
    const { sink } = setup();
    key('keydown', 'KeyP');
    key('keydown', 'Escape');
    key('keydown', 'Escape', { repeat: true });
    expect(sink.log).toEqual(['pause', 'pause']);
  });

  it('ignore les raccourcis avec modificateur, la saisie de texte et les autres touches', () => {
    const { sink } = setup();
    key('keydown', 'ArrowLeft', { ctrlKey: true });
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
    const other = key('keydown', 'KeyZ');
    expect(other.defaultPrevented).toBe(false);
    expect(sink.log).toEqual([]);
  });

  it('relâche tout à la perte du focus ou quand il est désactivé', () => {
    const { sink, keyboard } = setup();
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowDown');
    window.dispatchEvent(new Event('blur'));
    keyboard.update(1000);
    expect(sink.log).toEqual(['right', 'drop:on', 'drop:off']);

    key('keydown', 'ArrowDown');
    keyboard.enabled = false;
    key('keydown', 'ArrowLeft');
    expect(sink.log.slice(3)).toEqual(['drop:on', 'drop:off']);
    keyboard.enabled = true;
    key('keydown', 'ArrowLeft');
    expect(sink.log.at(-1)).toBe('left');
  });
});

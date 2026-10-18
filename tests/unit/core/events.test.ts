import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../../../src/core/events.ts';

interface Events {
  ping: { n: number };
  other: string;
}

describe('Emitter', () => {
  it('appelle les abonnés avec la charge, dans l’ordre d’abonnement', () => {
    const emitter = new Emitter<Events>();
    const calls: string[] = [];
    emitter.on('ping', ({ n }) => calls.push(`a${n}`));
    emitter.on('ping', ({ n }) => calls.push(`b${n}`));
    emitter.emit('ping', { n: 1 });
    expect(calls).toEqual(['a1', 'b1']);
  });

  it('ne mélange pas les types d’événements et tolère l’absence d’abonnés', () => {
    const emitter = new Emitter<Events>();
    const handler = vi.fn();
    emitter.on('other', handler);
    emitter.emit('ping', { n: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('se désabonne, y compris pendant une émission', () => {
    const emitter = new Emitter<Events>();
    const second = vi.fn();
    const off = emitter.on('ping', () => {
      off();
    });
    emitter.on('ping', second);
    emitter.emit('ping', { n: 1 });
    emitter.emit('ping', { n: 2 });
    expect(second).toHaveBeenCalledTimes(2);
  });
});

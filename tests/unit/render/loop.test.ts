import { describe, expect, it } from 'vitest';
import { GameLoop, MAX_FRAME_MS, type FrameScheduler } from '../../../src/render/loop.ts';

/** Ordonnanceur manuel : `frame(t)` déclenche l'image demandée au temps t. */
class FakeScheduler implements FrameScheduler {
  callback: ((time: number) => void) | null = null;
  cancelled = 0;
  request(callback: (time: number) => void): number {
    this.callback = callback;
    return 1;
  }
  cancel(): void {
    this.cancelled += 1;
    this.callback = null;
  }
  frame(time: number): void {
    this.callback?.(time);
  }
}

describe('GameLoop', () => {
  it('transmet le temps écoulé entre deux images, plafonné', () => {
    const scheduler = new FakeScheduler();
    const steps: number[] = [];
    const loop = new GameLoop((dt) => steps.push(dt), scheduler);
    loop.start();
    loop.start();
    scheduler.frame(1000);
    scheduler.frame(1016);
    scheduler.frame(5000); // onglet réveillé après une longue absence
    scheduler.frame(4990); // horloge non monotone
    expect(steps).toEqual([0, 16, MAX_FRAME_MS, 0]);
    expect(loop.running).toBe(true);
  });

  it('s’arrête et repart sans compter le temps d’arrêt', () => {
    const scheduler = new FakeScheduler();
    const steps: number[] = [];
    const loop = new GameLoop((dt) => steps.push(dt), scheduler);
    loop.start();
    scheduler.frame(0);
    loop.stop();
    loop.stop();
    expect(scheduler.cancelled).toBe(1);
    expect(loop.running).toBe(false);
    loop.start();
    scheduler.frame(60_000);
    expect(steps).toEqual([0, 0]);
  });
});

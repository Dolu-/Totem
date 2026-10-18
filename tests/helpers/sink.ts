import type { ActionSink } from '../../src/input/actions.ts';

/** Récepteur d'actions qui enregistre tout ce qu'il reçoit. */
export function recordingSink(): ActionSink & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    moveLeft: () => log.push('left'),
    moveRight: () => log.push('right'),
    rotate: () => log.push('rotate'),
    setSoftDrop: (active) => log.push(active ? 'drop:on' : 'drop:off'),
    softDropUntilLock: () => log.push('drop:untilLock'),
    togglePause: () => log.push('pause'),
  };
}

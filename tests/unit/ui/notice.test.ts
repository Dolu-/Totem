// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoticeBar } from '../../../src/ui/notice.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('NoticeBar', () => {
  it('est masqué au départ', () => {
    const bar = new NoticeBar();
    expect(bar.visible).toBe(false);
    expect(bar.element.getAttribute('role')).toBe('status');
  });

  it('message simple : affiché puis masqué automatiquement', () => {
    vi.useFakeTimers();
    const bar = new NoticeBar();
    bar.show('Disponible hors ligne', undefined, 3000);
    expect(bar.visible).toBe(true);
    expect(bar.element.textContent).toBe('Disponible hors ligne');
    vi.advanceTimersByTime(2999);
    expect(bar.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(bar.visible).toBe(false);
  });

  it('message avec action : reste affiché, le bouton déclenche l’action', () => {
    vi.useFakeTimers();
    const bar = new NoticeBar();
    const onClick = vi.fn();
    bar.show('Nouvelle version', { label: 'Mettre à jour', onClick });
    vi.advanceTimersByTime(60_000);
    expect(bar.visible).toBe(true);
    bar.element.querySelector('button')?.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('un nouveau message remplace le précédent et annule son masquage', () => {
    vi.useFakeTimers();
    const bar = new NoticeBar();
    bar.show('Premier', undefined, 1000);
    bar.show('Second', { label: 'OK', onClick: () => undefined });
    vi.advanceTimersByTime(5000);
    expect(bar.visible).toBe(true);
    expect(bar.element.querySelectorAll('button')).toHaveLength(1);
    bar.hide();
    expect(bar.visible).toBe(false);
  });
});

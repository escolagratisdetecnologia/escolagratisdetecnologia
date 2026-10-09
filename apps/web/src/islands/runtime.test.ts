// @vitest-environment happy-dom
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountIslands } from './runtime.ts';

function Counter({ start }: { start: number }) {
  const [count, setCount] = useState(start);
  return h('button', { type: 'button', onClick: () => setCount(count + 1) }, `Cliques: ${count}`);
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('mountIslands', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hydrates islands with the props from data-props', async () => {
    document.body.innerHTML =
      '<div data-island="counter" data-props=\'{"start":2}\'><button type="button">Cliques: 2</button></div>';

    await mountIslands(document, { counter: async () => ({ default: Counter }) });

    const island = document.querySelector<HTMLElement>('[data-island]')!;
    expect(island.dataset.hydrated).toBe('true');
    island.querySelector('button')!.click();
    await nextTick();
    expect(island.textContent).toBe('Cliques: 3');
  });

  it('reports unknown islands and leaves their HTML alone', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = '<div data-island="nao-existe"><p>Oi</p></div>';

    await mountIslands(document, {});

    expect(error).toHaveBeenCalledWith('Unknown island: nao-existe');
    expect(document.body.textContent).toBe('Oi');
  });
});

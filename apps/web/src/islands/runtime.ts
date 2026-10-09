import { h, hydrate, type ComponentType } from 'preact';

// Props arrive as JSON from data-props, so each island checks its own shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IslandRegistry = Record<string, () => Promise<{ default: ComponentType<any> }>>;

/**
 * Hydrates every [data-island] under root with the component registered under its name.
 * Replaces Astro's client:* directives, whose inline scripts the CSP blocks (ADR 0021).
 */
export async function mountIslands(root: ParentNode, registry: IslandRegistry): Promise<void> {
  const elements = [...root.querySelectorAll<HTMLElement>('[data-island]')];
  await Promise.all(
    elements.map(async (element) => {
      const name = element.dataset.island ?? '';
      const load = registry[name];
      if (!load) {
        console.error(`Unknown island: ${name}`);
        return;
      }
      const { default: Component } = await load();
      const props = JSON.parse(element.dataset.props ?? '{}') as Record<string, unknown>;
      hydrate(h(Component, props), element);
      element.dataset.hydrated = 'true';
    }),
  );
}

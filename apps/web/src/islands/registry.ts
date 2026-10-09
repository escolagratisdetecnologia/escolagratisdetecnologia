import type { IslandRegistry } from './runtime.ts';

/** Every island, loaded on demand so a page only downloads the ones it uses. */
export const islands: IslandRegistry = {
  'course-progress': () => import('./CourseProgress.tsx'),
};

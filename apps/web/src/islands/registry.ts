import type { IslandRegistry } from './runtime.ts';

/** Every island, loaded on demand so a page only downloads the ones it uses. */
export const islands: IslandRegistry = {
  'continue-card': () => import('./ContinueCard.tsx'),
  'course-progress': () => import('./CourseProgress.tsx'),
  'my-progress': () => import('./MyProgress.tsx'),
  quiz: () => import('./Quiz.tsx'),
};

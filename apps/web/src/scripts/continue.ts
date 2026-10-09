import { courseStatus, mostRecentCourse, type CourseOutline } from '@egt/core';
import { readProgress } from '../lib/progress-store.ts';

// /continuar/ (app shortcut): jumps to the next lesson of the course touched most recently.
const root = document.querySelector<HTMLElement>('[data-continue]');
if (root) {
  try {
    const outlines = JSON.parse(root.dataset.outlines ?? '[]') as CourseOutline[];
    const progress = readProgress();
    const outline = mostRecentCourse(progress, outlines);
    if (outline) location.replace(courseStatus(outline, progress.courses[outline.slug]).next.url);
  } catch {
    // Keep the static list of courses as the fallback.
  } finally {
    root.dataset.ready = 'true';
  }
}

import { courseStatus, mostRecentCourse, type CourseOutline } from '@egt/core';
import { readProgress } from '../lib/progress-store.ts';

// /continuar/ (app shortcut): jumps to the next lesson of the course touched most recently.
const root = document.querySelector<HTMLElement>('[data-continue]');
if (root) {
  const outlines = JSON.parse(root.dataset.outlines ?? '[]') as CourseOutline[];
  const progress = readProgress();
  const outline = mostRecentCourse(progress, outlines);
  if (outline) location.replace(courseStatus(outline, progress.courses[outline.slug]).next.url);
  root.dataset.ready = 'true';
}

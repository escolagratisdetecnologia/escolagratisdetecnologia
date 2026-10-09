import { completeLesson, visitLesson } from '@egt/core';
import { readProgress, writeProgress } from '../lib/progress-store.ts';

// Lesson page: remembers the visit and marks the lesson done when the learner moves on.
const lesson = document.querySelector<HTMLElement>('[data-lesson]');
if (lesson) {
  const course = lesson.dataset.course ?? '';
  const slug = lesson.dataset.lesson ?? '';
  writeProgress(visitLesson(readProgress(), course, slug, new Date()));
  lesson.querySelector('[data-complete]')?.addEventListener('click', () => {
    writeProgress(completeLesson(readProgress(), course, slug, new Date()));
  });
  lesson.dataset.ready = 'true';
}

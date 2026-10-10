import { completeLesson, visitLesson } from '@egt/core';
import { readProgress } from '../lib/progress-store.ts';
import { saveProgress } from '../lib/progress-sync.ts';

// Lesson page: remembers the visit and marks the lesson done when the learner moves on.
const lesson = document.querySelector<HTMLElement>('[data-lesson]');
if (lesson) {
  const course = lesson.dataset.course ?? '';
  const slug = lesson.dataset.lesson ?? '';
  saveProgress(visitLesson(readProgress(), course, slug, new Date()), course);
  lesson.querySelector('[data-complete]')?.addEventListener('click', () => {
    saveProgress(completeLesson(readProgress(), course, slug, new Date()), course);
  });
  lesson.dataset.ready = 'true';
}

import type { CourseProgress, Progress } from '@egt/core';
import {
  normalizeTimestamp,
  sortedUnique,
  type ProgressRepository,
} from './progress-repository.ts';

/** In-memory repository: for tests and for `pnpm dev` without Docker (lost on restart). */
export function createMemoryProgressRepository(): ProgressRepository {
  const learners = new Map<string, Map<string, CourseProgress>>();

  const read = (sub: string): Progress => {
    const courses: Record<string, CourseProgress> = {};
    for (const [slug, course] of learners.get(sub) ?? []) courses[slug] = structuredClone(course);
    return { version: 1, courses };
  };

  return {
    async get(sub) {
      return read(sub);
    },
    async merge(sub, courses, now) {
      const stored = learners.get(sub) ?? new Map<string, CourseProgress>();
      learners.set(sub, stored);
      for (const [slug, incoming] of Object.entries(courses)) {
        const updatedAt = normalizeTimestamp(incoming.updatedAt, now);
        const current = stored.get(slug);
        const newer = current === undefined || current.updatedAt < updatedAt;
        const lastLesson = newer
          ? (incoming.lastLesson ?? current?.lastLesson)
          : current.lastLesson;
        stored.set(slug, {
          completedLessons: sortedUnique([
            ...(current?.completedLessons ?? []),
            ...incoming.completedLessons,
          ]),
          correctAnswers: sortedUnique([
            ...(current?.correctAnswers ?? []),
            ...incoming.correctAnswers,
          ]),
          ...(lastLesson === undefined ? {} : { lastLesson }),
          updatedAt: newer ? updatedAt : current.updatedAt,
        });
      }
      return read(sub);
    },
  };
}

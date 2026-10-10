import type { CourseProgress, Progress } from '@egt/core';

/** Server-side learning progress. Merging never removes anything (spec §4.4). */
export interface ProgressRepository {
  get(sub: string): Promise<Progress>;
  /**
   * Merges courses sent by a device: completed lessons and correct answers are unioned; the
   * newest `updatedAt` decides `lastLesson`. Timestamps from the future count as `now`.
   * Returns the learner's whole progress.
   */
  merge(sub: string, courses: Record<string, CourseProgress>, now: Date): Promise<Progress>;
}

export const sortedUnique = (values: Iterable<string>): string[] => [...new Set(values)].sort();

/** ISO timestamp in the canonical toISOString() form, never after `now`. */
export function normalizeTimestamp(value: string, now: Date): string {
  return new Date(Math.min(Date.parse(value), now.getTime())).toISOString();
}

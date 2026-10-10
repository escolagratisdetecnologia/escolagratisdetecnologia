import type { CourseProgress, Progress } from '@egt/core';
import { Entity } from 'electrodb';
import type { Database } from './client.ts';
import { isConditionalCheckFailure } from './errors.ts';
import {
  normalizeTimestamp,
  sortedUnique,
  type ProgressRepository,
} from './progress-repository.ts';

/** PK USER#<sub> · SK COURSE#<slug> (spec §3.5). */
function courseProgressEntity(db: Database) {
  return new Entity(
    {
      model: { entity: 'courseProgress', version: '1', service: 'egt' },
      attributes: {
        sub: { type: 'string', required: true },
        course: { type: 'string', required: true },
        completedLessons: { type: 'set', items: 'string' },
        correctAnswers: { type: 'set', items: 'string' },
        lastLesson: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      indexes: {
        byUser: {
          pk: { field: 'PK', composite: ['sub'], template: 'USER#${sub}', casing: 'none' },
          sk: { field: 'SK', composite: ['course'], template: 'COURSE#${course}', casing: 'none' },
        },
      },
    },
    { client: db.document, table: db.table },
  );
}

/**
 * Two writes per course, both safe to run concurrently from several devices: ADD unions the
 * sets, and the conditional SET only moves lastLesson/updatedAt forward. No read-modify-write.
 */
export function createDynamoProgressRepository(db: Database): ProgressRepository {
  const entity = courseProgressEntity(db);

  async function get(sub: string): Promise<Progress> {
    const { data } = await entity.query
      .byUser({ sub }) // Strongly consistent: PUT and merge answer with get() right after writing,
      // so the response must reflect the write that just happened.
      .go({ pages: 'all', consistent: true });
    const courses: Record<string, CourseProgress> = {};
    for (const item of data) {
      courses[item.course] = {
        completedLessons: sortedUnique(item.completedLessons ?? []),
        correctAnswers: sortedUnique(item.correctAnswers ?? []),
        ...(item.lastLesson === undefined ? {} : { lastLesson: item.lastLesson }),
        updatedAt: item.updatedAt ?? new Date(0).toISOString(),
      };
    }
    return { version: 1, courses };
  }

  return {
    get,
    async merge(sub, courses, now) {
      for (const [course, incoming] of Object.entries(courses)) {
        const sets: { completedLessons?: string[]; correctAnswers?: string[] } = {};
        if (incoming.completedLessons.length > 0) sets.completedLessons = incoming.completedLessons;
        if (incoming.correctAnswers.length > 0) sets.correctAnswers = incoming.correctAnswers;
        if (sets.completedLessons || sets.correctAnswers) {
          await entity.update({ sub, course }).add(sets).go();
        }

        const updatedAt = normalizeTimestamp(incoming.updatedAt, now);
        const latest =
          incoming.lastLesson === undefined
            ? { updatedAt }
            : { updatedAt, lastLesson: incoming.lastLesson };
        try {
          await entity
            .update({ sub, course })
            .set(latest)
            .where(
              (attributes, { notExists, lt }) =>
                `${notExists(attributes.updatedAt)} OR ${lt(attributes.updatedAt, updatedAt)}`,
            )
            .go();
        } catch (error) {
          // A newer update is already stored: keep it.
          if (!isConditionalCheckFailure(error)) throw error;
        }
      }
      return get(sub);
    },
    async deleteAll(sub) {
      const { data } = await entity.query
        .byUser({ sub })
        .go({ pages: 'all', attributes: ['course'], consistent: true });
      await Promise.all(data.map(({ course }) => entity.delete({ sub, course }).go()));
    },
  };
}

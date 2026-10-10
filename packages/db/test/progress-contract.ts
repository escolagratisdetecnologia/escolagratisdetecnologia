import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ProgressRepository } from '../src/index.ts';

const NOW = new Date('2026-10-09T12:00:00.000Z');

/** Behavior every ProgressRepository must have (memory and DynamoDB run the same tests). */
export function describeProgressRepository(name: string, create: () => ProgressRepository): void {
  describe(`${name}: ProgressRepository`, () => {
    const learner = () => `learner-${randomUUID()}`;

    it('starts empty', async () => {
      expect(await create().get(learner())).toEqual({ version: 1, courses: {} });
    });

    it('stores what a device sends', async () => {
      const repository = create();
      const sub = learner();

      const progress = await repository.merge(
        sub,
        {
          site: {
            completedLessons: ['b', 'a'],
            correctAnswers: ['a#0'],
            lastLesson: 'b',
            updatedAt: '2026-10-09T10:00:00Z',
          },
        },
        NOW,
      );

      const expected = {
        version: 1,
        courses: {
          site: {
            completedLessons: ['a', 'b'],
            correctAnswers: ['a#0'],
            lastLesson: 'b',
            updatedAt: '2026-10-09T10:00:00.000Z',
          },
        },
      };
      expect(progress).toEqual(expected);
      expect(await repository.get(sub)).toEqual(expected);
    });

    it('unions lessons and answers and never removes anything', async () => {
      const repository = create();
      const sub = learner();
      await repository.merge(
        sub,
        {
          site: {
            completedLessons: ['a', 'b'],
            correctAnswers: ['a#0'],
            updatedAt: '2026-10-09T10:00:00.000Z',
          },
        },
        NOW,
      );

      const progress = await repository.merge(
        sub,
        {
          site: {
            completedLessons: ['c'],
            correctAnswers: [],
            updatedAt: '2026-10-09T09:00:00.000Z',
          },
        },
        NOW,
      );

      expect(progress.courses.site?.completedLessons).toEqual(['a', 'b', 'c']);
      expect(progress.courses.site?.correctAnswers).toEqual(['a#0']);
    });

    it('keeps the lastLesson of the newest update', async () => {
      const repository = create();
      const sub = learner();
      const course = (lastLesson: string, updatedAt: string) => ({
        site: { completedLessons: [], correctAnswers: [], lastLesson, updatedAt },
      });

      await repository.merge(sub, course('b', '2026-10-09T11:00:00.000Z'), NOW);
      const older = await repository.merge(sub, course('a', '2026-10-09T10:00:00.000Z'), NOW);
      expect(older.courses.site).toMatchObject({
        lastLesson: 'b',
        updatedAt: '2026-10-09T11:00:00.000Z',
      });

      const newer = await repository.merge(sub, course('c', '2026-10-09T11:30:00.000Z'), NOW);
      expect(newer.courses.site).toMatchObject({
        lastLesson: 'c',
        updatedAt: '2026-10-09T11:30:00.000Z',
      });
    });

    it('keeps the stored lastLesson when a newer update has none', async () => {
      const repository = create();
      const sub = learner();
      await repository.merge(
        sub,
        {
          site: {
            completedLessons: [],
            correctAnswers: [],
            lastLesson: 'b',
            updatedAt: '2026-10-09T10:00:00.000Z',
          },
        },
        NOW,
      );

      const progress = await repository.merge(
        sub,
        {
          site: {
            completedLessons: ['a'],
            correctAnswers: [],
            updatedAt: '2026-10-09T11:00:00.000Z',
          },
        },
        NOW,
      );

      expect(progress.courses.site).toMatchObject({
        lastLesson: 'b',
        updatedAt: '2026-10-09T11:00:00.000Z',
      });
    });

    it('treats timestamps from the future as now', async () => {
      const repository = create();
      const sub = learner();

      const progress = await repository.merge(
        sub,
        {
          site: {
            completedLessons: ['a'],
            correctAnswers: [],
            updatedAt: '2030-01-01T00:00:00.000Z',
          },
        },
        NOW,
      );

      expect(progress.courses.site?.updatedAt).toBe(NOW.toISOString());
    });

    it('keeps learners and courses apart', async () => {
      const repository = create();
      const ana = learner();
      const bia = learner();
      const lesson = (slug: string) => ({
        completedLessons: [slug],
        correctAnswers: [],
        updatedAt: '2026-10-09T10:00:00.000Z',
      });

      await repository.merge(ana, { site: lesson('a'), planilhas: lesson('x') }, NOW);
      await repository.merge(bia, { site: lesson('b') }, NOW);

      expect(Object.keys((await repository.get(ana)).courses).sort()).toEqual([
        'planilhas',
        'site',
      ]);
      expect((await repository.get(bia)).courses).toEqual({ site: lesson('b') });
    });
  });
}

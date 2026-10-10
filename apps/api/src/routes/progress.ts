import { isKnownLesson, keepKnownProgress, type ProgressCatalog } from '@egt/core';
import type { ProgressRepository } from '@egt/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireIdentity, type Authenticate, type AuthEnv } from '../auth.ts';
import { apiError } from '../errors.ts';

// Same slug rule as packages/content (course folders and lesson files).
const slug = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const answer = z
  .string()
  .max(110)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*#\d{1,3}$/);

const courseProgress = z.object({
  completedLessons: z.array(slug).max(200),
  correctAnswers: z.array(answer).max(1000),
  lastLesson: slug.optional(),
  updatedAt: z.iso.datetime(),
});

const mergeBody = z.object({
  version: z.literal(1),
  courses: z.record(slug, courseProgress).refine((courses) => Object.keys(courses).length <= 50),
});

const lessonParams = z.object({ course: slug, lesson: slug });

const invalidRequest = apiError(
  'invalid_request',
  'Os dados enviados não estão no formato esperado.',
);

export interface ProgressDeps {
  progress: ProgressRepository;
  authenticate: Authenticate;
  catalog: ProgressCatalog;
  now?: () => Date;
}

export function progressRoutes({
  progress,
  authenticate,
  catalog,
  now = () => new Date(),
}: ProgressDeps) {
  return new Hono<AuthEnv>()
    .use(requireIdentity(authenticate))
    .get('/', async (c) => c.json(await progress.get(c.var.identity.sub)))
    .put('/:course/lessons/:lesson', async (c) => {
      const params = lessonParams.safeParse(c.req.param());
      if (!params.success) return c.json(invalidRequest, 400);
      const { course, lesson } = params.data;
      if (!isKnownLesson(catalog, course, lesson)) {
        return c.json(apiError('not_found', 'Aula não encontrada.'), 404);
      }
      const at = now();
      const completed = {
        completedLessons: [lesson],
        correctAnswers: [],
        lastLesson: lesson,
        updatedAt: at.toISOString(),
      };
      return c.json(await progress.merge(c.var.identity.sub, { [course]: completed }, at));
    })
    .post('/merge', async (c) => {
      const body = mergeBody.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json(invalidRequest, 400);
      // Unknown courses and lessons (renamed content, junk) are dropped, not refused: a device
      // with old progress must still sync the rest.
      const courses = keepKnownProgress(body.data.courses, catalog);
      return c.json(await progress.merge(c.var.identity.sub, courses, now()));
    });
}

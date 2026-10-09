import type { Course } from '@egt/content';
import { describe, expect, it } from 'vitest';
import { visibleCourses } from './visibility.ts';

const course = (slug: string, status: 'draft' | 'published') =>
  ({ slug, meta: { status } }) as unknown as Course;

describe('visibleCourses', () => {
  const courses = [course('publicado', 'published'), course('rascunho', 'draft')];

  it('hides drafts in production builds', () => {
    expect(visibleCourses(courses, false).map((c) => c.slug)).toEqual(['publicado']);
  });

  it('shows drafts when SITE_DRAFTS is on', () => {
    expect(visibleCourses(courses, true).map((c) => c.slug)).toEqual(['publicado', 'rascunho']);
  });
});

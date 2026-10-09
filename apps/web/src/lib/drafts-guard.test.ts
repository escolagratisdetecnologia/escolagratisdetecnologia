import { describe, expect, it } from 'vitest';
import { leakedDrafts } from './drafts-guard.ts';

const courses = [
  { slug: 'pronto', status: 'published' },
  { slug: 'rascunho', status: 'draft' },
];

describe('leakedDrafts', () => {
  it('lists draft courses that have a folder in dist/cursos', () => {
    expect(leakedDrafts(courses, ['pronto', 'rascunho'])).toEqual(['rascunho']);
  });

  it('is empty when only published courses were built', () => {
    expect(leakedDrafts(courses, ['pronto'])).toEqual([]);
  });
});

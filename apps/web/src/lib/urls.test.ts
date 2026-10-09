import { fileURLToPath } from 'node:url';
import { loadCatalog, type Course } from '@egt/content';
import { beforeAll, describe, expect, it } from 'vitest';
import { courseUrl, lessonUrl, lessonsOf, outlineOf, projectUrl } from './urls.ts';

const FIXTURE = fileURLToPath(
  new URL('../../../../packages/content/test/fixtures/valid/', import.meta.url),
);

describe('urls', () => {
  let course: Course;

  beforeAll(async () => {
    const { catalog } = await loadCatalog(FIXTURE);
    course = catalog.courses[0]!;
  });

  it('builds clean URLs from slugs', () => {
    expect(courseUrl(course)).toBe('/cursos/curso-teste/');
    expect(lessonUrl(course, lessonsOf(course)[0]!)).toBe('/cursos/curso-teste/boas-vindas/');
    expect(projectUrl(course)).toBe('/cursos/curso-teste/projeto/');
  });

  it('describes the course for the browser', () => {
    expect(outlineOf(course)).toEqual({
      slug: 'curso-teste',
      title: 'Curso de teste',
      url: '/cursos/curso-teste/',
      modules: [
        {
          title: 'Prepare seu ambiente',
          lessons: [
            { slug: 'boas-vindas', title: 'Boas-vindas', url: '/cursos/curso-teste/boas-vindas/' },
            {
              slug: 'no-seu-aparelho',
              title: 'No seu aparelho',
              url: '/cursos/curso-teste/no-seu-aparelho/',
            },
          ],
        },
        {
          title: 'Mão na massa',
          lessons: [
            {
              slug: 'primeiro-passo',
              title: 'Primeiro passo',
              url: '/cursos/curso-teste/primeiro-passo/',
            },
          ],
        },
      ],
      projectTitle: 'Seu primeiro teste',
      projectUrl: '/cursos/curso-teste/projeto/',
    });
  });
});

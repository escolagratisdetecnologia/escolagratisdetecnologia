import { describe, expect, it } from 'vitest';
import {
  completeLesson,
  courseStatus,
  emptyProgress,
  mostRecentCourse,
  parseProgress,
  recordCorrectAnswer,
  visitLesson,
  type CourseOutline,
} from '../src/index.ts';

const NOW = new Date('2026-10-09T12:00:00.000Z');
const LATER = new Date('2026-10-09T13:00:00.000Z');

const outline: CourseOutline = {
  slug: 'site-com-ia',
  title: 'Crie seu site com IA',
  url: '/cursos/site-com-ia/',
  modules: [
    {
      title: 'Prepare seu ambiente',
      lessons: [
        { slug: 'boas-vindas', title: 'Boas-vindas', url: '/cursos/site-com-ia/boas-vindas/' },
      ],
    },
    {
      title: 'Seu primeiro site',
      lessons: [
        { slug: 'escolha', title: 'Escolha o cliente', url: '/cursos/site-com-ia/escolha/' },
        { slug: 'publique', title: 'Publique', url: '/cursos/site-com-ia/publique/' },
      ],
    },
  ],
  projectTitle: 'O site de um negócio do bairro',
  projectUrl: '/cursos/site-com-ia/projeto/',
};

describe('parseProgress', () => {
  it('returns empty progress for anything that is not version 1', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress('texto')).toEqual(emptyProgress());
    expect(parseProgress({ version: 2, courses: {} })).toEqual(emptyProgress());
  });

  it('keeps valid courses, drops broken ones and sorts the sets', () => {
    const parsed = parseProgress({
      version: 1,
      courses: {
        ok: {
          completedLessons: ['b', 'a', 'a'],
          correctAnswers: [],
          lastLesson: 'b',
          updatedAt: NOW.toISOString(),
        },
        quebrado: { completedLessons: 'a', correctAnswers: [], updatedAt: NOW.toISOString() },
      },
    });
    expect(parsed).toEqual({
      version: 1,
      courses: {
        ok: {
          completedLessons: ['a', 'b'],
          correctAnswers: [],
          lastLesson: 'b',
          updatedAt: NOW.toISOString(),
        },
      },
    });
  });
});

describe('updates', () => {
  it('completes a lesson once and remembers it as the last one', () => {
    const once = completeLesson(emptyProgress(), 'site-com-ia', 'boas-vindas', NOW);
    const twice = completeLesson(once, 'site-com-ia', 'boas-vindas', LATER);

    expect(twice.courses['site-com-ia']).toEqual({
      completedLessons: ['boas-vindas'],
      correctAnswers: [],
      lastLesson: 'boas-vindas',
      updatedAt: LATER.toISOString(),
    });
  });

  it('records correct answers per question', () => {
    const progress = recordCorrectAnswer(emptyProgress(), 'site-com-ia', 'boas-vindas', 1, NOW);
    expect(progress.courses['site-com-ia']?.correctAnswers).toEqual(['boas-vindas#1']);
  });

  it('marks a visit without completing the lesson', () => {
    const progress = visitLesson(emptyProgress(), 'site-com-ia', 'escolha', NOW);
    expect(progress.courses['site-com-ia']).toMatchObject({
      completedLessons: [],
      lastLesson: 'escolha',
    });
  });

  it('never changes the progress it receives', () => {
    const original = emptyProgress();
    completeLesson(original, 'site-com-ia', 'boas-vindas', NOW);
    expect(original).toEqual(emptyProgress());
  });
});

describe('courseStatus', () => {
  it('starts at the first lesson', () => {
    expect(courseStatus(outline, undefined)).toEqual({
      done: 0,
      total: 3,
      percent: 0,
      started: false,
      finished: false,
      next: { title: 'Boas-vindas', url: '/cursos/site-com-ia/boas-vindas/' },
    });
  });

  it('points to the first pending lesson and ignores lessons that no longer exist', () => {
    const progress = completeLesson(
      completeLesson(emptyProgress(), 'site-com-ia', 'boas-vindas', NOW),
      'site-com-ia',
      'aula-removida',
      NOW,
    ).courses['site-com-ia'];

    expect(courseStatus(outline, progress)).toMatchObject({
      done: 1,
      percent: 33,
      started: true,
      next: { title: 'Escolha o cliente', url: '/cursos/site-com-ia/escolha/' },
    });
  });

  it('counts a visit as started', () => {
    const progress = visitLesson(emptyProgress(), 'site-com-ia', 'escolha', NOW).courses[
      'site-com-ia'
    ];
    expect(courseStatus(outline, progress)).toMatchObject({ done: 0, started: true });
  });

  it('sends a finished course to the project', () => {
    let progress = emptyProgress();
    for (const slug of ['boas-vindas', 'escolha', 'publique'])
      progress = completeLesson(progress, 'site-com-ia', slug, NOW);

    expect(courseStatus(outline, progress.courses['site-com-ia'])).toMatchObject({
      done: 3,
      percent: 100,
      finished: true,
      next: { title: 'Projeto final', url: '/cursos/site-com-ia/projeto/' },
    });
  });
});

describe('mostRecentCourse', () => {
  it('returns the course touched last, among the known ones', () => {
    const other: CourseOutline = {
      ...outline,
      slug: 'python',
      title: 'Python',
      url: '/cursos/python/',
    };
    let progress = visitLesson(emptyProgress(), 'site-com-ia', 'boas-vindas', NOW);
    progress = visitLesson(progress, 'python', 'boas-vindas', LATER);
    progress = visitLesson(progress, 'curso-removido', 'x', new Date('2026-10-10T00:00:00.000Z'));

    expect(mostRecentCourse(progress, [outline, other])?.slug).toBe('python');
    expect(mostRecentCourse(emptyProgress(), [outline])).toBeUndefined();
  });
});

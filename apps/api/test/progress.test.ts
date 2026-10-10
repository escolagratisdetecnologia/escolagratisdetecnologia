import { describe, expect, it } from 'vitest';
import { learner, NOW, testApp } from './helpers.ts';

const course = (completedLessons: string[], updatedAt: string, lastLesson?: string) => ({
  completedLessons,
  correctAnswers: [],
  ...(lastLesson === undefined ? {} : { lastLesson }),
  updatedAt,
});

describe('progress routes', () => {
  it('answer 500 without details when the storage breaks', async () => {
    const broken = async () => {
      throw new Error('boom');
    };
    const app = testApp({ progress: { get: broken, merge: broken } });

    const res = await app.request('/api/progress', { headers: learner() });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: {
        code: 'internal_error',
        message: 'Algo deu errado do nosso lado. Tenta de novo daqui a pouco.',
      },
    });
  });

  it('require a logged-in learner', async () => {
    const app = testApp();

    for (const [method, path] of [
      ['GET', '/api/progress'],
      ['PUT', '/api/progress/site/lessons/a'],
      ['POST', '/api/progress/merge'],
    ] as const) {
      const res = await app.request(path, { method, headers: { origin: 'http://localhost:4321' } });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: { code: 'unauthenticated', message: 'Entre na sua conta para continuar.' },
      });
    }
  });

  it('GET starts empty', async () => {
    const res = await testApp().request('/api/progress', { headers: learner() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, courses: {} });
  });

  it('PUT marks a lesson as completed and as the last one', async () => {
    const app = testApp();

    const res = await app.request('/api/progress/site/lessons/o-que-e-um-site', {
      method: 'PUT',
      headers: learner(),
    });

    const expected = {
      version: 1,
      courses: { site: course(['o-que-e-um-site'], NOW.toISOString(), 'o-que-e-um-site') },
    };
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expected);
    expect(await (await app.request('/api/progress', { headers: learner() })).json()).toEqual(
      expected,
    );
  });

  it('PUT refuses invalid slugs', async () => {
    const res = await testApp().request('/api/progress/site/lessons/Aula%201', {
      method: 'PUT',
      headers: learner(),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'invalid_request',
        message: 'Os dados enviados não estão no formato esperado.',
      },
    });
  });

  it('PUT answers 404 for lessons that are not in the catalog', async () => {
    const app = testApp();

    for (const path of ['/api/progress/site/lessons/aula-nova', '/api/progress/outro/lessons/a']) {
      const res = await app.request(path, { method: 'PUT', headers: learner() });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: 'not_found', message: 'Aula não encontrada.' },
      });
    }
  });

  it('POST /merge keeps only courses, lessons and answers of the catalog', async () => {
    const res = await testApp().request('/api/progress/merge', {
      method: 'POST',
      headers: learner(),
      body: JSON.stringify({
        version: 1,
        courses: {
          site: {
            ...course(['a', 'aula-removida'], NOW.toISOString(), 'aula-removida'),
            correctAnswers: ['a#0', 'a#1', 'aula-removida#0'],
          },
          'curso-removido': course(['x'], NOW.toISOString()),
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      version: 1,
      courses: { site: { ...course(['a'], NOW.toISOString()), correctAnswers: ['a#0'] } },
    });
  });

  it('POST /merge joins the device progress with the account and returns everything', async () => {
    const app = testApp();
    await app.request('/api/progress/site/lessons/a', { method: 'PUT', headers: learner() });

    const res = await app.request('/api/progress/merge', {
      method: 'POST',
      headers: learner(),
      body: JSON.stringify({
        version: 1,
        courses: {
          site: { ...course(['b'], '2026-10-09T08:00:00.000Z', 'b'), correctAnswers: ['b#0'] },
          planilhas: course(['x'], '2026-10-09T09:00:00.000Z'),
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      version: 1,
      courses: {
        site: {
          completedLessons: ['a', 'b'],
          correctAnswers: ['b#0'],
          lastLesson: 'a',
          updatedAt: NOW.toISOString(),
        },
        planilhas: course(['x'], '2026-10-09T09:00:00.000Z'),
      },
    });
  });

  it('POST /merge keeps learners apart', async () => {
    const app = testApp();
    await app.request('/api/progress/site/lessons/a', { method: 'PUT', headers: learner('ana') });

    const res = await app.request('/api/progress', { headers: learner('bia') });

    expect(await res.json()).toEqual({ version: 1, courses: {} });
  });

  it('POST /merge refuses malformed bodies', async () => {
    const app = testApp();
    const bodies = [
      'não é json',
      JSON.stringify({ version: 2, courses: {} }),
      JSON.stringify({ version: 1, courses: { site: course(['a'], 'ontem') } }),
      JSON.stringify({ version: 1, courses: { Site: course(['a'], NOW.toISOString()) } }),
      JSON.stringify({
        version: 1,
        courses: { site: { ...course([], NOW.toISOString()), correctAnswers: ['a#x'] } },
      }),
      JSON.stringify({
        version: 1,
        courses: Object.fromEntries(
          Array.from({ length: 51 }, (_, i) => [`curso-${i}`, course([], NOW.toISOString())]),
        ),
      }),
    ];

    for (const body of bodies) {
      const res = await app.request('/api/progress/merge', {
        method: 'POST',
        headers: learner(),
        body,
      });

      expect(res.status, body).toBe(400);
      expect(await res.json()).toEqual({
        error: {
          code: 'invalid_request',
          message: 'Os dados enviados não estão no formato esperado.',
        },
      });
    }
  });
});

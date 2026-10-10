// @vitest-environment happy-dom
import { completeLesson, emptyProgress, type Progress } from '@egt/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readProgress, writeProgress } from './progress-store.ts';
import {
  forgetProgress,
  pullProgress,
  readPending,
  saveProgress,
  syncAfterSignIn,
  syncPending,
} from './progress-sync.ts';

const T1 = new Date('2026-10-10T10:00:00.000Z');
const T2 = new Date('2026-10-10T11:00:00.000Z');

function serverWith(progress: Progress) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    calls.push({ method: init.method ?? 'GET', path, ...(body === undefined ? {} : { body }) });
    if (path === '/api/progress/merge') {
      for (const [slug, course] of Object.entries(body.courses as Progress['courses'])) {
        progress = { ...progress, courses: { ...progress.courses, [slug]: course } };
      }
    }
    return Response.json(progress);
  });
  return calls;
}

const signIn = () => {
  document.cookie = 'egt_hint=1; path=/';
};

describe('progress sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.cookie = 'egt_hint=; max-age=0; path=/';
  });

  it('without a session, saves only on this device and remembers what to send', () => {
    const calls = serverWith(emptyProgress());

    saveProgress(completeLesson(emptyProgress(), 'site', 'a', T1), 'site');

    expect(readProgress().courses.site?.completedLessons).toEqual(['a']);
    expect(readPending()).toEqual(['site']);
    expect(calls).toEqual([]);
  });

  it('with a session, sends the changed course and adopts the account progress', async () => {
    signIn();
    const other = completeLesson(emptyProgress(), 'planilhas', 'x', T1).courses.planilhas!;
    const calls = serverWith({ version: 1, courses: { planilhas: other } });
    writeProgress(completeLesson(emptyProgress(), 'site', 'a', T2));
    saveProgress(readProgress(), 'site');

    await syncPending();

    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/progress/merge',
      body: { version: 1, courses: { site: readProgress().courses.site } },
    });
    expect(Object.keys(readProgress().courses).sort()).toEqual(['planilhas', 'site']);
    expect(readPending()).toEqual([]);
  });

  it('keeps the pending courses when the API cannot be reached', async () => {
    signIn();
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('<html></html>', { status: 404, headers: { 'content-type': 'text/html' } }),
    );
    writeProgress(completeLesson(emptyProgress(), 'site', 'a', T1));

    saveProgress(readProgress(), 'site');

    expect(await syncPending()).toBe(false);
    expect(readPending()).toEqual(['site']);
  });

  it('keeps a course pending when it changed while it was being sent', async () => {
    const first = completeLesson(emptyProgress(), 'site', 'a', T1);
    saveProgress(first, 'site');
    signIn();
    vi.stubGlobal('fetch', async () => {
      // The learner finishes another lesson while the request is in flight.
      writeProgress(completeLesson(first, 'site', 'b', T2));
      return Response.json(first);
    });

    expect(await syncPending()).toBe(true);

    expect(readPending()).toEqual(['site']);
    expect(readProgress().courses.site?.completedLessons).toEqual(['a', 'b']);
  });

  it('drops a course the API refuses for good and keeps syncing the others', async () => {
    let progress = completeLesson(emptyProgress(), 'site', 'a', T1);
    progress = completeLesson(progress, 'planilhas', 'x', T1);
    saveProgress(progress, 'site');
    saveProgress(progress, 'planilhas');
    signIn();
    const sent: string[] = [];
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Progress;
      sent.push(...Object.keys(body.courses));
      if (sent.length === 1) {
        return Response.json(
          { error: { code: 'invalid_request', message: 'Dados inválidos.' } },
          { status: 400 },
        );
      }
      return Response.json(body);
    });

    expect(await syncPending()).toBe(true);

    expect(sent).toEqual(['site', 'planilhas']);
    expect(readPending()).toEqual([]);
  });

  it('keeps everything pending when the sign-up is missing or the origin is refused', async () => {
    saveProgress(completeLesson(emptyProgress(), 'site', 'a', T1), 'site');
    signIn();
    for (const [status, code] of [
      [409, 'profile_required'],
      [400, 'invalid_origin'],
    ] as const) {
      vi.stubGlobal('fetch', async () =>
        Response.json({ error: { code, message: 'Não deu.' } }, { status }),
      );

      expect(await syncPending()).toBe(false);
      expect(readPending()).toEqual(['site']);
    }
  });

  it('after signing in, sends each course of this device in its own request', async () => {
    signIn();
    let progress = completeLesson(emptyProgress(), 'site', 'a', T1);
    progress = completeLesson(progress, 'planilhas', 'x', T1);
    writeProgress(progress);
    const calls = serverWith(emptyProgress());

    expect(await syncAfterSignIn()).toBe(true);

    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'POST /api/progress/merge',
      'POST /api/progress/merge',
      'GET /api/progress',
    ]);
    expect(calls.slice(0, 2).map(({ body }) => Object.keys((body as Progress).courses))).toEqual([
      ['site'],
      ['planilhas'],
    ]);
  });

  it('brings in other devices at most every five minutes', async () => {
    signIn();
    const calls = serverWith(emptyProgress());

    await pullProgress({ now: 1_000_000 });
    await pullProgress({ now: 1_000_000 + 60_000 });
    await pullProgress({ now: 1_000_000 + 6 * 60_000 });

    expect(calls.filter(({ path }) => path === '/api/progress')).toHaveLength(2);
  });

  it('forgets everything on this device when the learner signs out', () => {
    saveProgress(completeLesson(emptyProgress(), 'site', 'a', T1), 'site');

    forgetProgress();

    expect(readProgress()).toEqual(emptyProgress());
    expect(readPending()).toEqual([]);
  });
});

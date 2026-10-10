import { createMemoryProfileRepository, createMemoryProgressRepository } from '@egt/db';
import { describe, expect, it } from 'vitest';
import { createFakeIdentity } from './fake-identity.ts';
import { learner, NOW, PROFILE, testApp } from './helpers.ts';

const patch = (body: unknown, sub = 'cris') => ({
  method: 'PATCH',
  headers: learner(sub),
  body: JSON.stringify(body),
});

/** Cris has an account but has not finished sign-up yet. */
function appWithCris() {
  const identity = createFakeIdentity({
    'ana@example.com': 'ana',
    'cris@example.com': 'cris',
  });
  const profiles = createMemoryProfileRepository({ ana: PROFILE });
  return { app: testApp({ identity, profiles }), identity, profiles };
}

describe('GET /api/me', () => {
  it('shows the account e-mail and profile', async () => {
    const res = await testApp().request('/api/me', { headers: learner('ana') });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'ana@example.com', profile: PROFILE });
  });

  it('shows no profile before sign-up is complete', async () => {
    const { app } = appWithCris();

    const res = await app.request('/api/me', { headers: learner('cris') });

    expect(await res.json()).toEqual({ email: 'cris@example.com', profile: null });
  });

  it('signs out a token whose account was deleted', async () => {
    const res = await testApp().request('/api/me', { headers: learner('quem') });

    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie().some((cookie) => cookie.startsWith('egt_hint=;'))).toBe(true);
  });

  it('needs a session', async () => {
    const res = await testApp().request('/api/me');

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/me', () => {
  it('never deletes a finished sign-up, whatever the birth year', async () => {
    const identity = createFakeIdentity({ 'ana@example.com': 'ana', 'bia@example.com': 'bia' });
    const profiles = createMemoryProfileRepository({ ana: PROFILE });
    const app = testApp({ identity, profiles });

    const res = await app.request('/api/me', patch({ birthYear: 2020, acceptTerms: true }, 'ana'));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: 'profile_exists', message: 'Seu cadastro já está completo.' },
    });
    expect(identity.accounts.has('ana@example.com')).toBe(true);
    expect(await profiles.get('ana')).toEqual(PROFILE);
  });

  it('finishes sign-up with the birth year and the accepted terms', async () => {
    const { app, profiles } = appWithCris();

    const res = await app.request('/api/me', patch({ birthYear: 2013, acceptTerms: true }));

    const profile = {
      birthYear: 2013,
      termsVersion: '2026-10-10',
      termsAcceptedAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
    };
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ profile });
    expect(await profiles.get('cris')).toEqual(profile);
  });

  it('refuses anyone who may be under 12 and deletes the account', async () => {
    const { app, identity, profiles } = appWithCris();

    const res = await app.request('/api/me', patch({ birthYear: 2014, acceptTerms: true }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'too_young',
        message:
          'Por enquanto, a Escola é para quem nasceu até 2013. Apagamos o cadastro que você começou.',
      },
    });
    expect(identity.accounts.has('cris@example.com')).toBe(false);
    expect(await profiles.get('cris')).toBeNull();
    expect(res.headers.getSetCookie().some((cookie) => cookie.startsWith('egt_at=;'))).toBe(true);
  });

  it('needs the terms accepted and a real birth year', async () => {
    const { app } = appWithCris();

    for (const body of [
      { birthYear: 2000 },
      { birthYear: 2000, acceptTerms: false },
      { birthYear: '2000', acceptTerms: true },
      { birthYear: 2027, acceptTerms: true },
      { birthYear: 1899, acceptTerms: true },
    ]) {
      const res = await app.request('/api/me', patch(body));

      expect(res.status).toBe(400);
    }
  });

  it('never changes a finished sign-up', async () => {
    const res = await testApp().request(
      '/api/me',
      patch({ birthYear: 1990, acceptTerms: true }, 'ana'),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: 'profile_exists', message: 'Seu cadastro já está completo.' },
    });
  });

  it('does not bring a deleted account back', async () => {
    const { app, profiles } = appWithCris();

    const res = await app.request('/api/me', patch({ birthYear: 2000, acceptTerms: true }, 'quem'));

    expect(res.status).toBe(401);
    expect(await profiles.get('quem')).toBeNull();
  });
});

describe('GET /api/me/export', () => {
  it('downloads everything the school keeps about the learner', async () => {
    const progress = createMemoryProgressRepository();
    await progress.merge(
      'ana',
      { site: { completedLessons: ['a'], correctAnswers: [], updatedAt: NOW.toISOString() } },
      NOW,
    );

    const res = await testApp({ progress }).request('/api/me/export', { headers: learner('ana') });

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="meus-dados-escola-gratis.json"',
    );
    expect(await res.json()).toEqual({
      exportedAt: NOW.toISOString(),
      account: { email: 'ana@example.com' },
      profile: PROFILE,
      progress: {
        version: 1,
        courses: {
          site: { completedLessons: ['a'], correctAnswers: [], updatedAt: NOW.toISOString() },
        },
      },
    });
  });
});

describe('DELETE /api/me', () => {
  it('deletes the progress, the profile and the account, and signs out', async () => {
    const identity = createFakeIdentity({ 'ana@example.com': 'ana' });
    const progress = createMemoryProgressRepository();
    const profiles = createMemoryProfileRepository({ ana: PROFILE });
    await progress.merge(
      'ana',
      { site: { completedLessons: ['a'], correctAnswers: [], updatedAt: NOW.toISOString() } },
      NOW,
    );
    const app = testApp({ identity, progress, profiles });

    const res = await app.request('/api/me', { method: 'DELETE', headers: learner('ana') });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'deleted' });
    expect(await progress.get('ana')).toEqual({ version: 1, courses: {} });
    expect(await profiles.get('ana')).toBeNull();
    expect(identity.accounts.size).toBe(0);
    expect(res.headers.getSetCookie().every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
  });

  it('deletes the profile first, then the progress, then the account', async () => {
    const calls: string[] = [];
    const identity = createFakeIdentity({ 'ana@example.com': 'ana' });
    const deleteUser = identity.deleteUser;
    identity.deleteUser = async (sub) => {
      calls.push('identity');
      await deleteUser(sub);
    };
    const profiles = createMemoryProfileRepository({ ana: PROFILE });
    const deleteProfile = profiles.delete;
    profiles.delete = async (sub) => {
      calls.push('profile');
      await deleteProfile(sub);
    };
    const progress = createMemoryProgressRepository();
    const deleteAll = progress.deleteAll;
    progress.deleteAll = async (sub) => {
      calls.push('progress');
      await deleteAll(sub);
    };

    const res = await testApp({ identity, profiles, progress }).request('/api/me', {
      method: 'DELETE',
      headers: learner('ana'),
    });

    expect(res.status).toBe(200);
    expect(calls).toEqual(['profile', 'progress', 'identity']);
  });

  it('needs the request to come from the site', async () => {
    const identity = createFakeIdentity({ 'ana@example.com': 'ana' });

    const res = await testApp({ identity }).request('/api/me', {
      method: 'DELETE',
      headers: { cookie: 'egt_at=access.ana', origin: 'https://outro.example' },
    });

    expect(res.status).toBe(400);
    expect(identity.accounts.has('ana@example.com')).toBe(true);
  });
});

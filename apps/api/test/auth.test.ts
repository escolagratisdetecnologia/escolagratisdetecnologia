import { describe, expect, it } from 'vitest';
import { learner, SITE, testApp } from './helpers.ts';

describe('personal routes', () => {
  it('know the learner by the egt_at cookie', async () => {
    const res = await testApp().request('/api/progress', { headers: learner('ana') });

    expect(res.status).toBe(200);
  });

  it('answer 401 without a valid access token', async () => {
    for (const cookie of [undefined, 'egt_at=lixo', 'egt_rt=refresh.ana.1']) {
      const headers: Record<string, string> = cookie === undefined ? {} : { cookie };

      const res = await testApp().request('/api/progress', { headers });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: { code: 'unauthenticated', message: 'Entre na sua conta para continuar.' },
      });
    }
  });

  it('answer 409 until the learner finishes sign-up', async () => {
    const res = await testApp().request('/api/progress', {
      headers: { cookie: 'egt_at=access.cris', origin: SITE },
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: 'profile_required', message: 'Complete seu cadastro para continuar.' },
    });
  });
});

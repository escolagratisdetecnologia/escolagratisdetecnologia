import { describe, expect, it } from 'vitest';
import { testApp } from './helpers.ts';

describe('GET /api/health', () => {
  it('reports status, environment, version and the database check', async () => {
    const res = await testApp().request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ok',
      environment: 'local',
      version: '9.9.9',
      checks: { database: 'ok' },
    });
  });

  it('answers 503 when the database is unavailable', async () => {
    const app = testApp({
      checkDatabase: async () => {
        throw new Error('connection refused');
      },
    });

    const res = await app.request('/api/health');

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: 'degraded',
      environment: 'local',
      version: '9.9.9',
      checks: { database: 'unavailable' },
    });
  });
});

describe('errors', () => {
  it('answer 404 with a pt-BR payload for unknown routes', async () => {
    const res = await testApp().request('/api/nao-existe');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'Rota não encontrada.' },
    });
  });
});

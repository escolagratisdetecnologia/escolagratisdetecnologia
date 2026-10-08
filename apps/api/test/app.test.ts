import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';

const app = createApp({ environment: 'local', version: '9.9.9' });

describe('GET /api/health', () => {
  it('reports status, environment and version', async () => {
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', environment: 'local', version: '9.9.9' });
  });
});

describe('unknown routes', () => {
  it('answer 404 with a pt-BR error payload', async () => {
    const res = await app.request('/api/nao-existe');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'Rota não encontrada.' },
    });
  });
});

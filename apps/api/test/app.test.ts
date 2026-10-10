import { describe, expect, it } from 'vitest';
import { config, SITE, testApp } from './helpers.ts';

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

describe('origin secret (ADR 0022)', () => {
  const app = testApp({ config: { ...config, originVerifySecret: 'segredo-da-borda' } });

  it('refuses requests without the CloudFront secret', async () => {
    for (const secret of [undefined, 'errado', 'segredo-da-bordx']) {
      const headers: Record<string, string> =
        secret === undefined ? {} : { 'x-origin-verify': secret };
      const res = await app.request('/api/health', { headers });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: { code: 'forbidden', message: 'Acesso direto à API não é permitido.' },
      });
    }
  });

  it('lets CloudFront requests through', async () => {
    const res = await app.request('/api/health', {
      headers: { 'x-origin-verify': 'segredo-da-borda' },
    });

    expect(res.status).toBe(200);
  });
});

describe('changes only from the site (CSRF)', () => {
  it('refuses a change without the site Origin, with 400 (never 403)', async () => {
    for (const origin of [undefined, 'https://outro-site.example']) {
      const headers: Record<string, string> = origin === undefined ? {} : { origin };

      const res = await testApp().request('/api/nao-existe', { method: 'POST', headers });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: {
          code: 'invalid_origin',
          message:
            'Não conseguimos confirmar de onde veio o pedido. Recarregue a página e tente de novo.',
        },
      });
    }
  });

  it('lets changes from the site through', async () => {
    const res = await testApp().request('/api/nao-existe', {
      method: 'POST',
      headers: { origin: SITE },
    });

    expect(res.status).toBe(404);
  });

  it('allows reads from anywhere', async () => {
    const res = await testApp().request('/api/health');

    expect(res.status).toBe(200);
  });
});

describe('API answers', () => {
  it('are never cached', async () => {
    for (const path of ['/api/health', '/api/nao-existe']) {
      const res = await testApp().request(path);

      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('refuse bodies above 8 KB with 413, like the WAF', async () => {
    const res = await testApp().request('/api/nao-existe', {
      method: 'POST',
      headers: { origin: SITE, 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(8 * 1024) }),
    });

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: {
        code: 'payload_too_large',
        message: 'O pedido ficou grande demais. Tente enviar menos de uma vez.',
      },
    });
  });
});

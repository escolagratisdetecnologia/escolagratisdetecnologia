import { Hono } from 'hono';
import type { AppConfig } from './config.ts';
import { healthRoutes } from './routes/health.ts';

export function createApp(config: AppConfig) {
  const app = new Hono().basePath('/api');

  app.route('/health', healthRoutes(config));

  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: 'Rota não encontrada.' } }, 404),
  );

  app.onError((err, c) => {
    console.error(
      JSON.stringify({ level: 'error', message: 'unhandled_error', error: err.message }),
    );
    return c.json(
      {
        error: {
          code: 'internal_error',
          message: 'Algo deu errado do nosso lado. Tenta de novo daqui a pouco.',
        },
      },
      500,
    );
  });

  return app;
}

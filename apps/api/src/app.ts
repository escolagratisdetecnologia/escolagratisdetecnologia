import type { Logger } from '@aws-lambda-powertools/logger';
import { Hono } from 'hono';
import type { AppConfig } from './config.ts';
import { apiError } from './errors.ts';
import { healthRoutes } from './routes/health.ts';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  checkDatabase: () => Promise<void>;
}

export function createApp(deps: AppDeps) {
  const app = new Hono().basePath('/api');
  app.route('/health', healthRoutes(deps));
  app.notFound((c) => c.json(apiError('not_found', 'Rota não encontrada.'), 404));
  app.onError((error, c) => {
    deps.logger.error('unhandled_error', { error });
    return c.json(
      apiError('internal_error', 'Algo deu errado do nosso lado. Tenta de novo daqui a pouco.'),
      500,
    );
  });
  return app;
}

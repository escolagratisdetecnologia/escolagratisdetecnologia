import type { Logger } from '@aws-lambda-powertools/logger';
import type { ProgressCatalog } from '@egt/core';
import type { ProfileRepository, ProgressRepository } from '@egt/db';
import { Hono } from 'hono';
import type { AppConfig } from './config.ts';
import { apiError } from './errors.ts';
import type { IdentityProvider } from './identity.ts';
import { authRoutes } from './routes/auth.ts';
import { healthRoutes } from './routes/health.ts';
import { meRoutes } from './routes/me.ts';
import { progressRoutes } from './routes/progress.ts';
import { limitBody, noStore, requireOriginVerify, requireSiteOrigin } from './security.ts';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  progress: ProgressRepository;
  profiles: ProfileRepository;
  /** Courses and lessons the progress may hold (built from content/). */
  catalog: ProgressCatalog;
  checkDatabase: () => Promise<void>;
  identity: IdentityProvider;
  now?: () => Date;
}

export function createApp(deps: AppDeps) {
  const app = new Hono().basePath('/api');
  app.use(requireOriginVerify(deps.config.originVerifySecret));
  app.use(noStore);
  app.use(requireSiteOrigin(deps.config.siteOrigin));
  app.use(limitBody);
  app.route('/health', healthRoutes(deps));
  app.route('/auth', authRoutes(deps));
  app.route('/me', meRoutes(deps));
  app.route('/progress', progressRoutes(deps));
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

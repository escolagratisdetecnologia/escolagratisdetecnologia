import type { Logger } from '@aws-lambda-powertools/logger';
import { Hono } from 'hono';
import type { AppConfig } from '../config.ts';

export interface HealthDeps {
  config: AppConfig;
  logger: Logger;
  checkDatabase: () => Promise<void>;
}

export function healthRoutes({ config, logger, checkDatabase }: HealthDeps) {
  return new Hono().get('/', async (c) => {
    const about = { environment: config.environment, version: config.version };
    try {
      await checkDatabase();
      return c.json({ status: 'ok', ...about, checks: { database: 'ok' } });
    } catch (error) {
      logger.warn('database_check_failed', { error });
      return c.json({ status: 'degraded', ...about, checks: { database: 'unavailable' } }, 503);
    }
  });
}

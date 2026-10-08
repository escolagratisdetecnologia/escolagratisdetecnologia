import { Hono } from 'hono';
import type { AppConfig } from '../config.ts';

export function healthRoutes(config: AppConfig) {
  return new Hono().get('/', (c) =>
    c.json({ status: 'ok', environment: config.environment, version: config.version }),
  );
}

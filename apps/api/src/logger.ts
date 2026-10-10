import { Logger } from '@aws-lambda-powertools/logger';
import type { AppConfig } from './config.ts';

export function createLogger(config: AppConfig): Logger {
  return new Logger({
    serviceName: 'api',
    persistentKeys: { environment: config.environment, version: config.version },
  });
}

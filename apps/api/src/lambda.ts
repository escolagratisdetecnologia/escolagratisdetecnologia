import { checkDatabase, connect } from '@egt/db';
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';

const config = loadConfig();
const logger = createLogger(config);
const db = connect({ table: config.tableName });
const handleRequest = handle(createApp({ config, logger, checkDatabase: () => checkDatabase(db) }));

export const handler: typeof handleRequest = async (event, context) => {
  logger.addContext(context);
  return handleRequest(event, context);
};

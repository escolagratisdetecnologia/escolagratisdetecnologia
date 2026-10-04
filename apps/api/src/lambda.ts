import { handle } from 'hono/aws-lambda';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

export const handler = handle(createApp(loadConfig()));

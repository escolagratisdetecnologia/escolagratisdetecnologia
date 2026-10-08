import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: createApp(loadConfig()).fetch, port }, (info) => {
  console.log(`API local em http://localhost:${info.port}/api/health`);
});

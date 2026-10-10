import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadProgressCatalog } from './catalog.ts';
import { loadConfig } from './config.ts';
import { noAccounts } from './identity.ts';
import { connectLocalStorage } from './local.ts';
import { createLogger } from './logger.ts';

const config = loadConfig();
const port = Number(process.env.PORT ?? 3001);
const catalog = await loadProgressCatalog(
  fileURLToPath(new URL('../../../content', import.meta.url)),
);
const storage = await connectLocalStorage(config);
if (storage.mode === 'memory') {
  console.warn(
    'DynamoDB Local fora do ar: o progresso fica na memória e some ao reiniciar. Para usar o banco, rode pnpm db:up.',
  );
}

const app = createApp({
  config,
  logger: createLogger(config),
  progress: storage.progress,
  profiles: storage.profiles,
  catalog,
  checkDatabase: storage.checkDatabase,
  identity: noAccounts,
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API local em http://localhost:${info.port}/api/health`);
});

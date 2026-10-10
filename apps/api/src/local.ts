import {
  checkDatabase,
  connect,
  createDynamoProgressRepository,
  createMemoryProgressRepository,
  ensureTable,
  type ProgressRepository,
} from '@egt/db';
import type { AppConfig } from './config.ts';

export interface LocalStorage {
  mode: 'dynamodb' | 'memory';
  progress: ProgressRepository;
  checkDatabase: () => Promise<void>;
}

/** DynamoDB Local when it is up (the table is created on the way); otherwise memory. */
export async function connectLocalStorage(config: AppConfig): Promise<LocalStorage> {
  const db = connect({ table: config.tableName, endpoint: config.dynamodbEndpoint });
  try {
    await ensureTable(db);
    return {
      mode: 'dynamodb',
      progress: createDynamoProgressRepository(db),
      checkDatabase: () => checkDatabase(db),
    };
  } catch {
    return {
      mode: 'memory',
      progress: createMemoryProgressRepository(),
      checkDatabase: async () => {},
    };
  }
}

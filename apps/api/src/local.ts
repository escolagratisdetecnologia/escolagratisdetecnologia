import {
  checkDatabase,
  connect,
  createDynamoProfileRepository,
  createDynamoProgressRepository,
  createMemoryProfileRepository,
  createMemoryProgressRepository,
  ensureTable,
  type ProfileRepository,
  type ProgressRepository,
} from '@egt/db';
import type { AppConfig } from './config.ts';
import type { LocalIdentitySettings } from './identity/local.ts';

/**
 * The local server signs anyone in with codes it prints: it must never run against AWS. Called
 * before anything connects (ADR 0024).
 */
export function requireLocal(config: AppConfig): LocalIdentitySettings {
  if (config.environment !== 'local' || config.local === undefined) {
    throw new Error('The local server only runs with APP_ENV=local.');
  }
  const endpoint = config.dynamodbEndpoint;
  if (endpoint !== undefined && !LOOPBACK_HOSTS.has(hostOf(endpoint))) {
    throw new Error('The local server only talks to a DynamoDB on this machine.');
  }
  return config.local;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export interface LocalStorage {
  mode: 'dynamodb' | 'memory';
  progress: ProgressRepository;
  profiles: ProfileRepository;
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
      profiles: createDynamoProfileRepository(db),
      checkDatabase: () => checkDatabase(db),
    };
  } catch {
    return {
      mode: 'memory',
      progress: createMemoryProgressRepository(),
      profiles: createMemoryProfileRepository(),
      checkDatabase: async () => {},
    };
  }
}

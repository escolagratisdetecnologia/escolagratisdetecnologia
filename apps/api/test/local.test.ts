import { connect, deleteTable } from '@egt/db';
import { describe, expect, it } from 'vitest';
import { connectLocalStorage, requireLocal } from '../src/local.ts';
import { config } from './helpers.ts';

const endpoint =
  process.env.DYNAMODB_ENDPOINT ?? (process.env.CI ? 'http://localhost:8000' : undefined);

describe('connectLocalStorage', () => {
  it('falls back to memory when DynamoDB Local is down', async () => {
    const storage = await connectLocalStorage({
      ...config,
      dynamodbEndpoint: 'http://127.0.0.1:9',
    });

    expect(storage.mode).toBe('memory');
    await expect(storage.checkDatabase()).resolves.toBeUndefined();
  });

  it.skipIf(endpoint === undefined)('uses DynamoDB Local and creates the table', async () => {
    const tableName = `egt-test-local-${Date.now()}`;
    const storage = await connectLocalStorage({ ...config, tableName, dynamodbEndpoint: endpoint });

    try {
      expect(storage.mode).toBe('dynamodb');
      await expect(storage.checkDatabase()).resolves.toBeUndefined();
    } finally {
      await deleteTable(connect({ table: tableName, endpoint }));
    }
  });
});

describe('requireLocal', () => {
  it('lets the local server start only with APP_ENV=local', () => {
    const local = {
      mailpitUrl: 'http://localhost:8025',
      googleIssuer: 'http://localhost:8080/google',
    };

    expect(requireLocal({ ...config, local })).toEqual(local);
    expect(() => requireLocal({ ...config, environment: 'dev', local })).toThrow(
      'The local server only runs with APP_ENV=local.',
    );
    expect(() => requireLocal(config)).toThrow('The local server only runs with APP_ENV=local.');
  });

  it('refuses a database that is not on this machine', () => {
    const local = {
      mailpitUrl: 'http://localhost:8025',
      googleIssuer: 'http://localhost:8080/google',
    };
    const at = (dynamodbEndpoint: string) => ({
      ...config,
      environment: 'local' as const,
      local,
      dynamodbEndpoint,
    });

    for (const endpoint of [
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://[::1]:8000',
    ]) {
      expect(requireLocal(at(endpoint))).toEqual(local);
    }
    for (const endpoint of [
      'https://dynamodb.sa-east-1.amazonaws.com',
      'http://10.0.0.5:8000',
      'lixo',
    ]) {
      expect(() => requireLocal(at(endpoint))).toThrow(
        'The local server only talks to a DynamoDB on this machine.',
      );
    }
  });
});

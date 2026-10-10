import { connect, deleteTable } from '@egt/db';
import { describe, expect, it } from 'vitest';
import { connectLocalStorage } from '../src/local.ts';
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

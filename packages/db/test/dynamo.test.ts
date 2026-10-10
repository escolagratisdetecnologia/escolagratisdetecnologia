import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkDatabase,
  connect,
  createDynamoProgressRepository,
  deleteTable,
  ensureTable,
} from '../src/index.ts';
import { describeProgressRepository } from './progress-contract.ts';

// DynamoDB Local: `pnpm db:up` locally (export DYNAMODB_ENDPOINT=http://localhost:8000); the CI
// runs it as a service. Without it, these tests are skipped locally but never in the CI.
const endpoint =
  process.env.DYNAMODB_ENDPOINT ?? (process.env.CI ? 'http://localhost:8000' : undefined);

describe.skipIf(endpoint === undefined)('DynamoDB Local', () => {
  const db = connect({ endpoint, table: `egt-test-${randomUUID()}` });

  beforeAll(async () => {
    await ensureTable(db);
  });

  afterAll(async () => {
    await deleteTable(db);
  });

  it('ensureTable is idempotent', async () => {
    expect(await ensureTable(db)).toBe('exists');
  });

  it('checkDatabase passes for the table and fails without it', async () => {
    await expect(checkDatabase(db)).resolves.toBeUndefined();
    await expect(checkDatabase({ ...db, table: 'egt-test-nao-existe' })).rejects.toThrow();
  });

  describeProgressRepository('dynamodb', () => createDynamoProgressRepository(db));
});

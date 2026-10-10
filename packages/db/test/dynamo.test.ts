import { randomUUID } from 'node:crypto';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkDatabase,
  connect,
  createDynamoProfileRepository,
  createDynamoProgressRepository,
  deleteTable,
  ensureTable,
} from '../src/index.ts';
import { describeProfileRepository } from './profile-contract.ts';
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
  describeProfileRepository('dynamodb', () => createDynamoProfileRepository(db));

  it('keeps a learner profile and progress under the same partition', async () => {
    const sub = `learner-${randomUUID()}`;
    await createDynamoProfileRepository(db).create(sub, {
      birthYear: 2008,
      termsVersion: '2026-10-10',
      termsAcceptedAt: '2026-10-10T12:00:00.000Z',
      createdAt: '2026-10-10T12:00:00.000Z',
    });
    await createDynamoProgressRepository(db).merge(
      sub,
      { site: { completedLessons: ['a'], correctAnswers: [], updatedAt: '2026-10-10T12:00:00Z' } },
      new Date('2026-10-10T12:00:00.000Z'),
    );

    const { Items } = await db.document.send(
      new QueryCommand({
        TableName: db.table,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `USER#${sub}` },
      }),
    );

    expect(Items?.map((item) => item.SK).sort()).toEqual(['COURSE#site', 'PROFILE']);
  });
});

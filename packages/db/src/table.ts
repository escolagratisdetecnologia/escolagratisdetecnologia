import {
  CreateTableCommand,
  DeleteTableCommand,
  ResourceInUseException,
  type CreateTableCommandInput,
} from '@aws-sdk/client-dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { Database } from './client.ts';

/** Single table (ADR 0006). Keep in sync with infra/modules/data/main.tf. */
export function tableDefinition(table: string): CreateTableCommandInput {
  return {
    TableName: table,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  };
}

/** Creates the table when missing. Local use only: in AWS the table comes from Terraform. */
export async function ensureTable(db: Database): Promise<'created' | 'exists'> {
  try {
    await db.raw.send(new CreateTableCommand(tableDefinition(db.table)));
    return 'created';
  } catch (error) {
    if (error instanceof ResourceInUseException) return 'exists';
    throw error;
  }
}

/** Local and tests only. */
export async function deleteTable(db: Database): Promise<void> {
  await db.raw.send(new DeleteTableCommand({ TableName: db.table }));
}

/** Throws when the table cannot be read (used by /api/health). */
export async function checkDatabase(db: Database): Promise<void> {
  await db.document.send(
    new GetCommand({ TableName: db.table, Key: { PK: 'HEALTH', SK: 'HEALTH' } }),
  );
}

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface Database {
  /** Low-level client, for table operations. */
  raw: DynamoDBClient;
  /** Document client, used by the ElectroDB entities. */
  document: DynamoDBDocumentClient;
  /** Table name: egt-<env>-data-main. */
  table: string;
}

export interface ConnectOptions {
  table: string;
  /** DynamoDB Local URL (http://localhost:8000). Omit it to use AWS with the default credentials. */
  endpoint?: string;
}

export function connect({ table, endpoint }: ConnectOptions): Database {
  const raw = endpoint
    ? new DynamoDBClient({
        endpoint,
        region: 'sa-east-1',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      })
    : new DynamoDBClient({});
  return { raw, document: DynamoDBDocumentClient.from(raw), table };
}

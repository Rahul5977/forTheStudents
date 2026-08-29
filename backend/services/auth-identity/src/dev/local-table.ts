// DEV-ONLY. Creates the Users table in DynamoDB Local so the dev server works on
// first run. Mirrors infra/lib/data-stack.ts. Never imported by the Lambda bundle.
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'ap-south-1',
  endpoint: process.env.DDB_ENDPOINT ?? 'http://localhost:8000',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const TABLE = process.env.TABLE_USERS ?? 'sc-dev-users';
const AUDIT = process.env.TABLE_AUDIT ?? 'sc-dev-audit';

export async function ensureUsersTable(): Promise<void> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'email', AttributeType: 'S' },
          { AttributeName: 'phone', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [
          { IndexName: 'gsi1-email', KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }], Projection: { ProjectionType: 'KEYS_ONLY' } },
          { IndexName: 'gsi2-phone', KeySchema: [{ AttributeName: 'phone', KeyType: 'HASH' }], Projection: { ProjectionType: 'KEYS_ONLY' } },
        ],
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name !== 'ResourceInUseException') throw err;
  }
  await client.send(new DescribeTableCommand({ TableName: TABLE }));
}

/** Phase 11: auth-identity writes superadmin/admin promotions to the append-only audit trail. */
export async function ensureAuditTable(): Promise<void> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: AUDIT,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name !== 'ResourceInUseException') throw err;
  }
  await client.send(new DescribeTableCommand({ TableName: AUDIT }));
}

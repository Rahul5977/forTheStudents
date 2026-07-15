// DEV-ONLY: create the Audit table (+ the Mentors table this service moderates) in
// DynamoDB Local. Mirrors infra/lib/data-stack.ts so local behaviour matches prod.
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'ap-south-1',
  endpoint: process.env.DDB_ENDPOINT ?? 'http://localhost:8000',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const AUDIT = process.env.TABLE_AUDIT ?? 'sc-dev-audit';
const MENTORS = process.env.TABLE_MENTORS ?? 'sc-dev-mentors';

async function create(cmd: CreateTableCommand, table: string): Promise<void> {
  try {
    await client.send(cmd);
  } catch (err) {
    if ((err as { name?: string }).name !== 'ResourceInUseException') throw err;
  }
  await client.send(new DescribeTableCommand({ TableName: table }));
}

/** Append-only audit table: PK=ADMIN#<id> SK=ACT#<ts>. No GSI (per-admin queries only). */
export async function ensureAuditTable(): Promise<void> {
  await create(
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
    AUDIT,
  );
}

/** Mentors table (owned by marketplace) — needed here for moderation + status counts. */
export async function ensureMentorsTable(): Promise<void> {
  await create(
    new CreateTableCommand({
      TableName: MENTORS,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'gsi1pk', AttributeType: 'S' },
        { AttributeName: 'gsi1sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'gsi1-status',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    }),
    MENTORS,
  );
}

export async function ensureAdminTables(): Promise<void> {
  await ensureAuditTable();
  await ensureMentorsTable();
}

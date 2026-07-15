// DEV-ONLY: create the Planner table in DynamoDB Local (mirrors data-stack.ts).
// The doctor endpoint additionally reads the Catalog table — seed that with
// `pnpm --filter @sc/catalog seed` before exercising /choice-list/doctor.
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'ap-south-1',
  endpoint: process.env.DDB_ENDPOINT ?? 'http://localhost:8000',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const TABLE = process.env.TABLE_PLANNER ?? 'sc-dev-planner';

export async function ensurePlannerTable(): Promise<void> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE,
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
  await client.send(new DescribeTableCommand({ TableName: TABLE }));
}

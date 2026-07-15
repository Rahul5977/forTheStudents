// DEV-ONLY: create the Bookings table (+ gsi1-student, gsi2-mentor) in DynamoDB
// Local. Mirrors infra/lib/data-stack.ts.
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'ap-south-1',
  endpoint: process.env.DDB_ENDPOINT ?? 'http://localhost:8000',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const TABLE = process.env.TABLE_BOOKINGS ?? 'sc-dev-bookings';

export async function ensureBookingsTable(): Promise<void> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'gsi1pk', AttributeType: 'S' },
          { AttributeName: 'gsi1sk', AttributeType: 'S' },
          { AttributeName: 'gsi2pk', AttributeType: 'S' },
          { AttributeName: 'gsi2sk', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'gsi1-student',
            KeySchema: [{ AttributeName: 'gsi1pk', KeyType: 'HASH' }, { AttributeName: 'gsi1sk', KeyType: 'RANGE' }],
            Projection: { ProjectionType: 'ALL' },
          },
          {
            IndexName: 'gsi2-mentor',
            KeySchema: [{ AttributeName: 'gsi2pk', KeyType: 'HASH' }, { AttributeName: 'gsi2sk', KeyType: 'RANGE' }],
            Projection: { ProjectionType: 'ALL' },
          },
        ],
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name !== 'ResourceInUseException') throw err;
  }
  await client.send(new DescribeTableCommand({ TableName: TABLE }));
}

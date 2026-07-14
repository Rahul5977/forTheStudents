// Test-only helpers for local integration tests against DynamoDB Local.
// None of this ships to AWS — it recreates, on your laptop, the two things the
// cloud gives us for free: (1) the Users table, (2) a verified JWT's claims.
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import type { LambdaBindings } from '@sc/shared';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'ap-south-1',
  endpoint: process.env.DDB_ENDPOINT ?? 'http://localhost:8000',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' }, // DynamoDB Local ignores these
});

const TABLE = process.env.TABLE_USERS ?? 'sc-dev-users';

/**
 * Create the Users table in DynamoDB Local if it isn't there yet.
 * Mirrors infra/lib/data-stack.ts (PK/SK + sparse email/phone GSIs) so local
 * behaviour matches prod. Idempotent — safe to call before every test run.
 */
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
          {
            IndexName: 'gsi1-email',
            KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'KEYS_ONLY' },
          },
          {
            IndexName: 'gsi2-phone',
            KeySchema: [{ AttributeName: 'phone', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'KEYS_ONLY' },
          },
        ],
      }),
    );
  } catch (err) {
    // Table already exists from a previous run — fine.
    if ((err as { name?: string }).name !== 'ResourceInUseException') throw err;
  }
  // Local tables go ACTIVE effectively instantly; this confirms it's reachable.
  await client.send(new DescribeTableCommand({ TableName: TABLE }));
}

/**
 * Fake the Lambda bindings that hono/aws-lambda would populate in production.
 * In the cloud, API Gateway verifies the Cognito JWT and drops the *verified*
 * claims at event.requestContext.authorizer.jwt.claims — our code trusts them
 * and never re-verifies. Here we hand-write those claims so getPrincipal(c) can
 * read them. Pass this as the 3rd arg to app.request(path, init, bindings).
 *
 * @param claims  e.g. { sub, email, phone_number, 'custom:role' }
 */
export function authAs(claims: Record<string, unknown>): LambdaBindings {
  return {
    event: {
      requestContext: {
        requestId: 'local-test',
        authorizer: { jwt: { claims } },
      },
    },
    lambdaContext: {},
  } as unknown as LambdaBindings;
}

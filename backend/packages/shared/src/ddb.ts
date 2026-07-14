// DynamoDB Document client shared by all repos.
// Uses lib-dynamodb marshalling. Honours DDB_ENDPOINT for local dev (DynamoDB Local).
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const endpoint = process.env.DDB_ENDPOINT || undefined;

const base = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'ap-south-1',
  ...(endpoint ? { endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } } : {}),
});

export const ddb = DynamoDBDocumentClient.from(base, {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
});

/** Key builders — keep key shapes in ONE place so every repo agrees. */
export const key = {
  user: (userId: string) => ({ PK: `USER#${userId}`, SK: 'PROFILE' as const }),
};

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
  // Planner (Phase 3): two per-user singleton rows under the same partition.
  shortlist: (userId: string) => ({ PK: `USER#${userId}`, SK: 'SHORTLIST' as const }),
  choiceList: (userId: string) => ({ PK: `USER#${userId}`, SK: 'CHOICELIST' as const }),
  // Marketplace (Phase 4): mentor rows share a MENTOR#<userId> partition.
  mentor: (userId: string) => ({ PK: `MENTOR#${userId}`, SK: 'PROFILE' as const }),
  mentorAvailability: (userId: string) => ({ PK: `MENTOR#${userId}`, SK: 'AVAILABILITY' as const }),
  mentorEmailOtp: (userId: string) => ({ PK: `MENTOR#${userId}`, SK: 'EMAILOTP' as const }),
  // Phase 11: per-EMAIL OTP send counter (TTL) — a second rate limit next to the per-user one.
  mentorEmailRate: (email: string) => ({ PK: `EMAILRL#${email.toLowerCase()}`, SK: 'RL' as const }),
  // Booking (Phase 5).
  booking: (id: string) => ({ PK: `BOOKING#${id}`, SK: 'META' as const }),
  slotHold: (mentorId: string, slotId: string) => ({ PK: `SLOT#${mentorId}#${slotId}`, SK: 'HOLD' as const }),
  idempotency: (userId: string, k: string) => ({ PK: `IDEMP#${userId}#${k}`, SK: 'META' as const }),
  // Razorpay order → booking mapping (so a signed webhook can find its booking).
  razorpayOrder: (orderId: string) => ({ PK: `RZPORDER#${orderId}`, SK: 'META' as const }),
  // Notifications (Phase 6).
  notification: (userId: string, ts: string) => ({ PK: `USER#${userId}`, SK: `NOTIF#${ts}` }),
  notificationPrefs: (userId: string) => ({ PK: `USER#${userId}`, SK: 'PREFS' as const }),
  // Admin audit (Phase 7): append-only action trail. ts should be time-sortable (`${iso}#${ulid}`).
  audit: (adminId: string, ts: string) => ({ PK: `ADMIN#${adminId}`, SK: `ACT#${ts}` }),
};

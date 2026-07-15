// READ-ONLY view of the Mentors table — the booking saga needs the mentor's
// approved status + price, and the requested availability slot's time. Booking
// never writes here; it gets a read-only grant on the mentors table.
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, key } from '@sc/shared';
import { getEnv } from '@sc/config';

const TABLE = () => getEnv().TABLE_MENTORS;

export interface MentorLite {
  userId: string;
  name: string;
  status: string;
  priceINR: number;
}
export interface Slot { id: string; startsAt: string; durationMin: number; open: boolean }

export async function getMentor(userId: string): Promise<MentorLite | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.mentor(userId) }));
  if (!res.Item) return null;
  return { userId: res.Item.userId, name: res.Item.name, status: res.Item.status, priceINR: res.Item.priceINR };
}

export async function getSlot(mentorId: string, slotId: string): Promise<Slot | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.mentorAvailability(mentorId) }));
  const slots = (res.Item?.slots as Slot[] | undefined) ?? [];
  return slots.find((s) => s.id === slotId) ?? null;
}

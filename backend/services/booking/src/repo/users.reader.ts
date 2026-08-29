// READ-ONLY view of the Users table (owned by auth-identity). Phase 11: a mentor preparing
// for a BOOKED session sees the student's first name + the counselling inputs (rank,
// category, home state, target branches). Booking never writes here — it gets a read-only
// grant on the users table in infra. Missing table/row → null (never fails a booking).
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, key, createLogger } from '@sc/shared';
import { getEnv } from '@sc/config';

const logger = createLogger('booking.users');
const TABLE = () => getEnv().TABLE_USERS;

export interface StudentPrep {
  firstName?: string;
  advRank?: number;
  mainRank?: number;
  category?: string;
  home?: string;
  gender?: string;
  pwd?: boolean;
  branches?: string[];
  priority?: string;
}

/** `firstName` only — a mentor never needs (or gets) the student's full name, email or phone. */
export const firstNameOf = (name: unknown): string | undefined =>
  typeof name === 'string' && name.trim() ? name.trim().split(/\s+/)[0] : undefined;

export async function getStudentPrep(userId: string): Promise<StudentPrep | null> {
  try {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.user(userId) }));
    if (!res.Item) return null;
    const rp = (res.Item.rankPrefs ?? {}) as Record<string, unknown>;
    return {
      firstName: firstNameOf(res.Item.name),
      advRank: rp.advRank as number | undefined,
      mainRank: rp.mainRank as number | undefined,
      category: rp.category as string | undefined,
      home: rp.home as string | undefined,
      gender: rp.gender as string | undefined,
      pwd: rp.pwd as boolean | undefined,
      branches: rp.branches as string[] | undefined,
      priority: rp.priority as string | undefined,
    };
  } catch (err) {
    logger.warn('users read failed (best-effort)', { err: (err as Error).message });
    return null;
  }
}

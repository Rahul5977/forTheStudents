// Integration test: event fanout (consumer path) → in-app feed API → DynamoDB Local.
import { beforeAll, describe, expect, it } from 'vitest';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '@sc/shared';
import { app } from '../src/app';
import { ingest, fanout } from '../src/domain/notifications';
import { ensureNotificationsTable } from '../src/dev/local-table';
import { notificationsRepo } from '../src/repo/notifications.repo';

const TABLE = process.env.TABLE_NOTIFICATIONS!;
const authAs = (sub: string) =>
  ({ event: { requestContext: { authorizer: { jwt: { claims: { sub, 'custom:role': 'student' } } } } } }) as unknown as Parameters<typeof app.request>[2];

async function clear(userId: string) {
  const items = await notificationsRepo.list(userId, 200);
  for (const n of items) await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: `NOTIF#${n.id}` } }));
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: 'PREFS' } }));
}

beforeAll(async () => {
  await ensureNotificationsTable();
  await Promise.all(['stu1', 'men1', 'noprefs1'].map(clear));
});

describe('notifications (local DynamoDB)', () => {
  it('fanout maps booking.confirmed → student + mentor', () => {
    const f = fanout('booking.confirmed', { studentId: 'stu1', mentorId: 'men1', meetingUrl: 'https://meet.google.com/x' });
    expect(f).toHaveLength(2);
    expect(f.map((x) => x.userId).sort()).toEqual(['men1', 'stu1']);
    expect(f.find((x) => x.userId === 'stu1')?.link).toContain('meet.google.com');
  });

  it('ignores unmapped events', () => {
    expect(fanout('some.random.event', {})).toHaveLength(0);
  });

  it('ingest writes to each user feed; GET /notifications shows it', async () => {
    await ingest('booking.confirmed', { studentId: 'stu1', mentorId: 'men1', meetingUrl: 'https://meet.google.com/abc' });
    const feed = await (await app.request('/notifications', {}, authAs('stu1'))).json();
    expect(feed.unread).toBe(1);
    expect(feed.notifications[0].title).toContain('Session confirmed');
    expect(feed.notifications[0].link).toContain('meet.google.com');
  });

  it('mark one read drops the unread count', async () => {
    const before = await (await app.request('/notifications', {}, authAs('men1'))).json();
    expect(before.unread).toBe(1);
    await app.request(`/notifications/${before.notifications[0].id}/read`, { method: 'POST' }, authAs('men1'));
    const after = await (await app.request('/notifications', {}, authAs('men1'))).json();
    expect(after.unread).toBe(0);
  });

  it('prefs: turning off in-app suppresses the feed write', async () => {
    await app.request('/notifications/prefs', { method: 'PUT', body: JSON.stringify({ inApp: false, email: false, push: false, whatsapp: false }) }, authAs('noprefs1'));
    await ingest('mentor.approved', { userId: 'noprefs1' });
    const feed = await (await app.request('/notifications', {}, authAs('noprefs1'))).json();
    expect(feed.notifications).toHaveLength(0); // suppressed
  });

  it('read-all clears everything', async () => {
    await ingest('mentor.approved', { userId: 'stu1' });
    await ingest('session.rated', { mentorId: 'stu1', rating: 5 });
    const r = await (await app.request('/notifications/read-all', { method: 'POST' }, authAs('stu1'))).json();
    expect(r.marked).toBeGreaterThanOrEqual(2);
    const feed = await (await app.request('/notifications', {}, authAs('stu1'))).json();
    expect(feed.unread).toBe(0);
  });
});

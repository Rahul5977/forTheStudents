// Data access for the Notifications table.
//   PK=USER#<id> SK=NOTIF#<ulid>  a feed item (ulid sorts newest-last → query desc)
//   PK=USER#<id> SK=PREFS         per-user channel prefs
import { PutCommand, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, key, newId } from '@sc/shared';
import { getEnv } from '@sc/config';

const TABLE = () => getEnv().TABLE_NOTIFICATIONS;
// Feed items self-expire after ~90 days to keep the table (and cost) bounded.
const TTL_DAYS = 90;

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface Prefs {
  inApp: boolean;
  email: boolean;
  push: boolean;
  whatsapp: boolean;
}
const DEFAULT_PREFS: Prefs = { inApp: true, email: false, push: false, whatsapp: false };

export const notificationsRepo = {
  async add(userId: string, n: { type: string; title: string; body: string; link?: string; now: string }): Promise<Notification> {
    const id = newId();
    const item: Notification = { id, type: n.type, title: n.title, body: n.body, link: n.link, read: false, createdAt: n.now };
    await ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { ...key.notification(userId, id), ...item, ttl: Math.floor(Date.parse(n.now) / 1000) + TTL_DAYS * 86400 },
    }));
    return item;
  },

  async list(userId: string, limit = 50): Promise<Notification[]> {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'NOTIF#' },
      ScanIndexForward: false, // ulid ascending by time → false = newest first
      Limit: limit,
    }));
    return (res.Items ?? []).map(({ PK, SK, ttl, ...rest }) => rest as Notification);
  },

  async markRead(userId: string, id: string): Promise<void> {
    await ddb.send(new UpdateCommand({
      TableName: TABLE(),
      Key: key.notification(userId, id),
      UpdateExpression: 'SET #r = :t',
      ExpressionAttributeNames: { '#r': 'read' },
      ExpressionAttributeValues: { ':t': true },
      ConditionExpression: 'attribute_exists(PK)',
    }));
  },

  async markAllRead(userId: string): Promise<number> {
    const unread = (await this.list(userId, 200)).filter((n) => !n.read);
    await Promise.all(unread.map((n) => this.markRead(userId, n.id).catch(() => {})));
    return unread.length;
  },

  async getPrefs(userId: string): Promise<Prefs> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.notificationPrefs(userId) }));
    return { ...DEFAULT_PREFS, ...(res.Item?.prefs as Partial<Prefs> | undefined) };
  },

  async putPrefs(userId: string, prefs: Prefs): Promise<Prefs> {
    await ddb.send(new PutCommand({ TableName: TABLE(), Item: { ...key.notificationPrefs(userId), prefs } }));
    return prefs;
  },
};

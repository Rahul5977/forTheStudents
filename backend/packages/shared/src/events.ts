// Domain event publishing to EventBridge. Services emit facts ("user.bootstrapped",
// "booking.confirmed"); consumers (notifications, analytics) react later — this keeps
// services decoupled (see architecture.md §5.8).
//
// Local dev (DynamoDB Local) skips publishing so tests stay fast and offline.
// Publishing NEVER throws into the caller: an event bus hiccup must not fail a request.
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { getEnv, isLocal } from '@sc/config';
import { createLogger } from './logger';

const logger = createLogger('events');
let client: EventBridgeClient | null = null;
const getClient = () => (client ??= new EventBridgeClient({ region: process.env.AWS_REGION ?? 'ap-south-1' }));

export interface DomainEvent<T = unknown> {
  /** dot.namespaced fact, e.g. "user.bootstrapped" */
  type: string;
  /** the emitting service, e.g. "auth-identity" */
  source: string;
  detail: T;
}

/**
 * Fire-and-forget a domain event. Safe to `await` — resolves even on failure.
 * @param evt { type, source, detail }
 */
export async function publish<T>(evt: DomainEvent<T>): Promise<void> {
  if (isLocal()) {
    logger.debug('event (local, not sent)', { type: evt.type });
    return;
  }
  try {
    await getClient().send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: getEnv().EVENT_BUS_NAME,
            Source: `sc.${evt.source}`,
            DetailType: evt.type,
            Detail: JSON.stringify(evt.detail),
          },
        ],
      }),
    );
  } catch (err) {
    // Do not break the request path on an eventing failure.
    logger.warn('event publish failed', { type: evt.type, err: (err as Error).message });
  }
}

// SQS consumer Lambda: EventBridge (domain events) → SQS → here → in-app feed.
// SQS buffers spikes; failed records go to the DLQ (configured in infra) for replay.
// Each SQS record body is the EventBridge envelope: { 'detail-type', source, detail }.
import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { createLogger } from '@sc/shared';
import { ingest } from './domain/notifications';

const logger = createLogger('notifications-consumer');

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    try {
      const envelope = JSON.parse(record.body) as { 'detail-type'?: string; detail?: Record<string, unknown> };
      const type = envelope['detail-type'];
      if (!type) continue;
      const n = await ingest(type, envelope.detail ?? {});
      logger.info('ingested event', { type, notifications: n });
    } catch (err) {
      // Report just this record as failed → SQS redrives only it (partial batch response).
      logger.error('failed to process record', { messageId: record.messageId, err: String(err) });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}

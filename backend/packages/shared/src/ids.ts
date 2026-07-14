// Sortable, collision-resistant ids (ULID) for entities and idempotency keys.
import { ulid } from 'ulid';

export const newId = (prefix?: string): string => (prefix ? `${prefix}_${ulid()}` : ulid());
export { ulid };

// The append-only audit trail now lives in @sc/shared (Phase 11: auth-identity and
// marketplace write to it too). Re-exported here so existing imports keep working.
export { auditRepo, type AuditEntry } from '@sc/shared';

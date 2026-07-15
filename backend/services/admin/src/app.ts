// Route table for the admin-ops lambdalith (Phase 7). EVERY route is role=admin
// (enforced in the domain via requireRole(p,'admin')) and sits behind the Cognito
// authorizer in infra. Every mutating action appends to the append-only audit trail.
import { createApp } from '@sc/shared';
import { stats, audit, suspend, reinstate, broadcast } from './handlers/admin';

export const app = createApp('admin');

// Read: cheap platform metrics + audit trail.
app.get('/admin/stats', stats);
app.get('/admin/audit', audit);

// Moderation: guarded mentor status flips (drop from / restore to public search).
app.post('/admin/mentors/:id/suspend', suspend);
app.post('/admin/mentors/:id/reinstate', reinstate);

// Broadcast: publish an 'admin.broadcast' event → notifications fanout.
app.post('/admin/broadcast', broadcast);

// Route table for the auth-identity lambdalith.
import { createApp } from '@sc/shared';
import { bootstrap } from './handlers/bootstrap';
import { getMe, patchMe, patchRankPrefs, postRole } from './handlers/me';
import { listUsers as adminListUsers, listAdmins, createAdmin, updateAdmin, demoteAdmin } from './handlers/admin';

export const app = createApp('auth-identity');

app.post('/auth/bootstrap', bootstrap);
app.get('/me', getMe);
app.patch('/me', patchMe);
app.patch('/me/rank-prefs', patchRankPrefs);
app.post('/me/role', postRole);

// Admin directory (role=admin, enforced in the domain).
app.get('/admin/users', adminListUsers);

// Superadmin-only: manage the admin team + distribute permission scopes.
app.get('/admin/admins', listAdmins);
app.post('/admin/admins', createAdmin);
app.patch('/admin/admins/:id', updateAdmin);
app.post('/admin/admins/:id/demote', demoteAdmin);

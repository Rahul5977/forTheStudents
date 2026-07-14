// Route table for the auth-identity lambdalith.
import { createApp } from '@sc/shared';
import { bootstrap } from './handlers/bootstrap';
import { getMe, patchMe, patchRankPrefs, postRole } from './handlers/me';

export const app = createApp('auth-identity');

app.post('/auth/bootstrap', bootstrap);
app.get('/me', getMe);
app.patch('/me', patchMe);
app.patch('/me/rank-prefs', patchRankPrefs);
app.post('/me/role', postRole);

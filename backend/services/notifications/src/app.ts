// Route table for the notifications feed API (Phase 6). All authed (per-user).
import { createApp } from '@sc/shared';
import { feed, markRead, markAllRead, getPrefs, putPrefs } from './handlers/feed';

export const app = createApp('notifications');

app.get('/notifications', feed);
app.post('/notifications/read-all', markAllRead);
app.post('/notifications/:id/read', markRead);
app.get('/notifications/prefs', getPrefs);
app.put('/notifications/prefs', putPrefs);

// Route table for the booking-sessions lambdalith (Phase 5).
// - /bookings/*, /sessions/* : authed (participants act on their own sessions)
// - POST /payments/webhook   : PUBLIC (provider callback; signature-verified in the handler)
import { createApp } from '@sc/shared';
import { create, cancel, getOne, accept, decline, adminBookings, adminMentorBookings } from './handlers/bookings';
import { list, join, end, rate } from './handlers/sessions';
import { webhook } from './handlers/payments';

export const app = createApp('booking');

app.post('/bookings', create);
app.get('/bookings/:id', getOne);
app.post('/bookings/:id/cancel', cancel);
app.post('/bookings/:id/accept', accept);   // mentor accepts a request
app.post('/bookings/:id/decline', decline); // mentor declines a request

// Admin visibility (role=admin, enforced in the domain).
app.get('/admin/bookings', adminBookings);
app.get('/admin/mentors/:id/bookings', adminMentorBookings);

app.get('/sessions', list);
app.post('/sessions/:id/join', join);
app.post('/sessions/:id/end', end);
app.post('/sessions/:id/rate', rate);

app.post('/payments/webhook', webhook); // public (wired without authorizer in infra)

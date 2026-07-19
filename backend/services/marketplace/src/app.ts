// Route table for the marketplace-mentors lambdalith (Phase 4).
// - /mentor/*   : mentor self-service (behind the Cognito authorizer)
// - /admin/*    : admin verification queue (authorizer + role=admin, enforced in domain)
// - GET /mentors: PUBLIC search (no authorizer — wired that way in infra)
import { createApp } from '@sc/shared';
import { apply, verifyEmail, verifyId, getProfile, putProfile, getAvailability, putAvailability } from './handlers/mentor';
import { listPending, review, scheduleInterview } from './handlers/admin';
import { listMentors, mentorSlots } from './handlers/browse';

export const app = createApp('marketplace');

// Mentor self-service.
app.post('/mentor/apply', apply);
app.post('/mentor/verify/email', verifyEmail);
app.post('/mentor/verify/id', verifyId);
app.get('/mentor/profile', getProfile);
app.put('/mentor/profile', putProfile);
app.get('/mentor/availability', getAvailability);
app.put('/mentor/availability', putAvailability);

// Admin verification queue.
app.get('/admin/mentors/pending', listPending);
app.post('/admin/mentors/:id/review', review);
app.post('/admin/mentors/:id/interview', scheduleInterview);

// Public search.
app.get('/mentors', listMentors);
app.get('/mentors/:id/slots', mentorSlots);

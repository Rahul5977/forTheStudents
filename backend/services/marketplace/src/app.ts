// Route table for the marketplace-mentors lambdalith (Phase 4 + Phase 11).
// - /mentor/*   : mentor self-service (behind the Cognito authorizer)
// - /admin/*    : verification console (authorizer + role/scope enforced in the domain)
// - GET /mentors: PUBLIC search (no authorizer — wired that way in infra)
import { createApp } from '@sc/shared';
import { apply, verifyEmail, presignDocument, confirmDocument, submit, getProfile, putProfile, getAvailability, putAvailability } from './handlers/mentor';
import { queue, counts, listPending, getApplication, documentUrl, setField, verifyDocs, review, scheduleInterview, rescheduleInterview, cancelInterview } from './handlers/admin';
import { listMentors, mentorSlots } from './handlers/browse';

export const app = createApp('marketplace');

// Mentor self-service: apply → verify email → upload documents → submit.
app.post('/mentor/apply', apply);
app.post('/mentor/verify/email', verifyEmail);
app.post('/mentor/documents/presign', presignDocument);
app.post('/mentor/documents/confirm', confirmDocument);
app.post('/mentor/submit', submit);
app.get('/mentor/profile', getProfile);
app.put('/mentor/profile', putProfile);
app.get('/mentor/availability', getAvailability);
app.put('/mentor/availability', putAvailability);

// Admin verification console (static paths BEFORE the :id routes).
app.get('/admin/mentors/counts', counts);
app.get('/admin/mentors/pending', listPending); // legacy — one release
app.get('/admin/mentors', queue);
app.get('/admin/mentors/:id', getApplication);
app.get('/admin/mentors/:id/documents/:docType/url', documentUrl);
app.post('/admin/mentors/:id/fields/:field', setField);
app.post('/admin/mentors/:id/verify-docs', verifyDocs);
app.post('/admin/mentors/:id/review', review);
app.post('/admin/mentors/:id/interview', scheduleInterview);
app.patch('/admin/mentors/:id/interview', rescheduleInterview);
app.delete('/admin/mentors/:id/interview', cancelInterview);

// Public search.
app.get('/mentors', listMentors);
app.get('/mentors/:id/slots', mentorSlots);

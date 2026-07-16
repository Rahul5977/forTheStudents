// Route table for the catalog lambdalith (Phase 2). All routes public.
import { createApp } from '@sc/shared';
import { predict, predictSummary } from './handlers/predict';
import { listColleges, getCollege, getCollegeProfile } from './handlers/colleges';

export const app = createApp('catalog');

app.get('/predict', predict);
app.get('/predict/summary', predictSummary);
app.get('/colleges', listColleges);
// More specific route first: /colleges/:id/profile (canonical slug) vs /colleges/:id (row id).
app.get('/colleges/:id/profile', getCollegeProfile);
app.get('/colleges/:id', getCollege);

// Route table for the catalog lambdalith (Phase 2). All routes public.
import { createApp } from '@sc/shared';
import { predict, predictSummary } from './handlers/predict';
import { listColleges, getCollege, getCollegeProfile, compareColleges } from './handlers/colleges';

export const app = createApp('catalog');

app.get('/predict', predict);
app.get('/predict/summary', predictSummary);
app.get('/colleges', listColleges);
// Static /colleges/compare MUST come before /colleges/:id, else 'compare' is parsed as a
// row id and 400s on the integer validator.
app.get('/colleges/compare', compareColleges);
// More specific route first: /colleges/:id/profile (canonical slug) vs /colleges/:id (row id).
app.get('/colleges/:id/profile', getCollegeProfile);
app.get('/colleges/:id', getCollege);

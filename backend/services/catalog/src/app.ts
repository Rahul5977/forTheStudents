// Route table for the catalog lambdalith (Phase 2). All routes public.
import { createApp } from '@sc/shared';
import { predict, predictSummary } from './handlers/predict';
import { listColleges, getCollege } from './handlers/colleges';

export const app = createApp('catalog');

app.get('/predict', predict);
app.get('/predict/summary', predictSummary);
app.get('/colleges', listColleges);
app.get('/colleges/:id', getCollege);

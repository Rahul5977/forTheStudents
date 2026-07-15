// Route table for the planner lambdalith (Phase 3). All routes are per-user and
// run behind the Cognito JWT authorizer (wired in infra/lib/planner-service-stack).
import { createApp } from '@sc/shared';
import { getShortlist, putShortlist } from './handlers/shortlist';
import { getChoiceList, putChoiceList, reorder, doctor } from './handlers/choicelist';
import { exportChoiceList } from './handlers/export';

export const app = createApp('planner');

app.get('/shortlist', getShortlist);
app.put('/shortlist', putShortlist);

app.get('/choice-list', getChoiceList);
app.put('/choice-list', putChoiceList);
app.post('/choice-list/reorder', reorder);
app.get('/choice-list/doctor', doctor);
app.post('/choice-list/export', exportChoiceList);

// Lambda entrypoint. Adapts the Hono app to API Gateway (HTTP API) events.
import { handle } from 'hono/aws-lambda';
import { app } from './app';

export const handler = handle(app);

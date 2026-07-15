// Lambda entrypoint for the feed API — adapts Hono to API Gateway (HTTP API).
import { handle } from 'hono/aws-lambda';
import { app } from './app';

export const handler = handle(app);

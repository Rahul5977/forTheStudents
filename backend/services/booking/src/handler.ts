// Lambda entrypoint — adapts the Hono app to API Gateway (HTTP API).
import { handle } from 'hono/aws-lambda';
import { app } from './app';

export const handler = handle(app);

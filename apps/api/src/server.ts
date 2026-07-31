import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number.parseInt(process.env.LLM_CHESS_PORT ?? '8787', 10);
serve({ fetch: app.fetch, port });

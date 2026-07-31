import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { apiSuccessSchema } from '@llm-chess/shared';
import { z } from 'zod';

export const app = new Hono();

app.use('/api/*', cors({ origin: ['https://steamaa1.github.io'], allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'], maxAge: 86400 }));

app.get('/api/health', (context) => {
  const body = apiSuccessSchema({ service: z.string(), status: z.literal('ok') }).parse({
    ok: true,
    data: { service: 'llm-chess-api', status: 'ok' }
  });
  return context.json(body);
});

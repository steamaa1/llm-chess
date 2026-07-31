import { Hono } from 'hono';
import { apiSuccessSchema } from '@llm-chess/shared';
import { z } from 'zod';

export const app = new Hono();
app.get('/api/health', (context) => {
  const body = apiSuccessSchema({ service: z.string(), status: z.literal('ok') }).parse({
    ok: true,
    data: { service: 'llm-chess-api', status: 'ok' }
  });
  return context.json(body);
});

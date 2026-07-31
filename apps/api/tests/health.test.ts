import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { apiSuccessSchema } from '@llm-chess/shared';
import { z } from 'zod';

describe('GET /api/health', () => {
  it('returns the shared success envelope', async () => {
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
    expect(apiSuccessSchema({ service: z.string(), status: z.literal('ok') }).parse(await response.json())).toMatchObject({ ok: true });
  });
});

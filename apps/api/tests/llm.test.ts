import { describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';

describe('POST /api/llm/move', () => {
  it('rejects a request when the replayed side is not the requested side', async () => {
    const response = await app.request('/api/llm/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test-key' }, side: 'black', moves: [], gameSeed: 'test-seed' })
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'INVALID_GAME_STATE' } });
  });

  it('accepts a model move only when it selects a legal moveId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ moveId: 'red-pawn-0:06-05', commentary: '推进边兵，保持阵型完整。' }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const response = await app.request('/api/llm/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test-key' }, side: 'red', moves: [], gameSeed: 'test-seed' })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { move: { notation: expect.any(String) }, commentary: '推进边兵，保持阵型完整。' } });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ Authorization: 'Bearer test-key' }) });
    fetchMock.mockRestore();
  });
});

describe('robust move selection', () => {
  it('accepts a model response wrapped in a markdown code block', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"moveId":"red-pawn-0:06-05","commentary":"推进边兵。"}\n```' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const response = await app.request('/api/llm/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test-key' }, side: 'red', moves: [], gameSeed: 'md-test' })
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; data: { commentary: string } };
    expect(body.ok).toBe(true);
    expect(body.data.commentary).toBe('推进边兵。');
    fetchMock.mockRestore();
  });
});

describe('multi-level move selection', () => {
  it('accepts a model response that only returns the whitelist index', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ index: 0 }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const response = await app.request('/api/llm/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test-key' }, side: 'red', moves: [], gameSeed: 'index-test' })
    });
    expect(response.status).toBe(200);
    expect((await response.json() as { ok: boolean }).ok).toBe(true);
    fetchMock.mockRestore();
  });

  it('auto-selects a legal moveId embedded anywhere in the model output', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '我认为应该走 red-pawn-0:06-05，这步比较稳健。' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const response = await app.request('/api/llm/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test-key' }, side: 'red', moves: [], gameSeed: 'extract-test' })
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; data: { move: { notation: string }; commentary: string } };
    expect(body.ok).toBe(true);
    expect(body.data.move.notation).toBeTruthy();
    expect(body.data.commentary).toContain('模型已选择合法着法');
    fetchMock.mockRestore();
  });
});

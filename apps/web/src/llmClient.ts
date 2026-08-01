import { llmMoveResponseSchema, type CompactMove } from '@llm-chess/shared';
import type { Move, Side } from '@llm-chess/xiangqi-core';

export type LlmConfig = { provider: 'custom' | 'openai' | 'deepseek' | 'siliconflow'; baseUrl: string; model: string; apiKey: string };
export type LlmTurn = { move?: Move; commentary?: string; undo?: boolean; undoReason?: string; provider: string; model: string; durationMs: number; promptTokens: number; completionTokens: number };
export type LlmMemory = { previousResult: string; lesson: string; previousMoves: CompactMove[] };
export type LlmContext = { gameSeed: string; coachNote?: string; memory?: LlmMemory; undoNotice?: string };
export class LlmRequestError extends Error { constructor(public code: string, message: string) { super(message); this.name = 'LlmRequestError'; } }

export async function requestLlmMove(config: LlmConfig, side: Side, moves: CompactMove[], context: LlmContext): Promise<LlmTurn> {
  let response: Response;
  try { response = await fetch('/api/llm/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, side, moves, ...context }) }); }
  catch { throw new LlmRequestError('NETWORK_ERROR', '无法连接 Worker API，请检查网络后重试。'); }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? (body as { error?: { code?: string; message?: string } }).error : undefined;
    throw new LlmRequestError(error?.code ?? 'UNKNOWN_ERROR', error?.message ?? '模型请求失败，棋局未改变。');
  }
  const parsed = llmMoveResponseSchema.safeParse(body);
  if (!parsed.success) throw new LlmRequestError('INVALID_API_RESPONSE', 'Worker 返回了无法识别的响应。');
  return parsed.data.data;
}

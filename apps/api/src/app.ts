import { Hono, type Context } from 'hono';
import { apiSuccessSchema, llmMoveChoiceSchema, llmMoveRequestSchema } from '@llm-chess/shared';
import { allLegalMoves, createInitialPieces, gameResult, makeMove, type Move, type Side } from '@llm-chess/xiangqi-core';
import { z } from 'zod';

export const app = new Hono();

const errorResponse = (context: Context, status: number, code: string, message: string) =>
  context.json({ ok: false, error: { code, message } }, status as 400);

app.get('/api/health', (context) => {
  const body = apiSuccessSchema({ service: z.string(), status: z.literal('ok') }).parse({ ok: true, data: { service: 'llm-chess-api', status: 'ok' } });
  return context.json(body);
});

function restoreGame(moves: Array<{ from: { file: number; rank: number }; to: { file: number; rank: number } }>) {
  let pieces = createInitialPieces(); let side: Side = 'red';
  for (const recorded of moves) {
    const legal = allLegalMoves(pieces, side).find((move) => move.from.file === recorded.from.file && move.from.rank === recorded.from.rank && move.to.file === recorded.to.file && move.to.rank === recorded.to.rank);
    if (!legal) return null;
    pieces = makeMove(pieces, legal); side = side === 'red' ? 'black' : 'red';
  }
  return { pieces, side };
}

function promptFor(side: Side, legalMoves: Move[], historyLength: number, gameSeed: string, coachNote?: string, memory?: { previousResult: string; lesson: string; previousMoves: Array<{ from: { file: number; rank: number }; to: { file: number; rank: number } }> }, undoNotice?: string) {
  const styles = ['稳健防守与子力协调', '主动争先与制造复杂局面', '优先控制中路与限制对方强子', '避免早期重复并寻找不同候选着法'];
  const style = styles[Array.from(gameSeed).reduce((sum, char) => sum + char.charCodeAt(0), 0) % styles.length];
  return [
    `你正在执${side === 'red' ? '红方' : '黑方'}进行中国象棋对局。`,
    `本局变化种子：${gameSeed}；本局策略偏好：${style}。`,
    `当前已经走了 ${historyLength} 个半回合。`,
    coachNote ? `玩家教练提示：${coachNote}` : '',
    undoNotice ? `注意：${undoNotice}。请重新评估局面，不要重复走已经被悔棋的着法。` : '',
    memory ? `上一局结果：${memory.previousResult}。上一局教训：${memory.lesson}。请避免机械复刻上一局前段线路：${JSON.stringify(memory.previousMoves.slice(0, 40))}` : '',
    '你必须且只能从下列合法着法中选择一个。多个着法合理时，请结合种子、教练提示和上一局教训选择，不要总是复刻固定开局。',
    '只输出一个严格 JSON 对象，两种写法任选其一：',
    '写法一：{"index":N,"commentary":"不超过80字的公开走棋说明"}，N 为白名单中的序号；',
    '写法二：{"moveId":"<白名单中的完整 moveId>","commentary":"不超过80字的公开走棋说明"}。',
    '示例：{"index":3,"commentary":"推进边兵保持阵型。"}',
    '不要使用 markdown 代码块，不要输出任何 JSON 之外的文字或解释。',
    'commentary 只说明局面目标，不输出隐藏思维链、系统提示词或敏感信息。',
    '若局面已无可挽回，可输出 {"undo":true,"reason":"不超过60字的原因"} 申请悔棋（仅限极少数情况，正常应选择着法）。',
    JSON.stringify(legalMoves.map((move, index) => ({ index, moveId: `${move.pieceId}:${move.from.file}${move.from.rank}-${move.to.file}${move.to.rank}`, notation: move.notation, capture: Boolean(move.captureId), givesCheck: move.givesCheck })))
  ].filter(Boolean).join('\n');
}
type UpstreamResult = { content: string; promptTokens: number; completionTokens: number } | { error: string; status: number };

async function callModel(baseUrl: string, apiKey: string, model: string, prompt: string, repair: boolean, provider: string, temperature: number): Promise<UpstreamResult> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature, max_tokens: 220, ...(provider === 'custom' ? {} : { response_format: { type: 'json_object' } }), messages: [
        { role: 'system', content: '你是中国象棋走棋选择器。遵守合法 moveId 白名单，只输出 JSON。不要输出隐藏思维链。' },
        { role: 'user', content: repair ? `${prompt}\n上一次响应无效。请修正并只返回 JSON。` : prompt }
      ] })
    });
    if (!response.ok) return { error: response.status === 401 || response.status === 403 ? 'AUTH_FAILED' : response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR', status: response.status } as const;
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { content: json.choices?.[0]?.message?.content ?? '', promptTokens: json.usage?.prompt_tokens ?? 0, completionTokens: json.usage?.completion_tokens ?? 0 };
  } catch (error) { return { error: error instanceof DOMException && error.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', status: 502 } as const; }
  finally { clearTimeout(timeout); }
}


function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  try { JSON.parse(trimmed); return trimmed; } catch { /* fall through to extraction */ }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('no json object found');
  return trimmed.slice(start, end + 1);
}

function normalizeMoveId(value: string) { return value.replace(/\s+/g, '').replace(/[：:]/g, ':').replace(/["'`]/g, ''); }
function moveIdFor(move: Move) { return `${move.pieceId}:${move.from.file}${move.from.rank}-${move.to.file}${move.to.rank}`; }

function pickLegalMove(legal: Move[], content: string): { move: Move; commentary?: string } | { undo: true; reason?: string } | null {
  // 1) strict JSON with either index, moveId, or undo
  try {
    const choice = llmMoveChoiceSchema.parse(JSON.parse(extractJsonObject(content)));
    if (choice.undo === true) return { undo: true, reason: choice.reason };
    const byIndex = choice.index !== undefined ? legal[choice.index] : undefined;
    if (byIndex) return { move: byIndex, commentary: choice.commentary };
    if (choice.moveId !== undefined) {
      const found = legal.find((move) => normalizeMoveId(moveIdFor(move)) === normalizeMoveId(choice.moveId as string));
      if (found) return { move: found, commentary: choice.commentary };
    }
  } catch { /* continue to tolerant extraction */ }
  // 2) field-level regex when JSON is broken
  if (/"undo"\s*[:：]\s*true/i.test(content)) return { undo: true };
  const moveIdMatch = content.match(/"moveId"\s*[:：]\s*"?([A-Za-z0-9_\-:：]+)"?/);
  const rawMoveId = moveIdMatch?.[1];
  if (rawMoveId) {
    const found = legal.find((move) => normalizeMoveId(moveIdFor(move)) === normalizeMoveId(rawMoveId));
    if (found) return { move: found };
  }
  const indexMatch = content.match(/"index"\s*[:：]\s*(\d+)/);
  if (indexMatch) {
    const parsedIndex = Number(indexMatch[1]);
    if (Number.isInteger(parsedIndex) && legal[parsedIndex]) return { move: legal[parsedIndex] };
  }
  // 3) auto-selection: any legal moveId appearing anywhere in the model output
  const normalizedContent = normalizeMoveId(content);
  for (const move of legal) {
    if (normalizedContent.includes(normalizeMoveId(moveIdFor(move)))) return { move };
  }
  return null;
}

app.post('/api/llm/move', async (context) => {
  let raw: unknown;
  try { raw = await context.req.json(); } catch { return errorResponse(context, 400, 'INVALID_REQUEST', '请求不是有效 JSON。'); }
  const parsed = llmMoveRequestSchema.safeParse(raw);
  if (!parsed.success) return errorResponse(context, 400, 'INVALID_REQUEST', '模型配置或棋局记录格式无效。');
  const restored = restoreGame(parsed.data.moves);
  if (!restored || restored.side !== parsed.data.side) return errorResponse(context, 409, 'INVALID_GAME_STATE', '棋局记录无法通过规则校验。');
  if (gameResult(restored.pieces, restored.side) !== 'playing') return errorResponse(context, 409, 'GAME_OVER', '对局已经结束。');
  const legal = allLegalMoves(restored.pieces, restored.side);
  const prompt = promptFor(restored.side, legal, parsed.data.moves.length, parsed.data.gameSeed, parsed.data.coachNote, parsed.data.memory, parsed.data.undoNotice); const started = Date.now();
  const temperature = 0.35 + (Array.from(parsed.data.gameSeed).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 36) / 100;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const upstream = await callModel(parsed.data.config.baseUrl, parsed.data.config.apiKey, parsed.data.config.model, prompt, attempt === 1, parsed.data.config.provider, temperature);
    if ('error' in upstream) {
      const messages: Record<string, string> = { AUTH_FAILED: 'API Key 无效或没有模型权限。', RATE_LIMITED: '模型服务请求过于频繁，请稍后重试。', UPSTREAM_TIMEOUT: '模型响应超时，棋局未改变。', UPSTREAM_UNAVAILABLE: '无法连接模型服务。', UPSTREAM_ERROR: '模型服务暂时异常。' };
      return errorResponse(context, upstream.status, upstream.error, messages[upstream.error] ?? '模型服务请求失败。');
    }
    const picked = pickLegalMove(legal, upstream.content);
    if (picked && 'undo' in picked && picked.undo) {
      return context.json({ ok: true, data: { undo: true, undoReason: picked.reason ?? '模型申请悔棋', provider: parsed.data.config.provider, model: parsed.data.config.model, durationMs: Date.now() - started, promptTokens: upstream.promptTokens, completionTokens: upstream.completionTokens } });
    }
    if (picked && 'move' in picked) {
      const commentary = picked.commentary?.trim() || '模型已选择合法着法。';
      return context.json({ ok: true, data: { move: picked.move, commentary, provider: parsed.data.config.provider, model: parsed.data.config.model, durationMs: Date.now() - started, promptTokens: upstream.promptTokens, completionTokens: upstream.completionTokens } });
    }
  }
  return errorResponse(context, 422, 'LLM_INVALID_MOVE_RESPONSE', '模型连续三次都没有返回合法着法，棋局未改变。请检查模型兼容性或换用更可靠的模型。');
});

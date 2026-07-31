import { z } from 'zod';

/** 首版支持的对局模式。 */
export const gameModeSchema = z.enum(['human-vs-llm', 'llm-vs-llm']);

/** 中国象棋的阵营；棋盘固定红方在下。 */
export const sideSchema = z.enum(['red', 'black']);

/** 棋盘文件（列）。a 对应红方视角最左侧。 */
export const boardFileSchema = z.enum(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);

/** 棋盘行。红方底线为 0，黑方底线为 9。 */
export const boardRankSchema = z.number().int().min(0).max(9);

/** 稳定的棋盘格坐标。坐标不是面向用户的中文记谱。 */
export const boardPositionSchema = z.object({
  file: boardFileSchema,
  rank: boardRankSchema
}).strict();

/**
 * `moveId` 由规则引擎生成且只在所属局面中有效。LLM 和 UI 必须提交它，
 * 不能依靠自然语言记谱猜测落子。
 */
export const legalMoveSchema = z.object({
  moveId: z.string().min(1).max(120),
  from: boardPositionSchema,
  to: boardPositionSchema,
  notation: z.string().min(1).max(24),
  givesCheck: z.boolean()
}).strict();

export const gameOutcomeSchema = z.enum([
  'in_progress',
  'red_wins_checkmate',
  'black_wins_checkmate',
  'red_wins_stalemate',
  'black_wins_stalemate',
  'draw_repetition',
  'move_limit_reached'
]);

/** 只允许在产品设置范围内限制对局长度，单位为完整回合。 */
export const moveLimitSchema = z.number().int().min(50).max(400);

/**
 * 持久化棋谱中的单步。禁止添加模型连接配置、API Key、Authorization 或 token。
 * `.strict()` 是有意的：含未知字段的导入棋谱必须被拒绝，而不是静默保留敏感字段。
 */
export const recordedMoveSchema = z.object({
  moveId: z.string().min(1).max(120),
  side: sideSchema,
  notation: z.string().min(1).max(24),
  commentary: z.string().min(1).max(160).optional()
}).strict();

/** 仅供展示的非敏感参与方信息。 */
export const participantSchema = z.object({
  kind: z.enum(['human', 'llm']),
  displayName: z.string().min(1).max(80)
}).strict();

/**
 * 首版可导入导出的棋谱交换格式。
 * 局面编码的语义将由 Plan 002 选定的确定性规则引擎锁定；现在只定义安全边界。
 */
export const gameRecordV1Schema = z.object({
  schemaVersion: z.literal(1),
  gameMode: gameModeSchema,
  initialPosition: z.string().min(1).max(512),
  moveLimit: moveLimitSchema,
  red: participantSchema,
  black: participantSchema,
  moves: z.array(recordedMoveSchema).max(800),
  outcome: gameOutcomeSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional()
}).strict();

/** 先保留旧名称，避免 Plan 001 已建立的最小契约发生无提示破坏。 */
export const gameRecordSkeletonSchema = gameRecordV1Schema.pick({ schemaVersion: true });

export type GameMode = z.infer<typeof gameModeSchema>;
export type Side = z.infer<typeof sideSchema>;
export type BoardPosition = z.infer<typeof boardPositionSchema>;
export type LegalMove = z.infer<typeof legalMoveSchema>;
export type GameOutcome = z.infer<typeof gameOutcomeSchema>;
export type RecordedMove = z.infer<typeof recordedMoveSchema>;
export type GameRecordV1 = z.infer<typeof gameRecordV1Schema>;

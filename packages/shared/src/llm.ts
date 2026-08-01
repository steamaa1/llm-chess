import { z } from 'zod';

export const sideSchemaForLlm = z.enum(['red', 'black']);
const coordinateSchema = z.object({ file: z.number().int().min(0).max(8), rank: z.number().int().min(0).max(9) }).strict();
export const compactMoveSchema = z.object({ from: coordinateSchema, to: coordinateSchema }).strict();
export const llmMemorySchema = z.object({
  previousResult: z.string().trim().min(1).max(120),
  lesson: z.string().trim().min(1).max(600),
  previousMoves: z.array(compactMoveSchema).max(120)
}).strict();
export const ephemeralModelConfigSchema = z.object({
  provider: z.enum(['custom', 'openai', 'deepseek', 'siliconflow']),
  baseUrl: z.string().url().max(300).refine((value) => value.startsWith('https://'), '仅允许 HTTPS'),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1).max(500)
}).strict();
export const llmMoveRequestSchema = z.object({
  config: ephemeralModelConfigSchema,
  side: sideSchemaForLlm,
  moves: z.array(compactMoveSchema).max(800),
  gameSeed: z.string().trim().min(1).max(80),
  coachNote: z.string().trim().max(300).optional(),
  memory: llmMemorySchema.optional()
}).strict();
export const llmMoveChoiceSchema = z.object({ moveId: z.string().min(1).max(160), commentary: z.string().trim().min(1).max(180) }).strict();
export const llmMoveResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    move: z.object({
      pieceId: z.string(), from: coordinateSchema, to: coordinateSchema,
      captureId: z.string().optional(), notation: z.string(), givesCheck: z.boolean()
    }).strict(),
    commentary: z.string().max(180),
    provider: z.string(), model: z.string(), durationMs: z.number().nonnegative(),
    promptTokens: z.number().int().nonnegative(), completionTokens: z.number().int().nonnegative()
  }).strict()
}).strict();

export type CompactMove = z.infer<typeof compactMoveSchema>;
export type LlmMoveRequest = z.infer<typeof llmMoveRequestSchema>;
export type LlmMoveResponse = z.infer<typeof llmMoveResponseSchema>;

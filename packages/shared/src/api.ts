import { z } from 'zod';

export const apiErrorCodeSchema = z.enum(['SERVICE_UNAVAILABLE', 'VALIDATION_ERROR', 'INTERNAL_ERROR']);
export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: apiErrorCodeSchema, message: z.string().min(1).max(200) })
});
export const apiSuccessSchema = <T extends z.ZodRawShape>(data: T) => z.object({ ok: z.literal(true), data: z.object(data) });
export type ApiError = z.infer<typeof apiErrorSchema>;
export const apiError = (code: ApiError['error']['code'], message: string): ApiError => ({ ok: false, error: { code, message } });

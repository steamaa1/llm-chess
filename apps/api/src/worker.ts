import { app } from './app';

/**
 * Cloudflare Workers 入口。
 *
 * Hono 的 fetch 签名与 Workers 的 fetch handler 完全兼容，
 * 因此只需导出 app 作为默认出口。
 *
 * - `/api/*` 路由由 Worker 处理。
 * - 静态资源（前端构建产物）由 Cloudflare 在边缘层直接响应，
 *   无需经过 Worker。
 *
 * 本地开发：`wrangler dev` 或 `npm run dev`（通过 concurrently
 * 同时启动 Vite 和 Wrangler）。
 */
export default app;

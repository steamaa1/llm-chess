import { app } from './app.js';

/**
 * Cloudflare Workers 一体化入口。
 *
 * - Worker Assets 在同一域名直接响应 React/Vite 生产静态文件。
 * - Hono 处理 `/api/*` 路由。
 * - 前端和 API 同源，因此无需 VITE_API_BASE 或 CORS 配置。
 */
export default app;

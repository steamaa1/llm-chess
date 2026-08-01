# LLM 象棋

支持人机对战与 LLM 双方对弈的中国象棋 Web/PWA 项目。

## 部署架构

**一个 Cloudflare Worker 托管全部服务：**

- React + Vite 前端构建产物由 Worker Assets 在边缘直接响应。
- Hono API 由同一个 Worker 处理 `/api/*`。
- 前端与 API 同源，不需要 GitHub Pages、额外 API 域名或 CORS 设置。

## Cloudflare Dashboard：连接 GitHub 自动部署

在 Cloudflare Dashboard → **Workers & Pages** → `llm-chess` → **Settings** → **Builds** 中连接仓库 `steamaa1/llm-chess`，填写：

| 设置项 | 值 |
|---|---|
| Root directory | `/` |
| Build command | `npm run build --workspace @llm-chess/web` |
| Deploy command | `npx wrangler deploy` |
| Production branch | `main` |

`wrangler.toml` 已声明：前端构建产物目录为 `apps/web/dist`，API 入口为 `apps/api/src/worker.ts`。每次推送到 `main`，Cloudflare 将构建并部署完整应用。

> 项目有意不提交 `package-lock.json`：Cloudflare Workers Builds 对存在锁文件时固定使用 `npm ci`，而 npm workspace 新增 Worker 依赖时会因严格锁文件同步而失败；无锁文件时它使用 `npm install` 在隔离构建环境解析依赖。仓库绝不提交 `node_modules`。

部署成功后，通过同一个 Worker 地址访问：

```text
https://xxxx.workers.dev/
https://xxxx.workers.dev/api/health
```

## 本地开发命令

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run deploy
```

本地开发时 Vite 在 `127.0.0.1:4173` 运行，并把 `/api` 转给 `wrangler dev` 的 `127.0.0.1:8787`。

## 项目结构

```text
apps/web/                 React + Vite + PWA 前端
apps/api/                 Hono API（Cloudflare Workers）
packages/shared/          共享 TypeScript/Zod schema
packages/xiangqi-core/    象棋规则引擎适配层
```

## 安全原则

- API Key 仅存于浏览器当前会话内存和单次 HTTPS 请求头。
- 后端不记录密钥至数据库、日志、文件、LocalStorage 或棋谱。
- 棋谱 `GameRecordV1` 严格拒绝 `apiKey`、`token`、`Authorization` 等敏感字段。

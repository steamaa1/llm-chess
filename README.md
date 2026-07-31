# LLM 象棋

支持人机对战与 LLM 双方对弈的中国象棋 Web/PWA 项目。
部署于 Cloudflare Pages + Workers。

## 前置条件

- Node.js 22+、npm 10+
- API Key 绝不写入代码、`.env`、棋谱、浏览器持久化存储或 Git。

## 命令

```bash
npm install        # 安装依赖（含 wrangler）
npm run dev        # 本地开发（Vite + Wrangler Worker）
npm run lint       # ESLint
npm run typecheck  # TypeScript 类型检查
npm test           # Vitest
npm run build      # 生产构建
npm run test:e2e   # Playwright E2E
npm run deploy     # 部署到 Cloudflare
```

开发时 Web 运行于 127.0.0.1:4173，Vite 将 /api 代理到 Wrangler Worker (127.0.0.1:8787)。

## 部署

本项目部署于 Cloudflare Pages + Worker：

- **前端**：React + Vite 构建产物通过 Worker Assets 由 Cloudflare 边缘直接响应。
- **API**：Hono 运行于 Workers，处理 /api/* 路由。

### 首次部署

1. 确保 Cloudflare 账号已开通 Workers。
2. 在 GitHub 仓库添加 Secrets：
   - CF_API_TOKEN：具有 Workers 部署权限的 Cloudflare API Token
   - CF_ACCOUNT_ID：Cloudflare 账号 ID
3. 推送至 main 分支后自动部署。

### 手动部署

```bash
npx wrangler login
npm run deploy
```

## 项目架构

```
apps/web/          React + Vite + PWA 前端
apps/api/          Hono API（Cloudflare Workers）
packages/shared/   共享 TypeScript/Zod schema
packages/xiangqi-core/  象棋规则引擎适配层
```

## 安全原则

- API Key 仅存于浏览器当前会话内存和单次 HTTPS 请求头。
- 后端不记录密钥至数据库、日志、文件、LocalStorage 或棋谱。
- 棋谱 GameRecordV1 严格拒绝 apiKey、token、Authorization 等敏感字段。

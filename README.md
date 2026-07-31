# LLM 象棋

支持人机对战与 LLM 双方对弈的中国象棋 Web/PWA 项目。
部署于 Cloudflare Workers（一体化：前端静态资源 + Hono API 同 Worker）。

## 前置条件

- Node.js 22+、npm 10+
- Cloudflare 账号
- API Key 绝不写入代码、`.env`、棋谱、浏览器持久化存储或 Git。

## 命令

```bash
npm install        # 安装依赖
npm run dev        # 本地开发（Vite + Wrangler）
npm run lint       # ESLint
npm run typecheck  # TypeScript 类型检查
npm test           # Vitest
npm run build      # 生产构建
npm run test:e2e   # Playwright E2E
npm run deploy     # 构建 + 部署到 Cloudflare Workers
```

开发时 Web 运行于 127.0.0.1:4173，Vite 将 /api 代理到 Wrangler Worker（127.0.0.1:8787）。

## 首次部署（手动，无需 API Token）

```bash
# 1. 登录 Cloudflare（浏览器弹窗 OAuth，仅需一次）
npx wrangler login

# 2. 安装依赖并构建前端
npm install
npm run build

# 3. 一键部署（Worker + 前端静态资源同时上线）
npm run deploy
```

部署成功后终端会输出类似 `https://llm-chess.<你的子域>.workers.dev` 的地址。

## 后续部署

修改代码后只需：

```bash
npm run build && npm run deploy
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

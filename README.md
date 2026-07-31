# LLM 象棋

一个支持人机对战与 LLM 双方对弈的中国象棋 Web/PWA 项目。当前为基础工程阶段。

## 前置条件

- Node.js 22+、npm 10+
- API Key 绝不写入代码、`.env`、棋谱、浏览器持久化存储或 Git。

## 命令

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

开发时 Web 运行于 `127.0.0.1:4173`，并将 `/api` 代理到 `127.0.0.1:8787`。生产环境必须通过同源 HTTPS 反向代理提供 API。

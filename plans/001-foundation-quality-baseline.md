# Plan 001: 建立受控的 Web、API 与质量基线

> **执行者指令**：逐步执行本计划。每一步都运行验证命令，并确认达到预期结果后才继续。若出现“停止条件”，立即停止并报告，不得自行扩大范围。完成后更新 `plans/README.md` 中本计划状态。
>
> **漂移检查（先执行）**：本计划写于初始空目录，尚无 Git commit。先执行 `find . -maxdepth 2 -type f | sort`；若除 `plans/` 外已经出现业务源码、锁文件或配置，停止并对照本计划的“当前状态”确认技术决策没有漂移。初始化 Git 后，后续计划必须补填其实际基线 SHA。

## 状态

- **优先级**：P1
- **工作量**：M
- **风险**：MED（项目初始化会固定目录、边界和脚本；错误选择会影响后续所有计划）
- **依赖**：无
- **类别**：DX / 架构
- **计划时间**：无 Git 基线，2026-07-31

## 为什么重要

本项目同时包含浏览器界面、Node API、共享棋局契约和 PWA；若在一开始让 UI、后端和规则各自定义数据结构，后续 LLM 校验与棋谱导入很容易出现不兼容。目标 VPS 只有 1G 内存且不能 Docker，因此开发构建与生产运行都应保持轻量、可重复，并在开始业务实现前有可执行的类型检查、单元测试、端到端测试和生产构建门槛。

## 当前状态

- 项目根目录为 `/workspace/llm-chess`，当前仅有 `plans/`，没有源码、包管理配置、Git 仓库、依赖或 CI。
- 已确认技术决策完整记录在 `plans/README.md` 的“已确认的产品决策”和“推荐技术栈”章节。实现中必须以其为准。
- 必须采用：Node.js LTS、TypeScript、npm workspace、React + Vite、Hono、Zod、Vitest、Playwright、PWA 插件。
- 共享数据只能放在 `packages/shared`；浏览器 UI 不得直接引用 API 服务内部实现；API 服务不得接受未由 schema 校验的请求体。
- API Key 是高敏感凭据：不得创建真实 `.env`，只能创建已忽略的 `.env.example`，其中仅有变量名和说明，绝不含值。

## 需要的命令

| 用途 | 命令 | 成功预期 |
|---|---|---|
| 安装 | `npm ci` | 退出码 0 |
| 类型检查 | `npm run typecheck` | 所有 workspace 均退出码 0 |
| 单元测试 | `npm test` | Vitest 全部通过 |
| E2E | `npm run test:e2e` | Playwright 全部通过 |
| 代码规范 | `npm run lint` | 退出码 0、无 error |
| 生产构建 | `npm run build` | web 与 api 构建成功 |

> 初始化时可以用 `npm install` 创建锁文件；从第二次开始 CI 和本地可重复安装必须使用 `npm ci`。不要安装本计划未列出的依赖，除非先说明其必要性并获得操作者同意。

## 范围

**允许修改/创建**：
- 根目录：`package.json`、``pnpm-lock.yaml`、`tsconfig*.json`、`.gitignore`、`.editorconfig`、`.env.example`、`README.md`
- `apps/web/**`、`apps/api/**`、`packages/shared/**`
- `.github/workflows/ci.yml`
- 测试与工具配置（Vitest、Playwright、ESLint、PWA）
- `plans/README.md`

**明确不做**：
- 不实现中国象棋规则、LLM 调用、真实棋盘 UI、账号、数据库或 VPS 部署。
- 不创建、读取或提交任何真实密钥。
- 不发布、推送、创建 GitHub 仓库或安装系统级软件。

## Git 工作流

- 初始化仓库与首次提交需要操作者明确授权；未经授权不得执行。
- 若获授权，分支用 `feat/001-foundation`；提交信息使用 Conventional Commits，例如 `chore: initialize llm chess workspace`。
- 未获“推送”授权时，不得推送。

## 步骤

### 第 1 步：创建最小 pnpm monorepo 与可复现工具链

1. 建立 `apps/web`、`apps/api`、`packages/shared` 三个 workspace，根 `package.json` 用 `packageManager` 锁定实际使用的 npm 版本。
2. 配置 TypeScript 严格模式：`strict: true`、`noUncheckedIndexedAccess: true`；禁止以广泛 `any` 绕过编译器。
3. 建立根级脚本：`dev`、`build`、`typecheck`、`lint`、`test`、`test:e2e`。脚本必须一次覆盖所有相应 workspace，不依赖全局安装。
4. 添加 `.gitignore`：至少忽略 `node_modules/`、`dist/`、`coverage/`、`playwright-report/`、`test-results/`、`.env`、`.env.*`（但保留 `.env.example`）。
5. 添加 `.editorconfig` 与中文 `README.md`：说明前置条件、安装、开发、测试、构建和“不得把 API Key 写入文件”的原则。

**验证**：`npm install && npm run typecheck && npm run lint` → 三项均退出码 0；`git status --short`（若已初始化 Git）中不出现 `.env` 或构建产物。

### 第 2 步：建立共享的最小契约边界

在 `packages/shared` 建立仅含占位但真实可导入的 TypeScript/Zod 模块：

- `src/api.ts`：统一 API 成功/失败包络；失败至少包含稳定的机器码和可展示的中文消息字段，禁止透传堆栈、上游响应体或 API Key。
- `src/game.ts`：定义尚未实现的 `GameMode`（`human-vs-llm`、`llm-vs-llm`）、`Side`（`red`、`black`）和版本化棋谱顶层 `schemaVersion` 的类型/Zod schema 骨架。
- `src/index.ts`：唯一公共导出入口。

不得在本步骤臆造完整棋局字段；Plan 002 会负责规范。所有值必须用 Zod 在运行时校验，而不只依赖 TypeScript 类型。

**验证**：为 schema 写至少 3 个 Vitest 测试：两个有效枚举输入通过、一个未知模式被拒绝；执行 `npm test` → 通过，且 `npm run typecheck` → 退出码 0。

### 第 3 步：建立 Web 与 API 的健康切片

1. `apps/api` 用 Hono 实现 `GET /api/health`，只返回经共享成功包络验证的非敏感字段（例如 service 名和状态）。
2. `apps/web` 用 React + Vite 实现一个最小中文页面，显示产品名“LLM 象棋”、说明“正在建立对局服务”，并从同源 `/api/health` 获取状态。请求失败时必须显示中文可恢复错误状态，而不是空白页。
3. 开发环境通过 Vite 代理将 `/api` 转至 API 本地端口；生产环境部署成同源反向代理，不能在浏览器填写另一个 API 地址。
4. PWA 仅配置 manifest、图标占位和安全的 app-shell 缓存；禁止缓存 `/api/**`、任何请求头、模型响应、棋谱导入文件或 API Key。

**验证**：启动开发服务后，`curl -fsS http://localhost:<实际API端口>/api/health` 返回 JSON 且退出码 0；浏览器手工检查首页能显示服务可用状态；停止 API 后刷新页面显示中文错误提示，不显示技术堆栈。

### 第 4 步：建立自动化质量门槛

1. 用 Vitest 覆盖 API 健康端点的成功包络和错误包络 schema。
2. 用 Playwright 建立最小 smoke 测试：访问首页，确认中文产品标题可见；模拟 API 失败或停止 API 时确认错误提示可见。不得调用真实模型服务。
3. 新建 GitHub Actions CI：在受支持的 Node LTS 上执行 `npm ci`、`npm run lint`、`npm run typecheck`、`npm test`、`npm run build`；Playwright 若运行则安装浏览器缓存并执行 `npm run test:e2e`。不得在 CI 写入任何密钥。

**验证**：依次执行 `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` → 全部退出码 0。检查 CI YAML 确认没有 `secrets` 值回显、没有真实 API 请求。

## 测试计划

- `packages/shared`：无效枚举和 API 错误包络不能通过 Zod 解析。
- `apps/api`：健康端点响应满足共享 schema。
- `apps/web`：服务成功与失败各有明确中文 UI 状态。
- Playwright：不依赖真实 API Key 或公网服务；在离线/失败模拟下可重复运行。

## 完成标准

- [ ] 目录和依赖边界符合 `apps/web`、`apps/api`、`packages/shared`。
- [ ] `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npm run test:e2e` 全部退出码 0。
- [ ] 浏览器和测试夹具中不存在真实 API Key；`git grep -nE '(sk-|api[_-]?key\s*[:=]\s*["'"'][^"'"']+)'` 仅可命中说明文字或变量名，不能命中凭据值。
- [ ] PWA 配置不缓存 `/api/**`。
- [ ] `plans/README.md` 的 001 状态更新为 DONE。

## 停止条件

- 当前环境没有 Node.js LTS 或 pnpm，且安装会违反操作者“未经许可不得安装依赖/软件”的限制。
- 任何建议的棋规库、PWA 插件或工具链需要未经批准的新依赖。
- Web 与 API 无法实现同源 `/api` 路径，必须改为浏览器跨域直连模型服务。
- 为通过测试而需要真实 API Key、真实第三方模型请求或关闭 TLS/安全校验。

## 维护说明

- 任何新 API 先在 `packages/shared` 定义运行时 schema，再由 API 和 UI 同时使用。
- 新 PWA 缓存规则须优先审查是否会持久化敏感请求/响应。
- 计划 002 会扩展 `game.ts`，不得在多个 app 中创建平行的棋局类型。
- 计划 003 会增加模型网关；它必须沿用本计划的错误包络，而不是向浏览器透传供应商错误。

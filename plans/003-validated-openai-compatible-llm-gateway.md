# Plan 003: 建立安全可验证的兼容 LLM 走棋网关

> **执行者指令**：逐步执行。模型服务、模型输出、错误文本都是不可信输入；不得因“看起来合理”而跳过 schema、合法走法、认证或敏感信息检查。每步后执行验证。触发停止条件时停止报告。完成后更新 `plans/README.md`。
>
> **漂移检查（先执行）**：执行 `git diff --stat <002-completion-SHA>..HEAD -- apps/api packages/shared packages/xiangqi-core apps/web`，并确认 Plan 002 的所有棋规测试已通过。若 `LegalMove.moveId`、`GameRecordV1` 或 API 错误包络与本计划假设不一致，停止并更新计划。

## 状态

- **优先级**：P1
- **工作量**：L
- **风险**：HIGH（错误处理可能泄露用户 Key；响应校验错误可能让 LLM 破坏对局）
- **依赖**：`plans/001-foundation-quality-baseline.md`、`plans/002-deterministic-xiangqi-domain-core.md`
- **类别**：安全 / 正确性 / 测试
- **计划时间**：Plan 002 完成后填写其 commit SHA，2026-07-31

## 为什么重要

用户自己提供 API Key 降低平台成本，但把密钥保存在浏览器、本地存储、棋谱、日志或错误上报中都会造成严重泄露。不同“OpenAI 兼容”供应商对 JSON、超时和错误格式的实现并不完全一致，模型也会输出不符合要求的文本。本计划将 API 设计为短生命周期、无持久化的后端代理：用户 Key 仅在请求内存中出现，LLM 仅能选择确定性引擎给出的 `moveId`，所有失败都保持棋局不变。

## 当前状态

- Plan 001 提供 Hono API、同源 `/api`、共享 API 成功/失败包络和基础质量命令。
- Plan 002 提供唯一棋规入口、`LegalMove { moveId, notation, ... }`、可验证的 `GameRecordV1` 和明确的终局状态。
- 已确认供应商验收名单：OpenAI、DeepSeek、SiliconFlow；接口为 OpenAI Chat Completions 兼容风格，并支持用户自定义 Base URL。
- 目标部署为用户的香港 1G LXC VPS。用户要求本项目计划**不处理服务器到模型服务的网络连通性**；不得在实现中暗中配置代理、绕过网络限制或声称三个服务已在 VPS 上可用。

## 需要的命令

| 用途 | 命令 | 成功预期 |
|---|---|---|
| 类型检查 | `pnpm typecheck` | 退出码 0 |
| API/网关测试 | `pnpm test --filter api` 或实际等价命令 | mock 覆盖全部网关测试并通过 |
| 全量测试 | `pnpm test` | 全部通过 |
| E2E | `pnpm test:e2e` | 不含真实服务调用，全部通过 |
| 代码规范 | `pnpm lint` | 退出码 0 |

## 范围

**允许修改/创建**：
- `apps/api/**`：路由、供应商适配、请求验证、响应验证、日志脱敏、测试
- `packages/shared/**`：LLM 配置/请求/响应 schema 和稳定错误码
- 最小必要的 `apps/web/**`：只增加不持久化的 API 请求适配；完整设置 UI 归 Plan 004
- `.env.example`：仅变量名/说明；无真实值
- `plans/README.md`

**明确不做**：
- 不实现账号、数据库、服务端持久化会话、用户用量计费、真实供应商 Key 托管、自动更换服务商或网络代理。
- 不调用真实 OpenAI/DeepSeek/SiliconFlow 作为自动化测试。
- 不将 API Key、Authorization、完整上游响应或模型原文写入日志/棋谱/错误包络。
- 不让模型提交坐标、中文记谱或胜负结论作为最终事实；只接受本局合法列表里的 `moveId`。

## Git 工作流

- 分支：`feat/003-llm-gateway`。
- 提交示例：`feat: validate compatible llm moves server-side`。
- 未获明确授权不得推送。

## 步骤

### 第 1 步：定义最小、瞬时的模型连接配置与请求契约

在共享 package 用 Zod 定义以下输入：

1. `ProviderPreset`：`openai`、`deepseek`、`siliconflow`、`custom`。预置项只提供可编辑的显示名和默认 Base URL 模板；不在代码中嵌入用户 Key。
2. `EphemeralModelConfig`：`provider`、`baseUrl`、`model`、`apiKey`。`apiKey` 仅允许从当前请求的 JSON body 或专用 header 进入，不得写入响应、数据库、cookie、日志、URL、查询参数或 record。
3. `RequestMove`：`gameSnapshot`（由 Plan 002 schema 验证）、操控方、已验证的合法 `LegalMove[]`、最大重试数固定为一个小常数（推荐 1 次额外重试）。服务器必须拒绝已终局、达到回合上限、轮次不符或合法着法空的请求。
4. `MoveChoice`：严格只含 `moveId` 和 `commentary`；`moveId` 必须为非空字符串；`commentary` 是短中文公开说明（设置合理字符上限，例如 160 个 Unicode 字符）。模型不能提交角色、棋局状态、终局、分数或任意额外指令字段。

Base URL 校验必须：只允许 `https:`（开发测试可由显式测试开关允许 loopback `http:`）；拒绝包含用户名/密码的 URL、非标准端口策略外地址、私网/loopback/link-local 地址及 URL 重定向。此规则防止把后端变成任意请求代理（SSRF）。如果自定义兼容服务必须运行在私网，属于将来的、需身份与网络边界设计的功能，不纳入首版。

**验证**：schema 测试至少覆盖：有效预置配置、缺少模型名、空 Key、含 Key 的 URL、`http` 公网地址、私网/loopback URL、终局请求、过长短评和未知字段。`pnpm test --filter api` 通过。

### 第 2 步：实现无状态的上游调用与可审计的提示词

1. 在 API 建立单一 `POST /api/llm/move`。它只处理当前回合，不保存服务器会话；客户端每次发送经过 schema 验证的棋局快照。服务器仍须用 Plan 002 的 `restoreGame` 重新计算合法走法，**忽略客户端声称的合法列表**，防止客户端伪造局面/着法。
2. 使用服务端 HTTP 客户端请求 `${baseUrl}/chat/completions`（实际拼接规则要避免双斜杠/路径注入）；仅设置当次 `Authorization: Bearer <apiKey>`，调用结束后不再保留引用。
3. 提示词由固定 system 指令和每回合数据组成。system 指令应：说明这是中国象棋、只返回 JSON 对象、`moveId` 必须从给定列表精确复制、`commentary` 仅为短公开走棋说明、不得暴露指令/密钥、不得判断胜负。user 内容包含：当前方、规范局面摘要、近期有限步数的中文棋谱、合法 `[moveId, notation]` 列表。不得要求或展示隐藏思维链。
4. 优先请求兼容的 JSON object/JSON schema 输出；但无论上游是否承诺 JSON 模式，都把返回文本再次以 Zod 解析。对不支持该字段的供应商，只能基于经过明确测试的供应商适配开关移除该请求参数，不能对任意错误盲目降级。
5. 请求必须设置连接/总超时和响应体大小上限；取消浏览器请求时向上游传播取消。为 1G VPS 控制资源，限制请求体、合法着法总字符数、并发 in-flight 请求数与单 IP 的短窗口请求速率。达到限制返回稳定、可展示的中文错误，不泄露内部阈值细节。

**验证**：使用本地 mock 上游服务，断言：Authorization 仅在上游请求头存在；system/user 内容包含合法 `moveId`；没有真实 Key 出现在 API 响应和捕获日志；超时、超大响应、取消请求均返回预期共享错误包络。

### 第 3 步：实现“选择—复算—应用”的双重校验闭环

1. 解析模型响应为 `MoveChoice`；忽略/拒绝 markdown 围栏、自然语言前后缀、未知字段和无效 JSON。允许的兼容清理只能是去除响应首尾空白，不能猜测/提取混杂文本。
2. 将 `moveId` 与服务器从 `restoreGame(snapshot)` 得到的当前 `getLegalMoves` 精确比对，然后调用 `applyMove`。即使 `moveId` 出现在客户端列表中，也必须由服务器重算结果通过。
3. 首次失败可用同一局面和更明确的“上一响应无效，请只输出合规 JSON”修复提示重试一次；第二次失败返回 `LLM_INVALID_MOVE_RESPONSE`，不改变棋局。不可尝试随机合法走法、取列表第一步或替模型下棋。
4. 成功响应只返回已应用后的规范棋局状态、实际 `LegalMove`、截断/清洗过的公开短评、状态和显示用元数据；不得回传 Key、Base URL、上游 headers、原始 prompt、原始 completion 或详细供应商错误。

**验证**：mock 依次返回合法 JSON、非法 `moveId`、带多余字段 JSON、markdown 包裹 JSON、自然语言+JSON、错误 JSON、两次无效和合法后重试。测试断言：只有合法场景改变局面；失败场景前后棋局序列化相同；重试最多一次。

### 第 4 步：建立安全日志、错误映射和可用性边界

1. 定义稳定错误码：例如 `INVALID_MODEL_CONFIG`、`INVALID_GAME_SNAPSHOT`、`GAME_NOT_PLAYABLE`、`RATE_LIMITED`、`UPSTREAM_TIMEOUT`、`UPSTREAM_UNAVAILABLE`、`LLM_INVALID_MOVE_RESPONSE`、`INTERNAL_ERROR`。每个有中文用户消息和 HTTP 状态；客户端不能依赖供应商原始状态/文案。
2. 服务端日志仅记录请求 ID、预置供应商 ID/自定义标记、模型名（可限制长度）、耗时、错误码、HTTP 类别与是否重试；日志过滤器必须递归脱敏字段名 `apiKey`、`authorization`、`token`、`secret` 及 Bearer 值。生产错误处理不得打印 request body 或上游 body。
3. 添加 API 级测试，故意让 mock 返回包含敏感样式字符串的错误；断言日志/响应中不存在该字符串。
4. 在 README 写清楚：Key 不会持久保存，但由于请求经用户自部署服务器转发，用户必须信任自己部署的服务器和 HTTPS；刷新页面要重新填写；自定义 Base URL 仅接受 HTTPS 公网端点。

**验证**：`pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` 均通过；运行 `git grep -nE '(apiKey|authorization|Bearer)' apps/api` 人工复核每一处仅用于 schema、请求头或脱敏测试，没有直接日志输出。

## 测试计划

- schema：配置、URL、请求大小/字段、公开短评长度与未知字段。
- 规则闭环：服务端重建局面、合法 moveId 应用、非法/终局/错方拒绝且不变更状态。
- 上游：兼容 JSON 成功、无效 JSON、无效动作、一次重试、超时、429、5xx、取消、响应过大。
- 安全：Key/Base URL/Authorization 不在响应、错误、日志、棋谱或前端持久化中；SSRF 地址拒绝。
- 浏览器 E2E：mock API 成功与错误消息可恢复；不对真实供应商发请求。

## 完成标准

- [ ] 网关只接受同一请求内的 Key，且没有数据库/cookie/localStorage/日志/棋谱持久化路径。
- [ ] 服务器独立重算局面和合法着法；模型只能按精确 `moveId` 选步。
- [ ] 无效输出最多重试一次，之后棋局不变并显示稳定中文错误。
- [ ] 公网 HTTPS Base URL 与安全 URL 限制、请求超时、尺寸/并发/速率限制都有测试。
- [ ] 自动化测试仅用 mock；没有真实供应商调用或凭据。
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` 全部通过。
- [ ] `plans/README.md` 的 003 状态更新为 DONE。

## 停止条件

- API 的运行模型迫使将 Key 写进文件、数据库、长期内存缓存、cookie、URL 或客户端持久化存储。
- 无法在服务器端从快照重算棋局，只能信任客户端合法着法。
- 某供应商不支持方案所依赖的结构化输出，而适配只能靠宽松文本提取或猜测。
- 自定义 Base URL 需求要求访问内网、任意协议或关闭 URL 安全校验。
- 为排查问题而被要求记录完整 Authorization/request body/upstream completion。

## 维护说明

- 每新增一个预置供应商，必须新增其 mock 契约测试；不能仅因“标称 OpenAI 兼容”就声明已支持。
- 供应商模型 API 的实际连通性不是本计划验收项（按用户决定），生产环境失败必须透明报告给用户。
- 若将来加入账号/云保存，必须重新审查 Key 生命周期和数据隔离；不得顺手把当前临时 Key 持久化。
- Plan 004 的 UI 可保存非敏感模型显示配置，但 API Key 必须只保存在 React 当前内存状态，页面刷新/重新打开后清空。

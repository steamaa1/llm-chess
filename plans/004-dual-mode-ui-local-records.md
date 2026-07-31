# Plan 004: 交付双模式棋局与本地棋谱的响应式界面

> **执行者指令**：逐步执行，每步后运行验证命令。前端样式与动效按 UDS + FDO 技能最优实践执行，但设计约束由本计划限定。触发停止条件必须停止报告。完成后更新 `plans/README.md` 状态。
>
> **漂移检查（先执行）**：`git diff --stat <003-completion-SHA>..HEAD -- apps/web packages/shared packages/xiangqi-core apps/api`。确认 `getLegalMoves`、`GameRecordV1`、API 错误包络和 `/api/llm/move` 契约与本计划一致。若 API 尚未通过 Plan 003 全量测试，停止。

## 状态

- **优先级**：P1
- **工作量**：L
- **风险**：MED（UI 复杂度高但可分别独立验证；PWA 缓存策略若失误可能留存敏感请求）
- **依赖**：`plans/001`、`002`、`003`
- **类别**：方向 / 测试
- **计划时间**：Plan 003 完成后填写其 commit SHA，2026-07-31

## 为什么重要

用户只有通过本界面才能创建棋局、配置双方模型、观战或亲自对弈。这是整个项目的唯一用户可见成果。

## 当前状态

- `apps/web` 由 Plan 001 建立，有 React + TypeScript + Vite + PWA 骨架。Plan 003 提供 `/api/llm/move`。
- 棋局真相在 `packages/xiangqi-core`；前端不得复制规则逻辑。
- 界面仅简体中文；风格采用中式棋盘搭配现代简约控制台，**不要**过度拟物或杂乱装饰。
- 设备：香港 1G LXC VPS 提供同源反向代理；PWA 缓存不能触碰 `/api/**`。

## 需要的命令

| 用途 | 命令 | 成功预期 |
|---|---|---|
| 类型检查 | `pnpm typecheck` | 退出码 0 |
| Web 测试 | `pnpm test --filter web` | 全部通过 |
| 全量测试 | `pnpm test` | 全部通过 |
| E2E | `pnpm test:e2e` | 关键流程通过，无真实模型调用 |
| 构建 | `pnpm build` | 所有 workspace 构建成功 |
| 代码规范 | `pnpm lint` | 退出码 0 |

## 范围

**允许修改/创建**：`apps/web/**`（页面、组件、hooks、状态、路由、测试、PWA 配置及样式）、少量 `packages/shared/**` UI 专用类型、`plans/README.md`。

**明确不做**：不在前端侧判定走法合法性或终局；不将 API Key/Authorization 写入 localStorage/cookie/URL/IndexedDB；不实现深色模式、即时通知、多语言、账号、在线匹配或自动锦标赛。

## Git 工作流

- 分支：`feat/004-chess-ui`。
- 提交示例：`feat: responsive xiangqi board with dual mode controls`。
- 未授权不得推送。

## 步骤

### 第 1 步：应用设计系统基础

将以下限制嵌入 CSS 自定义属性（参考 UDS + FDO）：

- **调色板**：主色取自中国象棋传统色；背景略带暖米色/象牙纸质感；控件深灰/暗色为主。禁止彩虹渐变和海量颜色。
- **字体**：标题 `Noto Serif SC`；正文 `Noto Sans SC` 或系统回退。楷体可少量用于棋评。
- **空间**：8pt 网格；卡片间距 ≥ 24px；移动触控目标 ≥ 44px。
- **动效**：仅 `transform`/`opacity`；棋盘走子 ≤ 250ms `ease-out`；尊重 `prefers-reduced-motion`。
- **A11y**：焦点环、`aria-live` 状态朗读、模态焦点捕获且 Esc 关闭。

**验证**：`pnpm typecheck`；屏幕截图检查字号/间距/颜色 token 数量在可接受范围。

### 第 2 步：构建独立棋局状态与校验层

1. 创建 React 全局对局上下文/状态机（reducer）：`idle → playing → paused（仅观战）→ awaiting_player/llm → error → terminated`。
2. 状态只通过后端/引擎更新：新局 `/api/move`（本地方案也可调 `xiangqi-core`）、LLM 走棋 `/api/llm/move`、悔棋 `undoMove`、重开 `createInitialGame`。
3. 错误必须保留当前棋局、设中文错误提示、不可自动重试导致重复扣费。

**验证**：`pnpm test --filter web` 至少覆盖状态转换：idle→playing、暂停/继续、错误恢复不丢状态、终局不能再走。

### 第 3 步：实现棋盘与棋子渲染（纯 UI）

1. 响应式棋盘：纵向/横向自适应视口；棋子清晰中文+红/黑色标识；合法走位高亮（半透明圆点/环）。
2. 走子：点选己方棋子再点击目标位置。移动端同交互。棋盘方向红下黑上。
3. 步历史仅在控制台展开时显示；点击某步高亮但不改变对局。

**验证**：Playwright 测试棋子数量正确、初始走法高亮可见；桌面和 375px 视口均可完整显示。

### 第 4 步：实现双模式控制台与 LLM 配置面板

1. 标签切换：① 旁观 LLM vs LLM、② 人与 LLM 对战。
2. 旁观控制：开始/暂停/继续/单步/速度/重开。暂停禁止 LLM 请求；错误自动暂停。
3. 人机模式：玩家回合高亮，选步后 `applyMove`；AI 回合锁定棋盘。
4. 模型配置面板（协议见 Plan 003）：
   - 红黑分别配置，默认复制。预设 + 可覆盖 Base URL + 模型名 + API Key（password 输入）。
   - Key 永不清洗后写入 localStorage；刷新丢失。
   - 允许存除 Key 外的显示配置至 localStorage；加载时若缺少 Key 则提示填写。
   - 表单校验：URL 须 `https://` 开头、非空。
5. 状态栏显示走棋说明、步摘要、对局状态（将军/将死等）与轮次。
6. 走棋说明渲染为楷体/衬线卡片；截断超长文，不显示"思维链"标签。

**验证**：Playwright 覆盖模式切换、完整人机流程、旁观暂停/继续/单步、无效配置被拒、Key 重启不恢复。

### 第 5 步：实现棋谱管理与导入导出

1. 对局结束后"保存"按钮将 `GameRecordV1` 写入 localStorage（限制局数，可删除）。不含 Key/Base URL。
2. 棋谱列表：日期、双方模型名、结果、总回合数；可删除。
3. JSON 导出/导入：经 Plan 002 schema 验证；导入后回放模式查看。导入失败显示中文错误字段。
4. 纯文本棋谱导出：含版本、双方、结果和 "1. 炮二平五 …" 格式；无隐私字段。
5. 控制器可独立进入，不绑定对局生命周期。

**验证**：测试 JSON 往返、损坏版本拒绝、含 token 字段拒绝；纯文本导出可读无 Key。

### 第 6 步：PWA 加固与安全审计

1. PWA manifest 不缓存 `/api/**` 响应、棋谱导入文件、含 Authorization 的请求。
2. 若检测到 localStorage 包含 `apiKey` 键值则警告清除（安全网）。
3. 加 CSP 头限制；Lighthouse PWA + a11y 评分 ≥ 90。
4. 屏幕阅读可读出棋盘关键状态。

**验证**：`pnpm test:e2e` 覆盖 PWA 缓存规则；Lighthouse 确认 `/api/**` 无缓存。

## 测试计划

- 状态机隔离测试、组件/交互测试、Playwright E2E（人机到将杀/上限、旁观、缩放、表单校验、JSON 棋谱往返、重启后 Key 清空）。
- 全部 mock LLM 响应；不使用真实 API Key。

## 完成标准

- [ ] 旁观模式可开始/暂停/继续/单步/变速/重开；错误后棋局可恢复。
- [ ] 人机模式支持合法走步、等待 LLM、悔棋与回合上限。
- [ ] Key 会话存活后刷新丢失，绝不写入持久化。配置可保存非敏感项。
- [ ] JSON 棋谱导入导出版本化；纯文本导出可读无隐私字段。
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` 全部通过。
- [ ] PWA 缓存排除 `/api/**`；Lighthouse a11y ≥ 90。
- [ ] `plans/README.md` 的 004 状态更新为 DONE。

## 停止条件

- 某组件状态与后端契约错位导致 UI 与规则引擎状态不同。
- PWA 缓存策略无法正确排除 `/api` 路径。
- 玩家落子被 UI 绕过后端校验直接 `applyMove`。
- 键盘/触屏辅助技术下无法操作棋盘。
- 需要未获批准的新依赖。

## 维护说明

- 落子和棋盘交互改动须跑 Playwright E2E。
- `GameRecordV1` 是长期契约；新字段开 V2。
- 模型配置面板是用户第一安全边界——每个"记住"功能先审查无 Key 泄漏。
- 棋盘方向硬编码红下黑上；将来改向需测试所有坐标和记谱一致性。

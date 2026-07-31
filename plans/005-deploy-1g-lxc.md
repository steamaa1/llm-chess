# Plan 005: 在非 Docker 的 1G LXC VPS 上可观测地发布

> **执行者指令**：先到目标 VPS 收集部署事实（不得猜测），然后按步骤执行。完成后更新 `plans/README.md` 状态。
>
> **漂移检查（先执行）**：确认所有前置计划 DONE：全部测试通过、生产构建成功、无硬编码开发端口 URL。若有绑定 localhost:5173 的引用，停止修正。

## 状态

- **优先级**：P2
- **工作量**：M
- **风险**：MED（VPS 资源紧张；错误配置可导致 OOM、停机、TLS 过期或 Key 泄漏）
- **依赖**：`plans/001`、`002`、`003`、`004`
- **类别**：部署 / DX / 安全
- **计划时间**：Plan 004 完成后填写其 commit SHA，2026-07-31

## 为什么重要

应用代码完成后需在 1G LXC VPS 上安全可访问地运行。LXC 局限（不能 Docker、内存紧张）与安全要求（API Key 经服务端转发）决定需细致配置。

## 当前状态

- 用户有香港 LXC VPS（~1G 内存、已装 cloudflared）。
- **未确认的部署前提**：域名、反向代理（Nginx/Caddy/1Panel）、TLS 自动续期、Node LTS 版本、可用内存/Swap、运行用户、防火墙、开放端口、SELinux/AppArmor、Cloudflare Tunnel 使用。本计划要求先收集这些信息。
- 前端静态资源由 Vite 构建产出，API 由 Hono 同端口或经反向代理传递。
- 本计划不处理服务器到模型 API 的网络连通性（按用户决定）。

## 需要的命令

| 用途 | 命令（VPS 上） | 成功预期 |
|---|---|---|
| Node 版本 | `node -v` | ≥ 目标 LTS |
| 内存概览 | `free -h` | 确认 swap 配置 |
| 端口占用 | `ss -tlnp` | 目标端口空闲 |
| 服务管理 | `systemctl start/stop/status llm-chess` | 正常运行 |
| 健康检查 | `curl -fSsL https://<域名>/api/health` | 返回正常 JSON |

## 范围

**允许**：`apps/api` 生产入口、systemd unit、反向代理片段、README 部署文档、`plans/README.md`。**不做**：Docker、新系统包管理器（未经许可）、模型 API 代理/VPN、数据库或缓存。

## Git 工作流

- 分支：`feat/005-deploy`。
- 不推送真实证书/私钥/`.env.production`。

## 步骤

### 第 0 步：在与操作者交互下收集 VPS 现实信息

操作者在 VPS 上执行（或你操作 VPS 终端）：

1. 内存和交换：`free -h`。
2. Node：`node -v && which node`。若无 Node，按操作系统方式安装 LTS，**控制构建内存消耗**（低配 LXC 安装 Node 可能 OOM，需先扩大 swap）。
3. 反向代理：确认 Nginx/Caddy/1Panel，服务端口和自动 TLS 续期。
4. 域名：绑定或通过 Cloudflare Tunnel 提供；DNS 已指向或隧道已通。
5. 防火墙：`ufw status` 或 `iptables -L INPUT`，仅开 80/443。
6. 部署路径、运行用户、systemd 版本。

**停止条件**：若内存不足致 OOM，先协调扩大 swap 或调整内存预算。

### 第 1 步：构建生产部署最小化产物

1. 在 CI 或本机构建（非 VPS）输出生产前端静态资源与 API bundle。
2. API 进程只依赖 `production` node_modules。
3. 前端不绑定 Vite 开发模式。

**验证**：`NODE_ENV=production pnpm build && NODE_ENV=production pnpm start` 后 `curl http://localhost:<port>/api/health` 正常。

### 第 2 步：在 VPS 上部署并配置反向代理

1. 上传构建产物及 `package.json`/`pnpm-lock.yaml`；仅安装 production deps（`pnpm install --prod --frozen-lockfile`）。
2. 以非 root 用户运行。
3. systemd unit：`MemoryHigh=700M`、`MemoryMax=850M`，重启策略和日志上限。
4. 反向代理映射 `:port` 到 443，请求体大小限制 ≤ 1MB。关闭 `X-Powered-By`/`Server` 指纹头。
5. HTTPS 正常，`/api/health` 公网可达。

**验证**：`systemctl status llm-chess` running；HTTPS 健康检查通过。

### 第 3 步：设定监控、日志和备份

1. journald 限制 `SystemMaxUse=100M`。
2. README 部署章节记录：实时日志、重启、部署新版本步骤、环境变量说明（仅变量名，无值）、小内存调优、健康检查、Cloudflare Tunnel 切换。
3. 重启后服务可恢复；`journalctl` 不含 API Key 或明文 Authorization。

**验证**：重启后服务恢复；日志无敏感凭据。

## 测试计划

部署过程无法 CI 完全模拟；依赖操作者在 VPS 验证健康检查并实际进行首次对局（需模型供应商连通，但本计划不验证）。

## 完成标准

- [ ] VPS 各项事实已收集并书面记录。
- [ ] `systemctl status llm-chess` 正常；内存限制合理；非 root。
- [ ] HTTPS 公网可达；`/api/health` 返回正确 JSON。
- [ ] journald 日志不达磁盘上限且不含 API Key。
- [ ] README 包含完整部署指引与调优参数。
- [ ] `plans/README.md` 的 005 状态更新为 DONE。

## 停止条件

- 需 Docker 或 systemd 不可用且无安全替代。
- Node/OpenSSL 版本过低且无法安全升级。
- 请求体/流量超过内存且无法通过 Swap 或反向代理限制缓解。
- 必须配置上游代理/绕过网络封锁（用户已排除）。

## 维护说明

- 新版发布前调整 MemoryHigh/Max 为实测峰值。
- 定期检查 `journalctl --disk-usage`。
- 将来增加 stateful 功能需重新评估内存限制。
- domain/reverse-proxy/cloudflared 变化时更新 README。

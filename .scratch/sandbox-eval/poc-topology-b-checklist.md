---
status: active
triage: ready-for-agent
feature: sandbox-eval
created: 2026-08-22
depends: README.md
---

# PoC 实施清单：拓扑 B 最小闭环（Docker 单机）

> 目标：验证"浏览器 → 控制面 → 容器化 pi-web"闭环可用，产出冷启动/稳定性实测数据，
> 支撑 ADR-0004 转正。全部工作在本分支（`eval/sandbox-execution`）进行。

## Phase 1：容器化 pi-web（无控制面）

- [ ] `docker/Dockerfile.piweb`：node:24-bookworm-slim；apt 装 git/ripgrep/ca-certificates；
      `npm ci && npm run build`；ENTRYPOINT `npm start`
- [ ] 验证容器内会话目录可写：`-v piweb-sessions:/root/.poweri/agent`
- [ ] 冒烟：宿主浏览器直连 `-p 30142:30141`，完成一轮"新建会话 → 发消息 → 工具执行 → SSE 流式渲染"
- [ ] 记录镜像体积与启动耗时

## Phase 2：最小控制面（编排 + 反代）

- [ ] `sandbox-poc/orchestrator/`：独立 Node 服务（不进上游目录，PoC 专用）
      - `POST /api/sandboxes` → docker create/start，等 healthcheck 通过，返回 sandboxId
      - `DELETE /api/sandboxes/:id` → stop/rm（可选 --keep 卷）
      - 反代 `/s/:id/*` → `container_ip:30141/*`（http-proxy，禁缓冲、SSE keepalive）
- [ ] 前端接入：会话创建后 base URL 指向 `/s/:id/`，验证相对路径 API 与 SSE 全通
- [ ] provider key 注入方式二选一并记录：
      a) env 注入容器（快，记为债务） b) 控制面代理 LLM 流量（接近目标形态）

## Phase 3：边界与数据验收

安全边界（核心验收项）：
- [ ] 沙箱内让 agent 执行 `ls /` —— 只见容器 FS，不见宿主
- [ ] 沙箱内 `rm -rf /tmp/poc-marker`（宿主先建同名文件）—— 宿主文件无变化
- [ ] 沙箱内读 `/etc/passwd`、尝试访问宿主 docker socket 路径 —— 确认不可达
- [ ] 容器无 host network / 无 privileged

性能与稳定性：
- [ ] 冷启动 P50/P95：POST /sandboxes → 首个 SSE token 到达
- [ ] 连续 10 会话并发创建，反代下 SSE 无断流
- [ ] inotify/chokidar 文件树监听在 overlayfs 上正常刷新
- [ ] 会话卷跨容器重建持久性：rm 容器 → 新容器挂同卷 → 历史会话可见

## Phase 4：结论物

- [ ] 本文件勾选完毕 + 实测数据回填 README.md §2"待验证风险"
- [ ] ADR-0004 状态改"已接受"（desktop 分支），附 PoC 数据链接
- [ ] 明确下一阶段范围：microVM/托管沙箱选型 vs 先做单用户 Docker Compose 发布

## 约束提醒

- 不修改上游文件（lib/hooks/app/api 等）；控制面代码放 `sandbox-poc/`（本分支自有）
- PoC 结束后本分支保留为决策档案；正式实现另起 feature 分支

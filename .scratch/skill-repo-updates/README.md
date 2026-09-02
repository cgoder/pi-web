---
title: 私有源技能更新（skill repo updates）
status: done
map: true
labels: [ready-for-agent]
---

# 技能仓库更新 · 工单地图

让 PowerI 市场里"从订阅源安装的 skill"在源仓库推进后能被检测、被一键升级，且不冲坏用户的本地改动与开关状态。

架构决策见 [ADR-0004 技能安装登记表由 PowerI 自有](../../docs/adr/0004-poweri-skill-install-registry.md)。

## 目标与非目标

**目标**：安装即登记来源与版本 → 按 git tree hash 判定 updateState → 原子覆盖式升级并保留休眠开关 → 面板给出可更新 badge 与源级"更新全部"。

**非目标**：版本锁定 / pin 到 tag / 回滚（`--depth=1` 浅克隆只有最新一版，2026-09-01 决定暂不做）；订阅凭据脱敏（另见 [token 泄露工单](./20260901-06-subscription-token-leak.md)）；上游 `app/api/skills/*` 的任何改动。

## 术语（本特性引入，暂记此处）

| 术语 | 定义 | Avoid |
|---|---|---|
| **安装登记表 Install Registry** | `~/.pi/agent/poweri-skill-installs.json`，PowerI 自有的已安装技能来源与版本账本，键为安装目录名 | skill-lock（那是上游 `skills` CLI 的 `~/.agents/.skill-lock.json`，两者不可混用、不可互写） |
| **来源凭证 Provenance** | 一条记录中"来自哪个仓库 + 仓库内哪条路径"的部分，取值 `verified`（安装时登记）/ `inferred`（事后按目录名反查命中）/ `unknown`（判定不了） | — |
| **远程版本标识 Source Tree Hash** | `git -C <缓存仓库> rev-parse HEAD:<repo相对路径>` 得到的 40 位 tree hash，标识"这个技能目录的版本" | commit sha（仓库级，会导致同仓库无关改动误报可更新） |
| **本地基线 Baseline Local Hash** | 上次安装/升级完成那一刻，`~/.pi/agent/skills/<folder>/` 的内容摘要（剔除 `disable-model-invocation` 行后的递归 sha256） | — |
| **偏离 Drift** | 当前本地摘要 ≠ 本地基线 ⇒ 用户或别的工具改过本地副本 | 不要把"开关被置为休眠"算作偏离（故哈希前剔除该行） |
| **三态 updateState** | `up-to-date` / `update-available` / `conflict` / `unknown-origin`（详见判定表） | — |

### 判定表

| 条件 | updateState | UI 动作 |
|---|---|---|
| 登记表无记录或 `origin: unknown` | `unknown-origin` | **永不给更新入口** |
| 本地摘要 ≠ 基线（偏离） | `conflict` | 警示 badge；展开给 覆盖 / 保留本地 / 查看差异 |
| 无偏离 且 基线摘要对应版本 == 远程 tree hash | `up-to-date` | 无 badge |
| 无偏离 且 远程 tree hash ≠ 登记版本 | `update-available` | `可更新 a1b2c3→e4f5a6` + 更新按钮 |

## 现状证据（2026-09-01 实测）

| 环节 | 状态 | 位置 |
|---|---|---|
| 缓存仓库同步 | ✅ 已有，`fetch --depth=1 origin` + `reset --hard origin/HEAD`，失败退 `pull --ff-only` | `poweri/lib/skill-subscriptions.ts` `syncGitSubscription()` |
| 安装落盘 | ✅ 有，❌ 不登记来源/版本 | 同文件 `toggleSkillState()` enabled 分支 `fs.cpSync()` |
| 更新检测 / 应用 | ❌ 无 | — |
| tree hash 原语 | ✅ 可用（git 在 PATH，实测 `HEAD:skills/enterprise-semantic` → `17313cc6…`） | — |
| 重载通道 | ✅ 已有，直接复用 | `poweri/features/skills/SkillsMarketView.tsx:505,588`（`hasPendingChanges` + `sendAgentCommand(sessionId,{type:"reload"})`） |
| 休眠开关 | ✅ 已有且格式安全，升级后需回写 | `lib/skill-frontmatter.ts` `setDisableModelInvocation()` |

## Decisions-so-far

- **2026-09-01** 自动化档位＝**后台按 TTL 同步 + 用户显式应用**（不做静默自动升级：会冲掉团队正在改的 skill）。
- **2026-09-01** **不做** pin / tag / 回滚，保持 `--depth=1`；将来要做需加深克隆深度，登记表字段已预留 ref。
- **2026-09-01**（ADR-0004）不复用上游 `.skill-lock.json` 与 `npx skills add`，改由 `poweri/` 自建登记表。
- **2026-09-01**（ADR-0004）版本标识用**目录级 git tree hash**，不用仓库 commit sha。
- **2026-09-01** 冲突默认不覆盖，apply 返回 409，由 UI 让用户三选。
- **2026-09-01** 老安装反查用**内容比对**：内容与当前远端一致才补记 inferred，否则 unknown-origin（歧义取 unknown，安全优先）；manifest/url 源本批不设 updateState（无更新路径）。
- **2026-09-01** 文档先行：本地图 + ADR 先落，UI 部分按产品理念 2 需先出 `?variant=` 变体再落正式实现。
- **2026-09-02** 票05（badge 原型）流程偏差回填：实际落地变体 A（`eb8b895`），未走 `?variant=` 拍板流程、无 prototype 分支，已在票05 Answer 段显式登记偏差，不追溯返工（详见该票）。
- **2026-09-01** 加载策略：面板首开只拉已安装/订阅源技能（`getMarketSkills` 默认不带 discover）；进 Discover tab 才请求市场数据（`?discover=1`），服务端两级缓存（内存 + `poweri-discover-cache.json`，TTL 30min）兑底。Git 源 TTL 10min 不变。

## Tickets

| 票 | 类型 | 依赖 |
|---|---|---|
| [01 安装登记表与哈希原语](./20260901-01-install-registry.md) | task | — |
| [02 安装时登记来源凭证](./20260901-02-provenance-on-install.md) | task | 01 |
| [03 同步 TTL 与 updateState 检测](./20260901-03-check-ttl-update-state.md) | task | 01 |
| [04 更新 API：原子应用与冲突 409](./20260901-04-update-api.md) | task | 02、03 |
| [05 可更新 badge 与变更明细原型](./20260901-05-update-badge-prototype.md) | prototype | 03 |
| [06 订阅凭据泄露加固](./20260901-06-subscription-token-leak.md) | task（done，`944faae` 已实施） | — |
| [07 编辑订阅源返回 unknown action](./20260901-07-fix-subscription-update-action.md) | task（**已激活**：token 无法轮换 = 技能无法更新，04 的隐性前置） | — |

## Fog（尚未确定）

- **老数据反查的置信度**：按目录名在缓存仓库 `skills/<name>` 反查命中即记 `inferred`。若同名技能存在于多个源（`sub-cas918` 与 litta 源是否真有交集未验证），反查会歧义 → 待定：歧义时记 unknown 还是取最近同步的源。
- **`conflict` 的"查看差异"要做到什么粒度**：文件级 added/removed/modified 是零成本（比对旧副本与缓存新版目录）；行级 diff 需要引入 diff 依赖 → 原型阶段决定。
- ~~TTL 取值与手动刷新入口~~：已定 10 分钟 + `?force=1`（03 完成）。
- **manifest / url 型源**的版本标识：git 用 tree hash，manifest 只能用清单里的 `version` 或内容 sha256；`syncManifestSubscription` 目前不校验任何版本 → 03 内决定是否一并处理还是先只做 git 源。
- **术语最终落点**：`CONTEXT.md` 上游持有禁改，是否新建 `docs/desktop/glossary.md` 待术语稳定后决定。

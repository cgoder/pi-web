# ADR-0004: 技能安装登记表由 PowerI 自有，版本标识用 git tree hash

## 状态

已接受（2026-09-01）

关联：[ADR-0002 分层架构](./0002-layered-architecture.md)、工单地图 [skill-repo-updates](../../.scratch/skill-repo-updates/README.md)

## 上下文

私有业务源（如 `gitlab.litta.cn/litta/litta-skills.git`）的添加链路已经可用：`poweri/lib/skill-subscriptions.ts` 会把订阅仓库浅克隆到 `~/.pi/agent/git-subscriptions/<subId>`，并在每次列目录时 `fetch --depth=1` + `reset --hard origin/HEAD` 保持缓存最新。

但"让仓库技能更新"做不了，因为**安装是一次性文件拷贝**（`toggleSkillState()` 里 `fs.cpSync(srcDir, destDir)`），拷完即断链。实测确认：`~/.pi/agent/skills/enterprise-semantic/` 内只有 `SKILL.md` 与 `references/`，没有任何来源或版本元数据；`poweri-subscriptions.json` 里也没有已安装清单。于是无法回答三个问题：这个本地目录来自哪个仓库、装的时候是什么版本、远端现在变了没有。

上游 `pi-web` 有更新体系（`lib/skill-lock.ts` + `lib/skill-updates.ts` + `app/api/skills/{check,update}`），但对本场景不可用。

## 决策

在 `poweri/` 内建立 PowerI 自有的**技能安装登记表**，以**订阅仓库中该技能目录的 git tree hash** 作为远程版本标识。

### 1. 为什么不复用上游更新体系（三条均为硬约束）

1. **判定写死 GitHub**：`lib/skill-lock.ts` 的 `canCheckForUpdates` 要求 `sourceType === "github"` 且 source 形如 `owner/repo`。自建 GitLab 与任意 git 源直接落不进去。
2. **落地通道走不通**：升级靠 `npx skills add <source>/<folder> --skill <name> -y --agent pi`。私有源带 token 的 `npx skills` 无法认证，且每次升级都要重新下载 npm 包。
3. **状态文件所有权冲突**：上游 `skills` CLI 往 `~/.agents/.skill-lock.json` 写条目，其内部执行 `git clone`，凭据/代理/SSH 环境由它自己管理。PowerI 把自己的条目塞进别人的账本，等于把产品正确性绑在一个不受我们控制的写入方上。

### 2. 考虑过但否决的方案

| 方案 | 否决理由 |
|---|---|
| 复用上游 `.skill-lock.json` | 被上面三条同时挡死；要能跑得改上游判定（违反 ADR-0002 红线） |
| 在每个已安装技能目录内放 sidecar 文件 | 污染技能目录（会随目录被用户拷走、被 loader 扫到）；且 53 个已装技能要各写一份、易漂移 |
| 只记仓库级 commit sha，不记目录 | 同仓库任一技能改动即触发全量"可更新"，误报毁掉功能可信度 |

选定的登记表方案：单一中心文件 `~/.pi/agent/poweri-skill-installs.json`，键为**安装目录名**。

### 3. 约束（代码里看不见的事实）

- 订阅仓库浅克隆 `--depth=1`，本地只有最新一版内容 ⇒ 追最新可以，**版本锁定与回滚需要额外深度**，本次明确不做（见地图决策）
- `~/.pi/agent/skills/` 不是 git 仓库 ⇒ 本地版本只能用内容摘要，不能用 git 对象
- 休眠开关由 `lib/skill-frontmatter.ts` 的 `setDisableModelInvocation()` **写进 `SKILL.md` 正文**。升级必然重写该文件 ⇒ 不显式回写就丢用户开关；同理本地摘要比对若不先剔除这一行，每个休眠技能都会被误判成"用户改过"
- 登记表键**不得用 `sub.id`**：id 含时间戳后缀，删源重加即变。实测 `~/.pi/agent/git-subscriptions/` 已有 3 个目录对 2 条订阅（`sub-cas918`、`sub-y5acpc` 是孤儿）

## 后果

**正面**

- 私有 git / manifest / url 三类源共用同一套 updateState 判定，不再依赖上游对 GitHub 的硬编码
- tree hash 是内容寻址：同仓库别的技能改动不误报；重排提交但内容不变也不误报
- 上游 `lib/skill-lock.ts` 与 `app/api/skills/*` 保持零改动，跟随合并无冲突

**负面与代价**

- 双账本并存：经 `npx skills` 装的 53 个条目走上游 `.skill-lock.json` 与上游 UI，经 PowerI 市场装的走登记表。以**安装目录名**为唯一键，两边不会同名覆盖，但同一技能的两条链路更新入口会各自显示状态
- 登记表格式漂移：需 `version` 字段与"读不出就降级为 unknown origin"的容错（unknown 一律不给更新入口，宁可少做不可误覆盖）
- 升级后已运行会话里的技能仍是加载时快照 ⇒ 必须显式置 pending 态提示重载；本仓库已有该通道（`SkillsMarketView.tsx` 的 `hasPendingChanges` + `sendAgentCommand(sessionId, {type:"reload"})`），直接复用，不新增 UI 概念

**术语落点**

本决策引入的词汇（安装登记表、来源凭证、远程版本标识、本地基线、偏离、三态）暂记在[工单地图](../../.scratch/skill-repo-updates/README.md)的术语节。根 `CONTEXT.md` 由上游持有、禁改；若后续术语稳定，再决定是否新建 PowerI 持有的 `docs/desktop/glossary.md`。

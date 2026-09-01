---
title: 01 安装登记表与哈希原语
status: backlog
type: task
labels: [ready-for-agent]
---

Blocked by: （无）

## 背景

见地图 [README](./README.md) 与 [ADR-0004](../../docs/adr/0004-poweri-skill-install-registry.md)。"更新"能力缺的不是同步，而是**已安装副本的来源凭证与版本基线**：`toggleSkillState()` 一次性 `fs.cpSync()` 后本地目录与仓库彻底断链。本票只做数据层原语，不碰任何调用方。

## 要做什么

新建 `poweri/lib/skill-install-registry.ts`：

```ts
export interface SkillInstallRecord {
  folder: string;              // ~/.pi/agent/skills/ 下的目录名，登记表唯一键
  origin: "verified" | "inferred" | "unknown";
  subscriptionId?: string;     // 仅作展示/回溯，绝不作为键（id 含时间戳，删源重加即变）
  repoUrl?: string;
  skillPath?: string;          // 仓库内相对路径，如 "skills/enterprise-semantic"
  sourceTreeHash?: string;     // 安装/上次升级时的远程版本（40 hex）
  baselineLocalHash?: string;  // 同时刻本地目录摘要（"sha256:<hex>"）
  ref?: string;                // 预留：将来做 pin 用，本票不写不读语义
  disabled?: boolean;          // 上次已知的休眠开关状态，供升级后回写
  installedAt: number;
  updatedAt: number;
}

readRegistry(): { version: number; installs: Record<string, SkillInstallRecord> }
writeRegistry(r): void
upsertInstall(rec: SkillInstallRecord): void
removeInstall(folder: string): boolean
getInstall(folder: string): SkillInstallRecord | undefined
```

哈希与路径原语（同文件或 `poweri/lib/skill-hash.ts`，二选一，倾向同文件避免碎片化）：

- `resolveCacheDir(subscriptionId)` → `~/.pi/agent/git-subscriptions/<id>`
- `remoteTreeHash(cacheDir, skillPath)` → `git -C <cacheDir> rev-parse HEAD:<skillPath>`，输出非 40 hex 视为失败
- `localDirHash(dir)` → 递归遍历，按 posix 相对路径**升序**，逐条喂入 `relpath\0<bytes>\0` 做 sha256；`SKILL.md` 内容先经 `stripDisableLine()` 处理
- `stripDisableLine(md)` → 删除 frontmatter 内 `disable-model-invocation` 行。复用 `lib/skill-frontmatter.ts` 里已有的正则思路（该文件第 5 行的 `KEY_LINE`），**只 import 不改上游文件**；若无法复用则在本文件内实现等价正则并注明来源

## 硬约束

- 读不出/JSON 损坏 → 返回空登记表并保留原文件（不得静默清空用户账本）；写用 `tmp + rename` 原子落盘
- 一切皆在 `poweri/`：`lib/skill-lock.ts`、`lib/skill-updates.ts`、`app/api/skills/*`、`lib/skill-frontmatter.ts` 一律零改动（红线见 ADR-0002）
- 文件模式：登记表落在 `getAgentDir()` 下，与 `poweri-subscriptions.json` 同目录

## 验收

新建 `poweri/lib/skill-install-registry.test.mjs`。文件系统隔离两种方式（实测均有效，优先前者）：

- **依赖注入**：registry 路径函数接受可选 `agentDir` 参数，默认取 `getAgentDir()`。对齐仓库已有做法 `lib/skill-lock.test.mjs:39`（`mkdtempSync(join(tmpdir(), "pi-web-skill-lock-"))` + 显式传路径）
- **环境变量**（兜底）：`process.env.PI_CODING_AGENT_DIR = tmp` 后 `getAgentDir()` 直接返回该目录（实测 `PI_CODING_AGENT_DIR=/tmp/pi-probe-dir` → `/tmp/pi-probe-dir`，见 SDK `dist/config.js` 的 `ENV_AGENT_DIR`）

断言：

1. 写入后重读一致；损坏 JSON → 空表 + 原文件仍在
2. `localDirHash` 对同一内容稳定、对增删改文件敏感、**与文件遍历顺序无关**
3. 仅 `disable-model-invocation` 行有差异的两个目录 → `localDirHash` 相同（休眠不算偏离）
4. `remoteTreeHash` 在一个临时 fixture 仓库上返回 40 hex；同仓库另一子目录改动后，本目录 hash 不变（证明目录级版本不误报）

```bash
node --test poweri/lib/skill-install-registry.test.mjs
node_modules/.bin/tsc --noEmit
```

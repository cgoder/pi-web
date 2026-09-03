# 分支模型（三层主干）

> 2026-09-02 落位。目标：上游跟随、Web 层（NPM 包）、桌面壳三层解耦，每层独立可验证。

## 模型

```
upstream (镜像 agegr/pi-web，只 fast-forward，零自有提交)
  └─ poweri     Web 层主干：PowerI 产品层（poweri/、app/poweri/、docs/desktop/ 等）
                + 继承自上游的全部基础层。终态 = @poweri/poweri-web npm 包
      └─ desktop  桌面壳：poweri 的全部内容 + src-tauri/。终态 = Native App
```

数据流单向：`poweri → desktop`（desktop 定期 merge poweri）。反向不存在：
poweri 分支上的历史含有壳文件（分叉自 desktop HEAD 的快照），但壳的**改动**只落
desktop，npm 打包时 `files` 白名单天然排除 `src-tauri/`，无影响。

| 分支 | 跟随对象 | 职责 | 红线 |
|---|---|---|---|
| `upstream` | `upstream/main`（agegr/pi-web） | 纯净上游镜像 | 永不加自有提交，只 ff（`scripts/sync-upstream.mjs` 已用 refspec 语义强制） |
| `poweri` | `merge upstream` | Web 层主干；上游同步在此层消化（replacement 审计在此执行） | 壳改动（src-tauri/）不落此层 |
| `desktop` | `merge poweri` | 壳 + 集成；版本 bump 与发布 tag 在此操作 | 不绕过 poweri 直接改 Web 层并停留（Web 层改动必须回流 poweri） |

## 提交归属纪律

改动的文件决定提交落点（判定标准见 [ownership.md](ownership.md)）：

- **Web 层提交 → `poweri`**：`poweri/`、`app/poweri/`、`docs/desktop/`、`docs/agents/`、`.github/`、`scripts/`、`vite.config.ts`、`package.json`、上游文件改动（须先过例外表）
- **壳层提交 → `desktop`**：`src-tauri/`（Rust 宿主 + shell/）
- **混合需求必须拆提交**：Web 层与壳的改动分开提交、各落其位；先落 poweri，desktop merge 后再做壳侧提交
- 预研/原型分支（`prototype/*`、`eval/*`、`research/*` 等）不属三层主干，成果落地时按上述归属拆分

## 开发工作模式（短命分支 + worktree）

采用 trunk-based 变体：三层主干随时可发布，**发布从 desktop 主干打 tag，不使用长命
release 分支**。理由：Tauri 自更新意味着用户永远在最新版，不存在“维护旧版本打补丁”
场景；发布失败按 bump 重发纪律处理，也不需要 release 分支冻结期（业界引入 release
分支的两大理由——月度以上节奏、多版本并行支持——本项目均不成立）。

日常开发：一个任务一个短命分支（数小时~数天），完成即 merge 归位并删除：

```bash
# Web 层任务：从 poweri 开短命分支（worktree 可选，便于并行不打断主 checkout）
git worktree add ../pi-web-feat-x -b feat/x poweri
# ……完成并验证后
git checkout poweri && git merge --no-ff feat/x && git push origin poweri
git worktree remove ../pi-web-feat-x && git branch -d feat/x
```

worktree 使用纪律（worktree 是本地并行手段，不是版本模型）：

1. 一个任务一个短命分支；一个活跃分支至多一个 worktree
2. **merge 后立即删分支与 worktree**（`git worktree prune` 收尾）；预研/原型
   worktree 用完即删，成果按文件归属拆分回 poweri/desktop，不留档案分支
3. worktree 目录名与分支同名（`../pi-web-<branch>`），便于对账
4. worktree 里有未跟踪/修改文件时 `git worktree remove` 会拒绝——先确认无唯一
   副本内容再 `--force`
5. agent 并行会话各自使用独立 worktree，互不污染主 checkout

团队策略速查：① 一个任务一个短命分支；② 一个活跃分支至多一个 worktree；③ merge
后立即清理；④ 发布只从 desktop 主干 tag；⑤ 预研单独开分支，成果拆分归位后即清理。

## 上游同步 SOP

```bash
node scripts/sync-upstream.mjs          # ① 镜像层：fetch + ff + push origin upstream
git checkout poweri && git merge upstream   # ② Web 层：消化上游变更
node scripts/upstream-replacement-audit.mjs check   # ③ 替换件逐项过账（移植或 ack --waive）
git push origin poweri                  #    （push 触发 CI replacement audit）
git checkout desktop && git merge poweri && git push origin desktop   # ④ 壳层跟进
```

## 版本与发布

- **tag 打在 desktop 分支**（发布快照语义）：发布产物 = 完整快照（Web 层 + 最新壳）。poweri 分支不收壳更新，其上的壳会随时间过时，故不可作为 tag 基点；发布前 desktop 必须 merge poweri，保证快照的 Web 层为最新
- npm 包 `@poweri/poweri-web`：预构建 bundle（`bin/` + `.next/` + `public/`），与上游
  `@agegr/pi-web` 同模式；`npm run build` 产物即包内容，`files` 白名单排除壳文件
- 发布由 tag 触发：`poweri-vX.Y.Z` 必须等于 `package.json` version
  （见 [.github/workflows/publish-poweri-web.yml](../../.github/workflows/publish-poweri-web.yml)）。版本策略为
  **lockstep**：联发（`poweri-v*`）时 npm 与壳同号推进，可对账；仅壳变更时用
  `poweri-app-v*` 独立发版，此时壳版本与 npm 包解耦（壳首装 web 包用 `@latest`，
  见 installer.rs `package_spec()`）。选择规则与版本对账原则详见
  [release.md](release.md) 版本管理策略一节
- desktop bump 版本 + 打 tag `poweri-v*` → CI 发布 npm 包并构建桌面安装包

## main 的角色（已清理）

`origin/main` 是 2026-09 分支模型调整前的 fork 主线（含全部早期自有提交），内容已完全
包含于 desktop/poweri，冻结不再发展。**2026-09-03 已删除本地与远程分支**（历史仍可在
git 对象库追溯），日常开发勿基于 main。

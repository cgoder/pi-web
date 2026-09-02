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

## 上游同步 SOP

```bash
node scripts/sync-upstream.mjs          # ① 镜像层：fetch + ff + push origin upstream
git checkout poweri && git merge upstream   # ② Web 层：消化上游变更
node scripts/upstream-replacement-audit.mjs check   # ③ 替换件逐项过账（移植或 ack --waive）
git push origin poweri                  #    （push 触发 CI replacement audit）
git checkout desktop && git merge poweri && git push origin desktop   # ④ 壳层跟进
```

## 版本与发布

- npm 包 `@poweri/poweri-web`：预构建 bundle（`bin/` + `.next/` + `public/`），与上游
  `@agegr/pi-web` 同模式；`npm run build` 产物即包内容，`files` 白名单排除壳文件
- 发布由 tag 触发：`poweri-vX.Y.Z` 必须等于 `package.json` version
  （见 [.github/workflows/publish-poweri-web.yml](../../.github/workflows/publish-poweri-web.yml)），
  壳版本（`src-tauri/tauri.conf.json`）与 web 包版本保持同步（installer.rs 锁定同版本包）
- desktop bump 版本 + 打 tag `poweri-v*` → CI 发布 npm 包并构建桌面安装包

## main 的角色（遗留）

`origin/main` 是 2026-09 分支模型调整前的 fork 主线（含全部早期自有提交），内容已完全
包含于 desktop/poweri，冻结不再发展。日常开发勿基于 main。

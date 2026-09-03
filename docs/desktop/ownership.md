# 文件归属名册 — 上游持有 vs PowerI 持有

> 回答一个具体问题：**这个文件是谁的，能不能改，合并时谁为准。**
> AGENTS.md 的红线段只给判断命令，本文件给**完整名册与例外登记**；构建/验证归属见 [file-map.md](file-map.md)。
> 基线：`upstream/main` = 真上游（`agegr/pi-web`），快照日期 2026-09-01。

## 0. 为什么必须换基线

`AGENTS.md` 原判据用 `origin/main`，但 `origin/main` 是**本 fork 的 main**，实测比 `upstream/main` 多 4 个提交：

| 提交 | 内容 | 后果（用 origin/main 判会误判） |
|---|---|---|
| `8a5217f` | 新增 `.github/workflows/build-poweri-desktop.yml` | 自家桌面 CI 被判成"上游文件" |
| `97b471a` `e06fce7` | 改 `lib/file-paths.ts`、`lib/path-security.ts`、`app/api/files/[...path]/route.ts`（WSL/UNC 路径修复）+ 新增 `lib/file-paths.test.mjs` | 这 4 个基础层文件被判成"上游原版、从未改过" |
| `dc3920a` | Merge upstream/main | — |

**正确判据**：以 `upstream/main` 为基线做**内容比对**（不是路径存在性），完整脚本见 §6。
路径存在性判法有两个实测误判，已弃用：`lib/file-paths.ts` 会被判为“上游原版未改”（实际 main 已修 WSL 路径）；
`.github/workflows/build-poweri-desktop.yml` 会被判为“上游文件”（实际上游根本无此文件，是 PowerI 持有）。
`origin/main` 已冻结为遗留（2026-09-02 分支模型调整，见 [branch-model.md](branch-model.md)）：不再有任何新提交；"desktop 相对基线改了什么"同样以 `upstream/main..HEAD` 度量，不再依赖 `origin/main`。

## 1. 三层归属模型

```
第 3 层  PowerI 持有（179 个新增文件，永不参与合并，上游无此路径）
第 2 层  fork main 上的受控上游修改（4 改 + 1 新增测试，合并时重放增量；main 已冻结，不再新增）
第 1 层  上游持有（跟随合并，desktop 侧禁改）
```

判定顺序（§6 脚本实现）：

1. `upstream/main` 无此路径 → **第 3 层**（PowerI 持有，无论它在哪个分支上）。
2. 有且与 `HEAD` 内容一致 → **第 1 层**（上游持有，禁改）。
3. 有且与 `HEAD` 不一致 → **第 1 层例外**（受控上游修改，必须进 §4 登记表；§3 是 main 冻结前的历史遗留）。

## 2. PowerI 持有（第 3 层，可自由修改）

相对 `upstream/main` 全部为**新增**（`A`），共 139 个文件，实测分布：

| 目录 | 文件数 | 范畴（壳/包） |
|---|---|---|
| `src-tauri/` | 69 | 壳（含 Rust 宿主 63 与 `src-tauri/shell/` 宿主前端 6） |
| `poweri/lib/` | 25 | 包·产品层 |
| `poweri/components/` | 10 | 包·产品层（上游组件的**替换件**） |
| `app/poweri/` | 9 | 包·产品层（`page.tsx` + `api/` 8 路由） |
| `docs/desktop/` | 6 | 文档（核心规范与治理） |
| `poweri/features/` | 5 | 包·产品层 |
| `.github/` | 4 | CI（`test-poweri-desktop`、`publish-poweri-web`、`size-check` 在 desktop；`build-poweri-desktop` 在 main） |
| `docs/agents/` | 3 | 文档 |
| `poweri/styles/` `scripts/` | 各 2 | 样式 / 构建脚本 |
| `poweri/layout/` `vite.config.ts` | 各 1 | 壳/包 |
| `docs/adr/0002-layered-architecture.md` | 1 | 文档 |

计数为 2026-09-01 快照。`app/prototype/`、`.scratch/` 与历史调研草稿已全量清理完毕，新原型与试验写在 `poweri/` 子目录或 throwaway 分支。

⚠️ **ADR 编号撞车**：`docs/adr/0002-chat-only-tool-selection.md` 是**上游文件**，`0002-layered-architecture.md` 才是 PowerI 的。AGENTS.md 旧写法 `docs/adr/0002-*` 会连带覆盖前者——按名点文件，不要用通配。

## 3. fork main 上的受控上游修改（第 2 层）

这些是**上游文件的真实改动**，已随 `main` 进入 desktop 基线，合并上游时以"上游为准 + 重放增量"处理：

| 文件 | 改动性质 | 提交 |
|---|---|---|
| `lib/file-paths.ts` | WSL `wsl$`/`wsl.localhost` 别名与 UNC 前缀 | `97b471a` `e06fce7` |
| `lib/path-security.ts` | 同上（访问校验放行） | 同上 |
| `lib/file-access.test.mjs` | 同上（配套测试修改） | 同上 |
| `app/api/files/[...path]/route.ts` | `decodeFilePathFromApi` 接入 + `realpath` 失败降级（网络文件系统） | 同上 |
| `lib/file-paths.test.mjs` | 新增测试（非上游文件，但随 main 进入基线） | 同上 |

**通道已随 `main` 冻结关闭（2026-09-02）**：此后的受控上游修改一律落 `poweri` 分支（Web 层主干）并登记 §4 例外表，desktop 经 merge 获得。§3 表格保留为合并上游时的"重放增量"依据。

另需注意：`.github/workflows/build-poweri-desktop.yml` 也由 `8a5217f` 落在 `main` 上，但它**上游根本不存在** → 属第 3 层 PowerI 持有，不是上游修改（仅因历史原因在 main 上）。

## 4. desktop 分支对上游文件的既有修改（第 1 层例外登记）

`git diff --diff-filter=M upstream/main..HEAD` 实测 19 个（含 §3 的 4 个历史遗留），逐条登记，**新增例外必须在此表出现**：

| 文件 | 类别 | 合并策略 |
|---|---|---|
| `lib/file-paths.ts` `lib/path-security.ts` `lib/file-access.test.mjs` `app/api/files/[...path]/route.ts` | WSL/UNC 路径修复（§3 历史遗留，随 main 进入基线） | 上游为准，重放增量 |
| `public/icons/apple-touch-icon.png` `icon-192.png` `icon-512.png` `app/favicon.ico` | 品牌资产替换 | 以我为准（PowerI 图标） |
| `public/offline.html` | 品牌文案覆盖（“Pi Web”→“PowerI”；图标已复用上方替换的 PowerI `/icons/*`） | 以我为准（PowerI 品牌） |
| `README.md` `README.zh-CN.md` | 产品定位描述 → **整体重写为 PowerI README**（2026-09-02 拍板：fork 产品定位独立，上游 README 内容不再适用） | 以我为准（上游同步时保留我方版本，不再重放增量） |
| `README.ja.md` `README.ru.md` | 上游日/俄语版 → **已删除**（PowerI 不维护上游语言版本，保留会造成过时描述误导用户） | 以我为准（合并时不恢复；如需多语言后续基于 PowerI 内容重写） |
| `AGENTS.md` | Agent 工作约定（本名册的宿主） | 以我为准 |
| `package.json` `package-lock.json` | 包名/版本 `@poweri/poweri-web` 0.2.0、tauri/vite 脚本与依赖 | 上游为准，重放增量（合并必冲突，重点核对） |
| `tsconfig.json` | `exclude: src-tauri/**` | 上游为准，重放增量 |
| `.gitignore` | `/dist/` `/src-tauri/target/` 等壳产物 | 上游为准，重放增量 |
| `eslint.config.mjs` | `ignores: ["temp/**"]`（临时产物目录不参与 lint） | 上游为准，重放增量 |

**其余上游文件 0 修改**（实测）：`components/` 全目录、`hooks/` 全目录、`app/api/` 其余 44 个路由、`bin/`、`app/` 根页面、`lib/`（除 §3 那三个）全部保持上游原版。替换式架构目前在代码层面是**成立**的。

## 5. 「界面改动」归属规则（D1 定案，2026-09-01，已写入 AGENTS.md）

规则：**任何界面改动一律落 `poweri/`，不改 `components/`。**

- 依据（实测）：`poweri/components/` 已有 10 个上游组件的替换件，它们**复用上游叶子组件**（`@/components/FileIcons`、`ModelSelector`、`AnsiText`、`ChatMinimap`、`ExtensionStatusBar`）而非复制整文件；上游 `components/` 至今 0 修改。
- 接线链：`app/poweri/page.tsx` → `poweri/layout/AppShell` → `poweri/components/ChatWindow` → `MessageView` → `MarkdownBody`。
- 上游 `components/AppShell.tsx` 保留仅为浏览器模式 `/` 路由可用，PowerI 永不使用它。

## 6. 归属判定脚本与名册再生成

将以下片段存为 `own.sh`（或直接粘贴执行）；已实测 15 项探测均正确（含目录）。基线过期时先 `git fetch upstream main`。

```bash
p="${1:?用法: own <path>}" 
if ! git cat-file -e "upstream/main:$p" 2>/dev/null; then echo "第3层 PowerI 持有"; exit 0; fi
u=$(git rev-parse "upstream/main:$p"); h=$(git rev-parse "HEAD:$p")
if [ "$u" = "$h" ]; then echo "第1层 上游持有（禁改）"; exit 0; fi
echo "第1层例外 受控上游修改 → 必须登记进 §4（§3 = main 冻结前历史遗留）"
```

实测输出（2026-09-01 快照，HEAD `4f92d54`；第三行判定措辞已按冻结后判据更新）：

| 路径 | 判定 |
|---|---|
| `components/ChatWindow.tsx` `hooks/` `components/` | 第 1 层（内容与上游一致） |
| `lib/file-paths.ts`、`app/api/files/[...path]/route.ts`、`lib/`、`app/api/` | 第 1 层例外（§3 历史遗留，已登记） |
| `.github/workflows/*`、`src-tauri/src/main.rs`、`poweri/layout/AppShell.tsx`、`app/poweri/page.tsx` | 第 3 层（PowerI 持有） |
| `tsconfig.json`、`README.md`、`app/` | 第 1 层例外（已登记 §4） |

注：目录级判定用 tree hash，是**粗判**（子树内任一文件差异就整块报“已改”，如 `app/` 会糅含图标/原型删除/新增路由），具体文件才是精确答案。

### 全量核对

```bash
git diff --name-status upstream/main..HEAD                   # 第 3 层全集（A）
git diff --name-only --diff-filter=M upstream/main..HEAD      # 第 1 层例外（应只出现 §4 表内 19 个文件，含 §3 历史遗留）
git diff --name-only upstream/main origin/main                # §3 历史遗留来源（origin/main 已冻结，结果固定）
```

上表第二行出现 §4 之外的路径 → 红线违例，回退或补登记。

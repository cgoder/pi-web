---
title: 安装后白名单裁剪（post-install pruning）
status: done
type: task
blocked-by: [20, 21]
---

# 安装后白名单裁剪（post-install pruning）

## Problem Statement

pi-web 生产安装 node_modules 实测 ~608MB（macOS arm64，工单 20）。其中大头是 next dist（~198MB）和 pi-coding-agent（~139MB）。实测 pi-coding-agent 139MB 中约 69MB（50%）是运行时无用的 .map / .d.ts / 文档资产。Minke 的 runtime-prune.mjs（RUNTIME_PRUNE_POLICY_VERSION=8）证明了"安装后白名单式裁剪"是安全有效的路径——**它从未使用 `--omit=optional`**（与工单 20 实测否决结论一致）。

## Solution

在 installer.rs 的 ensure_web_installed 中，npm install 成功后、健康检查前，执行白名单式裁剪：

```
安装 → 裁剪（prune） → 健康检查验证（verify_installation，工单 21）
```

裁剪规则（保守子集，参考 Minke scripts/harness/runtime-prune.mjs）：

| 类别 | 规则 | 安全性依据 |
|------|------|-----------|
| sourceMaps | 所有 `.map` 文件 | next start / Node 运行不需要 source map |
| typeDeclarations | `.d.ts` / `.d.mts` / `.d.cts` | TypeScript 编译期文件，Node 运行不需要 |
| buildCaches | `.tsbuildinfo` | 增量构建缓存，运行时无用 |
| documentation | `readme` / `changelog` / `changes` / `history`（md/txt） | 纯文档（**LICENSE 必须保留**——法律要求，Minke 的 DOCUMENTATION_FILE 正则也不含 LICENSE） |
| incompatiblePlatformAssets | 按目标平台盘点 pi-web 依赖树中的 native 包（如 node-pty 的 Windows-only 目录、esbuild 其他平台二进制），非当前平台资产删除 | 同 Minke 规则 |

## 关键约束与安全机制

1. **白名单式**：只删上表类别的文件，JS 产物（.js/.cjs/.mjs）、.next 构建产物、二进制、LICENSE 一律不碰
2. **pi-coding-agent 是 pi-web 的运行时依赖**（用户确认：pi-web 内嵌 pi-coding-agent 并使用了其部分内容）——**只删其非运行时资产，JS 产物全保留**，不做选择性部署（closure 计算）
3. **裁剪后必须通过 verify_installation**（工单 21 的探针验证），失败则视为安装失败（删除安装目录重试）——"每项删除都证明生产功能完整"（Minke 纪律）
4. **幂等**：重复裁剪安全（第二次无文件可删）
5. 跳过符号链接（npm 平铺安装一般无 symlink，但防御性跳过）
6. 记录裁剪统计（删除文件数/字节）到 log_line

## 实施注意

- 实现在 Rust（installer.rs 新函数 `prune_runtime()` 或类似），递归遍历 node_modules 匹配规则
- 遍历 600MB 目录树耗时数秒~十几秒，可接受（一次性成本）；注意用 walkdir 风格手写递归（不引入新依赖，参考 process_manager.rs 现有遍历风格）
- 规则函数设计成纯函数（路径 → Option<类别>），便于单测：`prune_category(relative_path) -> Option<PruneCategory>`
- 单元测试：规则匹配（临时目录造文件验证各类别）、LICENSE 不删断言、幂等性
- **平台资产规则要基于实测盘点**：先 du/检查 pi-web 依赖树里有哪些 native 包（node-pty？esbuild？@next/swc 已被 npm 按平台过滤所以不用管），再定规则；盘点结果写进工单
- 裁剪统计可作为工单 23 size-check 的补充信息（可选，不强制）

## 实施记录（2025 工单完成后回填）

### 平台资产盘点结论（基于本仓库 node_modules + 实际运行时安装 ~/.poweri/web 实测）

依赖树中的 native 包（darwin-arm64 主机实测）：

| 包族 | 存在形式 | 跨平台资产？ |
|------|---------|-------------|
| esbuild | `node_modules/esbuild` + `@esbuild/darwin-arm64` | 否——仅宿主变体 |
| next SWC | `@next/swc-darwin-arm64` | 否——仅宿主变体 |
| sharp | `@img/sharp-darwin-arm64`、`@img/sharp-libvips-darwin-arm64` | 否——仅宿主变体 |
| tailwindcss | `@tailwindcss/oxide-darwin-arm64` | 否——仅宿主变体 |
| rollup | `@rollup/rollup-darwin-arm64` | 否——仅宿主变体 |
| unrs | `@unrs/resolver-binding-darwin-arm64` | 否——仅宿主变体 |
| lightningcss | `lightningcss-darwin-arm64`（unscoped） | 否——仅宿主变体 |
| node-pty | **不存在** | — |
| pnpm / @reflink | **不存在**（npm 安装，非 pnpm） | — |

**结论**：npm ≥ 9 + 工单 20 的 `--os/--cpu` 固定参数在安装期已过滤平台 optionalDependencies，实际运行时安装中**零个非宿主平台包目录**。因此 incompatiblePlatformAssets 规则是纯防御性的（正常安装下删 0 字节），按 Minke 的 `prunableRuntimeDirectory` 思路实现为：

- `node-pty/deps/winpty`、`node-pty/third_party/conpty`（非 Windows 删，防御性，源自 Minke）
- 已盘点 native 包族目录，凡尾部三元组 `<os>-<arch>` ≠ 宿主则整目录删除：`@esbuild/<t>`、`@next/swc-<t>`、`@img/sharp-<t>`、`@img/sharp-libvips-<t>`、`@tailwindcss/oxide-<t>`、`@rollup/rollup-<t>`、`@unrs/resolver-binding-<t>`、`lightningcss-<t>`（含嵌套 node_modules）
- 白名单纪律：平台样名称但不在盘点包族列表中的目录（如 `node_modules/@scope/win32-x64`）**不删**

### 实测估算（对实际运行时安装 ~/.poweri/web，darwin-arm64，598 MB / 36,517 文件，只读测量）

| 类别 | 文件数 | 字节 |
|------|--------|------|
| sourceMaps（.map） | 8,472 | 43,836 KB |
| typeDeclarations（.d.ts/.d.mts/.d.cts） | 10,199 | 34,372 KB |
| buildCaches（.tsbuildinfo） | 4 | 216 KB |
| documentation（readme/changelog/changes/history） | 418 | 5,092 KB |
| incompatiblePlatformAssets | 0 | 0 KB |
| **合计** | **19,093（占 52%）** | **≈ 83,516 KB ≈ 81.6 MB** |

裁剪后预期 ~516 MB（598 − 81.6），落在工单预期的 500–540 MB 区间内。`LICENSE*` 零删除。健康检查所需文件（bin/*.js、.next/BUILD_ID、package.json）全部不匹配任何类别，已逐一验证。

## 验收标准

- cargo build / test / clippy 全绿（clippy 零新增 warning）
- 裁剪规则单测覆盖 5 个类别 + LICENSE 保留 + 幂等
- 实测（可选但推荐）：本地模拟裁剪，统计可删字节数，写进工单"实测"节

## Out of Scope

- 不做选择性部署（依赖闭包计算）——pi-web 是第三方包，import 关系不可控
- 不删 JS 产物、不删 .next、不改 package.json manifest
- 不做 esbuild launcher 替换（pi-web 依赖树中 esbuild 非关键路径，Minke 的特例不移植）

## Further Notes

- 参考实现：/tmp/pi-github-repos/lencx/Minke/scripts/harness/runtime-prune.mjs（已 clone 的 Minke 源码，只读参考）
- 工单 20 实测：608MB 基线；裁剪后预期 500-540MB（省 70-100MB）
- 与工单 23 联动：裁剪落地后收紧 CI 体积预算

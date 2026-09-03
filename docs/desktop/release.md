# 发布手册（Release Runbook）

> poweri-v0.2.0 首发 CI 三连挂的产物（2026-09-02）。发布前通读，按序执行；
> 相关陷阱详见 [`traps.md`](traps.md) 末尾三条。

## 版本管理策略（lockstep）

桌面 app 的能力 = Web 内核版本 + 壳版本。业界同类同仓项目（npm 包 + 桌面 app：
backlog、multica 等）验证的最优解是 **lockstep 单版本号**：`poweri-v*` 联发时
npm 包与壳同号推进，一张 tag = 一个完整可对账的发布快照。不做双包独立版本
（changesets 各自 bump 的对账成本，对单人项目为负收益）。

选通道的判定规则：

| 变更范围 | 通道 | 版本号推进 |
|---|---|---|
| Web 层有变化（`poweri/`、`app/poweri/` 等）或 web/壳需配套 | `poweri-vX.Y.Z` 联发 | npm 与壳同号 bump（五处同步，见门禁 §1） |
| 仅壳层修复（`src-tauri/**`）且 web 包无需变化 | `poweri-app-vX.Y.Z` | 仅壳三处 bump（见门禁 §1） |

边界原则：

- 拿不准时**默认联发**（壳/web 兼容性自查比版本解耦的收益更值钱，见门禁 §5）
- npm 版本不可复用：发布失败只能 bump patch 重发，禁止对已发版本重打 tag
- changelog 暂不引入自动化工具（changesets / release-please）：在 GitHub Release
  草稿 notes 中手写用户可感知变更；变更频率显著上升后再评估工具化

## 发布通道（全部由 CI 完成，本地不发版）

两种发布 tag，对应两条发布路径：

### 联发：`poweri-v*`（npm 包 + 壳同步发版，默认路径）

web 层有变更（或壳/ web 需同步配套）时使用。tag 推送即触发：

| Workflow | 动作 | 门禁 |
|---|---|---|
| `publish-poweri-web.yml` | `npm ci` → `npm test` + `shell:test` → `next build --webpack` → `npm publish --access public`（NPM_TOKEN secret） | tag 版本 == `package.json` version（CI 强制校验） |
| `build-poweri-desktop.yml` | 三平台矩阵（macos-arm64/macos-x64/windows-x64）Tauri 构建 → artifacts → **GitHub Release 草稿**（`--draft`，需手动 publish） | tag 版本 == `tauri.conf.json` version（CI 强制校验） |
| `test-poweri-desktop.yml` | 三平台 `cargo test`（debug profile） | paths 触发：`src-tauri/**` |
| `upstream-replacement-audit.yml` | 替换件审计 check | push main/desktop 即跑 |

### 壳独立发版：`poweri-app-v*`（仅壳，不触发 npm publish）

仅壳层（`src-tauri/**`）变更、web 包无需发版时使用（如 `poweri-app-v0.2.5`）。`poweri-app-v*` 前缀不匹配 `publish-poweri-web.yml` 的 `poweri-v*` 触发模式，npm 侧零动作。壳首装 web 包用 `@latest`（`installer.rs package_spec()`），与升级路径一致，壳版本号与 npm 包版本号解耦。CI 校验：tag 版本（去 `poweri-app-v` 前缀）== `tauri.conf.json` version。

注意：`poweri-v*` / `poweri-app-v*` 才触发发布；杂散格式（`0.2.0`、`v0.2.0`）不触发任何 CI，
却会造成“已发布”的错觉（0.2.0 曾因此实际停在 npm 0.1.14）。

## 打 tag 前置门禁（全部通过才允许打 tag）

1. **版本一致性**：
   - 联发 `poweri-v*`：五处同步（缺一 CI 必挂）——`package.json`、`package-lock.json`
     （2 处）、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`
     （poweri-desktop 条目）。参考 `chore(desktop): bump version to X.Y.Z` 历史提交。
   - 壳独立 `poweri-app-v*`：三处同步——`src-tauri/tauri.conf.json`、
     `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（poweri-desktop 条目）；
     `package.json` / `package-lock.json` 不动。**不得回退到壳版本 pin**
     （首装 `@latest` 是解耦前提，见 installer.rs `package_spec()`）。
2. **本地测试**：`npm test` + `npm run shell:test` 全绿（注意测试不得硬编码
   开发机绝对路径，见 traps.md——本地绿 ≠ CI 绿）。
3. **Rust 侧**：本机无 cargo 工具链，确认最近一次 push 已让
   `test-poweri-desktop` workflow 绿过；若本次改动涉及 `src-tauri/**`，先推分支
   等 CI 绿再打 tag。
4. **上游对照**：`node scripts/upstream-replacement-audit.mjs check` 通过。
5. **壳/ web 兼容性**（联发后独立发壳时自查）：壳 iframe ↔ web 的
   postMessage 协议与 `/poweri` 路由约定未破坏；不确定时优先联发。

## 发布执行

```bash
# 联发（npm 包 + 壳）：
git tag poweri-vX.Y.Z && git push origin <branch> && git push origin poweri-vX.Y.Z

# 壳独立发版（不触 npm）：
git tag poweri-app-vX.Y.Z && git push origin <branch> && git push origin poweri-app-vX.Y.Z
```

然后盯 Actions：联发时 npm 发布成功后 `npm view @poweri/poweri-web version` 应返回新版本；
两种 tag 的桌面构建完成后到 GitHub Releases **手动 publish 草稿**（macOS 未签名，
说明文案已注明去隔离）。

## 失败应对

- **tag 已推送才发现 CI 挂**：tag 固化（`git push -f` 被权限硬拦，勿尝试绕过），
  修复后按“版本一致性”bump 到下一个 patch 号、打新 tag 重发。失败 tag 留在原地
  无副作用（其 CI 已结束、npm 未发出、Release 草稿未创建）。
- **npm test 只在 CI 挂**：先对账本地 vs CI 的 tests 总数（差值 = 未注册用例数），
  看失败 step 耗时（秒挂 = 加载错误，跑满全程 = 断言失败）；文件级
  `✖ <file>:1:1 'test failed'` = 该文件加载崩了，优先查 import 路径。
- **本地克隆复现 CI**：记住克隆仍在本机共享文件系统上，硬编码本机路径的代码
  会在克隆里“正常工作”，复现结果不可信。

## 已知残留

- `poweri-v0.2.0` tag 固化在有 bug 的提交上（13282a7），其 npm/Release 均未产出，
  仅作历史标记，勿基于它发布或安装。

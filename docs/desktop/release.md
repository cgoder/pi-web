# 发布手册（Release Runbook）

> poweri-v0.2.0 首发 CI 三连挂的产物（2026-09-02）。发布前通读，按序执行；
> 相关陷阱详见 [`traps.md`](traps.md) 末尾三条。

## 发布通道（全部由 CI 完成，本地不发版）

打 **`poweri-v*`** tag 推送到 GitHub 即触发：

| Workflow | 动作 | 门禁 |
|---|---|---|
| `publish-poweri-web.yml` | `npm ci` → `npm test` + `shell:test` → `next build --webpack` → `npm publish --access public`（NPM_TOKEN secret） | tag 版本 == `package.json` version |
| `build-poweri-desktop.yml` | 三平台矩阵（macos-arm64/macos-x64/windows-x64）Tauri 构建 → artifacts → **GitHub Release 草稿**（`--draft`，需手动 publish） | tag 版本 == `tauri.conf.json` version |
| `test-poweri-desktop.yml` | 三平台 `cargo test`（debug profile） | paths 触发：`src-tauri/**` |
| `upstream-replacement-audit.yml` | 替换件审计 check | push main/desktop 即跑 |

注意：`poweri-v*` 才触发发布；杂散格式（`0.2.0`、`v0.2.0`）不触发任何 CI，
却会造成“已发布”的错觉（0.2.0 曾因此实际停在 npm 0.1.14）。

## 打 tag 前置门禁（全部通过才允许打 tag）

1. **版本一致性**：五处同步（缺一 CI 必挂）——`package.json`、`package-lock.json`
   （2 处）、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`
   （poweri-desktop 条目）。参考 `chore(desktop): bump version to X.Y.Z` 历史提交。
2. **本地测试**：`npm test` + `npm run shell:test` 全绿（注意测试不得硬编码
   开发机绝对路径，见 traps.md——本地绿 ≠ CI 绿）。
3. **Rust 侧**：本机无 cargo 工具链，确认最近一次 push 已让
   `test-poweri-desktop` workflow 绿过；若本次改动涉及 `src-tauri/**`，先推分支
   等 CI 绿再打 tag。
4. **上游对照**：`node scripts/upstream-replacement-audit.mjs check` 通过。

## 发布执行

```bash
git tag poweri-vX.Y.Z && git push origin <branch> && git push origin poweri-vX.Y.Z
```

然后盯 Actions：npm 发布成功后 `npm view @poweri/poweri-web version` 应返回新版本；
桌面构建完成后到 GitHub Releases **手动 publish 草稿**（macOS 未签名，
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

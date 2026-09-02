---
title: 03 测试接线进 npm test 与 CI 门禁
status: done
type: task
labels: [ready-for-agent]
---

## 背景（Standards H2，硬违规）

`package.json` 的 `test` script glob 只有 `app/components/hooks/lib/public`，**不含 `poweri/**`**——本周期新增的 111 个 PowerI 单测（17 个文件）`npm test` 永不执行。CI 侧同样零触达：`build-poweri-desktop.yml` 只构建不打测试；`publish-poweri-web.yml` 发布前仅 build+pack（npm 包发布零测试）；`test-poweri-desktop.yml` 只跑 `cargo test`；`shell:test` 也未接入任何 workflow。违反全局约定"以验证闭环为荣"：v0.2.0 发布建立在这批测试永不自动执行的盲区上。

## 要做什么

1. `package.json` test script glob 追加 `"poweri/**/*.test.mjs"`。
2. `.github/workflows/publish-poweri-web.yml`：在 build/publish 之前加 `npm test`（含 shell 则 `npm run shell:test`）步骤，失败即中止发布。
3. `.github/workflows/build-poweri-desktop.yml`：build 前加 `npm test`（如步骤已存在则确认覆盖 poweri glob 即可）。
4. eslint 配置（`eslint.config.*`）ignore 追加 `temp/`（已 gitignore 的 scratch 目录，当前使全仓 lint 报 17 errors；源码范围实为 0 errors/5 warnings）。

## 验收

1. 本地 `npm test` 用例数 849 → 约 960（849+111），0 fail。
2. `npm run lint` 全仓 0 errors（剩余 warnings 逐条可解释）。
3. 两个 workflow YAML 改动经 `node -e "require('js-yaml')..."` 或 actionlint 类检查确认语法（无工具则人工核对缩进）。

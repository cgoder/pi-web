---
title: CI 体积监控
status: done
type: task
blocked-by: [20]
---

# CI 体积监控

## Problem Statement

pi-web 安装体积无监控机制，依赖膨胀无法感知。Minke 的经验表明，每次构建都应该验证体积，防止回归。

## Solution

添加 GitHub Actions workflow，每次构建时：
1. 在临时目录安装 pi-web（使用优化后的参数）
2. 测量安装体积
3. 与预算对比，超预算则 CI 失败
4. 上传体积报告作为 artifact

## User Stories

1. As a maintainer, I want CI to report pi-web install size on every build, so that I can detect volume regression early
2. As a release manager, I want CI to fail the build if install size exceeds a budget, so that users don't experience unexpected download bloat
3. As a contributor, I want to see install size breakdown in CI logs, so that I can identify which dependencies are growing

## Implementation Decisions

### GitHub Actions Workflow

```yaml
# .github/workflows/size-check.yml
name: Install Size Check

on:
  push:
    paths:
      - 'src-tauri/**'
      - 'package.json'
      - 'package-lock.json'
  pull_request:
    paths:
      - 'src-tauri/**'
      - 'package.json'
      - 'package-lock.json'

jobs:
  check-size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - name: Install pi-web and measure size
        run: |
          # 使用与 installer.rs 相同的参数
          npm install --prefix ./test-install \
            --omit=dev \
            --omit=optional \
            --os=linux \
            --cpu=x64 \
            @agegr/pi-web
          
          SIZE=$(du -sm ./test-install | cut -f1)
          echo "Install size: ${SIZE}MB"
          echo "SIZE=${SIZE}" >> $GITHUB_ENV
      
      - name: Check size budget
        run: |
          BUDGET=200  # MB
          if [ ${{ env.SIZE }} -gt $BUDGET ]; then
            echo "::error::Install size ${{ env.SIZE }}MB exceeds budget ${BUDGET}MB"
            exit 1
          fi
          echo "::notice::Install size ${{ env.SIZE }}MB within budget ${BUDGET}MB"
      
      - name: Generate size report
        run: |
          echo "## Install Size Report" > size-report.md
          echo "" >> size-report.md
          echo "- **Install size**: ${{ env.SIZE }}MB" >> size-report.md
          echo "- **Budget**: 200MB" >> size-report.md
          echo "- **Headroom**: $((200 - ${{ env.SIZE }}))MB" >> size-report.md
          echo "" >> size-report.md
          echo "### Top 10 largest directories" >> size-report.md
          echo '```' >> size-report.md
          du -sm ./test-install/node_modules/* | sort -rn | head -10 >> size-report.md
          echo '```' >> size-report.md
      
      - name: Upload size report
        uses: actions/upload-artifact@v4
        with:
          name: size-report
          path: size-report.md
          retention-days: 30
```

### 体积预算

- **初始预算**：200MB（优化后预期 150-180MB）
- **调整策略**：每月审查预算合理性，按需调整
- **超预算处理**：CI 失败，PR 无法合并，必须优化或申请提高预算

### 体积报告内容

- 总体积
- 与预算对比
- Top 10 最大目录
- 历史趋势（可选，后置）

## Testing Decisions

- **测试 workflow 本身**：在 PR 中验证 workflow 语法正确
- **测试体积计算**：本地运行 `du -sm` 验证与 CI 一致
- **测试预算检查**：故意设置低预算（如 10MB），验证 CI 失败

## Out of Scope

- 不做体积历史趋势图（后置，需要数据库）
- 不做依赖树可视化（后置，用 `npm explain` 手动分析）
- 不做自动预算调整（人工审查）

## Further Notes

- Workflow 只在 `src-tauri/**`、`package.json`、`package-lock.json` 变更时运行
- 体积报告保留 30 天，用于回溯
- ~~预算 200MB 是初始值，优化后应该降到 180MB 以下~~（已否决，见实施记录：实测不可达）
- 参考 Minke 的体积裁剪验证策略（每项删除都证明功能完整）

## 实施记录（2025-08，已完成）

### 预算设定依据（基于工单 20 实测，非拍脑袋）

- 工单 20 实测（macOS arm64 / npm 11.6.2，组合③ `--omit=dev --os=darwin --cpu=arm64`）：node_modules ≈ **608MB**
- linux x64 未实测，预计略小（平台 native 包体积不同）
- **初始预算 = 700MB**（≈ 608MB × 1.15，+15% 余量），保证 CI 首跑不误报
- 工单示例的 **200MB 预算不现实**：仅 next dist ~198MB + pi-coding-agent ~139MB 就已超出
- 策略：**先松后紧**——CI 误报比漏报更伤开发者信任；首跑后记录 linux 实际值，人工收紧（建议保留 10-15% 余量）

### 参数修正（与工单示例的关键差异）

- 工单示例的 `--omit=optional` **被否决**：工单 20 实测 Next 16 的 SWC 二进制在 optionalDependencies，省略后 `next start` 首启自动重下 31MB tarball（~10s 阻塞、网络依赖），净省仅 ~51MB
- 实际使用：`npm install --prefix ./test-install --omit=dev --os=linux --cpu=x64 @agegr/pi-web`（与 installer.rs 组合③一致），另加 `--no-audit --no-fund --no-package-lock` 加速/防污染
- 完整理由见 workflow 头部注释

### 测量口径

- `du -sm`（MiB）测量**整个 ./test-install 目录**（node_modules + npm 写入的 package.json；`--no-package-lock` 无 lockfile）
- node_modules 占绝对大头，与工单 20 的 node_modules 口径（608MB）差异 < 1MB，可比

### 首跑后待办

1. 记录第一次 linux x64 实际 SIZE 与 headroom
2. 人工决定是否收紧 `SIZE_BUDGET_MB`（建议保留 10-15% 余量）
3. 收紧时修改 workflow 的 `SIZE_BUDGET_MB`（workflow 文件自身已列入 paths，改预算会自动触发检查）

### 其他

- 触发路径除工单示例三项外，追加 `.github/workflows/size-check.yml` 自身（改预算/改 workflow 也能触发检查；与仓库其他 workflow 约定一致），另加 `workflow_dispatch` 便于手动验证
- 报告 artifact：总体积 / 预算 / headroom / Top 10 最大 node_modules 目录；`actions/upload-artifact@v4`，retention 30 天
- 超预算：`::error::` + exit 1 失败；预算内：`::notice::`
- YAML 已用 `python3 yaml.safe_load` 验证通过；shell 逻辑（du 路径、GITHUB_ENV 跨 step 传值、算术、Top 10 排序）已本地模拟验证超预算/预算内两路径

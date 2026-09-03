# PowerI

[English](./README.md)

PowerI 是基于 [pi coding agent](https://github.com/earendil-works/pi) 的 AI 编程助手——原生桌面应用 + 独立 Web UI。它 fork 自 [pi-web](https://github.com/agegr/pi-web)（pi 的本地浏览器界面），在其上增加产品层：用量与成本统计、插件与技能市场、工作区感知的附件体系、统一设置面板——全程**零修改上游代码**。

## 架构

PowerI 是严格的三层体系，上游代码**替换而非修改**，上游更新可干净合并：

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Tauri 桌面壳                  src-tauri/                          │
│    原生窗口、系统托盘、Node/Web 进程托管、环境探针、静默安装与升级      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ iframe http://127.0.0.1:9989/poweri
                               │ + __TAURI__ IPC 双向通信桥
┌──────────────────────────────▼──────────────────────────────────────┐
│ 2. PowerI 产品层                 poweri/ + app/poweri/               │
│    替换式 AppShell、统计与用量面板、插件/技能市场、双模附件、国际化     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ import @/lib、@/hooks（上游）
┌──────────────────────────────▼──────────────────────────────────────┐
│ 3. pi-web 基础引擎层             lib/ hooks/ app/api/ components/    │
│    Pi SDK 驱动、RPC 会话管理、SSE 流式推流                             │
│    （上游持有，零修改红线区域）                                       │
└─────────────────────────────────────────────────────────────────────┘
```

两种交付形态共享同一产品层：

| 形态 | 是什么 | 适合谁 |
| --- | --- | --- |
| **PowerI 桌面应用** | Tauri 2 壳：安装、拉起并升级 `@poweri/poweri-web` 子进程，嵌入系统 WebView（WKWebView / WebView2） | 想要零环境配置原生体验的最终用户 |
| **PowerI Web（`@poweri/poweri-web`）** | 独立 npm 包：`npx @poweri/poweri-web` 在 `http://127.0.0.1:9989/poweri` 提供服务 | 开发者与终端优先的工作流 |

## 快速开始

运行时要求 **Node.js 22.19+**。

### 桌面应用

从 [Releases](https://github.com/cgoder/pi-web/releases) 下载安装包（`.dmg` / `-setup.exe` / `.msi`）。首次启动会出现设置向导：探测系统 Node.js（含 fnm/nvm 根目录）、复用或安装 `@poweri/poweri-web`、启动本地服务并嵌入界面。后续升级一键完成——壳执行 `npm install @poweri/poweri-web@latest` 并重启服务。

从源码构建（需要 Rust 工具链）：

```bash
npm install
npm run tauri dev      # 开发模式：next dev + vite 壳，热更新
npm run desktop        # 生产构建：shell:build + tauri build
```

安装包产出在 `src-tauri/target/release/bundle/`。壳内部实现见 [`src-tauri/README.md`](./src-tauri/README.md)。

### 独立 Web 运行

```bash
npx -y @poweri/poweri-web          # 自动打开 http://127.0.0.1:9989/poweri

# 或全局安装
npm install -g @poweri/poweri-web
poweri-web
poweri-web -p 3000 --no-open       # 覆盖端口 / 不弹浏览器
```

启动选项与 pi-web 完全一致（`-p`、`-H`、`--no-open`、`-h`；环境变量 `PORT`、`PI_WEB_HOSTNAME`、`PI_WEB_NO_OPEN`、`PI_WEB_PASSWORD`、`PI_WEB_ALLOWED_HOSTS`），仅默认端口不同：**9989**（PowerI 专用）而非上游的 30141。注意落地页是 `/poweri`——根路径 `/` 仍是上游 pi-web 界面，这是保留上游基线不动刀的既定代价。详见 [`docs/desktop/poweri-web-standalone.md`](./docs/desktop/poweri-web-standalone.md)。

## 功能特性

- **用量统计**：时间线优先的会话历史，按天 / 按工作区 / 按项目的 Token 与费用分解、缓存命中率可视化、单会话下钻。数字直接从会话 JSONL 计算，口径与官方 SDK 一致。
- **插件与技能市场**：实时对接 `pi.dev/packages` 与 `skills.sh`（搜索、排序、安装量统计），支持私有 Git 技能仓库订阅——零硬编码假数据。
- **双模附件**：桌面端文件存入工作区、以轻量路径传给 Agent 按需调阅；浏览器端自动降级为 `<attached_files>` XML 内联注入。两端体验一致。
- **工作区感知 Markdown**：助手消息中的文件路径自动转为可点击链接，直达内置文件查看器。
- **统一设置**：一个设置面板（常规 / 模型 / 技能 / 子代理 / 插件）替代分散的配置弹窗。
- **国际化**：简体中文、繁体中文、英文。

## 开发

```bash
npm install
npm run dev                          # web 开发服务，127.0.0.1:9989
node_modules/.bin/tsc --noEmit       # 类型检查
npm test                             # 单元测试（上游 + poweri/）
npm run lint
```

日常开发**不要**运行 `next build` 或 `npm run build`——会写入 `.next/` 干扰 dev server，构建留给发布流程。

### 分支模型

```
upstream（agegr/pi-web，只读镜像）
  └─ poweri    Web 层主干：产品层 + 文档 + CI  → 发布为 @poweri/poweri-web
      └─ desktop    增加 src-tauri/ 壳          → 发布为桌面应用
```

提交按文件归属落分支（`poweri/`、`app/poweri/`、`docs/desktop/`、`scripts/` → `poweri`；`src-tauri/` → `desktop`），数据流单向 `poweri → desktop`。硬性红线：**上游文件一律禁改**——新 UI 一律写进 `poweri/` 作为替换件，且每个替换件登记进 [`docs/desktop/replacements.json`](./docs/desktop/replacements.json)，防止上游变更被静默忽略。详见 [`docs/desktop/branch-model.md`](./docs/desktop/branch-model.md) 与 [`docs/desktop/ownership.md`](./docs/desktop/ownership.md)。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`docs/desktop/architecture-and-scope-boundary.md`](./docs/desktop/architecture-and-scope-boundary.md) | 三层架构与范畴边界规范（深度） |
| [`docs/desktop/file-map.md`](./docs/desktop/file-map.md) | 逐文件地图与构建验证归属 |
| [`docs/desktop/branch-model.md`](./docs/desktop/branch-model.md) | 分支拓扑、上游同步 SOP |
| [`docs/desktop/ownership.md`](./docs/desktop/ownership.md) | 上游持有 vs PowerI 持有名册、例外登记 |
| [`docs/desktop/poweri-web-standalone.md`](./docs/desktop/poweri-web-standalone.md) | 独立 Web 运行、端口约定、与壳的互动 |
| [`docs/desktop/release.md`](./docs/desktop/release.md) | 发布 runbook（npm + 桌面端、tag 纪律） |
| [`src-tauri/README.md`](./src-tauri/README.md) | 桌面壳内部：启动状态机、进程管理、升级流水线 |
| [`poweri/README.md`](./poweri/README.md) | 产品层：替换式架构、目录导览 |
| [`docs/adr/`](./docs/adr) | 架构决策记录（PowerI 与上游） |

## 致谢

PowerI 的存在离不开它所立足的上游项目：

- **[pi-web](https://github.com/agegr/pi-web)**（作者 [@agegr](https://github.com/agegr)）——pi coding agent 的本地浏览器界面，也是 PowerI fork 的基础。三层架构中的整个基础引擎层都是上游代码，零修改使用并定期跟随合并。
- **[pi coding agent](https://github.com/earendil-works/pi)**（作者 [Earendil Works](https://github.com/earendil-works)）——pi-web（进而 PowerI）所驱动的 Agent 运行时、SDK 与会话格式。

PowerI 自身的工作仅限于产品层（`poweri/`、`app/poweri/`）与桌面壳（`src-tauri/`）；一切地基性的部分——Agent 本体、RPC/会话架构、聊天界面——都来自上游，功劳属于上游作者与贡献者。上游项目与 PowerI 均为 MIT 许可；基础层以上游为权威来源。

## 许可证

[MIT](./LICENSE)

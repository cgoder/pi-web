# ct-jyjntc/pi-web 研究（fork pi-web + Electron 深度加壳）

> 研究日期：2026-08-16
> 对象：https://github.com/ct-jyjntc/pi-web（@ct-jyjntc/pi-web v1.1.1，fork 自官方 agegr/pi-web v0.8.9）
> 方法：GitHub API（fork 关系、releases）+ 浅克隆源码逐文件分析 + 与本地官方 pi-web diff

## 一句话结论

**官方 agegr/pi-web 的深度 fork + 二次开发：Electron 壳 + app:// 协议直载 Vite SPA + 双 Node 子进程 IPC 直连 + 内置 Node 二进制——彻底去掉了回环 HTTP 服务器。** 不是简单加壳：在官方 UI 之上扩展了一整层产品功能（Git Review、终端、上下文面板、记忆、LSP 健康），壳只是其中一块。

## 架构（与官方 shell 的本质差异）

```
Electron main
├── app://pi → desktop-dist          (electron/app-protocol.js，静态吐 SPA，无 HTTP 端口)
├── BrowserWindow.loadURL("app://pi")
├── ipcMain: pi-api:request/stream/abort (electron/runtime-host.js)
└── spawn(内置 Node, daemon/ipc-host.mjs) × 2
     ├── light  — 无需 SDK 的路由（sessions/files/git/settings…，手工维护分类表）
     └── heavy  — agent SDK + 聊天/ModelRuntime（后台预热，不阻塞 UI）
```

- **UI 双跑**：同一套 React 组件，浏览器走 Next.js、桌面走 Vite SPA（alias 把 `next/*` shim 成薄实现，`desktop/shims/`）；传输层单一 owner `lib/api-transport.ts`（`window.piApi` vs fetch/SSE），约 50 个调用点无感切换
- **后端零重写**：`daemon/dispatch.mjs` 复用未修改的 `app/api/**` Next.js App Router 处理器（`next/server` 被 shim 成 Request/Response 子类）
- **内置 Node**：`bundle-runtime-node.mjs` 打包官方 Node 二进制（用户免装 Node，解决所有 PATH/版本问题）
- **裁剪**：Next 生产服务器从安装包中移除（`PI_WEB_KEEP_NEXT=1` 才保留）；SDK 折叠单文件 bundle（原生 import 0.5s vs jiti 20s）；`bin/pi` CLI shim 指向内置 Node
- **实测数据**（README）：UI ready ~246ms，/api/sessions ~396ms，SDK 冷加载 ~10s 被隔离在 heavy 进程不冻结 chrome

## 为什么双运行时（最大亮点）

SDK（@earendil-works/pi-coding-agent）冷加载阻塞 Node 事件循环 10-20s。单进程方案下会话列表/文件树全排队卡死；拆 light/heavy 后 UI 骨架秒开。代价：LIGHT 路由清单手工维护（注释明示"分类错误单向安全"）。

## 与三种方案对比

| 维度 | ct-jyjntc fork | 官方 shell / dsh-desktop（Tauri+npx+iframe） | PiDeck（Electron+自研UI+pi RPC） |
|---|---|---|---|
| 壳框架 | Electron 43 | Tauri 2 | Electron |
| 本地服务 | 无 HTTP 回环（app:// + IPC） | Next 服务 127.0.0.1:30141 | 无（pi RPC stdio） |
| UI 承载 | loadURL("app://pi") 直载 SPA | iframe 内嵌本地服务 | 完全自研 |
| 后端 | 双 Node 子进程复用 app/api | 独立 Next 进程（SDK 在服务内） | pi RPC JSONL |
| Node 依赖 | 内置 Node，用户零依赖 | 需系统 Node | 需系统 pi CLI |
| 功能扩展 | Git Review/终端/上下文面板/记忆… | 零（壳只承载） | 完整工作台 |

**本质**：ct-jyjntc 把 pi-web 改造成了"不需要 web 服务器的双进程桌面应用"（HTTP→IPC、iframe→协议直载、系统 Node→内置）；官方 shell/dsh-desktop 是"壳包着完整 web 应用"，对本体零侵入，代价是常驻 HTTP 服务 + 全部 iframe/端口/PATH 坑。

## 值得借鉴

1. 双运行时按路由分类（light/heavy）——SDK 阻塞问题的正解，分类表思路可照抄
2. 传输层单一 owner（api-transport）——桌面 IPC 与浏览器 fetch 双跑、调用点零改动的关键抽象
3. app:// 自定义协议——无端口冲突、无防火墙/多实例问题
4. 复用 app/api + next/server shim + 路由自动发现——后端零重写
5. 内置 Node + SDK 单文件 bundle + jiti 仅 dev 回退
6. 坑位：JSON+base64 IPC（Electron V8 与 Node V8 structured clone 不兼容）；renderer abort 要传播到子进程 AbortController；splash + notifyUiReady 握手防白屏

## 避坑

1. 维护成本高：LIGHT 清单手工维护、fork 每次跟上游 diff（与官方同天发版可见其辛苦）、AGENTS.md 大量 MUST NOT 约束
2. 体积与签名：内置 Node + SDK 包体大；macOS ad-hoc 签名未公证（首次打开右键→打开）
3. IPC 传输限制：JSON+base64 对大文件有开销
4. 无 CI（仅 Pages workflow），打包靠本地脚本手动执行
5. 若只想要"壳"，这条路性价比最低（要动 UI 构建链、路由层、打包管线三层）；若目标是"功能扩展 + 极致桌面体验"，这是目前最完整的范本

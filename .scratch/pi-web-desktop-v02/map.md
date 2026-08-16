# Wayfinder 航图：pi-web-desktop v0.2 增强路线图

> 本地 markdown tracker。地图 = 本文件；工单 = `issues/` 下每文件一张。frontier = open、未被 blocking、未 claim 的工单，按编号顺序取。

## Destination

产出一份 **pi-web-desktop v0.2 实施方案（spec）**：确定从 PiDeck / ct-jyjntc / dsh-desktop 借鉴哪些功能（范围已切，见各工单与 Out of scope）、每项落在哪一层（Tauri 壳 / pi-web fork 的 UI+API，架构已定为**单 fork 深改**）、以什么形态实现、按什么顺序做。航程结束 = 全部工单 resolved，剩下只有"照着 spec 实现"。

本航程只做决策与调研，不写业务实现；prototype 工单产出粗糙原型物用于讨论，属唯一例外。

## Notes

- 领域：pi-web 官方 fork（`desktop` 分支，上游 agegr/pi-web v0.8.9）+ Tauri 2 薄壳（src-tauri/ + shell/）
- 工作语言：中文；结论先行
- 每个工单一个会话（research 可并行）；一个会话最多 resolve 一个非 research 工单
- 基线文档：先读 `docs/desktop/`（web-to-native-mini-app-guide / pideck-research / ct-jyjntc-pi-web-research / feature-borrowing-matrix / pi-web-desktop-verification-guide），再答工单
- research 工单：/research 子代理在 throwaway 分支 `research/<name>` 上产出 findings（写入 `docs/desktop/<name>.md`），工单里留 context pointer
- grilling 工单：/grilling + /domain-modeling；需要事实时先读本地代码（app/ components/ lib/ 在本仓库内，直接查）
- prototype 工单：/prototype skill；产物以链接进工单，不粘贴正文
- fork 纪律：改动尽量集中在少量目录，保持与 main 可 merge（细节随 06 决策）

## Decisions so far

- [01 R1-pi-sdk-capabilities](issues/01-r1-pi-sdk-capabilities.md) — SDK 统计完备（getSessionStats / getContextUsage / RPC get_session_stats，官方 pi-web 已在消费）；MCP 与 plan 模式零原生支持，唯一路径是自建/引入扩展；权限只有「项目信任（defaultProjectTrust + trust.json）+ 工具 allow-list（--tools，PRESET_* 即其具名组合）」，无 allow/ask/deny/YOLO，逐工具确认需扩展 tool_call 拦截；`--approve` 仅覆盖项目信任。详情见 docs/desktop/pi-sdk-capabilities-research.md

## Not yet specified

- 语义 token 展示、拖拽排序、行宽滑块等布局细节 —— 随 07/08（F1/F2 原型）毕业
- 状态栏与统计面板的数据共享形态 —— 随 01/09/11 毕业
- GitPanel 的 AI 提交信息 / 冲突助手 / commit split 子项取舍 —— 随 16 毕业
- 权限系统 UI 形态与模式命名（allow/ask/deny/YOLO 与 pi 工具预设的映射）—— 随 01/15 毕业
- 二开后上游同步的具体节奏（merge 频率、冲突处理）—— 随 06 毕业
- 壳与 fork 的版本联动（各自发版时机）—— 随 17 毕业

## Out of scope

- 文件增强（Monaco / fuzzy index / diff vs HEAD）—— 用户确认出局（F12）
- ct-jyjntc 架构全套：app:// 协议、内置 Node、双运行时 light/heavy、Next 裁剪 —— 终局备选，不动
- 终端多 tab、Debug tab、项目记忆、LSP 健康 —— 排期后置
- 内置浏览器预览、提示词/Prompt 商店、会话导入（Codex/Claude）—— 产品取舍出局
- Electron 路线 —— 壳已定 Tauri，不回头
- 本航程不写业务实现 —— destination 本身

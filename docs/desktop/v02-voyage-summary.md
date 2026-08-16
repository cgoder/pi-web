# pi-web-desktop v0.2 航程总结（wayfinder）

> 2026-08-16 · 一次 wayfinder 制图+逐票决策航程，终点 = v0.2 实施方案。
> 实施蓝图见 [`v02-spec.md`](v02-spec.md)；逐条决策见 `.scratch/pi-web-desktop-v02/`（17 张工单全 resolved）。

## 一、航程目标

把 pi-web-desktop（pi-web fork + Tauri 薄壳）从「浏览器里能用的 web 版」推进到「桌面工作台」：确定 v0.2 借鉴哪些功能、每项落在哪一层、以什么形态实现、按什么顺序做。**航程只做决策与调研，不写业务实现**（prototype 工单产出粗糙原型供讨论，是唯一例外）。

## 二、过程

1. **charting**：定 destination（v0.2 实施 spec）→ 读基线研究（borrow matrix + 5 份研究文档）→ 建地图 + 17 张工单
2. **research ×2**（子代理并行）：R1 pi SDK 能力盘点（stats/MCP/权限/plan 四问）、R2 参照项目实现细节（PiDeck 托盘/状态栏/布局/轨迹 + ct-jyjntc GitPanel/统计/Composer/权限 八问）——产出 2 份研究文档，解锁 8 张决策票
3. **prototype ×2**（HITL）：F1 三栏布局三变体 → 用户选 C 活动栏式；F2 轨迹三变体 → 用户指示照搬 deepseek-harness——产出 2 个可运行原型
4. **grilling ×12**：壳三票、治理、状态栏、统计、Composer、模型、技能、MCP、权限、GitPanel、spec 汇总——逐问拍板，全部落 Answer

## 三、关键决策（一句话版）

| 域 | 决策 |
|---|---|
| 壳 | 关窗固定进托盘（is_quitting 退出链路）；单实例唤窗；完成通知=壳订阅 running/events SSE；设置区关于块；壳自身更新检查不做 |
| 布局 | **C 活动栏式**（VS Code 范式）：会话/文件/统计三图标；无右抽屉无底部栏；扩展官方 #file-panel 体系 |
| 状态栏 | **dsh 形态**（composer 统计行 + 上下文圆环 + 状态点）；只做精确数据；事件驱动无轮询 |
| 轨迹 | **照搬 deepseek-harness ui-trajectory**（MIT）：vendor + pi 数据 adapter + 活动栏面板 |
| 统计 | ct 全套全局（无 cost）；JSONL 流式解析 + 缓存 |
| GitPanel | 仅核心；并入官方文件面板；不走权限系统 |
| Composer/模型/技能 | 官方已全覆盖三语法（补 3 命令）；补默认模型 UI；补技能预览 |
| MCP / 权限 | **不内置，直接用 pi 生态**（pi-mcp-adapter 已装 / pi-permission-system）——零开发 |
| 治理 | npm 新包名（待定）+ 跟上游后缀版本；发版时 merge main；留 desktop 分支 |

## 四、产出物

- **spec**：`docs/desktop/v02-spec.md`（实施蓝图，含里程碑 M1-M6 与验收口径）
- **研究**：`docs/desktop/pi-sdk-capabilities-research.md`、`docs/desktop/reference-impl-details-research.md`
- **原型**：`app/prototype/layout/`（F1，快照分支 prototype/f1-layout）、`app/prototype/trail/`（F2）
- **航图**：`.scratch/pi-web-desktop-v02/map.md` + `issues/01-17`（全 resolved）

## 五、提交历史（desktop 分支，2026-08-16）

- `759a86d` docs(desktop): 基线 5 份研究文档
- `599d261` docs(wayfinder): 航图 + 17 张工单
- `6244f02` claim research 01/02
- `91d03f7` + merge：R1 findings（SDK 盘点）
- `7a9dcb5` + merge：R2 findings（参照实现）
- `ceb86fa` / `406756f`：resolve 01 / 02
- `966f673` + `eecec42`：F1 原型 + 工单记录
- `d74ab6b` + `8e22045`：F2 原型 + 工单记录
- `4a898d8` / `bb3c783` / `c768704` / `51ccfe4` / `012ba1b` / `d64febf`：resolve 07 / 08 / 03 / 04 / 05 / 06
- `31c0a88` / `ccf734e` / `63613bb` / `33e32b8` / `ffc68d6` / `1e681af` / `73fb3e0` / `7a42734`：resolve 09 / 11 / 10 / 12 / 13 / 14 / 15 / 16
- `5aa88a4` resolve 17（spec 定稿）—— 航程完成

## 六、遗留（实现期事项）

1. 新 npm 包名（G1 发布链路，实现前定）
2. AskUserCard 交互流验证（权限扩展 ask 在 web 的呈现）
3. ui-trajectory React 19 冒烟（vendor 时）
4. 壳 SSE 订阅断线重连（服务重启后恢复）
5. M2 完成时做一次上游同步检查

## 七、经验沉淀

- **先查生态再决定自研**：MCP/权限两次「不内置直接用 pi 生态」把大工作量归零——pi 生态（pi.dev/packages）已成熟，自研前先搜
- **官方往往已具备**：Composer 三语法、技能管理、模型管理官方已全覆盖，增量只有小 UI 缺口——决策前先读官方代码（两次 grep 避免了两张「大票」）
- **原型先于决策**：F1/F2 的形态决策靠可运行原型 + 参照项目截图才真正拍板（用户两次都指向了具体参照：VS Code、deepseek-harness）
- **SSR 陷阱**：Next.js 里 useState 初始化在服务端执行，localStorage 记忆必须 mount effect 应用（F1 原型踩坑已记录）
- **子代理隔离 worktree**：research 子代理在隔离 worktree 产出 findings + 各自分支，合并零冲突

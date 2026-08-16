# 06-fork-governance-publishing

Type: grilling
Status: resolved

## Question

fork 治理与发布策略的决策：

- 壳目前 `npx --yes @agegr/pi-web` 拉**官方包**——深改 UI 后必须改拉自己的发布：包名（新 npm 包名？）、发布渠道（npm 公开/私有？）、版本号策略（跟上游 + 后缀 vs 独立版本？）
- 上游同步纪律：merge main 的频率与方式、冲突处理约定、改动目录集中度
- 仓库形态：继续 cgoder/pi-web 的 desktop 分支 vs 拆新仓库（架构已定单 fork 深改，但发布载体未定）

决策输出：fork 治理规则，供 17 汇总进 spec。

## Answer（2026-08-16 用户逐问拍板）

**fork 治理规则（v0.2）**：

1. **发布载体**：业务包改名发布到 **npm 公开 registry**（壳的 npx 启动链路从 `@agegr/pi-web` 切换到新包名；包名具体值 v0.2 汇总时定，候选 pi-web-desktop）；现有壳 npx 探针/升级链路（upgrade_command 的 npx 包名常量）同步换
2. **版本策略**：**跟上游 + 后缀**——如 `0.8.9-desktop.1`：merge 上游后 bump 主版本段，desktop.N 递增我们自己的改动；升级探针（npm view）读新包名
3. **上游同步纪律**：**上游发版（tag v*）时 merge main → desktop**（上游静止则按需）；官方文件改动**目录集中**（新增文件优先放 app/ components/ lib/ 的 v02 子目录，新增文件天然不冲突；必须改官方文件时尽量小）；冲突约定——以官方文件为准，重放我们的增量（依赖改动集中才可操作）
4. **仓库形态**：**留在 cgoder/pi-web fork 的 desktop 分支**（改动已就位、merge 直连、历史可追溯；桌面相关新增目录 src-tauri/ shell/ 与上游共存，新增不冲突）

**现状事实**（决策时已核实）：desktop 基于上游 v0.8.9（merge-base = Release v0.8.9），领先 20 提交、上游零领先；对官方业务文件的改动仅 package.json 14 行，其余全为新增目录（src-tauri/ shell/ app/prototype/ docs/ scripts/）→ merge 摩擦面极小，v0.2 UI 深改开始动官方文件后按上述纪律执行。

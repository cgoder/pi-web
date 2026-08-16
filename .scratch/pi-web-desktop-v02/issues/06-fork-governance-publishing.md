# 06-fork-governance-publishing

Type: grilling
Status: open

## Question

fork 治理与发布策略的决策：

- 壳目前 `npx --yes @agegr/pi-web` 拉**官方包**——深改 UI 后必须改拉自己的发布：包名（新 npm 包名？）、发布渠道（npm 公开/私有？）、版本号策略（跟上游 + 后缀 vs 独立版本？）
- 上游同步纪律：merge main 的频率与方式、冲突处理约定、改动目录集中度
- 仓库形态：继续 cgoder/pi-web 的 desktop 分支 vs 拆新仓库（架构已定单 fork 深改，但发布载体未定）

决策输出：fork 治理规则，供 17 汇总进 spec。

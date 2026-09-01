# skills.sh 搜索与生态最佳实践调研报告

## 1. 什么是 skills.sh
- **主导机构**：Vercel Labs（开源项目 `vercel-labs/skills`）。
- **定位**：面向 AI Coding Agents 的开放式 Agent Skills 注册表、发现目录与包管理系统（CLI：`npx skills`）。
- **规范标准**：
  - 核心定义文件为标准 `SKILL.md`，包含 YAML Frontmatter 元数据：
    ```markdown
    ---
    name: git-commit-helper
    description: Generates clean, conventional git commit messages based on diffs.
    tags: [git, workflow, productivity]
    dependencies: []
    ---
    ```
  - 技能以文件夹为单元组织，可托管在 GitHub 任何仓库的根目录或 `skills/` 子目录中。

## 2. 搜索与发现机制（Discovery & Search Best Practices）
1. **统一索引与检索**：
   - 官方端点：`https://skills.sh`（聚合全球社区开源 Skills）。
   - CLI 命令：`npx skills find [query]` / `npx skills search [query]`，支持交互式模糊匹配及指定 `--owner` 过滤。
2. **多源多维度发现模式**：
   - **GitHub Owner/Repo 规范**：`owner/repo`（如 `vercel-labs/agent-skills`、`openai/skills`）。
   - **直连 Git 仓库与清单**：GitLab / GitHub / HTTP Manifest 清单。
   - **本地快照与在线 fallback**：网络离线或受限时以精选快照降级，保障开箱即用。

## 3. PowerI Skills 架构对齐方案（对标 Plugins 设计）
1. **双 Tab 交互架构**：
   - **`Installed` Tab（已安装技能）**：
     - 顶部源胶囊过滤器：`All`（全部已安装）/ `Local`（本地手工创建/无明确源技能）/ `LITTA Team`（企业内部源）/ 各自定义 Git 仓库。
     - 卡片展示：技能名称、描述、所属来源徽章、启用/禁用开关（全局即时生效）。
     - 支持快捷搜索。
   - **`Discover` Tab（发现与添加技能市场）**：
     - 包含 `skills.sh` 精选、社区热门技能及已订阅仓库中的未安装技能。
     - 顶部提供“添加仓库源”（支持 GitHub、GitLab、skills.sh 等）与别名管理。
     - 一键安装 / 启用到 Agent 技能目录。
2. **分类与归属（Classification）**：
   - 有明确订阅源（GitLab/GitHub）的技能绑定 `subscriptionId` 并显示源别名。
   - 本地 `~/.pi/agent/skills/`、`~/.agents/skills/` 或当前项目下自行创建的技能统一打上 **`local`** 标签，归入 **Local** 类别。

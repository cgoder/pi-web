# 13-f8-skills-management-delta

Type: grilling
Status: resolved

## Question

技能管理增量的决策：

- 官方 SkillsConfig 已有：加载列表、搜索（/api/skills/search）、安装（/api/skills/install）、disable-model-invocation——先读 components/SkillsConfig.tsx + app/api/skills/* 确认现状
- ct-jyjntc 的做法（list/search/install 对照）——实际缺口是什么？
- 增量清单确认（UI 缺口？管理动作缺口？）

决策输出：v0.2 技能管理增量清单。

## Answer（2026-08-16 用户拍板）

**v0.2 技能管理增量（仅一项）**：

1. **加 SKILL.md 内容预览**（官方唯一缺口）：技能行加「查看」→ 面板内预览 SKILL.md 内容（数据源：技能的 source/path 已有，经 /api/files 读或新增小 API；预览只读 markdown 渲染）
2. 官方其余能力全部保留、零改动：加载列表（/api/skills，DefaultResourceLoader 统一 settings/包/项目技能）、搜索（/api/skills/search）、安装（/api/skills/install，npx skills add）、update（/api/skills/update）、check、disable-model-invocation 开关（只改 SKILL.md frontmatter，官方已保证用户格式存活）、Scope+安装路径显示
3. 与 ct-jyjntc 对照：ct 无额外技能管理优势（同为 fork 官方体系），无需对照增量

**实现要点**：SkillsConfig 加预览面板（右侧或弹层）；读取用现有文件访问能力（file-access 白名单含技能路径或按 source/path 特批）。

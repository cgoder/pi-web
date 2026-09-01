// PowerI Skills 官方目录与搜索服务 (支持 skills.sh / obra/superpowers / 社区生态精选与实时动态检索)
import type { MarketSkillItem, SkillCategory } from "./skill-subscriptions";

/**
 * 社区流行顶级技能库精选（覆盖 obra/superpowers、vercel-labs、mattpocock 等头部生态）
 */
export const EXTENDED_POPULAR_SKILLS: MarketSkillItem[] = [
  // -------------------------------------------------------------
  // obra/superpowers 系列 (AI Coding Framework & Engineering Workflows)
  // -------------------------------------------------------------
  {
    id: "skills-sh-superpowers-systematic-debugging",
    name: "superpowers:systematic-debugging",
    description: "Methodical four-phase debugging process: reproduce reliably, isolate root cause, formulate fix, verify and prevent regressions.",
    author: "obra",
    tags: ["superpowers", "debugging", "workflow", "quality"],
    version: "2.4.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://github.com/obra/superpowers",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "310K",
  },
  {
    id: "skills-sh-superpowers-test-driven-development",
    name: "superpowers:tdd",
    description: "Strict test-driven development workflow: write failing unit test, verify failure reason, implement minimal pass, and refactor cleanly.",
    author: "obra",
    tags: ["superpowers", "tdd", "testing", "discipline"],
    version: "2.3.1",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://github.com/obra/superpowers",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "295K",
  },
  {
    id: "skills-sh-superpowers-subagent-driven-development",
    name: "superpowers:subagents",
    description: "Subagent-driven development: dispatch dedicated specialized child agents for isolated subtasks and review their deliverables.",
    author: "obra",
    tags: ["superpowers", "subagents", "multi-agent", "architecture"],
    version: "2.2.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://github.com/obra/superpowers",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "260K",
  },
  {
    id: "skills-sh-superpowers-executing-plans",
    name: "superpowers:executing-plans",
    description: "Disciplined implementation plan execution: step-by-step verification, checkpoint commits, and tracking progress with todo items.",
    author: "obra",
    tags: ["superpowers", "planning", "execution", "tracking"],
    version: "2.1.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://github.com/obra/superpowers",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "240K",
  },
  {
    id: "skills-sh-superpowers-brainstorming",
    name: "superpowers:brainstorming",
    description: "Structured design exploration: explore trade-offs, generate 2-3 architectural variants, and gather user approval before coding.",
    author: "obra",
    tags: ["superpowers", "design", "architecture", "brainstorm"],
    version: "2.0.4",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://github.com/obra/superpowers",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "215K",
  },
  {
    id: "skills-sh-superpowers-requesting-code-review",
    name: "superpowers:code-review",
    description: "Two-axis code review discipline: verify changes against both repo coding standards and original feature specifications.",
    author: "obra",
    tags: ["superpowers", "code-review", "audit", "standards"],
    version: "2.1.5",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://github.com/obra/superpowers",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "198K",
  },
  {
    id: "skills-sh-superpowers-dispatching-parallel-agents",
    name: "superpowers:parallel-agents",
    description: "Dispatch parallel worker agents across independent subproblems, gather diffs, and merge cleanly without context contention.",
    author: "obra",
    tags: ["superpowers", "parallel", "agents", "performance"],
    version: "1.9.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://github.com/obra/superpowers",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "185K",
  },
  {
    id: "skills-sh-superpowers-writing-skills",
    name: "superpowers:writing-skills",
    description: "Author new composable agent skills with strict SKILL.md YAML frontmatter, concise instructions, and verified test suites.",
    author: "obra",
    tags: ["superpowers", "meta", "skills-authoring", "docs"],
    version: "2.0.1",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://github.com/obra/superpowers",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "172K",
  },

  // -------------------------------------------------------------
  // Vercel Labs & 社区高频精选
  // -------------------------------------------------------------
  {
    id: "skills-sh-git-commit-helper",
    name: "git-commit-helper",
    description: "Generates clean, conventional git commit messages based on diffs, modified files, and project log history.",
    author: "vercel-labs",
    tags: ["git", "workflow", "productivity"],
    version: "1.2.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "142K",
  },
  {
    id: "skills-sh-browser-tools",
    name: "browser-tools",
    description: "Automate browser interactions, DOM inspection, screenshot capture, interactive console logging, and visual testing.",
    author: "steven-gonsalvez",
    tags: ["browser", "testing", "crawler"],
    version: "2.1.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "98K",
  },
  {
    id: "skills-sh-tdd-workflow",
    name: "tdd",
    description: "Test-Driven Development harness. Write failing test first, make it pass with minimal code, then refactor safely.",
    author: "mattpocock",
    tags: ["test", "tdd", "quality"],
    version: "1.0.4",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "84K",
  },
  {
    id: "skills-sh-code-review",
    name: "code-review",
    description: "Two-axis code review (Standards + Spec) running parallel sub-agents to critique diffs independently.",
    author: "mattpocock",
    tags: ["review", "audit", "standards"],
    version: "1.3.1",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "79K",
  },
  {
    id: "skills-sh-domain-modeling",
    name: "domain-modeling",
    description: "Domain-Driven Design (DDD) modeling skill to structure state machines, TypeScript schemas, and bounded contexts.",
    author: "advaitpaliwal",
    tags: ["architecture", "domain", "schema", "ddd"],
    version: "1.1.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "65K",
  },
  {
    id: "skills-sh-writing-for-agents",
    name: "writing-for-agents",
    description: "Draft clean, structured documentation and guidelines optimized specifically for AI coding agents to read and execute.",
    author: "nicopreme",
    tags: ["docs", "prompt", "guidelines"],
    version: "1.0.2",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "51K",
  },
  {
    id: "skills-sh-lark-cli",
    name: "lark-cli",
    description: "Feishu / Lark enterprise workspace integration. Send robot cards, query spreadsheets, and automate monitoring alerts.",
    author: "litta-team",
    tags: ["feishu", "lark", "im", "automation"],
    version: "1.5.0",
    category: "business",
    sourceLabel: "LITTA 团队源",
    subscriptionId: "sub-litta-business",
    subscriptionUrl: "https://gitlab.litta.cn/litta/litta-skills.git",
    sourceType: "git",
    installed: false,
    enabled: false,
    installs: "32K",
  },
  {
    id: "skills-sh-react-component-designer",
    name: "react-component-designer",
    description: "Design accessible, responsive, and tokenized React / Tailwind components with container queries and fluid ergonomics.",
    author: "shadcn",
    tags: ["react", "ui", "tailwind", "accessibility"],
    version: "1.4.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "112K",
  },
  {
    id: "skills-sh-docker-architect",
    name: "docker-architect",
    description: "Multi-stage Dockerfile design, caching optimization, Compose manifests, and minimal distroless production containerization.",
    author: "nicopreme",
    tags: ["docker", "container", "devops"],
    version: "1.2.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "88K",
  },
];

/**
 * 统一搜索 Skills 市场（支持本地与社区多源模糊检索）
 */
export function queryMarketSkills(
  allSkills: MarketSkillItem[],
  query: string = "",
  categoryFilter: SkillCategory | "all" = "all"
): MarketSkillItem[] {
  const q = query.trim().toLowerCase();
  
  // 合并全部已加载技能与拓展精选库，按 name 唯一去重
  const skillMap = new Map<string, MarketSkillItem>();
  for (const s of allSkills) {
    skillMap.set(s.name.toLowerCase(), s);
  }
  for (const s of EXTENDED_POPULAR_SKILLS) {
    if (!skillMap.has(s.name.toLowerCase())) {
      skillMap.set(s.name.toLowerCase(), { ...s });
    }
  }

  let list = Array.from(skillMap.values());

  if (categoryFilter !== "all") {
    list = list.filter((s) => s.category === categoryFilter);
  }

  if (!q) {
    return list;
  }

  // 模糊匹配：name、description、author、tags、sourceLabel
  return list.filter((s) => {
    const matchName = s.name.toLowerCase().includes(q);
    const matchDesc = s.description.toLowerCase().includes(q);
    const matchAuthor = s.author?.toLowerCase().includes(q);
    const matchSource = s.sourceLabel?.toLowerCase().includes(q);
    const matchTags = s.tags?.some((t) => t.toLowerCase().includes(q));
    return matchName || matchDesc || matchAuthor || matchSource || matchTags;
  });
}

// PROTOTYPE — mock data for the F1 workspace-layout prototype.
// Throwaway: shapes mimic the real SessionInfo / session-file structures
// (lib/types.ts, lib/session-reader.ts) closely enough for layout discussion.

export interface MockSession {
  id: string;
  name: string;
  project: string;
  time: string;
  model: string;
  tokens: string;
  messages: number;
  active?: boolean;
  children?: MockSession[];
}

export const projects: { name: string; sessions: MockSession[] }[] = [
  {
    name: "pi-web",
    sessions: [
      { id: "s1", name: "三栏布局原型设计", project: "pi-web", time: "刚刚", model: "claude-sonnet", tokens: "12.4k", messages: 24, active: true },
      { id: "s2", name: "R1: pi SDK 能力盘点", project: "pi-web", time: "1 小时前", model: "claude-sonnet", tokens: "8.1k", messages: 15 },
      {
        id: "s3", name: "研究子代理合并", project: "pi-web", time: "昨天", model: "claude-haiku", tokens: "31.2k", messages: 47,
        children: [
          { id: "s3a", name: "fork: 研究/r2 分支合并", project: "pi-web", time: "昨天", model: "claude-haiku", tokens: "2.3k", messages: 6 },
        ],
      },
      { id: "s4", name: "docs: wayfinder 航图", project: "pi-web", time: "2 天前", model: "claude-sonnet", tokens: "5.7k", messages: 9 },
    ],
  },
  {
    name: "pi-web-desktop",
    sessions: [
      { id: "s5", name: "Tauri 壳托盘增强", project: "pi-web-desktop", time: "昨天", model: "claude-sonnet", tokens: "18.9k", messages: 33 },
      { id: "s6", name: "升级/版本 UX 调研", project: "pi-web-desktop", time: "3 天前", model: "claude-haiku", tokens: "7.4k", messages: 12 },
    ],
  },
  {
    name: "dsh-desktop",
    sessions: [
      { id: "s7", name: "逆向 npx 启动流程", project: "dsh-desktop", time: "上周", model: "claude-sonnet", tokens: "22.1k", messages: 41 },
    ],
  },
];

interface FileNode {
  name: string;
  type: "dir" | "file";
  children?: FileNode[];
}

export const files: FileNode[] = [
  { name: "src-tauri", type: "dir", children: [
    { name: "src", type: "dir", children: [
      { name: "main.rs", type: "file" },
      { name: "tray.rs", type: "file" },
      { name: "commands.rs", type: "file" },
    ]},
    { name: "tauri.conf.json", type: "file" },
    { name: "Cargo.toml", type: "file" },
  ]},
  { name: "components", type: "dir", children: [
    { name: "AppShell.tsx", type: "file" },
    { name: "SessionSidebar.tsx", type: "file" },
    { name: "ChatWindow.tsx", type: "file" },
  ]},
  { name: "app", type: "dir", children: [
    { name: "page.tsx", type: "file" },
    { name: "layout.tsx", type: "file" },
  ]},
  { name: "package.json", type: "file" },
  { name: "AGENTS.md", type: "file" },
];

export interface MockMessage {
  role: "user" | "assistant" | "tool";
  text: string;
  time: string;
}

export const activeThread: MockMessage[] = [
  { role: "user", text: "帮我看一下 Codex 式三栏布局在 pi-web 上怎么落地，先做个原型", time: "14:02" },
  { role: "assistant", text: "好的。参考 PiDeck 的三栏方案（react-resizable-panels、宽度记忆只记展开态），我先产出三个结构变体供讨论：\n\n1. **Codex 三栏**：左会话树 | 对话 | 右抽屉（GitPanel/统计）\n2. **官方增量**：双栏 + 会话历史抽屉\n3. **活动栏式**：VS Code 风格图标列 + 面板切换\n\n宽度拖拽、折叠、记忆都会做上，会话历史抽屉和右键菜单也会覆盖。", time: "14:03" },
  { role: "tool", text: "✓ 分析官方 AppShell 布局结构（Explore 子代理）", time: "14:03" },
  { role: "assistant", text: "官方现状确认：AppShell 是单侧栏 + 主区，侧栏含会话树与文件树，无右抽屉概念。改动集中在少量目录即可保持与 main 可 merge。", time: "14:05" },
  { role: "user", text: "右侧抽屉你觉得放什么合适？GitPanel 还是上下文/统计？", time: "14:06" },
];

export const gitDraft = {
  branch: "desktop",
  ahead: 3,
  behind: 1,
  changes: [
    { file: "components/AppShell.tsx", status: "M" },
    { file: "app/prototype/layout/page.tsx", status: "A" },
    { file: "docs/desktop/v02-spec.md", status: "M" },
  ],
};

export const statsDraft = {
  tokens: "31.2k",
  cost: "$0.42",
  ctxPercent: 68,
  cacheHit: 41,
};

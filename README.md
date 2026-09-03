# PowerI

[中文文档](./README.zh-CN.md)

PowerI is an AI coding assistant built on the [pi coding agent](https://github.com/earendil-works/pi) — a native desktop app plus a standalone web UI. It starts as a fork of [pi-web](https://github.com/agegr/pi-web) (the local browser UI for pi) and adds a product layer on top: usage and cost analytics, plugin and skill marketplaces, workspace-aware attachments, and a unified settings experience — all without modifying a single line of upstream code.

## Architecture

PowerI is a strict three-layer stack. Upstream code is **replaced, never modified**, so upstream updates merge in cleanly:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Tauri desktop shell          src-tauri/                          │
│    Native window, tray, Node/web process hosting, environment        │
│    probes, silent install & upgrade                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ iframe http://127.0.0.1:9989/poweri
                               │ + __TAURI__ IPC bridge
┌──────────────────────────────▼──────────────────────────────────────┐
│ 2. PowerI product layer         poweri/ + app/poweri/               │
│    Replacement AppShell, stats & usage panels, plugin/skill          │
│    marketplaces, dual-mode attachments, i18n                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ imports @/lib, @/hooks (upstream)
┌──────────────────────────────▼──────────────────────────────────────┐
│ 3. pi-web base engine           lib/ hooks/ app/api/ components/    │
│    Pi SDK driver, RPC session management, SSE streaming              │
│    (upstream-held, zero-modification red line)                       │
└─────────────────────────────────────────────────────────────────────┘
```

Two shipping forms share the same product layer:

| Form | What it is | For whom |
| --- | --- | --- |
| **PowerI desktop app** | Tauri 2 wrapper that installs, launches, and upgrades `@poweri/poweri-web` as a child process and embeds it in the OS webview (WKWebView / WebView2) | End users who want a native app with zero environment setup |
| **PowerI web (`@poweri/poweri-web`)** | Standalone npm package: `npx @poweri/poweri-web` serves the UI at `http://127.0.0.1:9989/poweri` | Developers and terminal-centric workflows |

## Quick Start

PowerI requires **Node.js 22.19+** at runtime.

### Desktop app

Download an installer (`.dmg` / `-setup.exe` / `.msi`) from [Releases](https://github.com/cgoder/pi-web/releases). On first launch a setup wizard detects your Node.js install (including fnm/nvm roots), reuses or installs `@poweri/poweri-web`, starts the local server, and embeds the UI. Later upgrades are one click — the shell runs `npm install @poweri/poweri-web@latest` and restarts the server.

Build from source instead (needs a Rust toolchain):

```bash
npm install
npm run tauri dev      # dev mode: next dev + vite shell, hot reload
npm run desktop        # production build: shell:build + tauri build
```

Installers land in `src-tauri/target/release/bundle/`. See [`src-tauri/README.md`](./src-tauri/README.md) for the shell internals.

### Standalone web

```bash
npx -y @poweri/poweri-web          # opens http://127.0.0.1:9989/poweri

# or install globally
npm install -g @poweri/poweri-web
poweri-web
poweri-web -p 3000 --no-open       # override port / suppress browser
```

Startup options match pi-web (`-p`, `-H`, `--no-open`, `-h`; env `PORT`, `PI_WEB_HOSTNAME`, `PI_WEB_NO_OPEN`, `PI_WEB_PASSWORD`, `PI_WEB_ALLOWED_HOSTS`) except the default port: **9989** (PowerI-dedicated) instead of upstream's 30141. Note the landing page is `/poweri` — the root `/` still serves the upstream pi-web UI, a deliberate cost of keeping the upstream baseline untouched. Details: [`docs/desktop/poweri-web-standalone.md`](./docs/desktop/poweri-web-standalone.md).

## Features

- **Usage analytics**: timeline-first session history, per-day / per-workspace / per-project token and cost breakdowns, cache-hit-rate visualization, drill-down to individual sessions. Numbers are computed from session JSONL with the same accounting as the official SDK.
- **Plugin & skill marketplaces**: live catalogs from `pi.dev/packages` and `skills.sh` (search, sort, install stats) plus private Git skill repositories with subscriptions — no hardcoded fake data.
- **Dual-mode attachments**: in the desktop app files are saved to the workspace and passed as lightweight paths for the agent to read on demand; in the browser they degrade to inline `<attached_files>` XML. Same UX, both environments.
- **Workspace-aware Markdown**: file paths in assistant messages become clickable links that open the built-in file viewer.
- **Unified settings**: one settings panel (general / models / skills / agents / plugins) instead of scattered dialogs.
- **i18n**: Simplified Chinese, Traditional Chinese, and English UI.

## Development

```bash
npm install
npm run dev                          # web dev server on 127.0.0.1:9989
node_modules/.bin/tsc --noEmit       # typecheck
npm test                             # unit tests (upstream + poweri/)
npm run lint
```

Never run `next build` or `npm run build` during normal development — it writes to `.next/` and interferes with the dev server. Builds are for release work only.

### Branch model

```
upstream (agegr/pi-web, read-only mirror)
  └─ poweri    web-layer trunk: product layer + docs + CI  → ships as @poweri/poweri-web
      └─ desktop    adds src-tauri/ shell               → ships as the desktop app
```

Commits land on the branch that owns the files (`poweri/`, `app/poweri/`, `docs/desktop/`, `scripts/` → `poweri`; `src-tauri/` → `desktop`); data flows one way, `poweri → desktop`. The hard rule: **upstream files are never modified** — new UI goes into `poweri/` as replacement components, and every replacement is registered in [`docs/desktop/replacements.json`](./docs/desktop/replacements.json) so upstream changes can't silently bypass it. Details: [`docs/desktop/branch-model.md`](./docs/desktop/branch-model.md) and [`docs/desktop/ownership.md`](./docs/desktop/ownership.md).

## Documentation

| Doc | Contents |
| --- | --- |
| [`docs/desktop/architecture-and-scope-boundary.md`](./docs/desktop/architecture-and-scope-boundary.md) | The three-layer architecture and scope rules in depth |
| [`docs/desktop/file-map.md`](./docs/desktop/file-map.md) | File-by-file map and build/verification ownership |
| [`docs/desktop/branch-model.md`](./docs/desktop/branch-model.md) | Branch topology, upstream sync SOP |
| [`docs/desktop/ownership.md`](./docs/desktop/ownership.md) | Which files are upstream-held vs PowerI-held; exception registry |
| [`docs/desktop/poweri-web-standalone.md`](./docs/desktop/poweri-web-standalone.md) | Standalone web runtime, port conventions, shell interplay |
| [`docs/desktop/release.md`](./docs/desktop/release.md) | Release runbook (npm + desktop, tag discipline) |
| [`src-tauri/README.md`](./src-tauri/README.md) | Desktop shell internals: launch FSM, process manager, upgrade pipeline |
| [`poweri/README.md`](./poweri/README.md) | Product layer: replacement architecture, directory guide |
| [`docs/adr/`](./docs/adr) | Architecture decision records (PowerI and upstream) |

## Acknowledgements

PowerI exists thanks to the upstream projects it is built on:

- **[pi-web](https://github.com/agegr/pi-web)** by [@agegr](https://github.com/agegr) — the local browser UI for the pi coding agent, and the codebase PowerI forked. The entire base engine layer (the three-layer architecture's bottom layer) is upstream code, used unmodified and merged regularly.
- **[pi coding agent](https://github.com/earendil-works/pi)** by [Earendil Works](https://github.com/earendil-works) — the agent runtime, SDK, and session format that pi-web (and therefore PowerI) drives.

PowerI's own work is limited to the product layer (`poweri/`, `app/poweri/`) and the desktop shell (`src-tauri/`); everything foundational — the agent, the RPC/session architecture, the chat UI — comes from upstream, and all credit for it belongs to the upstream authors and contributors. Both upstream projects and PowerI are MIT-licensed; upstream remains the authoritative source for the base layer.

## License

[MIT](./LICENSE)

# PowerI

[中文说明](./README.zh-CN.md)

PowerI is a next-generation **Edge-Cloud Hybrid AI Agent Platform** built on the [pi](https://github.com/earendil-works/pi) framework. It bridges local developer workflows, enterprise multi-tenant web portals, and mobile device roaming with a unified, tiered-sandboxing architecture across **Desktop, Web, and Mobile**.

---

## Core Philosophy & Three-Tier Architecture

To solve the conflict between native system execution (running arbitrary Node, Python, and Shell scripts) and multi-tenant security/resource isolation, PowerI decouples into three independent planes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Presentation Layer (UI)                                                  │
│    - Desktop (Tauri 2 OS Shell)                                             │
│    - Web Portal (Next.js / Enterprise Micro-Frontend)                       │
│    - Mobile App (iOS / Android Controller via Device Link Protocol)         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP SSE / WebSocket
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. Control Plane (Runtime)                                                  │
│    - Stateless Gateway, JWT Auth & Multi-Tenant Routing                     │
│    - ReAct Loop & Memory State Machine (@earendil-works/pi-agent-core)      │
│    - Per-Session Serial Queue Lock (Anti-JSONL Corruption)                  │
│    - Streaming Usage Metering & Model Gateway Proxy                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ WebSocket (stdio-ws bridge RPC)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. Data Plane (Sandbox Execution)                                           │
│    - Isolated Execution Environments (Docker / MicroVM / Local Host)        │
│    - Physical Tools (read, write, edit, bash) driven by pi --mode rpc       │
│    - Egress Network Firewall (Blocking cloud metadata & internal subnets)   │
│    - Per-Tenant Workspace Isolation (/data/workspaces/{userId})             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The Three Architecture Paradigms

All deployment modes derive from a single unified abstraction: `ExecutionEnvironment` (`LocalEnvironment` vs `RemoteSandboxEnvironment`):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 【Paradigm B: The Ideal End-State · Local Brain + Cloud Sandbox】             │
│ - Presentation: Desktop Client (Tauri)                                      │
│ - Runtime: Local Node / pi-agent-core reasoning                             │
│ - Sandbox: Cloud Container Sandbox (Offloading heavy compute & risk)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                   │                                     │
                   │ Specialization                      │ Fallback Path
                   ▼                                     ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│ 【Paradigm C: Local Standalone】      │  │ 【Paradigm A: Cloud-Hosted Mode】  │
│ - Presentation: Desktop App          │  │ - Presentation: Web / Mobile UI   │
│ - Runtime: Local Node                │  │ - Runtime: Cloud Gateway          │
│ - Sandbox: Local Host OS             │  │ - Sandbox: Cloud Multi-Tenant     │
│ (Paradigm B specialized on-device)   │  │ (Best for teams & mobile roaming) │
└──────────────────────────────────────┘  └───────────────────────────────────┘
```

1. **Paradigm B (Ideal Target · Local Brain + Cloud Sandbox)**: Reasoning runs locally on the user's desktop, keeping prompts, keys, and privacy on-device, while untrusted scripts and heavy compilation tasks are offloaded to elastic cloud sandboxes via RPC.
2. **Paradigm A (Fallback & Web/Mobile · Fully Hosted)**: The client acts as a "Zero Authority" controller. The runtime and sandboxes are hosted on cloud infrastructure. Tasks survive mobile lock-screen and network reconnections.
3. **Paradigm C (Desktop Specialization · Pure Standalone)**: PowerI's current desktop app mode. When the cloud sandbox in Paradigm B is specialized into the local machine's host OS, it seamlessly becomes Paradigm C with full offline capabilities.

---

## Architectural Foundation: Understanding the Pi Ecosystem

PowerI strictly separates the responsibilities across the three official `@earendil-works/pi-*` packages:

| Package | Role & Responsibility | State & System Dependencies | Deployment Location |
| :--- | :--- | :--- | :--- |
| **`@earendil-works/pi-ai`** | Unified multi-provider LLM API (Claude, OpenAI, Gemini). Pure network fetch. | **Stateless**. Zero OS dependencies. | Must route through Gateway to protect API keys. |
| **`@earendil-works/pi-agent-core`** | ReAct thinking loop, prompt management, tool-call dispatcher. | **In-Memory Stateful**. Pure TypeScript. Zero Node native module bindings. | Portable Brain: runs in Desktop, Web, or Cloud. |
| **`@earendil-works/pi-coding-agent`** | Workspace binding (CWD), JSONL session persistence (`SessionManager`), physical tools (`read/write/edit/bash`), extensions loader. | **OS & Node-bound**. Strictly requires Node.js (`fs`, `child_process`, `lockfile`). | Physical Execution Host: Desktop Node or Cloud Container Sandbox. |

---

## Delivery Forms

| Form Factor | Mode | Core Features | Target Audience |
| :--- | :--- | :--- | :--- |
| **Desktop App** | Paradigm C / B | Native Tauri 2 wrapper, tray, auto-upgrades, local or cloud sandbox switching | Engineers who want a native IDE-grade experience |
| **Web Portal** | Paradigm A | Multi-tenant team portal, SSO/JWT auth, timeline UI, token usage metering | Engineering teams (20-100 members), internal systems |
| **Mobile App** | Paradigm A (Roaming) | Remote control projection, Device Link protocol, push notifications on completion | Remote supervision, mobile approvals, long-running workflows |

---

## Quick Start

### Prerequisites

* **Node.js**: `22.19.0+`
* **Package Manager**: `npm` or `pnpm`
* **Rust**: Required only for compiling the Tauri desktop shell

### Running the Web Platform

```bash
# Clone the repository
git clone https://github.com/cgoder/poweri.git
cd poweri

# Install dependencies
npm install

# Start development server (Port 9989)
npm run dev

# Open in browser
open http://localhost:9989/poweri
```

### Running the Desktop App

```bash
# Dev mode: Next.js dev server + Tauri OS Shell (Hot Reload)
npm run tauri dev

# Production build (Outputs to src-tauri/target/release/bundle/)
npm run desktop
```

---

## Architecture Research & Specifications

For comprehensive deep dives, primary source traces, and engineering specifications, refer to the documentation under `docs/research/`:

* 📘 [**PowerI Edge-Cloud Hybrid Architecture Specification**](./docs/research/poweri-edge-cloud-hybrid-architecture-spec.md) — The master architectural blueprint, formal user stories, seam abstractions, and phased roadmap.
* 🔍 [**Industry Multi-Tenant Web Agent Sandboxes Research**](./docs/research/2026-industry-web-agent-sandboxes.md) — Analysis of Devin, OpenHands, Bolt.new, E2B, and Daytona microVM architectures.
* 🔍 [**ThinkRail vs Legacy PowerI Codebase Deep Dive**](./docs/research/thinkrail-vs-poweri-codebase-deepdive.md) — JetBrains/thinkrail's three-ring architecture and worktree isolation vs PowerI's K8s gateway & stdio-ws bridge.
* 🔍 [**Mobile Local Runtimes & Edge Agents Architecture**](./docs/research/mobile-local-runtimes-and-edge-agents.md) — Deep dive into OpenMinis (iSH/PRoot sandboxing) and makecindy/cindy (Device Link protocol & Zero Authority projection).

---

## License

MIT © [cgoder](https://github.com/cgoder)

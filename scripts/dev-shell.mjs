#!/usr/bin/env node
"use strict";

// `npm run desktop:dev` — Tauri's beforeDevCommand.
// Runs the Next.js dev server (pi-web UI, port 9527) and the Vite dev
// server (shell UI, port 1420) together; kills both when either exits.
//
// In dev mode the Rust shell does NOT spawn `npx @agegr/pi-web` — it waits
// for the port 9527 that this script's `next dev` provides (the Rust dev
// build's DEFAULT_PORT). `npm run dev` (plain browser mode) stays on the
// upstream port 30141; `npm run dev` (plain browser mode) now serves on 9989
// too — the PowerI-dedicated port shared by the release shell and the
// poweri-web bin. Only this script's port (9527) must match the Rust side.

import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

// .mjs is ESM: `require` is unavailable, so re-create it for resolve-only use.
const require = createRequire(import.meta.url);
const __dirname = path.dirname(new URL(import.meta.url).pathname);

const root = path.join(__dirname, "..");

function resolveBin(pkgSubpath) {
  return require.resolve(pkgSubpath, { paths: [root] });
}

const nextBin = resolveBin("next/dist/bin/next"); // JS entry of the next CLI
// vite does not export its bin path; resolve it via the package.json `bin` field.
const vitePkg = resolveBin("vite/package.json");
const viteBin = path.join(
  path.dirname(vitePkg),
  JSON.parse(require("node:fs").readFileSync(vitePkg, "utf8")).bin.vite,
);

const children = [];

function run(name, entry, args) {
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.on("exit", (code, signal) => {
    console.log(`[dev-shell] ${name} exited (${signal || code})`);
    shutdown();
  });
  children.push(child);
}

function shutdown() {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// next dev on the loopback default port (same as `npm run dev`)
run("next dev", nextBin, ["dev", "-H", "127.0.0.1", "-p", "9527"]);
// vite dev server for the shell UI
run("vite", viteBin, ["--config", path.join(root, "vite.config.ts")]);

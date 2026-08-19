#!/usr/bin/env node
"use strict";

// `npm run desktop:dev` — Tauri's beforeDevCommand.
// Runs the Next.js dev server (pi-web UI, port 9527) and the Vite dev
// server (shell UI, port 1420) together; kills both when either exits.
//
// In dev mode the Rust shell does NOT spawn `npx @agegr/pi-web` — it waits
// for the port 9527 that this script's `next dev` provides (the Rust dev
// build's DEFAULT_PORT). `npm run dev` (plain browser mode) stays on the
// upstream port 30141; only this script's port must match the Rust side.

const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

function resolveBin(pkgSubpath) {
  return require.resolve(pkgSubpath, { paths: [root] });
}

const nextBin = resolveBin("next/dist/bin/next"); // JS entry of the next CLI
const viteBin = resolveBin("vite/bin/vite.js");

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

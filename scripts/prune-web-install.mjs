#!/usr/bin/env node
/**
 * PowerI: post-install whitelist prune for CI size measurement.
 *
 * Mirrors src-tauri/src/installer.rs `prune_category` /
 * `incompatible_platform_dir` (issue 25). The Rust implementation is the
 * source of truth that runs in the app; this script exists so the
 * size-check workflow measures the SAME pruned layout a user actually
 * gets. Keep both in sync when the whitelist rules change — the
 * e2e_prune_real_install harness in installer.rs is the reconciliation
 * test.
 *
 * Usage: node scripts/prune-web-install.mjs <install-root> [--os=linux] [--arch=x64]
 * Prints "pruned N files, M bytes" to stdout; exits 0 on success.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("fs");
const path = require("path");

const NATIVE_PLATFORMS = ["darwin", "win32", "linux", "freebsd"];
const NATIVE_ARCHES = ["arm64", "x64", "ia32", "arm"];

function parseArgs(argv) {
  const root = argv[0];
  if (!root) throw new Error("usage: prune-web-install.mjs <root> [--os=] [--arch=]");
  const os = (argv.find((a) => a.startsWith("--os=")) || "--os=linux").slice(5);
  const arch = (argv.find((a) => a.startsWith("--arch=")) || "--arch=x64").slice(7);
  return { root, os, arch };
}

function isDocumentationName(lowerName) {
  let base = lowerName;
  for (const suf of [".md", ".markdown", ".txt"]) {
    if (base.endsWith(suf)) { base = base.slice(0, -suf.length); break; }
  }
  return ["readme", "changelog", "changes", "history"].includes(base);
}

function splitTriplet(name) {
  const parts = name.split("-");
  if (parts.length < 2) return null;
  const arch = parts[parts.length - 1];
  const platform = parts[parts.length - 2];
  const stem = parts.slice(0, -2).join("-");
  if (!NATIVE_PLATFORMS.includes(platform) || !NATIVE_ARCHES.includes(arch)) return null;
  return { stem, platform, arch };
}

// Same white-list as installer.rs native_family().
function nativeFamily(scope, stem) {
  if (scope === "@esbuild" && stem === "") return "esbuild";
  if (scope === "@next" && stem === "swc") return "swc";
  if (scope === "@img" && (stem === "sharp" || stem === "sharp-libvips")) return "sharp";
  if (scope === "@tailwindcss" && stem === "oxide") return "oxide";
  if (scope === "@rollup" && stem === "rollup") return "rollup";
  if (scope === "@unrs" && stem === "resolver-binding") return "resolver-binding";
  if (scope === null && stem === "lightningcss") return "lightningcss";
  return null;
}

function incompatiblePlatformDir(rel, os, arch) {
  const parts = rel.split("/");
  if (os !== "win32" && (parts.join("/") === "node_modules/node-pty/deps/winpty" ||
      parts.join("/") === "node_modules/node-pty/third_party/conpty")) {
    return true;
  }
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== "node_modules") continue;
    let scope, name;
    if (i + 1 < parts.length && parts[i + 1].startsWith("@")) {
      scope = parts[i + 1];
      name = i + 2 < parts.length ? parts[i + 2] : null;
    } else {
      scope = null;
      name = i + 1 < parts.length ? parts[i + 1] : null;
    }
    if (!name) continue;
    const t = splitTriplet(name);
    if (t && nativeFamily(scope, t.stem) && (t.platform !== os || t.arch !== arch)) {
      return true;
    }
  }
  return false;
}

function category(rel, os, arch) {
  if (incompatiblePlatformDir(rel, os, arch)) return "IncompatiblePlatformAssets";
  const name = rel.split("/").pop();
  const lower = name.toLowerCase();
  if (lower.endsWith(".map")) return "SourceMaps";
  if (lower.endsWith(".d.ts") || lower.endsWith(".d.mts") || lower.endsWith(".d.cts")) return "TypeDeclarations";
  if (lower.endsWith(".tsbuildinfo")) return "BuildCaches";
  if (isDocumentationName(lower)) return "Documentation";
  return null;
}

function walk(root, os, arch) {
  const removed = { files: 0, bytes: 0 };
  const removedDirs = new Set();

  function visit(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // tolerate unreadable dirs
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      let st;
      try { st = fs.lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) continue; // never follow symlinks
      if (st.isDirectory()) {
        visit(full);
        continue;
      }
      if (!st.isFile()) continue;
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (category(rel, os, arch)) {
        removed.files += 1;
        removed.bytes += st.size;
        try { fs.unlinkSync(full); } catch { /* best effort */ }
      }
    }
  }
  visit(root);

  // Whole-directory removal for incompatible platform packages: collect
  // dirs whose every entry was a platform asset, then rm -rf them.
  function visitDirs(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      if (entry.name === "node_modules") continue; // never remove node_modules itself
      const full = path.join(dir, entry.name);
      let st;
      try { st = fs.lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        const rel = path.relative(root, full).split(path.sep).join("/");
        if (incompatiblePlatformDir(rel, os, arch) && !removedDirs.has(full)) {
          removedDirs.add(full);
        } else {
          visitDirs(full);
        }
      }
    }
  }
  visitDirs(root);
  for (const dir of removedDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return removed;
}

const { root, os, arch } = parseArgs(process.argv.slice(2));
const removed = walk(path.resolve(root), os, arch);
console.log(`pruned ${removed.files} files, ${removed.bytes} bytes`);

import { realpathSync } from "fs";
import path from "path";
import { isWindowsAbsolutePath } from "./paths";

/**
 * UNC hosts that denote the same share. Windows exposes the WSL filesystem
 * under both `\\wsl$\...` and `\\wsl.localhost\...`; realpath output and
 * user-typed roots may use either form, so they must compare equal.
 */
function normalizeUncHost(p: string): string {
  return p.replace(/^([\\/]{2})wsl\.localhost([\\/]|$)/i, "$1wsl$$$2");
}

/**
 * Lexical containment check. Accepts either canonical form on both sides: it
 * re-resolves through path.win32/path.posix and case-folds on Windows, so
 * separator style and drive-letter case never decide the answer.
 */
export function isPathWithinRoots(target: string, roots: Set<string>): boolean {
  for (const root of roots) {
    const useWindowsRules = isWindowsAbsolutePath(target) || isWindowsAbsolutePath(root);
    const resolver = useWindowsRules ? path.win32 : path;
    const sep = useWindowsRules ? "\\" : path.sep;
    const normalized = resolver.resolve(target);
    const normalizedRoot = resolver.resolve(root);
    let comparable = useWindowsRules ? normalized.toLowerCase() : normalized;
    let comparableRoot = useWindowsRules ? normalizedRoot.toLowerCase() : normalizedRoot;
    if (useWindowsRules) {
      comparable = normalizeUncHost(comparable);
      comparableRoot = normalizeUncHost(comparableRoot);
    }
    const rootWithSep = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep;
    if (comparable === comparableRoot || comparable.startsWith(rootWithSep)) return true;
  }
  return false;
}

/** The roots after resolving symbolic links, for comparing canonical paths. */
export function resolveRealRoots(roots: Set<string>): Set<string> {
  const realRoots = new Set<string>();
  for (const root of roots) {
    try {
      realRoots.add(realpathSync(root));
    } catch {
      // Ignore stale roots derived from removed sessions or worktrees. Do not
      // keep the lexical form: an unresolvable root must not silently widen
      // what counts as contained.
    }
  }
  return realRoots;
}

/**
 * Whether `target` has a `..` segment. Node's realpathSync collapses `..`
 * before it follows links, while the filesystem applies it after, so
 * `root/link/..` authorizes as `root` but opens the directory holding the
 * link's target, outside the roots (#748). A backslash separates segments only
 * in Windows paths; elsewhere it is part of a file name.
 */
export function hasParentDirectorySegment(target: string): boolean {
  const separator = process.platform === "win32" || isWindowsAbsolutePath(target) ? /[\\/]/ : "/";
  return target.split(separator).includes("..");
}

export function isExistingPathWithinRoots(target: string, roots: Set<string>): boolean {
  if (hasParentDirectorySegment(target)) return false;
  let realTarget: string;
  try {
    realTarget = realpathSync(target);
  } catch {
    return false;
  }
  return isPathWithinRoots(realTarget, resolveRealRoots(roots));
}

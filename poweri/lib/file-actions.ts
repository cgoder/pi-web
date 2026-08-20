/**
 * PowerI 产品层：文件操作帮助函数（下载、复制、打开目录）
 *
 * 统一处理文件路径的编码、下载、复制和目录打开，兼容浏览器和 Tauri。
 */
import { encodeFilePathForApi, getFileName } from "@/lib/file-paths";

/**
 * 获取文件的 API URL（用于下载/复制链接）
 *
 * @param filePath 绝对文件路径
 * @param type 下载类型
 * @param sourceSessionId 可选的会话 ID（用于权限校验）
 */
export function getFileApiUrl(
  filePath: string,
  type: "read" | "download" | "meta" | "preview" = "download",
  sourceSessionId?: string | null,
): string {
  const encoded = encodeFilePathForApi(filePath);
  const params = new URLSearchParams({ type });
  if (sourceSessionId) params.set("sessionId", sourceSessionId);
  return `/api/files/${encoded}?${params.toString()}`;
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for older browsers / Tauri webview
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

/**
 * 复制文件路径（绝对路径）
 */
export async function copyFilePath(filePath: string): Promise<void> {
  await copyToClipboard(filePath);
}

/**
 * 复制文件下载链接（完整的 API URL，包含 origin）
 */
export async function copyFileDownloadLink(
  filePath: string,
  sourceSessionId?: string | null,
): Promise<void> {
  const apiUrl = getFileApiUrl(filePath, "download", sourceSessionId);
  const fullUrl = `${window.location.origin}${apiUrl}`;
  await copyToClipboard(fullUrl);
}

/**
 * 下载文件（兼容浏览器和 Tauri）
 *
 * 在 Tauri 中，<a download> 可能不被 webview 正确处理（无反应），
 * 因此通过 fetch + blob + 临时链接触发下载，兼容两种环境。
 */
export async function downloadFile(
  filePath: string,
  sourceSessionId?: string | null,
): Promise<void> {
  const url = getFileApiUrl(filePath, "download", sourceSessionId);
  const fileName = getFileName(filePath);

  // 尝试直接通过 fetch 获取并触发下载
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`下载失败: HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 延迟释放，避免下载中断
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (e) {
    // Fallback: 直接导航到下载 URL（浏览器会处理）
    window.open(url, "_blank");
    throw e;
  }
}

/**
 * 在系统文件管理器中打开文件所在目录（并选中文件）
 *
 * - Tauri 桌面：调用 Rust 命令 `reveal_in_folder`（open -R / explorer / xdg-open）
 * - 浏览器：回退为在文件浏览器中高亮文件（需调用方处理）
 *
 * @returns 是否成功调用 Tauri（浏览器中返回 false，调用方可回退）
 */
export async function revealInFolder(filePath: string): Promise<boolean> {
  // 尝试 Tauri invoke
  try {
    // 检查是否在 Tauri 环境中
    const tauri = (window as unknown as { __TAURI__?: { core?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> } } }).__TAURI__;
    // Tauri v2 的 invoke 在 window.__TAURI__.core.invoke
    // 也尝试 window.__TAURI__.invoke (v1 兼容)
    const invoke =
      tauri?.core?.invoke ??
      (window as unknown as { __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__?.invoke ??
      (window as unknown as { __TAURI__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> } }).__TAURI__?.invoke;

    if (typeof invoke === "function") {
      await invoke("reveal_in_folder", { path: filePath });
      return true;
    }

    // 尝试通过 @tauri-apps/api（如果可用）
    // 动态 import，避免在浏览器中打包失败
    try {
      const { invoke: apiInvoke } = await import("@tauri-apps/api/core");
      await apiInvoke("reveal_in_folder", { path: filePath });
      return true;
    } catch {
      // 非 Tauri 环境，返回 false 让调用方回退
    }
  } catch (e) {
    console.warn("revealInFolder Tauri invoke failed:", e);
  }
  return false;
}

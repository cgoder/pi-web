import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const PORT = 30141;
const APP_URL = "http://127.0.0.1:" + PORT;

function q<T extends HTMLElement>(sel: string): T {
  return document.querySelector(sel) as T;
}

// Frontend runtime errors land in the PowerI log file so a non-starting
// window still reports what broke in the webview.
window.addEventListener("error", (e) => {
  void invoke("log_error", { message: String(e.message) }).catch(() => {});
});

/** Shape of the `WebInfo` struct returned by `web_info`. */
interface WebInfo {
  source: string
  version: string
  can_upgrade: boolean
}

let webCanUpgrade = false
const SOURCE_LABELS: Record<string, string> = {
  local: "本地开发",
  override: "自定义路径",
  system: "系统安装",
  cached: "应用内置",
  missing: "未安装",
}

const iframe = q<HTMLIFrameElement>("#app-iframe");
const loading = q<HTMLDivElement>("#loading");
const log = q<HTMLPreElement>("#log");
const dot = q<HTMLSpanElement>("#status-dot");
const statusText = q<HTMLSpanElement>("#status-text");
const topbar = q<HTMLElement>("#topbar");
const grabber = q<HTMLDivElement>("#grabber");
const loadingSpinner = q<HTMLDivElement>("#loading-spinner");
const loadingText = q<HTMLParagraphElement>("#loading-text");

type State = "starting" | "running" | "stopped" | "error";

let upgrading = false;
let cliMode = false;
let ready = false;
let hideTimer: number | undefined;

function setStatus(state: State, text: string): void {
  dot.className = "dot " + state;
  statusText.textContent = text;
}

function appendLog(line: string, kind: "out" | "err" | "sys"): void {
  const span = document.createElement("span");
  span.className = kind;
  span.textContent = line + "\n";
  log.appendChild(span);
  while (log.childElementCount > 2000) {
    if (log.firstElementChild) log.removeChild(log.firstElementChild);
  }
  log.scrollTop = log.scrollHeight;
}

/** Switch the loading overlay between "starting", "error" and "stopped" states. */
function setLoading(
  message: string,
  opts: { error?: boolean; retry?: boolean; spinner?: boolean } = {},
): void {
  loadingSpinner.style.display = opts.error || opts.spinner === false ? "none" : "";
  loadingText.textContent = message;
  loadingText.classList.toggle("error-text", !!opts.error);
  q<HTMLParagraphElement>("#loading-hint").hidden = !opts.error;
  q<HTMLButtonElement>("#btn-retry").hidden = !opts.retry;
}

function showStartupError(message: string): void {
  ready = false;
  setStatus("error", "启动失败");
  setLoading(message, { error: true, retry: true });
  showBar();
  appendLog("> " + message, "err");
}

function showApp(): void {
  loading.style.display = "none";
  if (iframe.src !== APP_URL) iframe.src = APP_URL;
}

function showBar(): void {
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
  topbar.classList.add("visible");
  grabber.classList.add("hidden");
}

function scheduleHide(): void {
  if (hideTimer !== undefined) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    topbar.classList.remove("visible");
    grabber.classList.remove("hidden");
    hideTimer = undefined;
  }, 1500);
}

function setupBar(): void {
  grabber.addEventListener("mouseenter", showBar);
  grabber.addEventListener("click", showBar);
  topbar.addEventListener("mouseenter", () => {
    if (hideTimer !== undefined) {
      window.clearTimeout(hideTimer);
      hideTimer = undefined;
    }
  });
  topbar.addEventListener("mouseleave", () => {
    if (!cliMode) scheduleHide();
  });
  q("#bar-close").addEventListener("click", () => {
    topbar.classList.remove("visible");
    grabber.classList.remove("hidden");
  });
}

async function start(): Promise<void> {
  ready = false;
  setStatus("starting", "启动中…");
  setLoading("正在启动 pi-web …");
  appendLog("> 正在启动 pi-web 服务…", "sys");
  try {
    const s = await invoke<any>("start_server");
    appendLog("> 等待端口 " + s.port + " 就绪…", "sys");
  } catch (e) {
    showStartupError("启动失败：" + String(e));
  }
}

async function stop(): Promise<void> {
  appendLog("$ 停止服务…", "sys");
  const s = await invoke<any>("stop_server");
  if (s.running) {
    appendLog("> 该服务非本应用启动，未停止", "sys");
    setStatus("running", "运行中 · " + APP_URL);
  } else {
    setStatus("stopped", "已停止");
  }
}

async function restart(): Promise<void> {
  await stop();
  await start();
}

async function upgrade(): Promise<void> {
  if (upgrading) return;
  if (!webCanUpgrade) {
    appendLog("> 当前使用的 pi-web 不由 PowerI 管理，无法应用内升级", "err");
    return;
  }
  upgrading = true;
  const btn = q<HTMLButtonElement>("#btn-upgrade");
  btn.disabled = true;
  appendLog("> 正在检查最新版本并安装…", "sys");
  try {
    const r = await invoke<any>("upgrade_piweb");
    if (r.ok) {
      appendLog("> 已安装版本 " + r.version + " · " + r.message, "sys");
      if (r.restarted) {
        iframe.src = "about:blank";
        showApp();
      }
    } else {
      appendLog("> 升级失败：" + r.message, "err");
    }
  } catch (e2) {
    appendLog("> 升级失败：" + String(e2), "err");
  } finally {
    upgrading = false;
    btn.disabled = false;
  }
}

function clearLog(): void {
  log.textContent = "";
}

async function copyLog(): Promise<void> {
  try {
    await navigator.clipboard.writeText(log.textContent || "");
    appendLog("> 已复制到剪贴板", "sys");
  } catch {
    appendLog("> 复制失败", "err");
  }
}

function setupTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
  const panels: Record<string, HTMLElement> = {
    app: q("#panel-app"),
    cli: q("#panel-cli"),
  };
  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      const key = t.dataset.tab || "app";
      Object.keys(panels).forEach((k) => panels[k].classList.toggle("active", k === key));
      if (key === "cli") {
        cliMode = true;
        showBar();
      } else {
        cliMode = false;
        scheduleHide();
      }
    });
  });
}

async function setupEvents(): Promise<void> {
  await listen<string>("server:stdout", (e) => appendLog(e.payload, "out"));
  await listen<string>("server:stderr", (e) => appendLog(e.payload, "err"));
  await listen("server:ready", () => {
    ready = true;
    setStatus("running", "运行中 · " + APP_URL);
    showApp();
    appendLog("> 就绪：" + APP_URL, "sys");
    refreshPiWebVersion();
    if (!cliMode) scheduleHide();
  });
  await listen("server:timeout", () => {
    showStartupError("启动超时：90 秒内未检测到端口监听，请检查 CLI 日志");
  });
  await listen<number | null>("server:exited", (e) => {
    if (ready) {
      setStatus("stopped", "已退出");
      appendLog("> 进程已退出 (code=" + e.payload + ")", "sys");
    } else {
      showStartupError("启动失败：进程提前退出（退出码 " + e.payload + "），请检查 CLI 日志");
    }
  });
  await listen("server:stopped", () => {
    if (!ready) setLoading("服务已停止", { spinner: false });
    setStatus("stopped", "已停止");
  });
  await listen<string>("upgrade:stdout", (e2) => appendLog(e2.payload, "out"));
  await listen<string>("upgrade:stderr", (e2) => appendLog(e2.payload, "err"));
  await listen("web:installing", () => {
    setStatus("starting", "正在下载安装 pi-web…");
    setLoading("首次使用：正在从 npm 下载安装 pi-web（视网络而定，需几分钟）…");
    appendLog("> 首次使用：正在下载安装 pi-web…", "sys");
  });
}

function setupButtons(): void {
  q("#btn-start").addEventListener("click", start);
  q("#btn-stop").addEventListener("click", stop);
  q("#btn-restart").addEventListener("click", restart);
  q("#btn-upgrade").addEventListener("click", upgrade);
  q("#btn-clear").addEventListener("click", clearLog);
  q("#btn-copy").addEventListener("click", copyLog);
  q("#btn-retry").addEventListener("click", start);
}

/** Show the installed pi-web version in the topbar, not the app's own. */
async function refreshPiWebVersion(): Promise<void> {
  const el = q<HTMLSpanElement>("#version");
  try {
    const v = await invoke<string>("piweb_version");
    el.textContent = v && v !== "unknown" ? "pi-web v" + v : "pi-web 未知";
  } catch {
    el.textContent = "pi-web 未知";
  }
}

/** Ask Rust where pi-web comes from and drive the source chip + upgrade state. */
async function setupWebInfo(): Promise<void> {
  const chip = q<HTMLSpanElement>("#web-source");
  const btn = q<HTMLButtonElement>("#btn-upgrade");
  try {
    const info = await invoke<WebInfo>("web_info");
    webCanUpgrade = info.can_upgrade;
    chip.textContent = SOURCE_LABELS[info.source] ?? info.source;
    chip.title = "pi-web 来源" + (info.version && info.version !== "unknown" ? " · v" + info.version : "");
    btn.disabled = !info.can_upgrade;
    btn.title = info.can_upgrade
      ? "升级应用内置的 pi-web"
      : info.source === "system"
        ? "当前使用系统安装的 pi-web，请用 npm install -g @agegr/pi-web@latest 升级"
        : "当前 pi-web 不由 PowerI 管理，无法应用内升级";
    if (info.source === "system") {
      appendLog("> 检测到系统安装的 pi-web（v" + info.version + "），直接使用，不再重复下载", "sys");
    } else if (info.source === "cached") {
      appendLog("> 使用应用内置的 pi-web（v" + info.version + "）", "sys");
    }
  } catch {
    chip.textContent = "";
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupButtons();
  setupBar();
  // The bar is visible at startup so users discover the controls,
  // then auto-hides after 5s (or on mouseleave / × button).
  showBar();
  window.setTimeout(() => {
    if (!cliMode) scheduleHide();
  }, 5000);
  q("#version").textContent = "pi-web …";
  await setupEvents();
  await setupWebInfo();
  try {
    const s = await invoke<any>("server_status");
    if (s.running) {
      showApp();
      setStatus("running", "运行中 · " + s.url);
      appendLog("> 检测到 " + s.url + " 已有服务，直接复用（该服务非本应用启动）", "sys");
    } else {
      await start();
    }
  } catch {
    await start();
  }
});

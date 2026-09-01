import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { createLaunchMachine, type LaunchMachine, type LaunchView } from "./launch-machine";

let PORT: number;
let APP_URL: string;
/** Origin of {@link APP_URL}, empty until the port is resolved. The postMessage
 *  bridge pins replies and validates inbound messages against it. */
let APP_ORIGIN = "";

// PowerI 产品层入口路由（分层架构：桌面壳加载 /poweri，上游原版 UI 保留在 /）。
// 切到 /poweri 后活动栏（F1）与统计面板（F6）等产品层功能才可见。
const POWERI_ENTRY = "/poweri";
/** Currently effective listen hostname (Rust `resolve_host`). */
let serverHost = "127.0.0.1";
/** Default port for this build (dev=9527 / prod=30141), for the reset button. */
let defaultPort = 30141;

function q<T extends HTMLElement>(sel: string): T {
  return document.querySelector(sel) as T;
}

// Frontend runtime errors land in the PowerI log file so a non-starting
// window still reports what broke in the webview.
window.addEventListener("error", (e) => {
  void invoke("log_error", { message: "JS error: " + e.message }).catch(() => {});
});
window.addEventListener("unhandledrejection", (e) => {
  void invoke("log_error", { message: "unhandled rejection: " + String(e.reason) }).catch(() => {});
});

/** Shape of the `WebInfo` struct returned by `web_info`. */
interface WebInfo {
  source: string
  version: string
  can_upgrade: boolean
}

/** Shape of the `UpdateInfo` struct returned by `check_update`. */
interface UpdateInfo {
  current_version: string
  latest_version: string
  update_available: boolean
}

/** Shape of the `InstallError` struct carried by `web:install-failed`. */
interface InstallError {
  code: string
  summary: string
}

let webCanUpgrade = false;
const SOURCE_LABELS: Record<string, string> = {
  local: "本地开发",
  override: "自定义路径",
  system: "系统安装",
  cached: "应用内置",
  missing: "未安装",
};

const iframe = q<HTMLIFrameElement>("#app-iframe");
const loading = q<HTMLDivElement>("#loading");
const log = q<HTMLPreElement>("#log");
const dot = q<HTMLSpanElement>("#status-dot");
const statusText = q<HTMLSpanElement>("#status-text");
const topbar = q<HTMLElement>("#topbar");
const grabber = q<HTMLDivElement>("#grabber");
const guide = q<HTMLDivElement>("#guide");
const loadingSpinner = q<HTMLDivElement>("#loading-spinner");
const guideTitle = q<HTMLHeadingElement>("#guide-title");
const guideSub = q<HTMLParagraphElement>("#guide-sub");
const guideDetail = q<HTMLParagraphElement>("#guide-detail");
const guideError = q<HTMLDivElement>("#guide-error");
const errTitle = q<HTMLSpanElement>("#err-title");
const errWhy = q<HTMLParagraphElement>("#err-why");
const errFix = q<HTMLParagraphElement>("#err-fix");
const btnRetry = q<HTMLButtonElement>("#btn-retry");
const btnCopyError = q<HTMLButtonElement>("#btn-copy-error");
const detailOverlay = q<HTMLDivElement>("#detail-overlay");
const detailChecks = q<HTMLDivElement>("#detail-checks");
const detailLog = q<HTMLPreElement>("#detail-log");
const detailFix = q<HTMLParagraphElement>("#detail-fix");
const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
const panels: Record<string, HTMLElement> = {
  app: q("#panel-app"),
  cli: q("#panel-cli"),
};

// settings drawer
const gearBtn = q<HTMLButtonElement>("#gear-btn");
const drawer = q<HTMLElement>("#drawer");
const drawerScrim = q<HTMLDivElement>("#drawer-scrim");
const drawerClose = q<HTMLButtonElement>("#drawer-close");
const hostSeg = q<HTMLDivElement>("#host-seg");
const portInput = q<HTMLInputElement>("#port-input");
const urlPreview = q<HTMLDivElement>("#url-preview");
const lanWarning = q<HTMLParagraphElement>("#lan-warning");
const portReset = q<HTMLButtonElement>("#port-reset");
const portSave = q<HTMLButtonElement>("#port-save");
const saveMsg = q<HTMLParagraphElement>("#save-msg");
const aboutShellVer = q<HTMLSpanElement>("#about-shell-ver");

type State = "starting" | "running" | "stopped" | "error";

let upgrading = false;
let cliMode = false;
let hideTimer: number | undefined;

/** Launch FSM; created once PORT is known. */
let machine: LaunchMachine;

/** Split a Rust command error (`CODE: message`) into code and message. */
function parseLaunchError(raw: string): { code: string; message: string } {
  const i = raw.indexOf(":");
  if (i > 0 && /^[A-Z_]+$/.test(raw.slice(0, i))) {
    return { code: raw.slice(0, i), message: raw.slice(i + 1).trim() };
  }
  return { code: "UNKNOWN", message: raw };
}

function setStatus(state: State, text: string): void {
  dot.className = "dot " + state;
  statusText.textContent = text;
}

/** Trim an append-only log to the last 2000 lines. */
function trimLog(el: HTMLElement): void {
  while (el.childElementCount > 2000) {
    if (el.firstElementChild) el.removeChild(el.firstElementChild);
  }
}

/** Append to both the CLI panel log and the detail-modal log. */
function appendLog(line: string, kind: "out" | "err" | "sys"): void {
  for (const el of [log, detailLog]) {
    const span = document.createElement("span");
    span.className = kind;
    span.textContent = line + "\n";
    el.appendChild(span);
    trimLog(el);
    el.scrollTop = el.scrollHeight;
  }
}

// ---- External-link bridge ----------------------------------------------
// poweri runs in a cross-origin iframe, so it cannot call Tauri IPC
// directly. Clicks on `target="_blank"` links inside the iframe are
// forwarded here as postMessages (see poweri/lib/external-link-bridge.ts)
// and opened in the system default browser via the `open_url` command.
// Only messages from our own iframe are accepted, and replies go back to
// exactly that origin.
//
// Commands the iframe may ask the shell to invoke through the generic
// `invoke` message (see poweri/lib/file-actions.ts `tauriInvoke`). This is an
// ALLOWLIST, not a deny-list: the bridge turns any string into a Tauri
// invoke, and several app commands fetch and run code (`upgrade_poweri`) or
// touch the filesystem (`reveal_in_folder`), so a permissive bridge would make
// one XSS inside pi-web equal desktop command execution. Keep in sync with the
// `tauriInvoke` call sites in the package; `open_url` stays on the dedicated
// `open-external` path above (scheme-gated in Rust).
const BRIDGE_COMMANDS = new Set([
  "check_update",
  "upgrade_poweri",
  "reveal_in_folder",
  "plugin:clipboard-manager|write_text",
]);

/** True when the message comes from the document we ourselves loaded into the
 *  iframe. The frame-identity check alone is not enough: it also passes for
 *  any other document that ends up in that frame after a navigation. Logging
 *  the mismatch (instead of a silent return) is what makes a broken bridge
 *  debuggable; callers get it only after the frame and `source` checks, so
 *  extension / HMR chatter cannot spam it. */
function isFromAppFrame(event: MessageEvent): boolean {
  if (event.source !== iframe.contentWindow) return false;
  if (APP_ORIGIN && event.origin === APP_ORIGIN) return true;
  appendLog(
    "> 已忽略 iframe 消息：origin " + (event.origin || "null") + " 不等于 " + (APP_ORIGIN || "（未就绪）"),
    "err",
  );
  return false;
}

function ackToIframe(type: string, url?: string): void {
  iframe.contentWindow?.postMessage({ source: "poweri-shell", type, url }, APP_ORIGIN || "*");
}

window.addEventListener("message", (event) => {
  const data = event.data as { source?: string; type?: string; url?: string; id?: number; cmd?: string; args?: unknown } | null;
  if (!data || data.source !== "poweri") return;
  // Anything claiming to come from the package must come from our own frame at
  // the exact origin we loaded; the id is echoed back, so a mismatch is fatal.
  if (!isFromAppFrame(event)) return;
  if (data.type === "bridge-ping") {
    // Handshake: tells the iframe the shell bridge is alive, so the very
    // first link click takes the postMessage path instead of a window.open
    // fallback.
    ackToIframe("open-external-ack");
    return;
  }
  if (data.type === "open-external" && typeof data.url === "string") {
    invoke("open_url", { url: data.url })
      .then(() => ackToIframe("open-external-ack", data.url!))
      .catch((e: unknown) => appendLog("> 打开链接失败：" + String(e), "err"));
    return;
  }
  if (data.type === "invoke" && typeof data.cmd === "string") {
    // 通用 IPC 桥：poweri 页面（远程 iframe）无法直接调用 Tauri 命令，
    // 由 shell（本地页面）转发。结果通过 postMessage 回传，id 用于匹配。
    // 命令名必须命中 BRIDGE_COMMANDS，未知/越权命令直接拒。
    const id = data.id;
    if (!BRIDGE_COMMANDS.has(data.cmd)) {
      iframe.contentWindow?.postMessage(
        { source: "poweri-shell", type: "invoke-result", id, ok: false, error: "bridge: command not allowed: " + data.cmd },
        APP_ORIGIN || "*",
      );
      appendLog("> 已拒绝越权 IPC 调用：" + data.cmd, "err");
      return;
    }
    invoke(data.cmd, data.args as Record<string, unknown> | undefined)
      .then((result: unknown) => {
        iframe.contentWindow?.postMessage(
          { source: "poweri-shell", type: "invoke-result", id, ok: true, result },
          APP_ORIGIN || "*",
        );
      })
      .catch((e: unknown) => {
        iframe.contentWindow?.postMessage(
          { source: "poweri-shell", type: "invoke-result", id, ok: false, error: String(e) },
          APP_ORIGIN || "*",
        );
      });
    return;
  }
});

// The initial `?cwd=` the iframe is loaded with. Resolved once via
// `default_cwd` (a Tauri command) before the first load, so pi-web opens
// on the most recent session's directory instead of an empty tree.
let initialCwdPromise: Promise<string> | null = null;
let appLoaded = false;
function initialCwd(): Promise<string> {
  if (!initialCwdPromise) {
    initialCwdPromise = invoke<string>("default_cwd").catch(() => "");
  }
  return initialCwdPromise;
}

function showApp(): void {
  loading.style.display = "none";
  if (!appLoaded) {
    // First load: attach ?cwd= so pi-web restores the default working
    // directory. Subsequent loads (retry/reuse) keep the same URL.
    appLoaded = true;
    void initialCwd().then((cwd) => {
      const sep = APP_URL.includes("?") ? "&" : "?";
      iframe.src = cwd
        ? APP_URL + sep + "cwd=" + encodeURIComponent(cwd)
        : APP_URL;
    });
    return;
  }
  if (iframe.src !== APP_URL && !iframe.src.startsWith(APP_URL + "?")) {
    iframe.src = APP_URL;
  }
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

/**
 * Render the guide page from the machine view. The still frame stays up
 * until `expanded` (fast-path flicker guard); `ready` hides the whole
 * loading layer via showApp().
 */
function renderGuide(): void {
  const v = machine.view();
  guide.classList.toggle("hidden", !v.expanded);
  // The still-frame spinner hands over to the wizard card on expansion.
  loadingSpinner.style.display = v.expanded ? "none" : "";
  for (let i = 0; i < 3; i++) {
    const stepEl = q<HTMLElement>(`[data-step="${i}"]`);
    const dotEl = q<HTMLElement>(`#step-dot-${i}`);
    const conn = document.querySelector<HTMLElement>(`[data-conn="${i}"]`);
    const st = v.steps[i];
    stepEl.classList.toggle("active", st === "busy");
    stepEl.classList.toggle("done", st === "done");
    stepEl.classList.toggle("fail", st === "fail");
    dotEl.className = "dot";
    if (st === "busy") dotEl.innerHTML = '<div class="spinner"></div>';
    else if (st === "done") dotEl.textContent = "✓";
    else if (st === "fail") dotEl.textContent = "✗";
    else dotEl.textContent = String(i + 1);
    conn?.classList.toggle("done", st === "done");
  }
  guideTitle.textContent = v.title;
  guideSub.textContent = v.sub;
  guideDetail.textContent = v.detail;
  const err = v.error;
  guideError.classList.toggle("hidden", !err);
  if (err) {
    errTitle.textContent = err.title;
    errWhy.textContent = err.why;
    errFix.textContent = err.fix;
    btnRetry.textContent = err.retryLabel;
    btnCopyError.classList.toggle("hidden", !err.copyText);
    btnCopyError.dataset.copy = err.copyText;
  }
  if (!detailOverlay.classList.contains("hidden")) renderDetail(v);
}

const CHECK_STATE_LABEL: Record<LaunchView["checks"][number]["state"], string> = {
  pending: "待检测",
  busy: "进行中",
  ok: "✓ 就绪",
  fail: "✗ 失败",
};

/** Detail modal: env report rows + fix guidance for the current state. */
function renderDetail(v: LaunchView): void {
  detailChecks.innerHTML = "";
  v.checks.forEach((c) => {
    const row = document.createElement("div");
    row.className =
      "b-check " +
      (c.state === "ok" ? "ok" : c.state === "fail" ? "err" : c.state === "busy" ? "busy" : "");
    const ic = document.createElement("span");
    ic.className = "ic";
    ic.innerHTML =
      c.state === "ok"
        ? "✓"
        : c.state === "fail"
          ? "✗"
          : c.state === "busy"
            ? '<div class="spinner"></div>'
            : "…";
    const meta = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = c.name;
    const ver = document.createElement("div");
    ver.className = "ver";
    ver.textContent = c.detail;
    meta.append(name, ver);
    const st = document.createElement("span");
    st.className = "st";
    st.textContent = CHECK_STATE_LABEL[c.state];
    row.append(ic, meta, st);
    detailChecks.append(row);
  });
  detailFix.classList.toggle("hidden", !v.error);
  if (v.error) detailFix.textContent = v.error.fix;
}

function openDetail(): void {
  detailOverlay.classList.remove("hidden");
  renderDetail(machine.view());
}

function closeDetail(): void {
  detailOverlay.classList.add("hidden");
}

function setupDetail(): void {
  q("#btn-detail").addEventListener("click", openDetail);
  q("#btn-detail-close").addEventListener("click", closeDetail);
  detailOverlay.addEventListener("click", (e) => {
    if (e.target === detailOverlay) closeDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !detailOverlay.classList.contains("hidden")) closeDetail();
  }, true);
  q("#btn-copy-error").addEventListener("click", () => {
    const text = btnCopyError.dataset.copy || "";
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => appendLog("> 已复制：" + text, "sys"))
      .catch(() => appendLog("> 复制失败", "err"));
  });
}

/** Launch the server through the FSM; events drive the rest. */
async function start(): Promise<void> {  appendLog("$ 启动服务", "sys");
  setStatus("starting", "启动中…");
  try {
    const s = await invoke<{ port: number }>("start_server");
    machine.event({ type: "spawned" });
    renderGuide();
    appendLog("> 等待端口 " + String(s.port) + " 就绪…", "sys");
  } catch (e) {
    const { code, message } = parseLaunchError(String(e));
    machine.event({ type: "launch-error", code, message });
    renderGuide();
    if (machine.view().error) setStatus("error", "启动失败");
  }
}

/** The service is up (or an existing one was detected): show the app. */
function onReady(): void {
  machine.event({ type: "ready" });
  renderGuide();
  setStatus("running", "运行中");
  showApp();
  appendLog("> 就绪：" + APP_URL, "sys");
  if (!cliMode) scheduleHide();
}

async function stop(): Promise<void> {
  appendLog("$ 停止服务…", "sys");
  const s = await invoke<{ running: boolean }>("stop_server");
  if (s.running) {
    appendLog("> 该服务非本应用启动，未停止", "sys");
    setStatus("running", "运行中");
  } else {
    machine.event({ type: "stop" });
    renderGuide();
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
    appendLog("> 当前使用的 PowerI 无法应用内升级（自定义路径或未安装）", "err");
    return;
  }
  upgrading = true;
  const btn = q<HTMLButtonElement>("#btn-upgrade");
  btn.disabled = true;
  // 复用初始化引导向导展示升级进度：关抽屉、切回 App 面板、展开向导卡片。
  // 下载进度来自 server:stderr 的 npm fetch 行（npm-fetch-line 事件）。
  closeDrawer();
  switchTab("app");
  loading.style.display = "";
  machine.event({ type: "upgrade-start" });
  renderGuide();
  setStatus("starting", "正在升级…");
  appendLog("> 正在检查最新版本并安装…", "sys");
  try {
    const r = await invoke<{
      ok: boolean;
      version: string;
      restarted: boolean;
      restart_failed: boolean;
      message: string;
    }>("upgrade_poweri");
    if (r.ok) {
      appendLog("> 已安装版本 " + r.version + " · " + r.message, "sys");
      if (r.restarted) {
        // 服务重启是异步的：Rust 端 stop → spawn 后立即返回，端口就绪才发
        // server:ready。这里只清空 iframe，由 server:ready → onReady() →
        // showApp() 在就绪后加载；立即加载会在服务器未就绪时请求 /poweri，
        // 命中 service worker 的 offline fallback（"Pi Web is offline"）且
        // 因地址栏 URL 不变而永久卡死。与 saveServerConfig 的模式一致。
        machine.event({ type: "upgrade-done", version: r.version });
        renderGuide();
        iframe.src = "about:blank";
        setStatus("starting", "升级完成，正在重启服务…");
      } else if (r.restart_failed) {
        machine.event({ type: "upgrade-failed", message: r.message });
        renderGuide();
        setStatus("error", "重启失败");
      } else {
        // 无本应用运行的服务（如浏览器里打开的 pi-web）：不打扰，装完即好，
        // 下次启动生效；恢复旧版页面。
        machine.event({ type: "upgrade-finished", version: r.version });
        renderGuide();
        showApp();
        setStatus("running", "运行中");
      }
      // Rust dropped its cached probe on a successful install, so this re-reads
      // npm and re-labels the button ("升级 PowerI → v…" vs "已是最新").
      void refreshUpdateBadge(btn);
    } else {
      appendLog("> 升级失败：" + r.message, "err");
      machine.event({ type: "upgrade-failed", message: r.message });
      renderGuide();
      setStatus("error", "升级失败");
    }
  } catch (e2) {
    appendLog("> 升级失败：" + String(e2), "err");
    machine.event({ type: "upgrade-failed", message: String(e2) });
    renderGuide();
    setStatus("error", "升级失败");
  } finally {
    upgrading = false;
    btn.disabled = false;
  }
}

function clearLog(): void {
  log.textContent = "";
  detailLog.textContent = "";
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
  tabs.forEach((t) => {
    t.addEventListener("click", () =>
      switchTab((t.dataset.tab as "app" | "cli") || "app"),
    );
  });
}

/** Switch between the App / CLI panels (the upgrade flow reuses this to
 *  bring the wizard card into view). */
function switchTab(key: "app" | "cli"): void {
  tabs.forEach((x) => x.classList.toggle("active", x.dataset.tab === key));
  Object.keys(panels).forEach((k) => panels[k].classList.toggle("active", k === key));
  if (key === "cli") {
    cliMode = true;
    showBar();
  } else {
    cliMode = false;
    scheduleHide();
  }
}

/**
 * Color-code a raw stderr line: npm fetch lines are download progress
 * (normal), npm notice/info lines are informational, everything else on
 * stderr is treated as an error. Red is reserved for real errors so a
 * healthy install never looks broken.
 */
function classifyStderr(line: string): "out" | "sys" | "err" {
  if (line.includes("npm http fetch")) return "out";
  if (line.startsWith("npm notice") || line.startsWith("npm info")) return "sys";
  return "err";
}

async function setupEvents(): Promise<void> {
  await listen<string>("server:stdout", (e) => appendLog(e.payload, "out"));
  await listen<string>("server:stderr", (e) => {
    appendLog(e.payload, classifyStderr(e.payload));
    // npm --loglevel=info prints one fetch line per downloaded package;
    // they mark the downloading phase of a first-run install.
    if (e.payload.includes("npm http fetch")) {
      machine.event({ type: "npm-fetch-line" });
      renderGuide();
    }
  });
  await listen("server:ready", () => {
    onReady();
  });
  await listen("server:timeout", () => {
    machine.event({ type: "timeout" });
    renderGuide();
    setStatus("error", "启动失败");
    appendLog("> 启动超时：90 秒内未检测到端口监听，请检查 CLI 日志", "err");
  });
  await listen<number | null>("server:exited", (e) => {
    const st = machine.view().state;
    if (st === "upgrading") {
      // 升级重启会主动 kill 旧进程，退出是预期行为，不报错。
      appendLog(
        "> 旧进程已退出 (code=" + String(e.payload) + ")，等待新版本就绪…",
        "sys",
      );
    } else if (st === "ready" || st === "stopped") {
      // The service died after it was up: keep the app frame, note the exit.
      machine.event({ type: "stop" });
      renderGuide();
      setStatus("stopped", "已退出");
      appendLog("> 进程已退出 (code=" + String(e.payload) + ")", "sys");
    } else {
      machine.event({ type: "exited" });
      renderGuide();
      setStatus("error", "启动失败");
      appendLog(
        "> 启动失败：进程提前退出（退出码 " + String(e.payload) + "），请检查 CLI 日志",
        "err",
      );
    }
  });
  await listen("server:stopped", () => {
    machine.event({ type: "stop" });
    renderGuide();
    // 升级流程会主动 stop 旧服务（npm 装完后重启），期间不显示「已停止」。
    if (machine.view().state !== "upgrading") {
      setStatus("stopped", "已停止");
    }
  });
  await listen("web:installing", () => {
    // First-run: the backend is downloading the package into the install dir.
    machine.event({ type: "install-start" });
    setStatus("starting", "正在下载安装…");
    appendLog("> 系统中未找到 PowerI，正在下载安装…", "sys");
    renderGuide();
  });
  await listen<string>("web:installed", (e) => {
    machine.event({ type: "installed", version: e.payload });
    setStatus("starting", "正在启动…");
    appendLog("> PowerI v" + e.payload + " 安装完成，正在启动…", "sys");
    renderGuide();
  });
  await listen<InstallError>("web:install-failed", (e) => {
    machine.event({
      type: "install-failed",
      code: e.payload.code,
      summary: e.payload.summary,
    });
    setStatus("error", "启动失败");
    appendLog("> 安装失败：" + (e.payload.summary || e.payload.code), "err");
    renderGuide();
  });
  await listen<string>("upgrade:stdout", (e2) => appendLog(e2.payload, "out"));
  await listen<string>("upgrade:stderr", (e2) =>
    appendLog(e2.payload, classifyStderr(e2.payload)),
  );
}

function setupButtons(): void {
  q("#btn-start").addEventListener("click", () => {
    machine.event({ type: "start" });
    renderGuide();
    void start();
  });
  q("#btn-stop").addEventListener("click", () => {
    void stop();
  });
  q("#btn-restart").addEventListener("click", () => {
    void restart();
  });
  q("#btn-upgrade").addEventListener("click", () => {
    void upgrade();
  });
  q("#btn-clear").addEventListener("click", clearLog);
  q("#btn-copy").addEventListener("click", () => {
    void copyLog();
  });
  btnRetry.addEventListener("click", () => {
    if (machine.view().state === "error-upgradeFailed") {
      // 升级失败重试：重新跑升级流程（npm 缓存使重复下载很快）。
      void upgrade();
      return;
    }
    // Staged retry: the FSM restarts from `detecting`; start_server is
    // idempotent (existing pi-web is reused, existing server is not respawned).
    machine.event({ type: "retry" });
    renderGuide();
    void start();
  });
}

/* ---------- settings drawer (S3): server config + about/upgrade ---------- */

let drawerOpen = false;
/** Hostname currently edited in the drawer ("127.0.0.1" | "0.0.0.0"). */
let drawerHost = "127.0.0.1";

function showSaveMsg(text: string, kind: "" | "ok" | "err"): void {
  saveMsg.textContent = text;
  saveMsg.classList.remove("ok", "err");
  if (kind) saveMsg.classList.add(kind);
  saveMsg.classList.remove("hidden");
}

function refreshUrlPreview(): void {
  const host = drawerHost === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1";
  urlPreview.textContent =
    "http://" + host + ":" + (portInput.value.trim() || "—");
  lanWarning.classList.toggle("hidden", drawerHost !== "0.0.0.0");
}

function openDrawer(): void {
  drawerOpen = true;
  showBar();
  drawerHost = serverHost;
  portInput.value = String(PORT);
  hostSeg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.host === drawerHost);
  });
  saveMsg.classList.add("hidden");
  refreshUrlPreview();
  drawer.classList.remove("hidden");
  drawerScrim.classList.remove("hidden");
  portInput.focus();
  portInput.select();
}

function closeDrawer(): void {
  drawerOpen = false;
  drawer.classList.add("hidden");
  drawerScrim.classList.add("hidden");
  saveMsg.classList.add("hidden");
}

/**
 * Persist port+host through `set_server_config` (atomic: writes
 * settings.json, then restarts the server on the new config). The drawer
 * stays open with a status line while the restart runs; `server:ready`
 * reloads the iframe on the new URL.
 */
function saveServerConfig(): void {
  const port = parseInt(portInput.value, 10);
  if (!port || port < 1024 || port > 65535) {
    showSaveMsg("端口需在 1024–65535 之间", "err");
    portInput.focus();
    return;
  }
  portSave.disabled = true;
  showSaveMsg("正在保存并重启服务…", "");
  void (async () => {
    try {
      const s = await invoke<{ running: boolean; port: number; url: string }>(
        "set_server_config",
        { port, host: drawerHost },
      );
      PORT = s.port;
      serverHost = drawerHost;
      APP_URL = "http://127.0.0.1:" + s.port + POWERI_ENTRY;
      APP_ORIGIN = new URL(APP_URL).origin;
      appendLog(
        "> 配置已更新：监听 " +
          serverHost +
          ":" +
          String(s.port) +
          "，服务重启中…",
        "sys",
      );
      setStatus("starting", "重启中…");
      showSaveMsg("已保存，服务重启中…", "ok");
      iframe.src = "about:blank";
      window.setTimeout(() => {
        portSave.disabled = false;
        closeDrawer();
      }, 1200);
    } catch (e) {
      portSave.disabled = false;
      showSaveMsg(parseLaunchError(String(e)).message, "err");
    }
  })();
}

function setupDrawer(): void {
  gearBtn.addEventListener("click", () =>
    drawerOpen ? closeDrawer() : openDrawer(),
  );
  drawerClose.addEventListener("click", closeDrawer);
  drawerScrim.addEventListener("click", closeDrawer);
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && drawerOpen) closeDrawer();
    },
    true,
  );

  hostSeg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.addEventListener("click", () => {
      drawerHost = b.dataset.host || "127.0.0.1";
      hostSeg.querySelectorAll<HTMLButtonElement>("button").forEach((x) => {
        x.classList.toggle("active", x === b);
      });
      refreshUrlPreview();
    });
  });
  portInput.addEventListener("input", () => {
    saveMsg.classList.add("hidden");
    refreshUrlPreview();
  });

  portReset.addEventListener("click", () => {
    portInput.value = String(defaultPort);
    drawerHost = "127.0.0.1";
    hostSeg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.host === "127.0.0.1");
    });
    refreshUrlPreview();
  });

  portSave.addEventListener("click", saveServerConfig);
}

/* ---------- version chips / about ---------- */

/** Where the PowerI web app will run comes from; drives the upgrade button
 *  in the settings drawer and the detail modal's service row. Never gates
 *  the launch path. */
async function setupWebInfo(): Promise<void> {
  const btn = q<HTMLButtonElement>("#btn-upgrade");
  try {
    const info = await invoke<WebInfo>("web_info");
    webCanUpgrade = info.can_upgrade;
    machine.event({
      type: "env-info",
      webSourceLabel: SOURCE_LABELS[info.source] ?? info.source,
      webVersion: info.version,
    });
    renderGuide();
    btn.disabled = !info.can_upgrade;
    btn.title = info.can_upgrade
      ? "升级 PowerI：重新下载 npm 上的 @poweri/poweri-web 最新版并重启服务"
      : info.source === "override"
        ? "当前使用自定义 PowerI 路径（POWERI_WEB_BIN），无法应用内升级"
        : "当前无已安装的 PowerI，首次启动将自动下载";
    if (info.source === "system") {
      appendLog(
        "> 检测到系统安装的 PowerI（v" + info.version + "），直接使用；如需新版请在设置中点击「升级 PowerI」",
        "sys",
      );
    } else if (info.source === "cached") {
      appendLog("> 使用应用内置的 PowerI（v" + info.version + "）", "sys");
    }
    // Best-effort "is there a newer @poweri/poweri-web on npm?" — non-blocking,
    // never delays boot. Reflects on the upgrade button so the user sees
    // whether clicking will actually fetch something new.
    if (info.can_upgrade) {
      void refreshUpdateBadge(btn);
    }
  } catch {
    // web_info failed — upgrade stays disabled
  }
}

// Query `check_update` once and annotate the upgrade button + CLI log. Any
// failure (offline, no npm) is silent — the button keeps its default label.
async function refreshUpdateBadge(btn: HTMLButtonElement): Promise<void> {
  try {
    const u = await invoke<UpdateInfo>("check_update");
    if (!u.latest_version) return; // check could not run — say nothing
    if (u.update_available) {
      btn.textContent = "升级 PowerI → v" + u.latest_version;
      btn.title = "发现新版本 v" + u.latest_version + "：点击重新下载 @poweri/poweri-web@latest 并重启服务";
      appendLog("> 发现新版本 v" + u.latest_version + "（当前 v" + u.current_version + "），可点击「升级 PowerI」", "sys");
    } else {
      // Restore the base label: a previous probe may have annotated it with
      // "→ v<latest>", which is wrong now that we are up to date (notably
      // right after a successful upgrade).
      btn.textContent = "升级 PowerI";
      btn.title = "当前已是最新版本 v" + u.current_version;
      appendLog("> 已是最新版本 v" + u.current_version, "sys");
    }
  } catch {
    // best-effort only
  }
}

window.addEventListener("DOMContentLoaded", () => {
  void (async () => {
    // Get port from Rust (cfg-split: dev=9527, prod=30141, or env override)
    PORT = await invoke<number>("get_port");
    try {
      defaultPort = await invoke<number>("default_port");
    } catch {
      // keep the prod default
    }
    APP_URL = "http://127.0.0.1:" + PORT + POWERI_ENTRY;
    APP_ORIGIN = new URL(APP_URL).origin;
    machine = createLaunchMachine(PORT);

    setupTabs();
    setupButtons();
    setupBar();
    setupDetail();
    setupDrawer();
    // The bar is visible at startup so users discover the controls,    // then auto-hides after 5s (or on mouseleave / × button).
    showBar();
    window.setTimeout(() => {
      if (!cliMode) scheduleHide();
    }, 5000);
    getVersion()
      .then((v) => {
        q<HTMLSpanElement>("#brand-ver").textContent = "v" + v;
        aboutShellVer.textContent = "v" + v;
      })
      .catch(() => {
        q<HTMLSpanElement>("#brand-ver").textContent = "";
      });
    await setupEvents();
    machine.event({ type: "boot" });
    renderGuide();
    // Fast-path flicker guard: only a detect that outlives ~250ms reveals
    // the wizard; installing/error states expand on their own, and a fast
    // cached/system launch never shows the card at all.
    window.setTimeout(() => {
      if (machine.view().state === "detecting") {
        machine.event({ type: "expand" });
        renderGuide();
      }
    }, 250);
    try {
      const s = await invoke<{ running: boolean; url: string }>("server_status");
      if (s.running) {
        machine.event({ type: "reuse" });
        renderGuide();
        appendLog("> 检测到 " + s.url + " 已有服务，直接复用（该服务非本应用启动）", "sys");
        onReady();
      } else {
        await start();
      }
    } catch {
      await start();
    }
    void setupWebInfo();
  })();
});

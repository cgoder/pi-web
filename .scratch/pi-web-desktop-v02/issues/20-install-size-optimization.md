---
title: 安装体积优化（依赖闭包 + 平台裁剪）
status: done
type: task
blocked-by: [19]
---

# 安装体积优化（依赖闭包 + 平台裁剪）

## Problem Statement

pi-web 首次下载 ~270MB（npm 11 实测：干净缓存下载 ~301MB，安装后 node_modules ~610MB），
包含大量依赖。Minke 的经验表明，依赖闭包计算 + 平台裁剪可以减少体积。

## Solution（最终方案）

在 `installer.rs` 中构建 npm install 参数时：
1. 添加 `--omit=dev` 移除 devDependencies（npm 不会安装依赖包的 devDeps，此项实测近乎无效果，作为意图标记保留）
2. 根据当前平台添加 `--os=<platform> --cpu=<arch>`，只安装当前平台的 native module（npm 9+ 已原生按 os/cpu 过滤 optional native deps，此项实测无额外收益，作为安全网保留）

**`--omit=optional` 被实测否决**，理由见「验证」。

## User Stories

1. As a first-time user, I want the initial pi-web download to be as small as possible, so that I can start using PowerI quickly even on slow networks
2. As a macOS ARM64 user, I don't want to download Windows/Linux native modules, so that disk space is not wasted on incompatible binaries
3. As a maintainer, I want to control which dependencies are installed, so that I can prevent volume regression when pi-web adds new optional dependencies

## Implementation Decisions

### npm install 参数构建（已实施）

```rust
// installer.rs —— build_npm_args(prefix: &str) -> Vec<String>
// 参数顺序：install --prefix <prefix> --omit=dev [--os] [--cpu] <NPM_COMMON> <PACKAGE>
let mut args = vec![
    "install".to_string(),
    "--prefix".to_string(),
    prefix.to_string(),
    "--omit=dev".to_string(),
];
// 平台裁剪（编译期 #[cfg] 确定，产物永远匹配运行机器）
#[cfg(target_os = "macos")]
args.push("--os=darwin".to_string());
#[cfg(target_os = "windows")]
args.push("--os=win32".to_string());
#[cfg(target_os = "linux")]
args.push("--os=linux".to_string());
#[cfg(target_arch = "aarch64")]
args.push("--cpu=arm64".to_string());
#[cfg(target_arch = "x86_64")]
args.push("--cpu=x64".to_string());
args.extend(NPM_COMMON.iter().map(|s| s.to_string()));
args.push(PACKAGE.to_string());
```

- `ensure_web_installed` 改为调用 `build_npm_args(prefix)`，不再内联拼参数
- `build_npm_args` / `NPM_COMMON` 未加 `#[cfg(not(debug_assertions))]` 门控，而是沿用本文件
  `INSTALL_TIMEOUT` / `extract_installed_version` 的 `#[cfg_attr(debug_assertions, allow(dead_code))]`
  模式：**被测函数在 debug 也可编译，`cargo test`（debug）能真实跑单元测试**；release 行为与门控前完全一致。
  门控函数（`run_npm` / `ensure_web_installed`）仍保持 release-only。

### 为什么不加 `--omit=optional`（实测结论，2025-08 于 macOS arm64 / npm 11.6.2）

| 组合 | 干净缓存下载体积 | 安装后 node_modules | 首次启动 |
|---|---|---|---|
| ① 现状基线（现 installer 参数） | ~301MB | 610MB | ✓ 即时 Ready（~100ms） |
| ② + `--omit=dev` | ~301MB（无变化） | 608MB | ✓ 即时 Ready |
| ③ + `--omit=dev` + `--os=darwin --cpu=arm64` | ~301MB（无变化） | 608MB | ✓ 即时 Ready |
| ④ + `--omit=dev` + `--omit=optional` + `--os/--cpu` | 252MB（-49MB） | 472MB（安装时） | ✓ 但首次启动被阻塞 ~10s，且触发运行时下载 |

第④组合的关键发现（`next@16.3.1`）：`next start` 加载 `next.config.ts` 仍需 SWC 二进制
（`@next/swc-darwin-arm64`，next 的 optionalDependency）。省略 optional deps 后：
- Next 在**首次启动时自动重新下载** swc：31MB tarball → `~/Library/Caches/next-swc`，
  并解包 **85MB 到 `node_modules/next/next-swc-fallback`**（即 472MB → 首次启动后 557MB）；
- 首次启动 `✓ Ready` 后阻塞 10.2s（`Running next.config.ts took 10.2s`），慢网下会更久，
  且**没有 PowerI 的进度上报/超时控制**，首次启动变成网络依赖（离线则启动失败，健康检查会误报坏安装）；
- sharp（next 的另一个 optional dep，图片优化用）也被移除，生产环境图片优化降级；
- 净收益塌缩：下载仅省 ~18MB（301→252+31），磁盘仅省 ~51MB（608→557），
  换来首次启动可靠性回归。

**结论**：不采用 `--omit=optional`。保留 `--omit=dev` + `--os/--cpu`（组合③）作为最终方案。

### 为什么收益没有工单预期的 150-180MB

npm 11 的基线安装**本来就不下载所有平台的 swc**：`@next/swc-*` 是 optionalDependencies 且带
`os`/`cpu` 字段，npm 原生只装当前平台的 darwin-arm64 变体（实测 ① 与 ③ 体积相同）。真正占体积的是：

- `next` 本体 dist：~198MB（`next start` 必需，npm 参数无法裁剪）
- `@earendil-works/pi-coding-agent`：~139MB（含内嵌依赖）
- 随包发布的 `.next` 产物：~27MB
- `@mariozechner/clipboard-*` 全家桶 12MB（10 个平台包，但它们是 `pi-coding-agent` 的**普通依赖**，
  npm 对普通依赖不做 os/cpu 过滤，`--os/--cpu` 也无效——只能上游改用 optionalDependencies 才能裁）

即：**150-180MB 目标在 npm 参数层面不可达**；本次改动的价值是语义正确 + 对未来依赖树的
安全网（防止新依赖把多平台 native 包泄漏进来），真正的体积大头需要 pi-web 上游瘦身（见 issue 23 的 CI 监控思路）。

### 预期收益（修正后）

- `--omit=dev`：0%（npm 不装依赖包的 devDeps）；保留为意图标记
- `--os/--cpu`：当前依赖树 0%（npm 11 原生已过滤）；保留为安全网
- 总体：当前实测下载 ~301MB / 安装 ~608MB 维持不变，但杜绝了未来「多平台 native 泄漏」回归

### 验证（实测，2025-08-19，macOS arm64 / node v24.13.0 / npm 11.6.2）

1. 四种组合在 `/tmp/piweb-size-test/` 下用 `npm install --prefix <dir> @agegr/pi-web <flags>`
   （复刻 installer.rs 的 NPM_COMMON：`--no-audit --no-fund --no-update-notifier --fetch-retries=0
   --no-save --no-package-lock --json --loglevel=info --legacy-peer-deps=false`）逐一安装并 `du -sh` 测体积
2. 每个组合 `node_modules/.bin/pi-web -H 127.0.0.1 -p <空闲端口> --no-open` 启动，curl 首页 HTTP 200 后杀进程
   （注意：`pi-web --version` 并不存在——parseLaunchOptions strict:false 会忽略未知参数并真正启动服务；
   且 shell 的 `PORT` 环境变量会被 `env.PORT` 读走，测试需 `env -u PORT` + 显式 `-p`）
3. 体积对比表见上文；四种组合均能启动（HTTP 200），区别只在首次启动耗时与是否触发运行时下载
4. 第④组合额外验证：`~/Library/Caches/next-swc` 出现 31MB tarball、`node_modules/next/next-swc-fallback`
   85MB、`Running next.config.ts took 10.2s`（首次）/ 840ms（swc 已缓存后的第二次）
5. 单元测试：`cargo test` 新增 6 个 `build_npm_args` 测试全部通过（参数形状/顺序、`--omit=optional`
   缺席断言、按编译目标的 `--os`/`--cpu` 断言，跨平台部分用 `#[cfg(target_os/arch)]` 门控，
   各 CI 平台各自验证自己的分支）

## Testing Decisions

- 单元测试：`build_npm_args()` 返回正确的参数列表（形状、顺序、平台参数、`--omit=optional` 缺席）
- 集成/冒烟测试：已在 macOS arm64 真机完成四种组合的安装 + 启动 + HTTP 200 验证（见「验证」）
- 跨平台：`--os`/`--cpu` 断言用 `#[cfg]` 门控，CI 矩阵各平台验证自己的分支

## Out of Scope

- 不做依赖树分析（可视化哪些包占用空间最多）——但实测已定位大头：next dist 198MB / pi-coding-agent 139MB
- 不做 source map 移除（pi-web 自身控制）
- 不做 ASAR 打包（Tauri 不需要）
- 不裁剪 `@mariozechner/clipboard-*` 等普通依赖的多平台变体（需 pi-coding-agent 上游改 optionalDependencies）

## Further Notes

- npm 的 `--os` 和 `--cpu` 参数在 npm 9+ 支持；PowerI 检测到的 npm 为 11.6.2
- npm ≥ 8.17 已按 os/cpu 字段原生过滤 optionalDependencies（`@next/swc-*` 只装匹配平台）
- `next@16` 在 SWC 缺失时会**运行时自动下载**到用户缓存并解包进 node_modules——这是否决 `--omit=optional` 的根本原因
- 如果用户手动安装 pi-web（系统安装优先），不受此优化影响
- 健康检查（21）会验证优化后的安装是否完整；CI 体积监控见 issue 23

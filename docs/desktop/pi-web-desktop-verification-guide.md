# Pi Web Desktop —— 方案验证执行手册（场景 A：Tauri 壳 + npx 拉取 + iframe 内嵌）

> 执行者：agent（可独立执行本手册全部步骤）
> 目标：把 pi-web（@agegr/pi-web）用 dsh-desktop 的模式打成超小原生应用，并**实测**该方案的可行性与已知缺点。
> 依据：《web-to-native-mini-app-guide.md》（同目录）第 6 章实例分析 + 第 8 章缺点清单。
> 模板源：`/Users/tianzhao/code/github/dsh-desktop`（MIT 许可，可直接复制改造）。

---

## 0. 验证目标与通过标准

**硬性通过标准**（全部满足才算方案可行）：
1. 安装包体积 < 5MB
2. 应用启动后自动拉起 pi-web 服务，窗口内正常显示 UI，可发送消息/浏览会话
3. 关闭窗口后无残留进程（`ps aux | grep` 验证）
4. CLI 日志面板实时可见
5. 端口 30141 被占用时走"复用"路径而非崩溃

**软性实测项**（记录数据即可，不设门槛）：首启耗时、内存占用、Finder 双击启动、剪贴板、拖拽上传、离线启动报错体验。

---

## 1. 环境事实（已核查，执行时无需重查）

| 项 | 事实 | 影响 |
|---|---|---|
| OS | macOS x86_64（Intel） | 打包用 `x86_64-apple-darwin` |
| Node | v24.16.0（fnm 管理，`~/.fnm/aliases/default` → v24.16.0） | ✅ 满足 pi-web 要求 ≥22.19 |
| npm | 11.13.0，registry 连通（npm ping 通过） | npx 拉取可用 |
| **Rust** | **rustc/cargo 均未安装** | **第一步必须安装**（rustup） |
| fnm 位置 | 不在 dsh 探测的 `/opt/homebrew` 或 `/usr/local`；本机为 `~/.fnm/aliases/default/bin/npx`（symlink） | **GUI 启动必坑**，见 §7.1 |
| 端口 30141 | **当前被占用**（PID 53471，Microsoft 进程有 ESTABLISHED 连接） | 验证时可实测"端口复用"路径；也可能是用户已开的 pi-web |
| pi-web 发布版 | v0.8.9，npm 包解压体积 **27MB**（dist.unpackedSize=27073030） | 首次 npx 下载 ~27MB+依赖，首启耗时属预期 |

---

## 2. 项目创建

```bash
# 1) 安装 Rust（首次，约 2-5 分钟）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env" && rustc --version   # 验证

# 2) 建项目（复制 dsh-desktop 骨架）
mkdir -p /Users/tianzhao/code/github/pi-web-desktop
cd /Users/tianzhao/code/github/pi-web-desktop
# 复制以下文件/目录（其余不要）：
#   package.json package-lock.json tsconfig.json vite.config.ts index.html .gitignore
#   src/  src-tauri/（去掉 src-tauri/target 和 src-tauri/gen，重新生成 icons）
cp -r /Users/tianzhao/code/github/dsh-desktop/{package.json,package-lock.json,tsconfig.json,vite.config.ts,index.html,.gitignore,src,src-tauri} .
rm -rf src-tauri/target src-tauri/gen src-tauri/icons   # icons 用 tauri icon 重新生成

# 3) 装前端依赖
npm install

# 4) 生成应用图标（先用占位图）
#    npx tauri icon <任意 1024x1024 png>   # 或临时复用 dsh 的 src-tauri/app-icon.png
```

---

## 3. 改造点（逐文件，精确到代码）

### 3.1 `src-tauri/src/main.rs`（核心，4 处）

```rust
// ① 端口常量（原 3080）
const PORT: u16 = 30141;

// ② 启动命令（原 dsh_command）—— 必须带 --no-open，否则每次启动弹浏览器
fn server_command() -> Command {
    let mut c = base_npx_cmd();
    c.args(["--yes", "@agegr/pi-web", "--no-open"]);
    c
}

// ③ base_npx_cmd 的探测列表 —— 本机必须加 ~/.fnm 路径（否则 Finder 双击必失败）
//    在现有 for fnm in [...] 列表前追加：
//      "~/.fnm/aliases/default/bin/fnm"  // 用 dirs::home_dir() 拼接，或直接探测 npx 本体
//    更稳的写法：探测 npx 可执行文件本身（fnm 管理下它是 symlink，路径稳定）：
//      let npx_candidates = [
//          "/opt/homebrew/bin/npx",
//          "/usr/local/bin/npx",
//          "~/.fnm/aliases/default/bin/npx",   // fnm 默认版本 symlink，升级跟随
//      ];
//    命中后 Command::new(candidate) 直接跑 npx，不再需要 fnm exec 包装。

// ④ 版本/升级命令（可选，建议第一版砍掉，见 3.4）
```

其余骨架（进程组、端口轮询、日志管道、事件、退出清理）**原样保留，一字不改**。

### 3.2 `src-tauri/tauri.conf.json`

```jsonc
{
  "productName": "Pi Web Desktop",
  "version": "0.1.0",
  "identifier": "com.piweb.desktop",
  // 其余（build/bundle/windows 配置）保持不变
}
```

### 3.3 `package.json`

- `name: "pi-web-desktop"`、`version: "0.1.0"`、`productName` 对应；依赖保持 `@tauri-apps/api` + `@tauri-apps/cli` + vite + typescript。

### 3.4 前端壳（`index.html` / `src/main.ts` / `src/styles.css`）

- `main.ts`：`const PORT = 30141;`、`APP_URL = "http://127.0.0.1:30141"`；文案 `dsh` → `Pi Web`；`refreshDshVersion()` 相关逻辑可删（pi-web 无 `--version` 输出）
- **加载文案**（`index.html` loading 区）：提示"首次启动需下载依赖（约 27MB），请耐心等待"
- **iframe 标签加剪贴板权限**：`<iframe id="app-iframe" allow="clipboard-write" ...>`（缓解跨源 iframe 剪贴板限制，§5 实测项）
- 建议第一版**砍掉**：升级按钮、版本显示（dsh 的 hacky 探针在 pi-web 不适用；升级用"临时端口法"留到验证通过后再加，见手册第 6 章备注）

### 3.5 `Cargo.toml` —— 原样保留（体积参数已在）

```toml
[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

---

## 4. 构建与运行（分三阶段）

### 阶段 1：先验证核心机制（不依赖 Rust，最快证明"拉取+服务"可用）

```bash
# 终端直接跑 pi-web 的启动命令（与壳内 Rust 将执行的完全一致）
npx --yes @agegr/pi-web --no-open
# 另开终端：
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:30141   # 预期 200
curl -s http://127.0.0.1:30141 | head -5                         # 预期 HTML
# 注意：30141 当前可能已被外部进程占用 —— 若 npx 启动报 EADDRINUSE，
# 属于预期（实测"端口复用"场景），可先 kill 占用者再测正常路径：
#   lsof -ti :30141 | xargs kill   # ⚠️ 确认占用者不是用户重要进程
# 验证完 Ctrl+C 停止
```

### 阶段 2：`npm run tauri dev`（debug 构建，首次编译 Rust 依赖 5-10 分钟）

- 预期：弹出 "Pi Web Desktop" 窗口 → 状态"启动中…" → 自动拉服务 → 绿色"运行中"→ iframe 显示 pi-web 界面
- 观察控制台：Rust 侧无 panic；页面无白屏

### 阶段 3：`npm run tauri build`（release，验证体积）

```bash
npm run tauri build
ls -lh src-tauri/target/release/bundle/macos/*.app.tar.gz   # 记录体积（硬性门槛 <5MB）
```

---

## 5. 验证清单（逐项执行并记录）

### 5.1 硬性项

| # | 验证项 | 方法 | 预期 | 结果 |
|---|--------|------|------|------|
| V1 | 安装包体积 | `ls -lh` bundle 产物 | < 5MB | |
| V2 | 自动拉起服务 + UI 显示 | `tauri dev` 窗口观察 | 状态转绿，页面可用 | |
| V3 | 关窗无残留进程 | 关窗后 `ps aux \| grep -E "next|pi-web"` | 无残留（排除用户外部进程） | |
| V4 | CLI 日志实时 | 切 CLI tab | 日志滚动、含 npx/next 输出 | |
| V5 | 端口复用 | 先手动 `npx pi-web --no-open`，再启动应用 | 应用提示"复用已有服务"，不崩溃 | |

### 5.2 软性实测项（记录数据）

| # | 项 | 方法 | 记录 |
|---|----|------|------|
| S1 | 首启耗时 | 冷启动（清 npx 缓存 `npm cache clean --force` 后）→ 记录"点击到 UI 出现"秒数 | |
| S2 | 二次启动耗时 | 热启动记录 | |
| S3 | 内存占用 | Activity Monitor：WebView 进程 + node 进程 RSS 总和 | |
| S4 | **Finder 双击启动** | `open src-tauri/target/release/bundle/macos/*.app` 或 dev 产物 | **大概率失败（fnm PATH 坑），见 §7.1** |
| S5 | 剪贴板复制 | pi-web UI 内找复制按钮（如复制 prompt/导出）点击 | 观察是否静默失败 |
| S6 | 拖拽上传 | 拖文件到 pi-web 的文件上传区 | 观察 drop 是否生效 |
| S7 | 离线启动 | 断网后启动应用 | 预期报错；验证错误提示与日志可见性 |
| S8 | 渲染兼容 | 对照 Chrome 检查布局/字体/滚动/中文 | 记录差异 |
| S9 | 关窗时 agent 运行中 | pi-web 里发一条长消息（agent 运行中）→ 关窗 → 重开 | 会话中断属预期，记录体验 |
| S10 | 升级按钮 | （若已实现临时端口法） | 记录 |

### 5.3 结果汇总

- 硬性项全部通过 → 方案可行，可进入"场景 B 变体"对照决策
- 任一硬性项失败 → 记录失败详情，判断是"实现问题"还是"方案问题"

---

## 6. 遗留决策点（验证通过后再定）

1. **升级按钮**：dsh 的 `npx pkg@latest --version` 探针不适用于 pi-web。候选方案：
   - A. 临时端口法：`npx --yes @agegr/pi-web@latest --no-open -p 39999`，等端口就绪或 15s 后 kill 进程组（强制刷新 npx 缓存）
   - B. 不做升级按钮（npx 每次 `--yes pkg` 会用缓存，加 `@latest` 才强制更新；说明"升级=重启应用"）
   - C. `npm view @agegr/pi-web version` 查远程版本做"有新版本"提示
2. **版本显示**：从 npx 下载日志行提取 semver（dsh 已有 `extract_version`）或砍掉
3. **托盘常驻/后台跑 agent**：属原生增强，不在本次验证范围（记入后续场景 B 变体）

---

## 7. 已知坑位（执行前必读）

### 7.1 ⚠️ Finder 双击启动必坑（本机特有，已验证事实）

- 事实链：GUI 进程 PATH = `/usr/bin:/bin:/usr/sbin:/sbin`（launchd 默认，无 node/npx）；本机 node 在 `~/.fnm/node-versions/v24.16.0/installation/bin`；fnm 二进制不在 `/opt/homebrew`、`/usr/local`（dsh 探测列表全覆盖 miss）→ 裸 `Command::new("npx")` 必然 "No such file or directory"
- **必须**按 §3.1 ③ 扩展 `base_npx_cmd` 探测 `~/.fnm/aliases/default/bin/npx`（symlink，fnm 升级自动跟随）
- 验证方法：`launchctl setenv PATH` 不改的情况下，`open` 启动 app 观察是否报"无法启动"

### 7.2 端口 30141 已被占用（当前环境）

- 占用者：PID 53471（Microsoft 进程）。验证 V5 端口复用路径正好可用
- 若测试正常启动路径受阻：`lsof -ti :30141 | xargs kill` 前先确认进程归属

### 7.3 首次启动慢（预期内）

- npm 包解压 27MB + next 依赖，npx 首拉可能 1-5 分钟；loading 文案已要求提示；90s 就绪超时可能不够，建议首版把超时调到 300s 或在超时文案提示"首次下载较慢可重试"

### 7.4 npm 镜像（中国网络可选）

```bash
npm config set registry https://registry.npmmirror.com   # 慢时使用
```

### 7.5 macOS 未签名

- 构建产物双击会触发 Gatekeeper；验证时：`sudo xattr -cr /Applications/Pi\ Web\ Desktop.app`（或右键-打开）；正式分发需 Developer ID 签名（$99/年）或接受 `xattr -cr` 引导

### 7.6 iframe 剪贴板/拖拽（S5/S6 实测后回填结论）

- 已加 `allow="clipboard-write"` 缓解；若仍失败，记录为"方案缺点命中"（对照手册第 8 章缺点 5）

---

## 8. 产出物

验证结束后，回填：
1. 本手册 §5 验证清单结果表
2. 新仓库 `pi-web-desktop`（含全部源码，可继续演进）
3. 一段结论：方案可行/不可行 + 与"场景 B 变体"的取舍建议

# poweri-web 独立运行（Standalone）

> `@poweri/poweri-web` 对标 pi-web：既是 PowerI 桌面壳的 web 层，也是一个可以
> 独立安装运行的 web 服务。本文描述独立运行的入口、端口约定与壳的互动行为。

## 身份与入口

| 入口 | 命令 | 默认端口 | 说明 |
|---|---|---|---|
| **poweri-web**（推荐） | `npx @poweri/poweri-web` / `poweri-web` | **9989** | PowerI 专用端口，与桌面壳（release）一致；入口实现 `poweri/bin/poweri-web.js` |
| pi-web（legacy 兼容） | `pi-web` | 30141 | 上游 launcher（`bin/pi-web.js`），仅为已发布旧壳保留——旧壳解析 `pi-web` bin 并总是显式传 `-p`，不受默认值影响；**勿删除** |
| npm scripts | `npm run dev` / `npm start`（仓库或安装目录内） | 9989 | 与独立 bin 对齐 |

> npmjs.com 页面展示的 README 为上游 pi-web 的（`README.md` 上游持有，fork 红线
> 不改），独立运行说明以本文为准；`package.json` 的 `description` 已标注双身份。

## 运行

```bash
# 免安装试跑（PowerI 专用端口 9989）
npx -y @poweri/poweri-web

# 全局安装
npm install -g @poweri/poweri-web
poweri-web                      # http://127.0.0.1:9989
poweri-web -p 3000 --no-open    # 显式覆盖
PORT=7777 poweri-web            # env 兜底（优先级：-p/--port > PORT > 9989）
```

选项与环境变量与 pi-web 完全一致（`-p/-H/--no-open/-h`；`PORT`、
`PI_WEB_HOSTNAME`、`PI_WEB_NO_OPEN`、`PI_WEB_PASSWORD`、`PI_WEB_ALLOWED_HOSTS`），
`poweri-web --help` 查看全文。仅默认端口不同：**9989 vs 上游 30141**。

## 端口约定全景

| 端口 | 归属 |
|---|---|
| **9989** | poweri-web 独立默认 + release 桌面壳默认（`main.rs DEFAULT_PORT`）+ npm scripts |
| 30141 | pi-web 上游（`bin/pi-web.js` 默认值）；poweri-web 不再使用 |
| 9527 | debug 壳（`dev-shell.mjs`，Rust dev build 配对） |
| 1420 | 壳 UI 自身（vite devUrl） |

## 与桌面壳的互动（release）

壳启动时探测 `resolve_port()`（默认 9989）。**复用一律以 poweri-web 身份为前
提**，两条路径同构（`/poweri` 为 fork 独有路由，上游 pi-web 与陌生程序都返回
非 2xx，故 `GET /poweri` 2xx 即正识别信号）：

| 场景 | 判定路径 | 结果 |
|---|---|---|
| 独立 poweri-web 已在 9989 | boot 快路径 `server_status` → `reusable_web_on_port`（pid 空 → 过探针） | **接管**，日志 `reusable_web_on_port: riding external poweri-web on port 9989 (not spawned by this app)`；不下载、不再起服务 |
| 壳自己 spawn 的服务 | `reusable_web_on_port`（pid 在场 → 直接信任，免探针） | 正常加载 |
| 竞态：boot 时端口未开、start 时已被占 | `start_internal` → `reusable_web_on_port` | 是 poweri-web → 复用（同上日志行）；否则报 `PORT_OCCUPIED` |
| 被陌生程序占用 | 同上两条路径 | 报 `PORT_OCCUPIED: 端口 9989 已被其他程序占用（未识别为 poweri-web）`，不抢占、不把陌生服务盲入 iframe |
| 端口空闲 | `start_internal` | 安装并拉起壳 pinned 版本的 web（`~/.poweri/web`） |

> 日志路径：macOS `~/Library/Logs/PowerI/poweri.log`，Windows `%USERPROFILE%\.poweri\poweri.log`
> （`~/.poweri/` 只放 `settings.json` 与托管安装目录 `web/`）。“app 里 web 版本和我装的对不上”这类问题，
> 看这一行即可对账：是接管了外部实例，还是壳自己装的那份。

## 实现

`poweri/bin/poweri-web.js` 是 PowerI 层新增入口（上游 `bin/` 红线不改动）：
拦截 `--help` 输出自身文案；无 `-p/--port` 且无 `PORT` 时设 `PORT=9989`；
随后 `require` 委托上游 `bin/pi-web.js`（node 版本门禁、`next start` 派生、
`PI_WEB_*` 处理全部复用上游，零行为分叉）。发布包 `files` 含 `poweri/bin`。

## 验证方式

published 包注入等价改动后实测（见对应 PR/提交说明）：`npm pack
@poweri/poweri-web@<published>` 解包 → 注入本改动 → `npm install` →
`npx poweri-web` 默认绑 9989、`/poweri` 200、legacy `pi-web --help` 仍显
30141、`PORT` env 覆盖生效、壳接管日志命中。

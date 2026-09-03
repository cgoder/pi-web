# poweri-web 独立运行（Standalone）

> `@poweri/poweri-web` 对标 pi-web：既是 PowerI 桌面壳的 web 层，也是一个可以
> 独立安装运行的 web 服务。本文描述独立运行的入口、端口约定与壳的互动行为。

## 身份与入口

| 入口 | 命令 | 默认端口 | 说明 |
|---|---|---|---|
| **poweri-web**（推荐） | `npx @poweri/poweri-web` / `poweri-web` | **9989** | PowerI 专用端口，与桌面壳（release）一致；入口实现 `poweri/bin/poweri-web.js` |
| pi-web（legacy 兼容） | `pi-web` | 30141 | 上游 launcher（`bin/pi-web.js`），仅为已发布旧壳保留——旧壳解析 `pi-web` bin 并总是显式传 `-p`，不受默认值影响；**勿删除** |
| npm scripts | `npm run dev` / `npm start`（仓库或安装目录内） | 9989 | 与独立 bin 对齐 |

> npmjs.com 页面展示的 README 现为 PowerI 项目 README（2026-09-02 整体重写，登记于
> `docs/desktop/ownership.md` §4）；独立运行细节仍以本文为准，README 只保留快速上手。

## 运行

```bash
# 免安装试跑（PowerI 专用端口 9989）
npx -y @poweri/poweri-web

# 全局安装
npm install -g @poweri/poweri-web
poweri-web                      # 浏览器自动开 http://127.0.0.1:9989/poweri
poweri-web -p 3000 --no-open    # 显式覆盖端口 / 不弹浏览器
PORT=7777 poweri-web            # env 兜底（优先级：-p/--port > PORT > 9989）
```

### 落地页为何是 `/poweri` 而不是 `/`

上游 `app/layout.tsx` 把根路径元数据定为 `title: "Pi Web"`，即 **`/` 就是上游
pi-web 的完整 UI**；PowerI 产品层在 `/poweri`（自己的 layout，`title: PowerI`）。
桌面壳一直显式加载 `/poweri`，但独立运行时上游 launcher 只能拼根 URL（
`http://host:port`），会把用户送到 pi-web 界面。

加 `/` → `/poweri` 重定向需要改 `proxy.ts` / `next.config.ts`——**两个都是上游
持有且当前零分叉的文件**，改它们要走 §4 上游修改例外、且每次上游同步都产生冲突。
因此修正落在**我们自己的 bin 层**：`poweri-web` 入口置 `PI_WEB_NO_OPEN=1` 抑制
上游开浏览器，自己轮询就绪后打开 `/poweri`（`--no-open` / `PI_WEB_NO_OPEN` 仍完全
禁止弹窗）。手动访问 `/` 仍是上游页面——这是保留上游代码基线的既定代价。

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

## 为何包里仍有大量 `pi-web`

发布物内 `pi-web` / `Pi Web` 出现在 **39 个上游持有文件**（`bin/`、`lib/`、
`app/` 上游页面、`components/`、`proxy.ts` 等），PowerI 持有文件仅 7 个。本次
只把**用户可见的独立身份**改成 poweri-web：CLI 命令名、`--help` 文案、默认端口
9989、落地页 `/poweri`。以下标识刻意沿用上游：

| 保留项 | 原因 |
|---|---|
| `PI_WEB_*` 环境变量、Basic Auth 用户名 `pi` | 上游约定；改名 = 分叉 `lib/web-auth`、`bin/` 等，破坏上游同步 |
| `pi-web` bin 别名（默认 30141） | 已发布旧壳按 `pi-web` 解析 bin，删了会使旧壳升级后找不到入口 |
| `/` 根路径的上游 UI与页内文案 | 根页面就是上游 `app/page.tsx` + `app/layout.tsx`，fork 它等于 fork 整个上游前端 |

真要彻底改名，正路是把 `bin/` fork 成 poweri 替换件并在 `replacements.json`
登记（现有审计机制就是为这类替换建的），但会背上每次上游同步的移植成本——
属独立产品决策，不在本次范围。

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

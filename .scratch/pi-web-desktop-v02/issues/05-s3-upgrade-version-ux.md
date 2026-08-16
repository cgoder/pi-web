# 05-s3-upgrade-version-ux

Type: grilling
Status: resolved

## Question

升级与版本 UX 的决策：

- 壳自身版本检查：GitHub Release API → 有新版本时提示形态（角标/弹窗/托盘菜单）？
- 业务侧现有 npx 升级按钮（shell 已有 upgrade_piweb）保留/整合进统一入口？
- 版本显示：现有 topbar badge（npm view）是否够？壳版本与业务版本并排？
- 升级时 agent 运行中的保护：升级前确认/强制停止？

决策输出：v0.2 升级与版本规格。

## Answer（2026-08-16 用户逐问拍板）

**v0.2 升级与版本规格**：

1. **壳自身版本检查**：**v0.2 不做**——壳尚未发布（无 GitHub Release 可查），发布后再补（决策已记录，实现时先留 TODO）
2. **升级入口**：现有 topbar 升级按钮**移入设置区**（新增壳内设置面板「关于」块），topbar 只留版本徽章；升级进度日志（upgrade:stdout/stderr 实时流）跟随移到设置区
3. **版本显示**：设置区「关于」块集中展示——**壳版本**（tauri.conf.json productVersion）+ **pi-web 最新版**（npm view）+ **pi-web 已装版**（升级后回读）+ 升级按钮；topbar 徽章维持现状（仅 pi-web 最新版）
4. **升级保护**：升级前**一律确认弹窗**（不检查 agent 运行状态——统一行为、可预期；确认后走现有 upgrade_piweb 命令 + 探针重启链路）

**实现要点**：壳侧 `piweb_version`/`upgrade_piweb` 命令保留；新增壳版本读取（tauri `app.package_info()`）；设置区为 shell 内新视图（shell/index.html 加设置面板，与日志面板并列）；确认弹窗用 Tauri dialog API 或 shell 内自绘。

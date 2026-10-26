---
title: T03 标签无障碍（拆自终端标签提交）
status: done
triage: ready-for-agent
upstream-commit: 9290c272
blocked-by: 无
---

# T03 标签无障碍（拆自终端标签提交）

上游提交：9290c272 · feat: add workspace terminal tabs to the file panel (#695)
涉及文件：poweri/components/TabBar.tsx
## 问题

PowerI 的文件标签条缺少无障碍语义：没有 tablist/tab 角色、没有 aria-selected、不能键盘导航、关闭标签后焦点丢失。

## 为什么只做一半

上游这条提交把**终端标签**与**无障碍改进**打包在一起。PowerI 的 Tab 接口没有 kind 字段，结构上承载不了终端标签——那属于终端集成 spec 的范围。

决定：本票**只移植无障碍部分**，终端标签部分保持 pending，并注明依赖终端集成 spec。

## 要做的事

1. 标签条容器加 tablist 角色；每个标签加 tab 角色与 aria-selected。
2. 方向键在标签之间移动焦点与选中项。
3. 关闭标签后焦点落到相邻标签。
4. 只对当前激活的标签设置可见的 tabIndex 顺序（roving tabindex）。

## 验收

- [ ] 屏幕阅读器能读出"标签，N 个中的第 M 个，已选/未选"
- [ ] 左右方向键可切换标签
- [ ] 关闭标签后焦点落到相邻标签，不丢到 body
- [ ] Tab 键在标签条内只停一次（roving tabindex）

## 备注

**明确不做**：终端标签、kind / closing / tabLabel 字段。不要为了让审计命中率好看而硬塞字段。

## 实际结论

按"只做无障碍一半"的拆分如期落地（提交 `192ba8da`），落地范围：

- `role="tablist"` + `aria-label`（`:103-104`）、`role="tab"` / `aria-selected={isActive}`（`:129-131`）；
- roving `tabIndex`：只有激活项（或无激活时的首项）进入 Tab 顺序（`:135`）；
- Enter/Space 选择，`ArrowLeft` / `ArrowRight` / `Home` / `End` 键盘导航并转移焦点（`:84-99`）。

**终端标签部分确认不做**：PowerI 的 `Tab` 接口至今没有 `kind` 字段，结构上承载不了；
该提交的终端侧仍挂在 `poweri/layout/AppShell.tsx` 的 pending（"工作区终端未挂载"）上，
属终端集成 spec，**本批未闭环也不声称闭环**。断言里显式钉了 `doesNotMatch(/\bkind\b/)`，
将来接口真长出 `kind` 会先红一次，提醒先读终端 spec 再动手。

账目处置：`TabBar` 的 9290c272 走 `--port`，理由写明只落无障碍一半、终端侧仍 pending 于 AppShell。

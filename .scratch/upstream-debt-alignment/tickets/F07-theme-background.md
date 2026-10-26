---
title: F07 主题切换时代码块背景正确
status: done
triage: ready-for-agent
upstream-commit: 9da54e12
blocked-by: 无
---

# F07 主题切换时代码块背景正确

上游提交：9da54e12 · fix(file-viewer): keep the source view background across theme switches
涉及文件：poweri/components/FileViewer.tsx
## 问题

在浅色与深色主题之间切换时，源码视图的 \`<pre>\` 背景不跟随，出现背景与主题错位或闪烁。

## 原因（上游结论）

Prism 的两套主题用不同属性设置背景：浅色用 backgroundColor，深色用 background。只覆盖其中一个，切换主题时另一个会顶回来。

## 要做的事

1. 源码视图的 \`<pre>\` 由自身持有背景，不依赖 Prism 主题的默认值。
2. 确保写入的是能覆盖两套主题的属性组合。

## 验收

- [ ] 浅色切深色、深色切浅色，代码块背景都正确
- [ ] 切换过程中无闪烁
- [ ] 与 M02（MermaidBlock 的同一问题）口径一致

## 备注

M02 修的是同一个根因，只是发生在聊天里的代码块。两票的实现应保持一致，**不要各自造一套背景变量**。

## 实际结论

**本票在收尾时闭环，但过程中发现原提交只做了一半并引入回归。** 原实现（提交 `a6763776`）只落了上游 9da54e12 的一半：

1. ✅ customStyle 的 `background: "var(--bg)"` → `backgroundColor: "var(--bg)"`（`FileViewer.tsx:1542`）；
2. ❌ 缺上游同一条提交的另一半——把 `vscDarkPlus` 的 `pre[class*="language-"]` 的 `background` 简写删成
   `fileViewerDarkTheme`。`poweri/components/FileViewer.tsx` 里根本没有这个常量
   （`git log -S fileViewerDarkTheme -- poweri/components/FileViewer.tsx` 为空）。

为什么这是**真缺陷而非风格差异**——用 PowerI 的实际 customStyle 与两套主题做 SSR，读回 `<pre>` 的 style：

```
light(vs):          background-color=var(--bg)
dark(vscDarkPlus):  background=#1e1e1e ; background-color=var(--bg)
```

深色下两个属性同时存在。切回浅色时 `background` 从 style 对象里消失，React 的 `updateStyles`
（`react-dom-client.development.js` 的简写/长写冲突表）会执行 `node.style.background = ""`——清空**所有**
背景长写——而 `backgroundColor` 的取值 `var(--bg)` 前后没变，React 跳过重写。净效果是切到浅色后
源码视图**完全没有背景**，正是上游描述的症状。

且这比未移植更差：改动前 customStyle 写的是 `background: var(--bg)`，两套主题同键，React 不会删任何东西。

## 收尾时的修复

在 `poweri/components/FileViewer.tsx` 补上与同仓 `MermaidBlock.tsx:272-278` 的 `codeBlockDarkTheme` 同形的常量：

```ts
const fileViewerDarkTheme = {
  ...vscDarkPlus,
  'pre[class*="language-"]': { ...vscDarkPlus['pre[class*="language-"]'] },
};
delete fileViewerDarkTheme['pre[class*="language-"]'].background;
// L1544：style={isDark ? fileViewerDarkTheme : vs}
```

修复前后用同一份 customStyle 做 SSR，读回 `<pre>` 的背景属性：

```
修复前  深色: background=#1e1e1e  background-color=var(--bg)     ← 简写与长写并存
        浅色: background-color=var(--bg)                          ← 简写消失
修复后  深色: background-color=var(--bg)
        浅色: background-color=var(--bg)                          ← 两套主题一致
```

回归守卫：`poweri/lib/replacement-wiring.test.mjs` 的「源码视图的暗色主题删掉 `<pre>` 的 background 简写」。
已做负向验证——把修复撤掉，该断言立即变红。

**MermaidBlock 的同根因检查**：`codeBlockDarkTheme`（`:272-278`、`:351`）本批已正确落地——注意它不是「一直对的」，而是**本批 M01+M02 提交 `8370e3cd` 才加进来的**（批次起点 `26464684` 处该符号 0 处）。所以 F07 的教训不是「照着 MermaidBlock 抄」，而是「F07 与 M02 是同一根因，本批在 MermaidBlock 侧做对了、在 FileViewer 侧只做了一半」。
也就是说 M01+M02 的实现是完整的，缺的是 FileViewer 侧对齐——两票的「同一根因」配对现在才真正成立。
原本的注释里写着「与 M02 口径一致」，但当时只有口径一致、实现不一致。

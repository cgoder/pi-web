---
title: X01 批次收尾：账目推进与验收
status: backlog
triage: ready-for-agent
upstream-commit: —
blocked-by: 全部 F/T/M/S 票
---

# X01 批次收尾：账目推进与验收

上游提交：— · —
涉及文件：docs/desktop/replacements.json
阻塞：全部 F/T/M/S 票

## 目标

把第一批 25 条欠账在账目上正式关闭，并留下可复核的验收记录。

## 要做的事

1. 逐个检查四个替换件的 pending 是否已清空。
2. 对每条关闭的条目确认处置理由指向具体落地位置（不是"已对齐"这种笼统措辞）。
3. 逐替换件执行 \`ack --watermark e533d9b3975f\` 推进水位（此时脚本会校验区间内无遗漏）。
4. 跑 check、typecheck、lint、npm test、shell:test。
5. 记录本批的实际工作量与遇到的问题，写进父 spec 的 Further Notes，供第二批估算。

## 验收

- [ ] FileViewer / SettingsPanel / TabBar / MermaidBlock 四个替换件 pending 归零
- [ ] 每条 ported 理由可定位到代码
- [ ] watermark 经 ack 正规推进，watermarkProvenance 已写入
- [ ] check + typecheck + lint + test + shell:test 全绿
- [ ] 人工确认：CSV 变表格、大文件有「加载更多」、设置里有 MCP 分区、标签溢出可滚动、PDF 链接跳页
- [ ] 父 spec 的 Further Notes 记录本批实际耗时与偏差

## 备注

**不要手写 watermark**——脚本会用 watermarkProvenance 校验，手写会让审计区间变成空区间而永远通过，这是 traps.md 里明确记录的陷阱。

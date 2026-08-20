---
title: "历史会话/统计：即时计算 vs 本地数据库缓存（性能研究）"
status: backlog
type: research
blocked-by: []
tags: [performance, history, usage-stats, f6]
---

## 背景

历史会话列表（/poweri/api/session-summaries）与全局统计（/poweri/api/usage）目前都是
**即时从 ~/.pi/agent/sessions/** 下的 .jsonl 文件流式读取 + substring 提取**计算得出。

现有优化（已实现）：
- size:mtime 签名文件缓存（`__piUsageFileCache`，仅重解析变化的文件）
- 8 worker 并发解析 + soft 45s / hard 15min 双层 TTL + 合并 Promise（`__piUsagePromise`）
- 首个会话详情（/poweri/api/session-stats/[id]）每次请求即时重算（SessionManager.open）

## 待研究问题

1. **规模增长后的性能**：99 会话（~1GB jsonl 总量）首次全量解析耗时？500/1000 会话时？
   热路径（重复打开面板）已被 TTL 缓存覆盖，冷启动（应用重启后首次打开）是主要风险点。
2. **session-stats 每次即时重算**：打开历史会话详情 = 每次解析整个 jsonl 文件，
   大文件（数百 MB，含 thinking 块）可能数百 ms ~ 数秒。
3. **方案评估**：
   - 方案 A：维持即时计算 + 更强缓存（磁盘持久化解析结果，如 .cache 目录按文件签名缓存 JSON）
   - 方案 B：本地数据库（SQLite）——解析一次写入，增量更新（监听文件变化或 mtime 扫描），
     汇总/会话/详情全部查库。开销：解析管道改造、增量同步、文件删除/迁移清理。
   - 方案 C：混合——聚合走缓存，单会话详情按需解析 + 内存 LRU。
4. **量化指标**：给出冷启动/热路径 P50/P95 实测数据后再决策。

## 验收

- [ ] 实测当前实现 100/500/1000 会话规模的冷启动与热路径耗时
- [ ] 对比方案 A/B/C 的复杂度与收益，输出推荐
- [ ] 决策记录到 map.md（本 ticket 保持 backlog 直到启动研究）

## 备注

2026-08-20 用户提出：如性能有问题，考虑"把重要信息记录到本地数据库"。
本 ticket 为研究前置，不直接改代码。

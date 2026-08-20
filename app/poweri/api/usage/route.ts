import { NextRequest, NextResponse } from "next/server";
import {
  MAX_RANGE_DAYS,
  getAggregate,
  summarizeUsage,
} from "@/poweri/lib/usage-stats";

export const dynamic = "force-dynamic";

/**
 * PowerI 使用统计 API（/poweri/api/usage）。
 *
 * 从 ct-jyjntc fork 的 app/api/usage/route.ts 移植：GET 处理器被拆成
 * poweri/lib/usage-stats.ts（纯聚合逻辑，可单测）+ 本文件（Next.js 薄包装）。
 *
 * 数据源：~/.pi/agent/sessions/<project>/<session>.jsonl（pi 的 session 归档），
 * 服务端流式逐行 substring 聚合 + size:mtime 签名缓存 + soft/hard TTL。
 *
 * 参数：
 *   days    1–366（默认 30），趋势条零填充的天数
 *   refresh 1 强制跳过 soft/hard 缓存重建
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const forceRefresh = params.get("refresh") === "1";
    const daysParam = Number(params.get("days") ?? "30");
    const rangeDays = Number.isFinite(daysParam)
      ? Math.min(MAX_RANGE_DAYS, Math.max(1, Math.round(daysParam)))
      : 30;

    const agg = await getAggregate(forceRefresh);
    const summary = summarizeUsage(agg, rangeDays);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      ...summary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

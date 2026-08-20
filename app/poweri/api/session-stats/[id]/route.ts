import { NextResponse } from "next/server";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolveSessionPath } from "@/lib/session-reader";
import { computeSessionTotalActiveMs } from "@/lib/session-timing";

export const dynamic = "force-dynamic";

/**
 * PowerI product-layer API: offline session statistics for the
 * "历史会话" view (F6). Replicates pi's live `get_session_stats`
 * (dist/core/agent-session.js getSessionStats) from the session file
 * directly, so any historical session can be inspected without an
 * AgentSession wrapper. `contextUsage` is runtime state and is omitted
 * offline.
 */

type UsageLike = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: { total?: number };
};

function addUsage(totals: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }, usage: UsageLike | undefined) {
  if (!usage) return;
  totals.input += usage.input ?? 0;
  totals.output += usage.output ?? 0;
  totals.cacheRead += usage.cacheRead ?? 0;
  totals.cacheWrite += usage.cacheWrite ?? 0;
  totals.cost += usage.cost?.total ?? 0;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolvedPath = await resolveSessionPath(id);
  if (!resolvedPath) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const sm = SessionManager.open(resolvedPath);
    const entries = sm.getEntries() as unknown as Array<{
      type: string;
      usage?: UsageLike;
      message?: {
        role?: string;
        content?: Array<{ type?: string }>;
        usage?: UsageLike;
      };
    }>;

    let userMessages = 0;
    let assistantMessages = 0;
    let toolResults = 0;
    let toolCalls = 0;
    let totalMessages = 0;
    const usageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

    for (const entry of entries) {
      if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
        addUsage(usageTotals, entry.usage);
      }
      if (entry.type !== "message") continue;
      totalMessages++;
      const message = entry.message;
      if (message?.role === "user") {
        userMessages++;
      } else if (message?.role === "toolResult") {
        toolResults++;
        addUsage(usageTotals, message.usage);
      } else if (message?.role === "assistant") {
        assistantMessages++;
        if (Array.isArray(message.content)) {
          toolCalls += message.content.filter((c) => c.type === "toolCall").length;
        }
        addUsage(usageTotals, message.usage);
      }
    }

    const totalActiveMs = computeSessionTotalActiveMs(entries as never);
    return NextResponse.json({
      ok: true,
      stats: {
        sessionFile: sm.getSessionFile() ?? resolvedPath,
        sessionId: id,
        sessionName: sm.getSessionName() || undefined,
        userMessages,
        assistantMessages,
        toolCalls,
        toolResults,
        totalMessages,
        tokens: {
          input: usageTotals.input,
          output: usageTotals.output,
          cacheRead: usageTotals.cacheRead,
          cacheWrite: usageTotals.cacheWrite,
          total: usageTotals.input + usageTotals.output + usageTotals.cacheRead + usageTotals.cacheWrite,
        },
        cost: usageTotals.cost,
        totalActiveMs,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Failed to read session: ${message}` }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { applySkillUpdate, applySourceUpdates, checkUpdates } from "@/poweri/lib/skill-update-service";

export const dynamic = "force-dynamic";

/**
 * POST /poweri/api/skills/update
 * body:
 *   { action: "check", subscriptionId? }                                  → { success, updates }
 *   { action: "apply", folder }                                           → { success, before, after, changedFiles? }
 *   { action: "apply", folder, mode: "force" }                            → 覆盖 conflict
 *   { action: "apply", folder, mode: "keep" }                             → 接受本地改动、推进基线
 *   { action: "apply", subscriptionId }                                   → 源级批量 { success, results }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action: "check" | "apply";
      folder?: string;
      subscriptionId?: string;
      mode?: "force" | "keep";
    };

    if (body.action === "check") {
      const result = await checkUpdates(body.subscriptionId);
      return NextResponse.json({ success: true, ...result });
    }

    if (body.action === "apply") {
      if (body.subscriptionId) {
        const result = await applySourceUpdates(body.subscriptionId);
        return NextResponse.json({ success: true, ...result });
      }
      const folder = body.folder;
      if (!folder) {
        return NextResponse.json({ error: "folder or subscriptionId is required" }, { status: 400 });
      }
      const result = await applySkillUpdate(folder, {
        force: body.mode === "force",
        keep: body.mode === "keep",
      });
      if (result.conflict) {
        return NextResponse.json({ error: "conflict", ...result }, { status: 409 });
      }
      if (!result.success) {
        return NextResponse.json({ error: result.error || "update failed", ...result }, { status: 400 });
      }
      return NextResponse.json({ ...result });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

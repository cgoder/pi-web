import { NextResponse } from "next/server";
import {
  getMarketSkills,
  readSubscriptions,
  writeSubscriptions,
  generateSubscriptionId,
  detectSubscriptionType,
} from "@/poweri/lib/skill-subscriptions";

export const dynamic = "force-dynamic";

// GET /poweri/api/skills/market?cwd=<path>
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd") || process.cwd();

  try {
    const data = await getMarketSkills(cwd);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// POST /poweri/api/skills/market
// body: { action: "add" | "remove", url?: string, id?: string, name?: string }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action: "add" | "remove";
      url?: string;
      id?: string;
      name?: string;
    };

    const subs = readSubscriptions();

    if (body.action === "add") {
      const url = body.url?.trim();
      if (!url) {
        return NextResponse.json({ error: "url is required" }, { status: 400 });
      }

      const id = generateSubscriptionId(url);
      const existing = subs.find((s) => s.url === url || s.id === id);
      if (existing) {
        return NextResponse.json({ success: true, subscription: existing });
      }

      const newSub = {
        id,
        url,
        name: body.name || undefined,
        type: detectSubscriptionType(url),
        addedAt: Date.now(),
      };

      subs.push(newSub);
      writeSubscriptions(subs);
      return NextResponse.json({ success: true, subscription: newSub });
    }

    if (body.action === "remove") {
      const id = body.id || (body.url ? generateSubscriptionId(body.url) : null);
      if (!id) {
        return NextResponse.json({ error: "id or url is required" }, { status: 400 });
      }

      const filtered = subs.filter((s) => s.id !== id && s.url !== body.url);
      writeSubscriptions(filtered);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

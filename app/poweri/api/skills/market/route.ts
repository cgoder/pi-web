import { NextResponse } from "next/server";
import {
  getMarketSkills,
  readSubscriptions,
  writeSubscriptions,
  generateSubscriptionId,
  detectSubscriptionType,
  type SkillCategory,
  type SkillSubscription,
} from "@/poweri/lib/skill-subscriptions";

export const dynamic = "force-dynamic";

// GET /poweri/api/skills/market?cwd=<path>&category=all|business|public
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd") || process.cwd();
  const category = (searchParams.get("category") || "all") as SkillCategory | "all";

  try {
    const data = await getMarketSkills(cwd, category);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// POST /poweri/api/skills/market
// body: { action: "add" | "remove", url?: string, id?: string, name?: string, category?: SkillCategory, token?: string }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action: "add" | "remove";
      url?: string;
      id?: string;
      name?: string;
      category?: SkillCategory;
      token?: string;
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
        if (body.token) existing.token = body.token;
        if (body.category) existing.category = body.category;
        if (body.name) existing.name = body.name;
        writeSubscriptions(subs);
        return NextResponse.json({ success: true, subscription: existing });
      }

      const category: SkillCategory = body.category
        || (url.includes("gitlab.") || url.toLowerCase().includes("business") ? "business" : "public");

      const newSub: SkillSubscription = {
        id,
        url,
        name: body.name || undefined,
        category,
        type: detectSubscriptionType(url),
        token: body.token || undefined,
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

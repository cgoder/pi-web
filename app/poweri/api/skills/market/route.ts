import { NextResponse } from "next/server";
import {
  getMarketSkills,
  readSubscriptions,
  writeSubscriptions,
  updateSubscription,
  generateSubscriptionId,
  detectSubscriptionType,
  toPublicSubscription,
  type SkillCategory,
  type SkillSubscription,
} from "@/poweri/lib/skill-subscriptions";

export const dynamic = "force-dynamic";

// GET /poweri/api/skills/market?cwd=<path>&category=all|business|public&q=<query>&discover=1&force=1
// discover=1 时才拉取 skills.sh 市场数据（前端懒加载：默认只返回已安装/订阅源技能）
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd") || process.cwd();
  const category = (searchParams.get("category") || "all") as SkillCategory | "all";
  const query = searchParams.get("q") || undefined;
  const force = searchParams.get("force") === "1";
  const discover = searchParams.get("discover") === "1";

  try {
    const data = await getMarketSkills(cwd, category, query, { forceSync: force, discover });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// POST /poweri/api/skills/market
// body: { action: "add" | "update" | "remove", url?: string, id?: string, name?: string, category?: SkillCategory, token?: string }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action: "add" | "update" | "remove";
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
        return NextResponse.json({ success: true, subscription: toPublicSubscription(existing) });
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
      return NextResponse.json({ success: true, subscription: toPublicSubscription(newSub) });
    }

    if (body.action === "update") {
      const id = body.id;
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }
      if (body.url !== undefined && !body.url.trim()) {
        return NextResponse.json({ error: "url cannot be empty" }, { status: 400 });
      }
      // 只覆盖显式传入的字段；token 空串 = 不修改（前端脱敏语义）；id 保持不变
      const updates: Partial<SkillSubscription> = {};
      if (body.url !== undefined) updates.url = body.url.trim();
      if (body.name !== undefined) updates.name = body.name || undefined;
      if (body.category) updates.category = body.category;
      if (body.token) updates.token = body.token;
      const sub = updateSubscription(id, updates);
      if (!sub) {
        return NextResponse.json({ error: "subscription not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, subscription: toPublicSubscription(sub) });
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

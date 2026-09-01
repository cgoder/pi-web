import { NextResponse } from "next/server";
import {
  discoverLittaModels,
  getLittaConfig,
} from "@/poweri/lib/litta-provider";

export const dynamic = "force-dynamic";

// POST /poweri/api/models/litta/discover
// body: { apiKey?: string, baseUrl?: string, api?: "openai-completions" | "anthropic-messages" }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      apiKey?: string;
      baseUrl?: string;
      api?: "openai-completions" | "anthropic-messages";
    };

    const config = getLittaConfig();
    const apiKey = (typeof body.apiKey === "string" && body.apiKey.trim()) ? body.apiKey.trim() : config.apiKey;
    const baseUrl = body.baseUrl || config.baseUrl;
    const api = body.api || config.api;

    if (!apiKey) {
      return NextResponse.json({ error: "API Key is required to discover models" }, { status: 400 });
    }

    const models = await discoverLittaModels({ apiKey, baseUrl, api });
    return NextResponse.json({ success: true, models });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

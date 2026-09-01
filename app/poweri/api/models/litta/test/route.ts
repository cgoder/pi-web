import { NextResponse } from "next/server";
import {
  testLittaConnection,
  getLittaConfig,
} from "@/poweri/lib/litta-provider";

export const dynamic = "force-dynamic";

// POST /poweri/api/models/litta/test
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
      return NextResponse.json({ error: "API Key is required" }, { status: 400 });
    }

    const result = await testLittaConnection({ apiKey, baseUrl, api });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

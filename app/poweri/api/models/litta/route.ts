import { NextResponse } from "next/server";
import {
  getLittaConfig,
  saveLittaConfig,
  discoverLittaModels,
  type LittaModelEntry,
} from "@/poweri/lib/litta-provider";

export const dynamic = "force-dynamic";

// GET /poweri/api/models/litta
export async function GET() {
  try {
    const config = getLittaConfig();
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// POST /poweri/api/models/litta
// body: { apiKey: string, baseUrl?: string, api?: "openai-completions" | "anthropic-messages", models?: LittaModelEntry[], autoDiscover?: boolean }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      apiKey?: string;
      baseUrl?: string;
      api?: "openai-completions" | "anthropic-messages";
      models?: LittaModelEntry[];
      autoDiscover?: boolean;
    };

    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    let models = body.models;

    // 如果未传入模型且指定了 autoDiscover 或当前模型列表为空，尝试自动拉取
    if (apiKey && (!models || models.length === 0) && body.autoDiscover !== false) {
      try {
        models = await discoverLittaModels({
          apiKey,
          baseUrl: body.baseUrl,
          api: body.api,
        });
      } catch (err) {
        console.warn("[POST /poweri/api/models/litta] auto discover models skipped:", err);
      }
    }

    const saved = saveLittaConfig({
      apiKey,
      baseUrl: body.baseUrl,
      api: body.api,
      models,
    });

    return NextResponse.json({ success: true, config: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

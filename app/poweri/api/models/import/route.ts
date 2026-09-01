import { NextResponse } from "next/server";
import { importModelsFromUrl, mergeRemoteProviders, type RemoteProviderItem } from "@/poweri/lib/model-subscriptions";

export const dynamic = "force-dynamic";

// POST /poweri/api/models/import
// body: { url?: string, providers?: RemoteProviderItem[] }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      url?: string;
      providers?: RemoteProviderItem[];
    };

    if (body.url) {
      const result = await importModelsFromUrl(body.url);
      if (!result.success) {
        return NextResponse.json({ error: result.error || "导入失败" }, { status: 500 });
      }
      return NextResponse.json(result);
    }

    if (body.providers && Array.isArray(body.providers)) {
      const result = mergeRemoteProviders(body.providers);
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ error: "url or providers is required" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

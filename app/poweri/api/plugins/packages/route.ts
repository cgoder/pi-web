import { NextResponse } from "next/server";
import { searchPiPackages } from "@/poweri/lib/packages-catalog";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const category = searchParams.get("category") || "all";

    const packages = await searchPiPackages({ query, category });
    return NextResponse.json({ packages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search packages" },
      { status: 500 }
    );
  }
}

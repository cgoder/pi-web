// PowerI 附件上传与磁盘落地 API
import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isFilePathAllowed } from "@/lib/file-access";
import { decideAttachmentCwd, saveTextAttachment } from "@/poweri/lib/attachment-storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      content?: string;
      cwd?: string | null;
    };

    if (!body.name || typeof body.content !== "string") {
      return NextResponse.json({ error: "name and content are required" }, { status: 400 });
    }

    // 安全边界：cwd 必须在文件访问白名单内（同层先例 resolve-file/route.ts）
    const allowedRoots = await getAllowedFileRoots();
    const decision = decideAttachmentCwd(body.cwd ?? null, (candidate) =>
      isFilePathAllowed(candidate, allowedRoots),
    );
    if (!decision.ok) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const result = saveTextAttachment({
      name: body.name,
      content: body.content,
      cwd: decision.cwd,
    });

    return NextResponse.json({
      savedPath: result.savedPath,
      relativePath: result.relativePath,
      size: result.size,
      lineCount: result.lineCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

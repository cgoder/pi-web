// PowerI 附件持久化与磁盘存储服务 (保存用户附加的文件并生成真实物理路径供 Agent 工具访问)
import fs from "fs";
import path from "path";
import os from "os";

export interface SaveAttachmentOptions {
  name: string;
  content: string;
  cwd?: string | null;
}

export interface SavedAttachmentResult {
  name: string;
  savedPath: string;
  size: number;
  lineCount: number;
}

/**
 * 获取全局或工作区附件存储目录
 * 统一存储在 ~/.pi/agent/attachments/ 或项目 temp/attachments/ 下，避免污染仓库根目录
 */
export function getAttachmentsDirectory(cwd?: string | null): string {
  let dir: string;
  if (cwd && fs.existsSync(cwd)) {
    dir = path.join(cwd, "temp", "attachments");
  } else {
    dir = path.join(os.homedir(), ".pi", "agent", "attachments");
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 将用户上传的文本附件内容保存到磁盘，并返回物理绝对路径
 */
export function saveTextAttachment({
  name,
  content,
  cwd,
}: SaveAttachmentOptions): SavedAttachmentResult {
  const dir = getAttachmentsDirectory(cwd);
  
  // 清理文件名中的非法字符
  const sanitized = name.replace(/[/\\]/g, "_");
  const ext = path.extname(sanitized);
  const base = path.basename(sanitized, ext);
  const timestamp = Date.now();
  const fileName = `${base}-${timestamp}${ext}`;
  const filePath = path.join(dir, fileName);

  fs.writeFileSync(filePath, content, "utf-8");

  const stat = fs.statSync(filePath);
  const lineCount = content ? content.split("\n").length : 0;

  return {
    name: sanitized,
    savedPath: filePath,
    size: stat.size,
    lineCount,
  };
}

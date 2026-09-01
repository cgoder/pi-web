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
 */
export function getAttachmentsDirectory(cwd?: string | null): string {
  if (cwd && fs.existsSync(cwd)) {
    const dir = path.join(cwd, ".pi", "attachments");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
  const globalDir = path.join(os.homedir(), ".pi", "agent", "attachments");
  if (!fs.existsSync(globalDir)) {
    fs.mkdirSync(globalDir, { recursive: true });
  }
  return globalDir;
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
  
  // 若文件已存在且内容不同，生成带时间戳的文件名
  let targetPath = path.join(dir, sanitized);
  if (fs.existsSync(targetPath)) {
    const existingContent = fs.readFileSync(targetPath, "utf8");
    if (existingContent !== content) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      targetPath = path.join(dir, `${base}_${timestamp}${ext}`);
    }
  }

  fs.writeFileSync(targetPath, content, "utf8");
  const stat = fs.statSync(targetPath);
  const lineCount = content.split("\n").length;

  return {
    name: path.basename(targetPath),
    savedPath: targetPath,
    size: stat.size,
    lineCount,
  };
}

// PowerI 附件与上下文处理模块

export interface AttachedTextFile {
  id: string;
  name: string;
  path: string;
  size?: number;
  lineCount?: number;
}

export type AttachedFile = AttachedTextFile;

/** 支持常见文本、代码、配置与日志文件的扩展名列表 */
export const TEXT_CODE_EXTENSIONS = new Set([
  "txt", "md", "markdown", "mdown", "json", "jsonc", "json5",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts",
  "py", "pyw", "ipynb",
  "go", "rs", "java", "kt", "kts", "c", "cpp", "cc", "cxx", "h", "hpp", "hxx",
  "cs", "fs", "fsx", "php", "rb", "erb", "lua", "swift", "dart",
  "sh", "bash", "zsh", "fish", "bat", "cmd", "ps1", "psm1",
  "html", "htm", "css", "scss", "sass", "less", "vue", "svelte", "astro",
  "yaml", "yml", "toml", "ini", "cfg", "conf", "config", "env", "properties",
  "xml", "svg", "graphql", "gql", "sql", "prisma", "proto",
  "csv", "tsv", "log", "diff", "patch", "dockerfile", "makefile", "r", "zig",
]);

/** 文本与代码附件大小上限：2MB（超限文件建议通过工作区相对路径或工具读取） */
export const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

/**
 * 判断文件是否为纯文本或代码类文件
 */
export function isTextOrCodeFile(file: Pick<File, "name" | "type">): boolean {
  if (!file) return false;
  if (file.type && (file.type.startsWith("text/") || file.type === "application/json" || file.type === "application/xml" || file.type === "application/javascript" || file.type === "application/typescript")) {
    return true;
  }
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop();
  if (ext && TEXT_CODE_EXTENSIONS.has(ext)) {
    return true;
  }
  if (name === "dockerfile" || name === "makefile" || name === "gemfile" || name === "rakefile" || name.startsWith(".env")) {
    return true;
  }
  return false;
}

/**
 * 判断文件是否为图片文件
 */
export function isImageFile(file: Pick<File, "name" | "type">): boolean {
  if (!file) return false;
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name);
}

/**
 * 格式化文件字节大小展示
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 匹配结构化附件信封的正则
 * 格式：
 * <attached_files>
 * <file path="..." name="..." size="..." lines="..." />
 * </attached_files>
 * (可选换行) 用户纯文本
 */
const ATTACHED_FILES_ENVELOPE_RE = /^<attached_files>\n([\s\S]*?)\n<\/attached_files>(?:\n\n([\s\S]*))?$/;
const SINGLE_FILE_TAG_RE = /<file\s+path="([^"\n]+)"(?:\s+name="([^"\n]*)")?(?:\s+size="([^"\n]*)")?(?:\s+lines="([^"\n]*)")?\s*\/>/g;

/** 兼容旧版纯文本提示的正则 */
const LEGACY_ATTACHMENT_RE = /^(?:\[Attached File:\s*([^\n\]]+)\](?:\n\(Please use your tools[^\n]*\))?\n*)+([\s\S]*)$/;
const LEGACY_SINGLE_FILE_RE = /\[Attached File:\s*([^\n\]]+)\]/g;

export interface ParsedAttachmentEnvelope {
  files: AttachedFile[];
  cleanText: string;
  hasEnvelope: boolean;
}

/**
 * 将用户输入的纯文本与附件列表组装为结构化信封 (Envelope)
 * 发送给 Agent 时携带明确的 <attached_files> 协议，供 Agent 按需调用 read/ffgrep 工具，
 * 同时使 UI 展示层与编辑层能够精准解耦还原。
 */
export function assembleMessageWithAttachments(
  rawMessage: string,
  attachedFiles?: AttachedFile[],
): string {
  const cleanMsg = (rawMessage ?? "").trim();
  if (!attachedFiles || attachedFiles.length === 0) {
    return cleanMsg;
  }

  const fileTags = attachedFiles.map((file) => {
    const nameAttr = file.name ? ` name="${escapeXmlAttr(file.name)}"` : "";
    const sizeAttr = file.size != null ? ` size="${file.size}"` : "";
    const linesAttr = file.lineCount != null ? ` lines="${file.lineCount}"` : "";
    return `  <file path="${escapeXmlAttr(file.path)}"${nameAttr}${sizeAttr}${linesAttr} />`;
  }).join("\n");

  const envelope = `<attached_files>\n${fileTags}\n</attached_files>`;
  return cleanMsg ? `${envelope}\n\n${cleanMsg}` : envelope;
}

/**
 * 从消息中解析出结构化附件信封与纯净的用户自然语言文本
 * 适用于：
 * 1. MessageView 渲染（顶部渲染附件卡片，正文渲染纯净用户文本）；
 * 2. 复制与编辑消息（仅复制与编辑用户自然语言）；
 * 3. 历史记录回溯（输入框只回填用户的自然输入）。
 */
export function parseAttachmentEnvelope(content: string): ParsedAttachmentEnvelope {
  if (!content) {
    return { files: [], cleanText: "", hasEnvelope: false };
  }

  // 1. 标准结构化信封格式
  const match = content.match(ATTACHED_FILES_ENVELOPE_RE);
  if (match) {
    const [, fileBlock, bodyText] = match;
    const files: AttachedFile[] = [];
    let fileMatch: RegExpExecArray | null;
    const tagRegex = new RegExp(SINGLE_FILE_TAG_RE);

    while ((fileMatch = tagRegex.exec(fileBlock)) !== null) {
      const [, filePath, name, sizeStr, linesStr] = fileMatch;
      const fileName = name || filePath.split("/").pop() || "file";
      const size = sizeStr ? parseInt(sizeStr, 10) : undefined;
      const lineCount = linesStr ? parseInt(linesStr, 10) : undefined;

      files.push({
        id: `${fileName}-${filePath}`,
        name: fileName,
        path: filePath,
        size: Number.isNaN(size) ? undefined : size,
        lineCount: Number.isNaN(lineCount) ? undefined : lineCount,
      });
    }

    return {
      files,
      cleanText: (bodyText ?? "").trim(),
      hasEnvelope: true,
    };
  }

  // 2. 兼容旧版纯文本提示格式
  const legacyMatch = content.match(LEGACY_ATTACHMENT_RE);
  if (legacyMatch) {
    const [, , bodyText] = legacyMatch;
    const files: AttachedFile[] = [];
    let fileMatch: RegExpExecArray | null;
    const legacyRegex = new RegExp(LEGACY_SINGLE_FILE_RE);

    while ((fileMatch = legacyRegex.exec(content)) !== null) {
      const [, filePath] = fileMatch;
      const fileName = filePath.split("/").pop() || "file";
      files.push({
        id: `${fileName}-${filePath}`,
        name: fileName,
        path: filePath,
      });
    }

    return {
      files,
      cleanText: (bodyText ?? "").trim(),
      hasEnvelope: true,
    };
  }

  return {
    files: [],
    cleanText: content,
    hasEnvelope: false,
  };
}

/**
 * 提取纯净的用户自然语言文本（用于输入框回填、消息编辑、复制文本）
 */
export function extractCleanUserText(content: string): string {
  return parseAttachmentEnvelope(content).cleanText;
}

function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

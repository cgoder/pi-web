// PowerI 附件处理辅助函数 (支持图片 + 本地文件路径引用，供 Agent 调用 tools 按需读取)

export interface AttachedFile {
  id: string;
  name: string;
  path: string; // 本地物理绝对路径
  size?: number;
  lineCount?: number;
}

export type AttachedTextFile = AttachedFile;

export const MAX_TEXT_FILE_BYTES = 50 * 1024 * 1024; // 本地磁盘支持更大文件 (50MB)

export const TEXT_FILE_EXTENSIONS = new Set([
  "txt", "text", "md", "markdown", "json", "jsonc", "json5",
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts",
  "py", "pyw", "go", "rs", "java", "kt", "kts", "c", "cpp", "cc", "cxx", "h", "hpp", "hxx",
  "cs", "fs", "swift", "rb", "php", "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
  "html", "htm", "xhtml", "css", "scss", "sass", "less", "styl",
  "yaml", "yml", "toml", "ini", "conf", "config", "env", "properties",
  "xml", "svg", "graphql", "gql", "sql", "prisma",
  "csv", "tsv", "log", "diff", "patch", "vue", "svelte", "astro",
  "dockerfile", "containerfile", "makefile", "cmake", "gemfile", "podfile", "gradle",
  "gitignore", "gitattributes", "npmrc", "yarnrc", "editorconfig", "lock",
]);

/**
 * 判断是否为文本或代码文件
 */
export function isTextOrCodeFile(file: { name: string; type?: string; size?: number }): boolean {
  if (!file || !file.name) return false;
  if (file.type && (file.type.startsWith("text/") || file.type === "application/json" || file.type.includes("javascript") || file.type.includes("typescript") || file.type.includes("xml"))) {
    return true;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const baseName = file.name.toLowerCase();
  if (TEXT_FILE_EXTENSIONS.has(ext) || TEXT_FILE_EXTENSIONS.has(baseName)) {
    return true;
  }
  if (["dockerfile", "makefile", "license", "readme"].includes(baseName)) {
    return true;
  }
  return false;
}

/**
 * 判断是否为图片文件
 */
export function isImageFile(file: { name: string; type?: string }): boolean {
  if (!file) return false;
  if (file.type && file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"].includes(ext);
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 将附加的本地文件以路径引用形式组装入 Prompt 中，明确指示模型使用 tools 按需读取
 */
export function assembleMessageWithAttachments(userText: string, files: AttachedFile[]): string {
  if (!files || files.length === 0) return userText;

  const fileReferences = files
    .map(
      (f) =>
        `[Attached File: ${f.path}]\n(Please use your tools such as \`read\`, \`ffgrep\`, or \`bash\` to inspect and analyze this file as needed)`,
    )
    .join("\n\n");

  const trimmed = (userText || "").trim();
  if (!trimmed) {
    return fileReferences;
  }
  return `${fileReferences}\n\n${trimmed}`;
}

// PowerI 附件处理辅助函数 (支持图片 + 文本/代码文件)

export const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024; // 2MB

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
  // 无后缀名的常见配置文件
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
 * 将文本文件内容格式化为 Markdown 附件代码块
 */
export function formatTextFileContent(name: string, content: string): string {
  const ext = name.split(".").pop() || "";
  return `[File: ${name}]\n\`\`\`${ext}\n${content.trimEnd()}\n\`\`\``;
}

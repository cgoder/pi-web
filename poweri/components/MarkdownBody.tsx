"use client";

import { useMemo } from "react";
import { MarkdownBody as BaseMarkdownBody } from "@/components/MarkdownBody";
import { looksLikeFilePath } from "../lib/file-path-detection";
import "../styles/file-link.css";

interface PowerIMarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
}

/**
 * PowerI 产品层：增强的 MarkdownBody
 * 
 * 在基础层 MarkdownBody 之上添加文件路径自动链接功能：
 * - 检测 inline code 中的文件路径（如 `docs/desktop/v02-spec.md`）
 * - 将其转换为可点击的链接，点击后在文件预览器中打开
 * 
 * 这个组件不修改基础层，而是在产品层包装基础层的能力。
 */
export function MarkdownBody({ children, ...props }: PowerIMarkdownBodyProps) {
  const enhancedMarkdown = useMemo(() => {
    return preprocessFilePaths(children);
  }, [children]);

  return (
    <BaseMarkdownBody {...props}>
      {enhancedMarkdown}
    </BaseMarkdownBody>
  );
}

/**
 * 预处理 markdown 文本，将 inline code 中的文件路径转换为链接
 * 
 * 例如：`docs/desktop/v02-spec.md` → [`docs/desktop/v02-spec.md`](docs/desktop/v02-spec.md)
 */
function preprocessFilePaths(markdown: string): string {
  // 匹配 inline code：`...`
  // 注意：不匹配代码块（```...```）中的内容
  return markdown.replace(/`([^`]+)`/g, (match, code) => {
    if (looksLikeFilePath(code)) {
      // 将文件路径转换为 markdown 链接
      return `[\`${code}\`](${code})`;
    }
    return match;
  });
}

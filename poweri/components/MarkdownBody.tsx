"use client";

import { useMemo } from "react";
import { MarkdownBody as BaseMarkdownBody } from "@/components/MarkdownBody";
import type { WrittenFile } from "@/lib/turn-written-files";
import { linkifyInlineFilePaths } from "../lib/file-path-linking";
import "../styles/file-link.css";

interface PowerIMarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  /** 本轮写过的文件：纯 basename 引用（如 `installer.rs`）据此解析为完整路径。 */
  writtenFiles?: WrittenFile[];
}

/**
 * PowerI 产品层：增强的 MarkdownBody
 * 
 * 在基础层 MarkdownBody 之上添加文件路径自动链接功能：
 * - 检测 inline code 中的文件路径（如 `docs/desktop/v02-spec.md`）
 * - 将其转换为可点击的链接，点击后在文件预览器中打开
 * - 纯 basename 引用优先用本轮 writtenFiles 消歧（见 file-path-linking.ts）
 * 
 * 这个组件不修改基础层，而是在产品层包装基础层的能力。
 */
export function MarkdownBody({ children, writtenFiles, ...props }: PowerIMarkdownBodyProps) {
  const enhancedMarkdown = useMemo(() => {
    return linkifyInlineFilePaths(children, { writtenFiles });
  }, [children, writtenFiles]);

  return (
    <BaseMarkdownBody {...props}>
      {enhancedMarkdown}
    </BaseMarkdownBody>
  );
}

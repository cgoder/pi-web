"use client";

import { memo, useMemo, useState, type MouseEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { parsePdfPageFragment, resolveLocalFileHref, shouldOpenLocalFileInApp } from "@/lib/file-links";
import { encodeFilePathForApi } from "@/lib/file-paths";
import { isAudioPath, isVideoPath } from "@/lib/file-types";
import { splitMarkdownBlocks } from "@/lib/markdown-blocks";
import { isExternalMarkdownHref, jumpToMarkdownFragment, markdownAppUrlTransform, markdownRehypePlugins, markdownRemarkPlugins, markdownUrlTransform, markdownUserRemarkPlugins, normalizeDisplayMath } from "@/lib/markdown";
import { MermaidBlock, CodeBlock } from "@/poweri/components/MermaidBlock";
import type { WrittenFile } from "@/lib/turn-written-files";
import { linkifyInlineFilePaths } from "../lib/file-path-linking";
import { escapeUnbalancedHtml } from "../lib/html-balance";
import { FileContextMenu } from "./FileContextMenu";
import "../styles/file-link.css";

interface PowerIMarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  cwd?: string;
  onOpenFile?: (filePath: string, page?: number) => void;
  writtenFiles?: WrittenFile[];
  sourceSessionId?: string | null;
  /** Render every line ending as a line break, for text the user typed (上游 faeff036). */
  keepLineBreaks?: boolean;
}

interface PowerIMarkdownBlockProps {
  markdown: string;
  remarkPlugins: typeof markdownRemarkPlugins;
  urlTransform: typeof markdownUrlTransform;
  components: Components;
}

/** One parse; skipped while its text and renderers stay the same (上游 a952ed507e). */
const MarkdownBlock = memo(function MarkdownBlock({ markdown, remarkPlugins, urlTransform, components }: PowerIMarkdownBlockProps) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={markdownRehypePlugins}
      urlTransform={urlTransform}
      components={components}
    >
      {markdown}
    </ReactMarkdown>
  );
});

export const MarkdownBody = memo(function MarkdownBody({
  children,
  className,
  isStreaming,
  cwd,
  onOpenFile,
  writtenFiles,
  sourceSessionId,
  keepLineBreaks,
}: PowerIMarkdownBodyProps) {
  const enhancedMarkdown = useMemo(() => {
    return linkifyInlineFilePaths(children, { writtenFiles });
  }, [children, writtenFiles]);

  const normalizedMarkdown = useMemo(
    () => normalizeDisplayMath(escapeUnbalancedHtml(enhancedMarkdown)),
    [enhancedMarkdown],
  );

  // PowerI 前置处理（行内文件路径链接化、未闭合 HTML 兜底）必须先于切块：
  // 切块只看空行/围栏等结构线索，处理挪到切块之后会让跨块的路径被切碎。
  // 上游 a952ed507e：流式回复按块解析，已经结束的块保持缓存，只有最后一块重解析。
  const blocks = useMemo(
    () => (isStreaming ? splitMarkdownBlocks(normalizedMarkdown) : [normalizedMarkdown]),
    [isStreaming, normalizedMarkdown],
  );

  const [contextMenu, setContextMenu] = useState<{ filePath: string; x: number; y: number } | null>(null);

  const components = useMemo<Components>(() => ({
    code({ className, children, ...props }) {
      const lang = className?.replace("language-", "").toLowerCase() ?? "";
      const raw = String(children);
      const isBlock = className?.includes("language-") || raw.includes("\n");
      if (isBlock) {
        if (lang === "mermaid") {
          return <MermaidBlock code={raw.replace(/\n$/, "")} isStreaming={isStreaming} defaultPreview />;
        }
        return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang} isStreaming={isStreaming} />;
      }
      return (
        <code className="markdown-inline-code" {...props}>
          {children}
        </code>
      );
    },
    pre({ children }) {
      return <>{children}</>;
    },
    a({ href, children, ...props }) {
      delete (props as Record<string, unknown>).node;
      if (href?.startsWith("#")) {
        // 上游 2cefb72f：站内锚点先于本地文件解析分出去，否则会被当成相对路径。
        // 净化器给 id 加了 user-content- 前缀，按原始 id 查必然落空，
        // 所以跳转交给基础层（它按同一套前缀匹配，且只在本文档的 .markdown-body 内找）。
        return (
          <a href={href} {...props} onClick={jumpToMarkdownFragment}>
            {children}
          </a>
        );
      }
      const filePath = onOpenFile ? resolveLocalFileHref(href, cwd) : null;
      const openFile = onOpenFile;
      if (!filePath || !openFile) {
        // 上游 5af2e04e：外部与桌面 app 链接（obsidian://、vscode://…）开新标签，
        // 交给系统处理器；相对链接保持同标签。
        return isExternalMarkdownHref(href)
          ? (
            <a href={href} {...props} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          )
          : <a href={href} {...props}>{children}</a>;
      }

      const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (!shouldOpenLocalFileInApp(event)) return;
        const target = event.currentTarget.getAttribute("target");
        if (target && target !== "_self") return;
        event.preventDefault();
        // 通过 AppShell 的兜底逻辑（resolve-file API）打开，支持 basename 唯一命中。
        // 上游 5e9b997d：路径解析会丢掉 #page= 片段，页码在这里取出后单独传下去。
        openFile(filePath, parsePdfPageFragment(href) ?? undefined);
      };

      const handleContextMenu = (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        setContextMenu({ filePath, x: event.clientX, y: event.clientY });
      };

      // 关键修复：href 改为 API 的 read URL，使“复制链接地址”得到正确的可下载链接
      // 点击仍由 onClick 拦截在文件预览器中打开，不会导航到 API
      const apiHref = `/api/files/${encodeFilePathForApi(filePath)}?type=read${sourceSessionId ? `&sessionId=${encodeURIComponent(sourceSessionId)}` : ""}`;

      return (
        <a href={apiHref} {...props} onClick={handleClick} onContextMenu={handleContextMenu}>
          {children}
        </a>
      );
    },
    img({ src, alt, ...props }) {
      delete (props as Record<string, unknown>).node;
      const href = typeof src === "string" ? src : undefined;
      const filePath = href ? resolveLocalFileHref(href, cwd) : null;
      const mediaSrc = filePath ? `/api/files/${encodeFilePathForApi(filePath)}?type=read` : href;
      // 上游 51b11598：`![](take.wav)` 是模型展示它生成的音/视频的方式，
      // <img> 放不出声也放不了片；文件 API 本来就支持 range 请求。
      const mediaPath = filePath ?? href?.split(/[?#]/, 1)[0] ?? "";
      const label = alt?.trim() ? alt : undefined;
      if (isAudioPath(mediaPath)) {
        return <audio controls preload="metadata" src={mediaSrc} aria-label={label} />;
      }
      if (isVideoPath(mediaPath)) {
        return <video controls playsInline preload="metadata" src={mediaSrc} aria-label={label} />;
      }
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={mediaSrc} alt={alt ?? ""} loading="lazy" {...props} />;
    },
    ol({ node, start, style, ...props }) {
      // 上游 8347ea5c：.markdown-body 的 overflow-x 会裁掉比左内距更宽的序号（“10.” 起），
      // 内距改由最大序号的位数决定，最少按两位算。
      const items = node?.children.filter((child) => child.type === "element" && child.tagName === "li").length ?? 0;
      const digits = String(Math.abs((start ?? 1) + Math.max(items, 1) - 1)).length;
      return <ol start={start} style={{ ...style, ["--ol-marker-digits" as string]: Math.max(digits, 2) }} {...props} />;
    },
    table({ children }) {
      // 上游 e070e0b7：边框画在外框上，里层 scroller 自己淡掉滑动边缘——合成一层会把边框一起淡掉。
      // 基础层 globals.css 把 mask 挂在 .markdown-table-wrap 上、边框挂在 .markdown-table-frame 上，
      // 所以两层必须都渲染，否则表格没有边框。
      return (
        <div className="markdown-table-frame">
          <div className="markdown-table-wrap">
            <table>{children}</table>
          </div>
        </div>
      );
    },
  }), [cwd, isStreaming, onOpenFile, sourceSessionId]);

  return (
    <>
      <div className={["markdown-body", className].filter(Boolean).join(" ")}>
        {blocks.map((block, index) => (
          <MarkdownBlock
            key={index}
            markdown={block}
            remarkPlugins={keepLineBreaks ? markdownUserRemarkPlugins : markdownRemarkPlugins}
            urlTransform={onOpenFile ? markdownUrlTransform : markdownAppUrlTransform}
            components={components}
          />
        ))}
      </div>
      {contextMenu && (
        <FileContextMenu
          filePath={contextMenu.filePath}
          cwd={cwd}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          sourceSessionId={sourceSessionId}
        />
      )}
    </>
  );
});

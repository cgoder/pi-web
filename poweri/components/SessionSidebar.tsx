"use client";

import { SessionSidebar as BaseSessionSidebar } from "@/components/SessionSidebar";
import { useState, useCallback } from "react";
import { FileContextMenu } from "./FileContextMenu";

/**
 * PowerI 会话侧边栏包装层
 *
 * 在上游 SessionSidebar 之上增加文件右键菜单：
 * - 复制文件路径
 * - 复制下载链接
 * - 下载
 * - 打开所在目录（Tauri reveal / 浏览器回退）
 *
 * 通过事件委托捕获文件树节点的右键，避免 fork 整个 SessionSidebar。
 */
export function SessionSidebar(props: React.ComponentProps<typeof BaseSessionSidebar>) {
  const [menu, setMenu] = useState<{ filePath: string; x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const fileNode = target.closest<HTMLElement>("[title]");
    if (!fileNode) return;
    const title = fileNode.getAttribute("title");
    if (!title || !title.includes("/") || !/\.[a-zA-Z0-9]+$/.test(title)) return;
    e.preventDefault();
    setMenu({ filePath: title, x: e.clientX, y: e.clientY });
  }, []);

  return (
    <>
      <div onContextMenu={handleContextMenu} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <BaseSessionSidebar {...props} />
      </div>
      {menu && (
        <FileContextMenu
          filePath={menu.filePath}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

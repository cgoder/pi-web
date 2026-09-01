// PowerI 增强版 ChatInput (支持图片 + 文本/代码文件全类型附件、复合预览条、Markdown 组装发送、拖拽与粘贴分流)
"use client";

import React, { useRef, useState, useCallback, useEffect, useLayoutEffect, useImperativeHandle, forwardRef, KeyboardEvent } from "react";
import type { BuiltinSlashCommandResult, CompactResultInfo, QueuedMessages, SlashCommandInfo } from "@/hooks/useAgentSession";
import type { SkillsResponse } from "@/lib/api-types";
import type { TextContent, UserMessage } from "@/lib/types";
import {
  clearDraft,
  getDraft,
  mergeRestoredSubmissionDraft,
  mergeRestoredSubmissionText,
  rekeyDraft as rekeyStoredDraft,
  setDraft,
  type ChatDraftImage,
} from "@/lib/draft-store";
import {
  MAX_ATTACHED_IMAGE_BYTES,
  MAX_ATTACHED_IMAGES,
  isBase64ImageWithinLimits,
} from "@/lib/image-attachments";
import {
  buildEntriesFromFiles, buildAtInsertText, extractAtQuery, filterFileEntries,
  type AtQueryMatch, type FileIndexEntry,
} from "@/lib/file-fuzzy";
import { FolderIcon, getFileIcon } from "@/components/FileIcons";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useI18n } from "@/hooks/useI18n";
import type { ToolPreset } from "@/lib/tool-presets";
import { ModelSelector, type ModelSelectorOption, filterModelOptions } from "@/components/ModelSelector";
import {
  type AttachedTextFile,
  isTextOrCodeFile,
  isImageFile,
  formatFileSize,
  assembleMessageWithAttachments,
  MAX_TEXT_FILE_BYTES,
} from "@/poweri/lib/attachment-helper";
import { tp } from "@/poweri/lib/i18n";

export { filterModelOptions };
export type { AttachedTextFile };

export interface AttachedImage {
  data: string;   // base64, no prefix
  mimeType: string;
  previewUrl: string; // object URL for display
}

interface Props {
  onSend: (message: string, images?: AttachedImage[]) => void;
  onAbort: () => void;
  onSteer?: (message: string, images?: AttachedImage[]) => void;
  onFollowUp?: (message: string, images?: AttachedImage[]) => void;
  onPromptWithStreamingBehavior?: (message: string, behavior: "steer" | "followUp", images?: AttachedImage[]) => void;
  isStreaming: boolean;
  model?: { provider: string; modelId: string } | null;
  isAutoModelSelection?: boolean;
  modelNames?: Record<string, string>;
  modelList?: { id: string; name: string; provider: string }[];
  modelError?: string | null;
  /** Diagnostics from resolving `enabledModels`, e.g. a pattern that matched nothing. */
  modelScopeWarnings?: string[];
  onModelChange?: (provider: string, modelId: string) => void;
  modelSwitching?: boolean;
  onCompact?: () => void;
  onAbortCompaction?: () => void;
  isCompacting?: boolean;
  compactError?: string | null;
  compactResult?: CompactResultInfo | null;
  toolPreset?: ToolPreset;
  onToolPresetChange?: (preset: ToolPreset) => void;
  thinkingLevel?: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  onThinkingLevelChange?: (level: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max") => void;
  availableThinkingLevels?: string[] | null;
  thinkingLevelMap?: Record<string, string | null> | null;
  retryInfo?: { attempt: number; maxAttempts: number; errorMessage?: string } | null;
  queuedMessages?: QueuedMessages | null;
  inputHistory?: string[];
  onRecallQueue?: () => void;
  slashCommands?: SlashCommandInfo[];
  slashCommandsLoading?: boolean;
  onLoadSlashCommands?: () => Promise<SlashCommandInfo[]> | SlashCommandInfo[];
  onBuiltinCommand?: (message: string) => Promise<BuiltinSlashCommandResult>;
  soundEnabled?: boolean;
  onSoundToggle?: () => void;
  onAudioUnlock?: () => void;
  draftKey?: string;
  /** Session working directory — enables the @ file autocomplete menu */
  cwd?: string | null;
}

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (text: string) => void;
  replaceMessage: (message: UserMessage) => void;
  prependText: (text: string) => void;
  addImages: (files: File[]) => void;
  addFiles?: (files: File[]) => void;
  rekeyDraft: (previousKey: string, nextKey: string) => void;
  restoreSubmission: (text: string, images?: ChatDraftImage[], targetDraftKey?: string) => void;
}

const TOOL_PRESETS = ["chat-only", "read-only", "default", "full"] as const;
type ToolPresetLabel = typeof TOOL_PRESETS[number];
const TOOL_PRESET_MAP: Record<ToolPresetLabel, ToolPreset> = {
  "chat-only": "none",
  "read-only": "read-only",
  default: "default",
  full: "full",
};
const COMPOSITION_END_ENTER_GRACE_MS = 100;
const TEXT_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const ANCHORED_MENU_GAP = 8;

export function getUpwardMenuMaxHeight(menuBottom: number, visibleTop: number, gap = ANCHORED_MENU_GAP): number {
  return Math.max(0, Math.floor(menuBottom - visibleTop - gap));
}

function getVisibleTopBoundary(element: HTMLElement): number {
  let visibleTop = window.visualViewport?.offsetTop ?? 0;

  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflowY = window.getComputedStyle(parent).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden" || overflowY === "clip") {
      visibleTop = Math.max(visibleTop, parent.getBoundingClientRect().top + parent.clientTop);
    }
  }

  return visibleTop;
}

export function shouldCompressImageFile(file: Pick<File, "size" | "type">): boolean {
  return Boolean(file.type.startsWith("image/") && file.size > MAX_ATTACHED_IMAGE_BYTES);
}

function readImageFile(file: Blob, mimeType: string): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve({ data: base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compressImageFile(file: File): Promise<{ data: string; mimeType: string }> {
  const original = () => readImageFile(file, file.type);
  if (!shouldCompressImageFile(file) || typeof createImageBitmap !== "function") return original();

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return original();

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, Math.sqrt((MAX_ATTACHED_IMAGE_BYTES * 0.9) / file.size));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return original();
  }

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob || blob.size >= file.size) {
          resolve(original());
        } else {
          resolve(readImageFile(blob, "image/jpeg"));
        }
      },
      "image/jpeg",
      0.85,
    );
  });
}

function imageToDraftImage(image: AttachedImage): ChatDraftImage {
  return { data: image.data, mimeType: image.mimeType };
}

function draftImageToAttachedImage(image: ChatDraftImage): AttachedImage {
  return {
    ...image,
    previewUrl: URL.createObjectURL(
      new Blob([Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0))], { type: image.mimeType }),
    ),
  };
}

function draftImagesToAttachedImages(images: ChatDraftImage[] | undefined): AttachedImage[] {
  return (images ?? [])
    .filter(isBase64ImageWithinLimits)
    .slice(0, MAX_ATTACHED_IMAGES)
    .map(draftImageToAttachedImage);
}

function canClearBuiltinCommandInput(
  value: string,
  attachedImageCount: number,
  commandText: string,
): boolean {
  return value.trim() === commandText.trim() && attachedImageCount === 0;
}

export function canRestoreUserMessage(
  value: string,
  attachedImageCount: number,
  pendingImageCount: number,
): boolean {
  return !value.trim() && attachedImageCount === 0 && pendingImageCount === 0;
}

export function getUserMessageDraftImages(message: UserMessage): ChatDraftImage[] {
  if (typeof message.content === "string") return [];
  return message.content.flatMap((block) => {
    if (block.type !== "image") return [];

    // Support both the current nested image format and older flat pi-ai entries.
    const flat = block as unknown as { data?: unknown; mimeType?: unknown };
    const data = block.source?.type === "base64" ? block.source.data : flat.data;
    const mimeType = block.source?.type === "base64" ? block.source.media_type : flat.mimeType;
    if (typeof data !== "string" || typeof mimeType !== "string") return [];

    const image = { data, mimeType };
    return isBase64ImageWithinLimits(image) ? [image] : [];
  });
}

function revokeImagePreview(image: AttachedImage): void {
  URL.revokeObjectURL(image.previewUrl);
}

export function canRunBuiltinSlashCommandWhileStreaming(message: string): boolean {
  const [command] = message.trim().split(/\s+/, 1);
  return command === "/fork" || command === "/tree";
}

function ModelErrorBanner({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div style={{
      marginBottom: 8,
      padding: "8px 12px",
      borderRadius: 8,
      background: "rgba(239, 68, 68, 0.12)",
      border: "1px solid rgba(239, 68, 68, 0.35)",
      color: "#f87171",
      fontSize: 12,
      lineHeight: 1.45,
    }}>
      {error}
    </div>
  );
}

function ModelScopeWarningBanner({ warnings }: { warnings?: string[] }) {
  if (!warnings?.length) return null;
  return (
    <div style={{
      marginBottom: 8,
      padding: "8px 12px",
      borderRadius: 8,
      background: "rgba(245, 158, 11, 0.12)",
      border: "1px solid rgba(245, 158, 11, 0.35)",
      color: "#fbbf24",
      fontSize: 12,
      lineHeight: 1.45,
    }}>
      {warnings.map((warning, index) => (
        <div key={index}>{warning}</div>
      ))}
    </div>
  );
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput(
  {
    onSend,
    onAbort,
    onSteer,
    onFollowUp,
    onPromptWithStreamingBehavior,
    isStreaming,
    model,
    isAutoModelSelection,
    modelNames,
    modelList,
    modelError,
    modelScopeWarnings,
    onModelChange,
    modelSwitching,
    onCompact,
    onAbortCompaction,
    isCompacting,
    compactError,
    compactResult,
    toolPreset = "default",
    onToolPresetChange,
    thinkingLevel = "auto",
    onThinkingLevelChange,
    availableThinkingLevels,
    thinkingLevelMap,
    retryInfo,
    queuedMessages,
    inputHistory = [],
    onRecallQueue,
    slashCommands,
    slashCommandsLoading,
    onLoadSlashCommands,
    onBuiltinCommand,
    soundEnabled,
    onSoundToggle,
    onAudioUnlock,
    draftKey,
    cwd,
  },
  ref,
) {
  const { locale, t } = useI18n();
  const isMobile = useIsMobile();
  const [value, setValue] = useState(() => (draftKey ? (getDraft(draftKey)?.value ?? "") : ""));
  const valueRef = useRef(value);
  valueRef.current = value;
  const draftKeyRef = useRef(draftKey);
  draftKeyRef.current = draftKey;

  // 图片附件
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>(() => (
    draftKey ? draftImagesToAttachedImages(getDraft(draftKey)?.images) : []
  ));

  // 文本 / 代码文件附件
  const [attachedTextFiles, setAttachedTextFiles] = useState<AttachedTextFile[]>([]);
  const [previewTextFile, setPreviewTextFile] = useState<AttachedTextFile | null>(null);

  // 添加菜单状态
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  const trimmedValue = value.trim();
  const bashMode = attachedImages.length === 0 && attachedTextFiles.length === 0 && trimmedValue.startsWith("!");
  const bashExcluded = bashMode && trimmedValue.startsWith("!!");

  const [isFocused, setIsFocused] = useState(false);
  const [streamingBehavior, setStreamingBehavior] = useState<"steer" | "followUp">("steer");

  // Slash commands
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  // File autocomplete (@)
  const [fileList, setFileList] = useState<string[]>([]);
  const [atQuery, setAtQuery] = useState<AtQueryMatch | null>(null);
  const [atResults, setAtResults] = useState<FileIndexEntry[]>([]);
  const [selectedAtIndex, setSelectedAtIndex] = useState(0);
  const [atMenuOpen, setAtMenuOpen] = useState(false);

  // Input history
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  // Hidden inputs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const allFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const controlsMenuRef = useRef<HTMLDivElement>(null);
  const [controlsMenuOpen, setControlsMenuOpen] = useState(false);

  const attachedImagesRef = useRef(attachedImages);
  const pendingImageCountRef = useRef(0);
  const attachedTextFilesRef = useRef(attachedTextFiles);
  attachedImagesRef.current = attachedImages;
  attachedTextFilesRef.current = attachedTextFiles;

  // 点击外部关闭添加菜单
  useEffect(() => {
    if (!attachMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [attachMenuOpen]);

  // 处理文本文件读取
  const processTextFiles = useCallback(async (files: File[]) => {
    const validFiles: AttachedTextFile[] = [];
    for (const file of files) {
      if (file.size > MAX_TEXT_FILE_BYTES) {
        alert(`${file.name}: ${tp(locale, "chat.fileTooLarge")}`);
        continue;
      }
      try {
        const text = await file.text();
        const lineCount = text.split("\n").length;
        validFiles.push({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          size: file.size,
          content: text,
          lineCount,
          mimeType: file.type || "text/plain",
        });
      } catch {
        alert(`${file.name}: ${tp(locale, "chat.fileReadError")}`);
      }
    }
    if (validFiles.length > 0) {
      setAttachedTextFiles((prev) => [...prev, ...validFiles]);
    }
  }, [locale]);

  // 处理图片压缩
  const processImageFiles = useCallback(async (files: File[]) => {
    const availableSlots = Math.max(
      0,
      MAX_ATTACHED_IMAGES - attachedImagesRef.current.length - pendingImageCountRef.current,
    );
    const imageFiles = files
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, availableSlots);
    if (imageFiles.length === 0) return;

    pendingImageCountRef.current += imageFiles.length;
    try {
      const newImages = await Promise.all(
        imageFiles.map(async (file) => {
          const { data, mimeType } = await compressImageFile(file);
          return draftImageToAttachedImage({ data, mimeType });
        }),
      );
      setAttachedImages((prev) => {
        const accepted = newImages.slice(0, Math.max(0, MAX_ATTACHED_IMAGES - prev.length));
        newImages.slice(accepted.length).forEach(revokeImagePreview);
        const next = [...prev, ...accepted];
        attachedImagesRef.current = next;
        return next;
      });
    } finally {
      pendingImageCountRef.current -= imageFiles.length;
    }
  }, []);

  // 统一分发文件：自动识别图片或文本/代码文件
  const processIncomingFiles = useCallback(async (files: File[]) => {
    const imageFiles: File[] = [];
    const textFiles: File[] = [];

    for (const file of files) {
      if (isImageFile(file)) {
        imageFiles.push(file);
      } else if (isTextOrCodeFile(file)) {
        textFiles.push(file);
      } else {
        // 兜底作为文本尝试
        textFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      await processImageFiles(imageFiles);
    }
    if (textFiles.length > 0) {
      await processTextFiles(textFiles);
    }
  }, [processImageFiles, processTextFiles]);

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => {
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      if (removed) revokeImagePreview(removed);
      attachedImagesRef.current = next;
      return next;
    });
  }, []);

  const removeTextFile = useCallback((id: string) => {
    setAttachedTextFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    attachedImagesRef.current = [];
    setAttachedImages((prev) => {
      prev.forEach(revokeImagePreview);
      return [];
    });
    setAttachedTextFiles([]);
    if (draftKeyRef.current) {
      setDraft(draftKeyRef.current, { value: valueRef.current, images: [] });
    }
  }, []);

  // 对外句柄暴露
  useImperativeHandle(ref, () => ({
    insertText(text: string) {
      setValue((prev: string) => prev + text);
      textareaRef.current?.focus();
    },
    insertIfEmpty(text: string) {
      setValue((prev: string) => (prev.trim() === "" ? text : prev));
      textareaRef.current?.focus();
    },
    prependText(text: string) {
      setValue((prev: string) => text + prev);
      textareaRef.current?.focus();
    },
    replaceMessage(message: UserMessage) {
      const text = typeof message.content === "string"
        ? message.content
        : message.content.filter((c): c is TextContent => c.type === "text").map((c) => c.text).join("\n");
      setValue(text);
      const restoredImages = draftImagesToAttachedImages(getUserMessageDraftImages(message));
      setAttachedImages((prev) => {
        prev.forEach(revokeImagePreview);
        return restoredImages;
      });
      textareaRef.current?.focus();
    },
    addImages(files: File[]) {
      void processIncomingFiles(files);
    },
    addFiles(files: File[]) {
      void processIncomingFiles(files);
    },
    rekeyDraft(previousKey: string, nextKey: string) {
      rekeyStoredDraft(previousKey, nextKey);
    },
    restoreSubmission(text: string, images?: ChatDraftImage[], targetDraftKey?: string) {
      setValue(text);
      if (images) {
        const restored = draftImagesToAttachedImages(images);
        setAttachedImages((prev) => {
          prev.forEach(revokeImagePreview);
          return restored;
        });
      }
    },
  }));

  // 发送消息处理
  const clearInput = useCallback(() => {
    setValue("");
    clearAttachments();
    if (draftKeyRef.current) {
      clearDraft(draftKeyRef.current);
    }
  }, [clearAttachments]);

  const handleSend = useCallback(() => {
    const rawMsg = value.trim();
    const hasAttachments = attachedImages.length > 0 || attachedTextFiles.length > 0;
    if (!rawMsg && !hasAttachments) return;

    onAudioUnlock?.();

    // 组装文本附件内容入 Prompt
    const fullMsg = assembleMessageWithAttachments(rawMsg, attachedTextFiles);

    onSend(fullMsg, attachedImages.length ? attachedImages : undefined);
    clearInput();
  }, [value, attachedImages, attachedTextFiles, onAudioUnlock, onSend, clearInput]);

  const handleSteer = useCallback(() => {
    const rawMsg = value.trim();
    const hasAttachments = attachedImages.length > 0 || attachedTextFiles.length > 0;
    if (!rawMsg && !hasAttachments) return;

    onAudioUnlock?.();
    const fullMsg = assembleMessageWithAttachments(rawMsg, attachedTextFiles);
    if (onPromptWithStreamingBehavior) {
      onPromptWithStreamingBehavior(fullMsg, "steer", attachedImages.length ? attachedImages : undefined);
    } else if (onSteer) {
      onSteer(fullMsg, attachedImages.length ? attachedImages : undefined);
    }
    clearInput();
  }, [value, attachedImages, attachedTextFiles, onAudioUnlock, onPromptWithStreamingBehavior, onSteer, clearInput]);

  const handleFollowUp = useCallback(() => {
    const rawMsg = value.trim();
    const hasAttachments = attachedImages.length > 0 || attachedTextFiles.length > 0;
    if (!rawMsg && !hasAttachments) return;

    onAudioUnlock?.();
    const fullMsg = assembleMessageWithAttachments(rawMsg, attachedTextFiles);
    if (onPromptWithStreamingBehavior) {
      onPromptWithStreamingBehavior(fullMsg, "followUp", attachedImages.length ? attachedImages : undefined);
    } else if (onFollowUp) {
      onFollowUp(fullMsg, attachedImages.length ? attachedImages : undefined);
    }
    clearInput();
  }, [value, attachedImages, attachedTextFiles, onAudioUnlock, onPromptWithStreamingBehavior, onFollowUp, clearInput]);

  // 键盘与快捷键
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (isStreaming) {
        if (streamingBehavior === "steer") handleSteer();
        else handleFollowUp();
      } else {
        handleSend();
      }
    }
  };

  // 粘贴与拖拽分发
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files || []);
    if (files.length > 0) {
      e.preventDefault();
      void processIncomingFiles(files);
    }
  };

  // 模型选项
  const modelOptions: ModelSelectorOption[] = React.useMemo(() => {
    if (modelList && modelList.length > 0) {
      return modelList.map((m) => ({ provider: m.provider, modelId: m.id, name: m.name }));
    }
    return Object.entries(modelNames ?? {}).map(([modelId, name]) => ({
      provider: model?.provider ?? "unknown",
      modelId,
      name,
    }));
  }, [modelList, modelNames, model]);

  return (
    <div
      style={{
        flexShrink: 0,
        background: "transparent",
        padding: "0 16px 8px",
        paddingRight: isMobile ? 16 : 52,
      }}
    >
      {/* 隐藏的图片与文本文件选择器 */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          void processImageFiles(files);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.markdown,.json,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.c,.cpp,.h,.hpp,.cs,.html,.css,.scss,.yaml,.yml,.toml,.xml,.sql,.sh,.csv,.log,text/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          void processTextFiles(files);
          e.target.value = "";
        }}
      />
      <input
        ref={allFileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          void processIncomingFiles(files);
          e.target.value = "";
        }}
      />

      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <ModelErrorBanner error={modelError} />
        <ModelScopeWarningBanner warnings={modelScopeWarnings} />

        {/* 附件展示栏（图片卡片 + 文本代码文件胶囊卡片） */}
        {(attachedImages.length > 0 || attachedTextFiles.length > 0) && (
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            {/* 图片预览 */}
            {attachedImages.map((img, i) => (
              <div key={`img-${i}`} style={{ position: "relative", flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt=""
                  style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", display: "block" }}
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  style={{
                    position: "absolute", top: -4, right: -4,
                    width: 16, height: 16, borderRadius: "50%",
                    background: "var(--bg-panel)", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", padding: 0, color: "var(--text-muted)",
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                  </svg>
                </button>
              </div>
            ))}

            {/* 文本/代码文件胶囊卡片 */}
            {attachedTextFiles.map((file) => (
              <div
                key={file.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 10px",
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                  maxWidth: 240,
                  cursor: "pointer",
                }}
                onClick={() => setPreviewTextFile(file)}
                title={tp(locale, "chat.previewAttachment")}
              >
                <span style={{ fontSize: 14 }}>📄</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                    {formatFileSize(file.size)} · {tp(locale, "chat.fileLines", { count: file.lineCount })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTextFile(file.id);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 2,
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 主输入框容器 */}
        <div
          style={{
            position: "relative",
            minWidth: 0,
            background: "var(--bg-panel)",
            border: `1px solid ${isFocused ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 12,
            padding: "10px 12px 6px",
            boxShadow: isFocused ? "0 0 0 1px var(--accent)" : "none",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              bashMode
                ? "Execute shell command..."
                : isStreaming
                ? "Direct or queue message during stream..."
                : "Ask anything, type / for commands, @ for files..."
            }
            style={{
              width: "100%",
              minHeight: 44,
              maxHeight: 240,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              color: "var(--text)",
              fontSize: 13,
              lineHeight: 1.5,
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />

          {/* 输入框底部栏：左侧添加附件+模型选择器；右侧控制项+发送/流式按钮 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginTop: 4,
              paddingTop: 4,
              borderTop: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            {/* 左侧：增强的【添加】附件按钮 + 模型选择器 */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
              {/* 增强型【添加】按钮 */}
              <div ref={attachMenuRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setAttachMenuOpen((prev) => !prev)}
                  title={tp(locale, "chat.attachTooltip")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    background: (attachedImages.length || attachedTextFiles.length) ? "var(--bg-selected)" : "transparent",
                    border: `1px solid ${(attachedImages.length || attachedTextFiles.length) ? "var(--accent)" : "transparent"}`,
                    borderRadius: 6,
                    color: (attachedImages.length || attachedTextFiles.length) ? "var(--accent)" : "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = (attachedImages.length || attachedTextFiles.length) ? "var(--bg-selected)" : "transparent";
                    e.currentTarget.style.color = (attachedImages.length || attachedTextFiles.length) ? "var(--accent)" : "var(--text-muted)";
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <span>{tp(locale, "chat.attach")}</span>
                </button>

                {/* 附件类型弹出下拉菜单 */}
                {attachMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: "calc(100% + 6px)",
                      zIndex: 1000,
                      minWidth: 160,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                      padding: 4,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        background: "none",
                        border: "none",
                        borderRadius: 5,
                        color: "var(--text)",
                        fontSize: 12,
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                    >
                      <span>📄</span>
                      <span>{tp(locale, "chat.attachFile")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        imageInputRef.current?.click();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        background: "none",
                        border: "none",
                        borderRadius: 5,
                        color: "var(--text)",
                        fontSize: 12,
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                    >
                      <span>🖼️</span>
                      <span>{tp(locale, "chat.attachImage")}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 模型选择器 */}
              {(modelOptions.length > 0 || model || modelError) && onModelChange && (
                <ModelSelector
                  options={modelOptions}
                  value={model}
                  onChange={onModelChange}
                  disabled={isStreaming}
                  busy={modelSwitching}
                  isAutoSelection={isAutoModelSelection}
                />
              )}
            </div>

            {/* 右侧：发送 / 停止 / 流式按键 */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isStreaming ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    type="button"
                    onClick={streamingBehavior === "steer" ? handleSteer : handleFollowUp}
                    disabled={!value.trim() && !attachedImages.length && !attachedTextFiles.length}
                    style={{
                      padding: "5px 12px",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: 6,
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {streamingBehavior === "steer" ? "Steer" : "Follow up"}
                  </button>
                  <button
                    type="button"
                    onClick={onAbort}
                    style={{
                      padding: "5px 10px",
                      background: "rgba(239, 68, 68, 0.15)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: 6,
                      color: "#f87171",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Stop
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!value.trim() && !attachedImages.length && !attachedTextFiles.length}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    background: (value.trim() || attachedImages.length || attachedTextFiles.length) ? "var(--accent)" : "var(--bg-hover)",
                    border: "none",
                    borderRadius: 6,
                    color: (value.trim() || attachedImages.length || attachedTextFiles.length) ? "#fff" : "var(--text-dim)",
                    cursor: (value.trim() || attachedImages.length || attachedTextFiles.length) ? "pointer" : "not-allowed",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="7" x2="11" y2="7" />
                    <polyline points="7.5 3 12 7 7.5 11" />
                  </svg>
                  <span>{t("chat.send")}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 文本附件详情预览弹窗 */}
      {previewTextFile && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            backdropFilter: "blur(3px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewTextFile(null);
          }}
        >
          <div
            style={{
              width: 600,
              maxWidth: "calc(100vw - 40px)",
              maxHeight: "80vh",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-panel)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>📄</span>
                <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{previewTextFile.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  ({formatFileSize(previewTextFile.size)} · {previewTextFile.lineCount} lines)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTextFile(null)}
                style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16 }}
              >
                ✕
              </button>
            </div>
            <pre
              style={{
                flex: 1,
                margin: 0,
                padding: 16,
                background: "var(--bg-panel)",
                color: "var(--text)",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: 11,
                lineHeight: 1.5,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {previewTextFile.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  isTextOrCodeFile,
  isImageFile,
  formatFileSize,
  assembleMessageWithAttachments,
  parseAttachmentEnvelope,
  extractCleanUserText,
} from "./attachment-helper.ts";

test("isTextOrCodeFile detects code, text, and log extensions", () => {
  assert.equal(isTextOrCodeFile({ name: "main.rs", type: "" }), true);
  assert.equal(isTextOrCodeFile({ name: "server.ts", type: "" }), true);
  assert.equal(isTextOrCodeFile({ name: "app.log", type: "" }), true);
  assert.equal(isTextOrCodeFile({ name: "README.md", type: "" }), true);
  assert.equal(isTextOrCodeFile({ name: "Dockerfile", type: "" }), true);
  assert.equal(isTextOrCodeFile({ name: "avatar.png", type: "image/png" }), false);
});

test("isImageFile correctly identifies image files", () => {
  assert.equal(isImageFile({ name: "screen.png", type: "image/png" }), true);
  assert.equal(isImageFile({ name: "photo.jpg", type: "image/jpeg" }), true);
  assert.equal(isImageFile({ name: "code.ts", type: "text/plain" }), false);
});

test("formatFileSize formats bytes cleanly", () => {
  assert.equal(formatFileSize(500), "500 B");
  assert.equal(formatFileSize(2048), "2.0 KB");
  assert.equal(formatFileSize(1048576 * 3), "3.0 MB");
});

test("assembleMessageWithAttachments creates structured XML envelope", () => {
  const files = [
    {
      id: "1",
      name: "lefthook.md",
      path: "/home/user/docs/lefthook.md",
      size: 4200,
      lineCount: 120,
    },
  ];

  const result = assembleMessageWithAttachments("帮我看看这个规范", files);
  assert.ok(result.includes("<attached_files>"));
  assert.ok(result.includes('<file path="/home/user/docs/lefthook.md" name="lefthook.md" size="4200" lines="120" />'));
  assert.ok(result.endsWith("帮我看看这个规范"));
});

test("parseAttachmentEnvelope correctly parses structured envelope and isolates pure user text", () => {
  const content = `<attached_files>
  <file path="/home/user/docs/lefthook.md" name="lefthook.md" size="4200" lines="120" />
</attached_files>

帮我看看这个规范`;

  const parsed = parseAttachmentEnvelope(content);
  assert.equal(parsed.hasEnvelope, true);
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].name, "lefthook.md");
  assert.equal(parsed.files[0].path, "/home/user/docs/lefthook.md");
  assert.equal(parsed.files[0].size, 4200);
  assert.equal(parsed.files[0].lineCount, 120);
  assert.equal(parsed.cleanText, "帮我看看这个规范");
  assert.equal(extractCleanUserText(content), "帮我看看这个规范");
});

test("parseAttachmentEnvelope supports legacy [Attached File: ...] format for backward compatibility", () => {
  const legacyContent = `[Attached File: /home/user/docs/legacy.log]
(Please use your tools such as read, ffgrep, or bash to inspect and analyze this file as needed)

分析日志报错`;

  const parsed = parseAttachmentEnvelope(legacyContent);
  assert.equal(parsed.hasEnvelope, true);
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].name, "legacy.log");
  assert.equal(parsed.files[0].path, "/home/user/docs/legacy.log");
  assert.equal(parsed.cleanText, "分析日志报错");
  assert.equal(extractCleanUserText(legacyContent), "分析日志报错");
});

test("parseAttachmentEnvelope returns original text when no envelope exists", () => {
  const normalText = "你好，请写一个快速排序算法";
  const parsed = parseAttachmentEnvelope(normalText);
  assert.equal(parsed.hasEnvelope, false);
  assert.equal(parsed.files.length, 0);
  assert.equal(parsed.cleanText, normalText);
  assert.equal(extractCleanUserText(normalText), normalText);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  isTextOrCodeFile,
  isImageFile,
  formatFileSize,
  assembleMessageWithAttachments,
} from "./attachment-helper.ts";

test("isTextOrCodeFile detects code, text, and log extensions", () => {
  assert.equal(isTextOrCodeFile({ name: "index.ts" }), true);
  assert.equal(isTextOrCodeFile({ name: "main.go" }), true);
  assert.equal(isTextOrCodeFile({ name: "Dockerfile" }), true);
  assert.equal(isTextOrCodeFile({ name: "2026-08-25 09-28-49.log" }), true);
  assert.equal(isTextOrCodeFile({ name: "config.json" }), true);
  assert.equal(isTextOrCodeFile({ name: "photo.jpg" }), false);
});

test("isImageFile correctly identifies image files", () => {
  assert.equal(isImageFile({ name: "diagram.png" }), true);
  assert.equal(isImageFile({ name: "banner.jpg" }), true);
  assert.equal(isImageFile({ name: "icon.webp" }), true);
  assert.equal(isImageFile({ name: "code.ts" }), false);
});

test("formatFileSize formats bytes cleanly", () => {
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(2048), "2.0 KB");
});

test("assembleMessageWithAttachments generates tool-inspection instructions with absolute file path instead of inlining content", () => {
  const files = [
    {
      id: "1",
      name: "proxy.log",
      path: "/home/tienchiu/Downloads/proxy.log",
      size: 10240,
    },
  ];

  const fullPrompt = assembleMessageWithAttachments("Please analyze why connection failed.", files);
  assert.match(fullPrompt, /\[Attached File: \/home\/tienchiu\/Downloads\/proxy\.log\]/);
  assert.match(fullPrompt, /Please use your tools such as `read`, `ffgrep`, or `bash` to inspect and analyze this file/);
  assert.match(fullPrompt, /Please analyze why connection failed\./);
  // 确保没有内联垃圾字符
  assert.equal(fullPrompt.includes("<user_attached_file>"), false);
});

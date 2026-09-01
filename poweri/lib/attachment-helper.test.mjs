import test from "node:test";
import assert from "node:assert/strict";
import {
  isTextOrCodeFile,
  isImageFile,
  formatFileSize,
  assembleMessageWithAttachments,
} from "./attachment-helper.ts";

test("isTextOrCodeFile detects code and text extensions", () => {
  assert.equal(isTextOrCodeFile({ name: "index.ts" }), true);
  assert.equal(isTextOrCodeFile({ name: "main.go" }), true);
  assert.equal(isTextOrCodeFile({ name: "Dockerfile" }), true);
  assert.equal(isTextOrCodeFile({ name: "config.json" }), true);
  assert.equal(isTextOrCodeFile({ name: "notes.md" }), true);
  assert.equal(isTextOrCodeFile({ name: "app.py" }), true);
  assert.equal(isTextOrCodeFile({ name: "styles.scss" }), true);
  assert.equal(isTextOrCodeFile({ name: "photo.jpg" }), false);
  assert.equal(isTextOrCodeFile({ name: "archive.zip" }), false);
  assert.equal(isTextOrCodeFile({ name: "video.mp4" }), false);
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
  assert.equal(formatFileSize(1048576), "1.0 MB");
});

test("assembleMessageWithAttachments formats attachment XML and prompt blocks cleanly", () => {
  const textFiles = [
    {
      id: "f1",
      name: "example.ts",
      size: 100,
      content: "const a = 1;",
      lineCount: 1,
    },
  ];

  const result1 = assembleMessageWithAttachments("Please analyze this file.", textFiles);
  assert.match(result1, /<attachment filename="example\.ts">/);
  assert.match(result1, /const a = 1;/);
  assert.match(result1, /Please analyze this file\./);

  const result2 = assembleMessageWithAttachments("", textFiles);
  assert.match(result2, /<attachment filename="example\.ts">/);
  assert.equal(result2.includes("Please analyze"), false);

  const result3 = assembleMessageWithAttachments("Hello", []);
  assert.equal(result3, "Hello");
});

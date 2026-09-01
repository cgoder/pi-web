import test from "node:test";
import assert from "node:assert/strict";
import {
  isTextOrCodeFile,
  isImageFile,
  formatFileSize,
  formatTextFileContent,
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

test("formatTextFileContent generates markdown code blocks with file header", () => {
  const result = formatTextFileContent("main.rs", "fn main() {\n  println!(\"hello\");\n}");
  assert.equal(result, "[File: main.rs]\n```rs\nfn main() {\n  println!(\"hello\");\n}\n```");
});

test("assembleMessageWithAttachments cleanly prefixes text file contents before prompt", () => {
  const textFiles = [
    {
      id: "1",
      name: "calc.py",
      size: 50,
      content: "def add(a, b): return a + b",
      lineCount: 1,
    },
  ];

  const fullPrompt = assembleMessageWithAttachments("Please add unit tests for this.", textFiles);
  assert.equal(
    fullPrompt,
    "[File: calc.py]\n```py\ndef add(a, b): return a + b\n```\n\nPlease add unit tests for this.",
  );

  const promptOnlyFiles = assembleMessageWithAttachments("", textFiles);
  assert.equal(promptOnlyFiles, "[File: calc.py]\n```py\ndef add(a, b): return a + b\n```");
});

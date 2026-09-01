import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { getAttachmentsDirectory, saveTextAttachment } from "./attachment-storage.ts";

test("getAttachmentsDirectory creates and returns .pi/attachments under cwd", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-attachments-"));
  try {
    const dir = getAttachmentsDirectory(tmpDir);
    assert.ok(dir.includes(".pi"), `dir should be inside .pi: ${dir}`);
    assert.ok(dir.includes("attachments"), `dir should contain attachments: ${dir}`);
    assert.ok(fs.existsSync(dir));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("saveTextAttachment writes file to disk and returns relativePath relative to cwd", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-save-"));
  try {
    const result = saveTextAttachment({
      name: "example.log",
      content: "line 1\nline 2\nline 3",
      cwd: tmpDir,
    });

    assert.equal(result.name, "example.log");
    assert.ok(fs.existsSync(result.savedPath));
    assert.equal(result.lineCount, 3);
    // relativePath should be relative to cwd (e.g. .pi/attachments/example-1234.log)
    assert.ok(!path.isAbsolute(result.relativePath), `relativePath should be relative, got: ${result.relativePath}`);
    assert.ok(result.relativePath.startsWith(".pi"), `relativePath should start with .pi, got: ${result.relativePath}`);
    // absolute path reconstructed from cwd+relativePath should match savedPath
    const reconstructed = path.join(tmpDir, result.relativePath);
    assert.equal(reconstructed, result.savedPath);
    assert.equal(fs.readFileSync(result.savedPath, "utf-8"), "line 1\nline 2\nline 3");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("saveTextAttachment falls back to absolute savedPath when no cwd given", () => {
  const result = saveTextAttachment({
    name: "global.log",
    content: "hello",
    cwd: null,
  });

  try {
    assert.ok(fs.existsSync(result.savedPath));
    // without cwd, relativePath equals savedPath (absolute)
    assert.equal(result.relativePath, result.savedPath);
  } finally {
    fs.rmSync(result.savedPath, { force: true });
  }
});

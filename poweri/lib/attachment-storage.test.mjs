import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { getAttachmentsDirectory, saveTextAttachment } from "./attachment-storage.ts";

test("getAttachmentsDirectory creates and returns attachments folder under temp", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-attachments-"));
  try {
    const dir = getAttachmentsDirectory(tmpDir);
    assert.ok(dir.includes("attachments"));
    assert.ok(fs.existsSync(dir));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("saveTextAttachment writes file to disk and returns absolute path", () => {
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
    assert.equal(fs.readFileSync(result.savedPath, "utf-8"), "line 1\nline 2\nline 3");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

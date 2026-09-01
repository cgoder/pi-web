import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { saveTextAttachment, getAttachmentsDirectory } from "./attachment-storage.ts";

test("getAttachmentsDirectory creates and returns attachments folder", () => {
  const dir = getAttachmentsDirectory();
  assert.ok(fs.existsSync(dir));
  assert.ok(dir.includes(".pi"));
});

test("saveTextAttachment writes file to disk and returns absolute path", () => {
  const testName = "test-log-file.log";
  const content = "line 1\nline 2\n[ERROR] Connection failed";
  const result = saveTextAttachment({ name: testName, content });

  assert.equal(result.name, testName);
  assert.ok(path.isAbsolute(result.savedPath));
  assert.ok(fs.existsSync(result.savedPath));
  assert.equal(fs.readFileSync(result.savedPath, "utf8"), content);
  assert.equal(result.lineCount, 3);
  assert.ok(result.size > 0);

  // 清理测试文件
  try {
    fs.unlinkSync(result.savedPath);
  } catch {}
});

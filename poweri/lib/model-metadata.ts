// 纯前端安全 / 共享模型元数据类型与纯工具函数，零 Node.js 运行时依赖

export interface LittaModelEntry {
  id: string;
  name?: string;
  api?: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  enabled?: boolean;
}

export interface RawDiscoveredModel {
  id: string;
  name?: string;
}

/**
 * 智能填充模型默认元数据（如 Claude 3.7、DeepSeek-R1、Qwen 等）
 */
export function enrichModelMetadata(rawModel: RawDiscoveredModel): LittaModelEntry {
  const id = rawModel.id;
  const lower = id.toLowerCase();
  let name = rawModel.name || id;
  let contextWindow = 32000;
  let maxTokens = 4096;
  let reasoning = false;

  if (lower.includes("claude-3-7") || lower.includes("claude-3.7")) {
    name = "Claude 3.7 Sonnet";
    contextWindow = 200000;
    maxTokens = 8192;
    reasoning = true;
  } else if (lower.includes("claude-3-5-sonnet") || lower.includes("claude-3.5-sonnet")) {
    name = "Claude 3.5 Sonnet";
    contextWindow = 200000;
    maxTokens = 8192;
  } else if (lower.includes("deepseek-r1") || lower.includes("deepseek-reasoner")) {
    name = "DeepSeek R1 (Reasoning)";
    contextWindow = 64000;
    maxTokens = 8192;
    reasoning = true;
  } else if (lower.includes("deepseek-v3") || lower.includes("deepseek-chat")) {
    name = "DeepSeek V3";
    contextWindow = 64000;
    maxTokens = 8192;
  } else if (lower.includes("qwen-2.5-coder") || lower.includes("qwen-coder")) {
    name = "Qwen 2.5 Coder";
    contextWindow = 32768;
    maxTokens = 8192;
  } else if (lower.includes("gpt-4o") || lower.includes("gpt-4.5")) {
    name = id;
    contextWindow = 128000;
    maxTokens = 4096;
  }

  return {
    id,
    name,
    contextWindow,
    maxTokens,
    reasoning,
    enabled: true,
  };
}

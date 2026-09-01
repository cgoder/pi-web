import { readModelsConfig, writeModelsConfig } from "../../lib/models-config-store";
import { parseDiscoveredModels, type DiscoveredModel } from "../../lib/model-discovery";
import { enrichModelMetadata, type LittaModelEntry } from "./model-metadata";

export { enrichModelMetadata, type LittaModelEntry };

export const LITTA_DEFAULT_BASE_URL = "https://llms.litta.cn/";
export const LITTA_PROVIDER_ID = "litta";

export interface LittaProviderConfig {
  baseUrl: string;
  api: "openai-completions" | "anthropic-messages";
  apiKey?: string;
  configured: boolean;
  models: LittaModelEntry[];
}

/**
 * 获取当前 models.json 中的 LITTA 提供商配置
 */
export function getLittaConfig(): LittaProviderConfig {
  try {
    const raw = readModelsConfig() as {
      providers?: Record<string, {
        baseUrl?: string;
        api?: string;
        apiKey?: string;
        models?: LittaModelEntry[];
      }>;
    };
    const litta = raw?.providers?.[LITTA_PROVIDER_ID];

    return {
      baseUrl: litta?.baseUrl || LITTA_DEFAULT_BASE_URL,
      api: (litta?.api === "anthropic-messages" ? "anthropic-messages" : "openai-completions"),
      apiKey: litta?.apiKey || "",
      configured: Boolean(litta?.apiKey && litta.apiKey.trim().length > 0),
      models: litta?.models || [],
    };
  } catch {
    return {
      baseUrl: LITTA_DEFAULT_BASE_URL,
      api: "openai-completions",
      apiKey: "",
      configured: false,
      models: [],
    };
  }
}



/**
 * 从 LITTA 网关动态拉取可用模型列表
 */
export async function discoverLittaModels(params: {
  apiKey: string;
  baseUrl?: string;
  api?: "openai-completions" | "anthropic-messages";
}): Promise<LittaModelEntry[]> {
  const baseUrl = (params.baseUrl || LITTA_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const api = params.api || "openai-completions";
  const apiKey = params.apiKey.trim();

  if (!apiKey) {
    throw new Error("API Key is required to fetch models from LITTA gateway");
  }

  // 构造标准 /models 端点
  const endpoint = baseUrl.endsWith("/v1")
    ? `${baseUrl}/models`
    : `${baseUrl}/v1/models`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (api === "anthropic-messages") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    cache: "no-store",
    headers,
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text.slice(0, 300) || `Gateway returned HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("LITTA gateway response is not valid JSON");
  }

  const discovered = parseDiscoveredModels(payload);
  if (discovered.length === 0) {
    // 容错：如果根 /v1/models 为空，尝试请求根路径 /models
    if (endpoint.endsWith("/v1/models")) {
      const fallbackEndpoint = `${baseUrl}/models`;
      const fallbackRes = await fetch(fallbackEndpoint, {
        cache: "no-store",
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (fallbackRes.ok) {
        const fallbackText = await fallbackRes.text();
        try {
          const fallbackPayload = JSON.parse(fallbackText);
          const fallbackDiscovered = parseDiscoveredModels(fallbackPayload);
          if (fallbackDiscovered.length > 0) {
            return fallbackDiscovered.map(enrichModelMetadata);
          }
        } catch {
          // ignore fallback json error
        }
      }
    }
    throw new Error("No models returned by LITTA gateway");
  }

  return discovered.map(enrichModelMetadata);
}

/**
 * 保存 LITTA 配置到 models.json
 */
export function saveLittaConfig(config: {
  apiKey: string;
  baseUrl?: string;
  api?: "openai-completions" | "anthropic-messages";
  models?: LittaModelEntry[];
}): LittaProviderConfig {
  const current = readModelsConfig() as {
    providers?: Record<string, unknown>;
  };
  const providers = { ...(current.providers || {}) };

  const baseUrl = (config.baseUrl || LITTA_DEFAULT_BASE_URL).trim();
  const api = config.api || "openai-completions";
  const apiKey = config.apiKey.trim();
  const models = config.models || [];

  providers[LITTA_PROVIDER_ID] = {
    baseUrl,
    api,
    apiKey,
    models,
  };

  writeModelsConfig({
    ...current,
    providers,
  });

  return {
    baseUrl,
    api,
    apiKey,
    configured: Boolean(apiKey.length > 0),
    models,
  };
}

/**
 * 轻量测试 LITTA 连通性与网络延迟 (ms)
 */
export async function testLittaConnection(params: {
  apiKey: string;
  baseUrl?: string;
  api?: "openai-completions" | "anthropic-messages";
}): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await discoverLittaModels(params);
    return {
      ok: true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

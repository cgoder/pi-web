import { readModelsConfig, writeModelsConfig } from "../../lib/models-config-store";

export interface RemoteModelItem {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
}

export interface RemoteProviderItem {
  id: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  apiType?: string;
  models?: RemoteModelItem[];
}

export interface RemoteModelsManifest {
  name?: string;
  description?: string;
  providers?: RemoteProviderItem[] | Record<string, RemoteProviderItem>;
}

/**
 * 将远程/订阅源提供的 Provider 与本地 models.json 安全合并
 */
export function mergeRemoteProviders(
  remoteProviders: RemoteProviderItem[] | Record<string, unknown>,
): { addedCount: number; updatedCount: number } {
  const currentConfig = readModelsConfig();
  const currentProviders = (currentConfig.providers && typeof currentConfig.providers === "object" && !Array.isArray(currentConfig.providers))
    ? { ...currentConfig.providers as Record<string, unknown> }
    : {};

  let addedCount = 0;
  let updatedCount = 0;

  const normalizedList: RemoteProviderItem[] = Array.isArray(remoteProviders)
    ? remoteProviders
    : Object.entries(remoteProviders).map(([id, val]) => {
        const item = typeof val === "object" && val !== null ? val : {};
        return { id, ...item } as RemoteProviderItem;
      });

  for (const remote of normalizedList) {
    if (!remote.id || typeof remote.id !== "string") continue;
    const providerId = remote.id.trim();
    const existing = currentProviders[providerId] as Record<string, unknown> | undefined;

    if (existing) {
      // 合并更新 models 列表
      const existingModels = Array.isArray(existing.models) ? [...existing.models] : [];
      const remoteModels = Array.isArray(remote.models) ? remote.models : [];

      for (const rm of remoteModels) {
        const idx = existingModels.findIndex((m) => typeof m === "object" && m !== null && (m as { id: string }).id === rm.id);
        if (idx >= 0) {
          existingModels[idx] = { ...(existingModels[idx] as object), ...rm };
        } else {
          existingModels.push(rm);
        }
      }

      currentProviders[providerId] = {
        ...existing,
        name: remote.name || existing.name,
        baseUrl: remote.baseUrl || existing.baseUrl,
        apiType: remote.apiType || existing.apiType,
        models: existingModels,
      };
      updatedCount += 1;
    } else {
      // 新增 provider
      currentProviders[providerId] = {
        name: remote.name || providerId,
        baseUrl: remote.baseUrl,
        apiType: remote.apiType,
        models: remote.models || [],
      };
      addedCount += 1;
    }
  }

  writeModelsConfig({ ...currentConfig, providers: currentProviders });
  return { addedCount, updatedCount };
}

/**
 * 从远程 Manifest URL 拉取并导入模型配置
 */
export async function importModelsFromUrl(url: string): Promise<{
  success: boolean;
  addedCount: number;
  updatedCount: number;
  error?: string;
}> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const manifest = (await res.json()) as RemoteModelsManifest;
    if (!manifest.providers) {
      return { success: false, addedCount: 0, updatedCount: 0, error: "未找到 providers 配置" };
    }

    const { addedCount, updatedCount } = mergeRemoteProviders(manifest.providers);
    return { success: true, addedCount, updatedCount };
  } catch (err) {
    return {
      success: false,
      addedCount: 0,
      updatedCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

import type { Locale } from "@/lib/i18n/types";

export const poweriMessages: Record<string, Record<Locale, string>> = {
  "common.data": {
    "en": "Data",
    "zh-CN": "数据",
    "zh-TW": "數據",
  },
  "common.settings": {
    "en": "Settings",
    "zh-CN": "设置",
    "zh-TW": "設定",
  },
  "usage.openDetails": {
    "en": "Open Data Details",
    "zh-CN": "打开数据详情",
    "zh-TW": "打開數據詳情",
  },
  "stats.currentSession": {
    "en": "Current Session",
    "zh-CN": "当前会话",
    "zh-TW": "當前會話",
  },
  "stats.historySessions": {
    "en": "History",
    "zh-CN": "历史会话",
    "zh-TW": "歷史會話",
  },
  "stats.globalStats": {
    "en": "Global Stats",
    "zh-CN": "全局统计",
    "zh-TW": "全局統計",
  },
  "stats.byDay": {
    "en": "By Day",
    "zh-CN": "按天",
    "zh-TW": "按天",
  },
  "stats.byWorkspace": {
    "en": "By Workspace",
    "zh-CN": "按工作区",
    "zh-TW": "按工作區",
  },
  "stats.allSessions": {
    "en": "All Sessions ({count}) · Click row to view details",
    "zh-CN": "全部会话（{count} 个）· 点击行查看详情",
    "zh-TW": "全部會話（{count} 個）· 點擊行查看詳情",
  },
  "stats.sessionsCount": {
    "en": "{count} sessions",
    "zh-CN": "{count} 个会话",
    "zh-TW": "{count} 個會話",
  },
  "stats.cacheHit": {
    "en": "Cache hit {rate}%",
    "zh-CN": "缓存命中 {rate}%",
    "zh-TW": "緩存命中 {rate}%",
  },
  "stats.user": {
    "en": "User",
    "zh-CN": "用户",
    "zh-TW": "使用者",
  },
  "stats.assistant": {
    "en": "Assistant",
    "zh-CN": "助手",
    "zh-TW": "助手",
  },
  "stats.toolCalls": {
    "en": "Tool Calls",
    "zh-CN": "工具调用",
    "zh-TW": "工具調用",
  },
  "stats.toolResults": {
    "en": "Tool Results",
    "zh-CN": "工具结果",
    "zh-TW": "工具結果",
  },
  "stats.input": {
    "en": "Input",
    "zh-CN": "输入",
    "zh-TW": "輸入",
  },
  "stats.output": {
    "en": "Output",
    "zh-CN": "输出",
    "zh-TW": "輸出",
  },
  "stats.cacheRead": {
    "en": "Cache Read",
    "zh-CN": "缓存读取",
    "zh-TW": "緩存讀取",
  },
  "stats.cacheWrite": {
    "en": "Cache Write",
    "zh-CN": "缓存写入",
    "zh-TW": "緩存寫入",
  },
  "stats.total": {
    "en": "Total",
    "zh-CN": "总计",
    "zh-TW": "總計",
  },
  "stats.sessionInfo": {
    "en": "Session Info",
    "zh-CN": "会话信息",
    "zh-TW": "會話資訊",
  },
  "stats.name": {
    "en": "Name",
    "zh-CN": "名称",
    "zh-TW": "名稱",
  },
  "stats.file": {
    "en": "File",
    "zh-CN": "文件",
    "zh-TW": "檔案",
  },
  "stats.inMemory": {
    "en": "(In-memory)",
    "zh-CN": "（内存中）",
    "zh-TW": "（記憶體中）" },
  "stats.activeTime": {
    "en": "Active Time",
    "zh-CN": "活跃时长",
    "zh-TW": "活躍時長",
  },
  "stats.messages": {
    "en": "Messages",
    "zh-CN": "消息",
    "zh-TW": "訊息",
  },
  "stats.tokens": {
    "en": "Tokens",
    "zh-CN": "Token",
    "zh-TW": "Token",
  },
  "stats.cost": {
    "en": "Cost",
    "zh-CN": "费用",
    "zh-TW": "費用",
  },
  "stats.context": {
    "en": "Context",
    "zh-CN": "上下文",
    "zh-TW": "上下文",
  },
  "stats.avgHitRate": {
    "en": "Avg cache hit rate",
    "zh-CN": "平均缓存命中率",
    "zh-TW": "平均緩存命中率",
  },
  "stats.loadingInfo": {
    "en": "Loading session info...",
    "zh-CN": "加载会话信息…",
    "zh-TW": "載入會話資訊…",
  },
  "stats.loadFailed": {
    "en": "Failed to load",
    "zh-CN": "加载失败",
    "zh-TW": "載入失敗",
  },
  "skills.title": {
    "en": "Skills",
    "zh-CN": "技能",
    "zh-TW": "技能",
  },
  "skills.subtitle": {
    "en": "Configure and manage available skills across business and public sources.",
    "zh-CN": "配置与管理可用技能，支持业务私有源与公共精选源。",
    "zh-TW": "配置與管理可用技能，支援業務私有源與公共精選源。",
  },
  "skills.tabBusiness": {
    "en": "Business Skills",
    "zh-CN": "业务技能",
    "zh-TW": "業務技能",
  },
  "skills.tabPublic": {
    "en": "Public Skills",
    "zh-CN": "公共技能",
    "zh-TW": "公共技能",
  },
  "skills.tabAll": {
    "en": "All",
    "zh-CN": "全部",
    "zh-TW": "全部",
  },
  "skills.manageSubscriptions": {
    "en": "Manage Sources ({count})",
    "zh-CN": "管理订阅源 ({count})",
    "zh-TW": "管理訂閱源 ({count})",
  },
  "skills.collapseSubscriptions": {
    "en": "Collapse Sources",
    "zh-CN": "收起订阅源",
    "zh-TW": "收起訂閱源",
  },
  "skills.inputPlaceholder": {
    "en": "Git repo URL or Manifest JSON URL...",
    "zh-CN": "粘贴 Git 仓库 (如 https://.../skills.git) 或 Manifest URL",
    "zh-TW": "貼上 Git 倉庫或 Manifest URL",
  },
  "skills.namePlaceholder": {
    "en": "Source display name (optional)",
    "zh-CN": "源名称备注（可选）",
    "zh-TW": "源名稱備註（可選）",
  },
  "skills.tokenPlaceholder": {
    "en": "Token (optional for private repo)",
    "zh-CN": "私有仓库 Token（可选）",
    "zh-TW": "私有倉庫 Token（可選）",
  },
  "skills.sourceCategory": {
    "en": "Category",
    "zh-CN": "分类",
    "zh-TW": "分類",
  },
  "skills.categoryBusiness": {
    "en": "Business Source",
    "zh-CN": "业务源",
    "zh-TW": "業務源",
  },
  "skills.categoryPublic": {
    "en": "Public Source",
    "zh-CN": "公共源",
    "zh-TW": "公共源",
  },
  "skills.addSource": {
    "en": "Add Source",
    "zh-CN": "添加订阅",
    "zh-TW": "新增訂閱",
  },
  "skills.syncing": {
    "en": "Syncing...",
    "zh-CN": "同步中...",
    "zh-TW": "同步中...",
  },
  "skills.subscribedSources": {
    "en": "Subscribed Sources:",
    "zh-CN": "已订阅的技能源：",
    "zh-TW": "已訂閱的技能源：",
  },
  "skills.remove": {
    "en": "Remove",
    "zh-CN": "移除",
    "zh-TW": "移除",
  },
  "skills.searchPlaceholder": {
    "en": "Search skills, descriptions, or tags...",
    "zh-CN": "搜索技能名称、场景说明或标签...",
    "zh-TW": "搜尋技能名稱、場景說明或標籤...",
  },
  "skills.loading": {
    "en": "Loading and syncing skills...",
    "zh-CN": "正在加载并同步技能源...",
    "zh-TW": "正在加載並同步技能源...",
  },
  "skills.loadFailed": {
    "en": "Load failed: {error}",
    "zh-CN": "加载失败: {error}",
    "zh-TW": "加載失敗: {error}",
  },
  "skills.noMatch": {
    "en": "No matching skills found",
    "zh-CN": "没有匹配的技能",
    "zh-TW": "沒有匹配的技能",
  },
  "skills.empty": {
    "en": "No skills available. Click 'Manage Sources' to add a source.",
    "zh-CN": "暂无可用技能，请点击右上角「管理订阅源」添加技能仓库链接",
    "zh-TW": "暫無可用技能，請點擊右上角「管理訂閱源」新增倉庫連結",
  },
  "skills.badgeBusiness": {
    "en": "Business",
    "zh-CN": "业务",
    "zh-TW": "業務",
  },
  "skills.badgePublic": {
    "en": "Public",
    "zh-CN": "公共",
    "zh-TW": "公共",
  },
  "skills.sourceGit": {
    "en": "Git Source",
    "zh-CN": "Git 仓库",
    "zh-TW": "Git 倉庫",
  },
  "skills.sourceManifest": {
    "en": "Manifest Source",
    "zh-CN": "清单配置",
    "zh-TW": "清單配置",
  },
  "skills.sourceLocal": {
    "en": "Local Extension",
    "zh-CN": "本地扩展",
    "zh-TW": "本地擴展",
  },
  "skills.noDescription": {
    "en": "No description available",
    "zh-CN": "暂无场景描述",
    "zh-TW": "暫無場景描述",
  },
  "skills.allCapsule": {
    "en": "All",
    "zh-CN": "全部",
    "zh-TW": "全部",
  },
  "skills.addSourceTitle": {
    "en": "Add Repository Source",
    "zh-CN": "添加技能仓库源",
    "zh-TW": "新增技能倉庫源",
  },
  "skills.editSourceTitle": {
    "en": "Configure Repository Source",
    "zh-CN": "配置技能仓库源",
    "zh-TW": "設定技能倉庫源",
  },
  "skills.deleteSource": {
    "en": "Delete Source",
    "zh-CN": "删除该源",
    "zh-TW": "刪除該源",
  },
  "skills.sourceUrlLabel": {
    "en": "Repository / Manifest URL",
    "zh-CN": "仓库地址 / 清单 URL",
    "zh-TW": "倉庫位址 / 清單 URL",
  },
  "skills.sourceAliasLabel": {
    "en": "Source Alias Name (Optional)",
    "zh-CN": "仓库别名（可选）",
    "zh-TW": "倉庫別名（選填）",
  },
  "skills.sourceTokenLabel": {
    "en": "Access Token (GitLab PAT / Private token)",
    "zh-CN": "访问令牌（GitLab PAT / 私有源 Token）",
    "zh-TW": "存取權杖（GitLab PAT / 私有源 Token）",
  },
  "skills.statusEnabled": {
    "en": "Enabled",
    "zh-CN": "已开启",
    "zh-TW": "已開啟",
  },
  "skills.statusDisabled": {
    "en": "Disabled",
    "zh-CN": "未开启",
    "zh-TW": "未開啟",
  },
  "skills.save": {
    "en": "Save",
    "zh-CN": "保存",
    "zh-TW": "儲存",
  },
  "skills.saving": {
    "en": "Saving...",
    "zh-CN": "保存中...",
    "zh-TW": "儲存中...",
  },
  "skills.cancel": {
    "en": "Cancel",
    "zh-CN": "取消",
    "zh-TW": "取消",
  },
  "skills.enabled": {
    "en": "Active",
    "zh-CN": "已开启生效",
    "zh-TW": "已開啟生效",
  },
  "skills.disabled": {
    "en": "Inactive",
    "zh-CN": "未开启",
    "zh-TW": "未開啟",
  },
  "skills.viewDocs": {
    "en": "View details →",
    "zh-CN": "查看说明 →",
    "zh-TW": "查看說明 →",
  },
  "skills.modalScenario": {
    "en": "Purpose & Scenarios:",
    "zh-CN": "功能定位与应用场景：",
    "zh-TW": "功能定位與應用場景：",
  },
  "skills.modalPath": {
    "en": "Source Path / URL:",
    "zh-CN": "来源路径 / 订阅 URL：",
    "zh-TW": "來源路徑 / 訂閱 URL：",
  },
  "models.littaTitle": {
    "en": "LITTA AI Gateway (Default BYOK)",
    "zh-CN": "LITTA 智能网关（默认 BYOK）",
    "zh-TW": "LITTA 智能閘道（預設 BYOK）",
  },
  "models.littaDesc": {
    "en": "Default high-performance enterprise gateway. Input your API key to connect.",
    "zh-CN": "企业级统一大模型代理，输入 API Key 即可快速连接并拉取模型。",
    "zh-TW": "企業級統一模型代理，輸入 API Key 即可快速連線並拉取模型。",
  },
  "models.apiKey": {
    "en": "API Key",
    "zh-CN": "API Key",
    "zh-TW": "API Key",
  },
  "models.apiKeyPlaceholder": {
    "en": "Enter your LITTA API Key (e.g. sk-...)",
    "zh-CN": "输入您的 LITTA API Key（如 sk-...）",
    "zh-TW": "輸入您的 LITTA API Key（如 sk-...）",
  },
  "models.baseUrl": {
    "en": "Base URL",
    "zh-CN": "服务基础地址",
    "zh-TW": "服務基礎位址",
  },
  "models.protocol": {
    "en": "API Protocol",
    "zh-CN": "API 协议",
    "zh-TW": "API 協定",
  },
  "models.protoOpenAI": {
    "en": "OpenAI API (Default)",
    "zh-CN": "OpenAI API（默认）",
    "zh-TW": "OpenAI API（預設）",
  },
  "models.protoAnthropic": {
    "en": "Anthropic API (Compatible)",
    "zh-CN": "Anthropic API（兼容）",
    "zh-TW": "Anthropic API（相容）",
  },
  "models.saveAndConnect": {
    "en": "Save & Connect",
    "zh-CN": "保存并连接",
    "zh-TW": "儲存並連線",
  },
  "models.connecting": {
    "en": "Connecting...",
    "zh-CN": "连接中...",
    "zh-TW": "連線中...",
  },
  "models.connected": {
    "en": "Connected",
    "zh-CN": "已连接",
    "zh-TW": "已連線",
  },
  "models.notConfigured": {
    "en": "Not Configured",
    "zh-CN": "未配置",
    "zh-TW": "未配置",
  },
  "models.fetchModels": {
    "en": "Fetch Latest Models",
    "zh-CN": "从网关拉取最新模型",
    "zh-TW": "從閘道拉取最新模型",
  },
  "models.fetching": {
    "en": "Fetching...",
    "zh-CN": "正在拉取...",
    "zh-TW": "正在拉取...",
  },
  "models.availableModels": {
    "en": "Available Models ({count})",
    "zh-CN": "可用模型 ({count} 个)",
    "zh-TW": "可用模型 ({count} 個)",
  },
  "models.testLatency": {
    "en": "Test Latency",
    "zh-CN": "测速",
    "zh-TW": "測速",
  },
  "models.testing": {
    "en": "Testing...",
    "zh-CN": "测试中...",
    "zh-TW": "測試中...",
  },
  "models.otherProviders": {
    "en": "Other Providers",
    "zh-CN": "其他提供商",
    "zh-TW": "其他提供商",
  },
  "plugins.installedTab": {
    "en": "Installed",
    "zh-CN": "已安装",
    "zh-TW": "已安裝",
  },
  "plugins.discoverTab": {
    "en": "Discover",
    "zh-CN": "发现",
    "zh-TW": "發現",
  },
  "plugins.categoryAll": {
    "en": "All",
    "zh-CN": "全部",
    "zh-TW": "全部",
  },
  "plugins.categoryExtension": {
    "en": "Extensions",
    "zh-CN": "扩展",
    "zh-TW": "擴充",
  },
  "plugins.categorySkill": {
    "en": "Skills",
    "zh-CN": "技能",
    "zh-TW": "技能",
  },
  "plugins.categoryPrompt": {
    "en": "Prompts",
    "zh-CN": "提示词",
    "zh-TW": "提示詞",
  },
  "plugins.categoryTheme": {
    "en": "Themes",
    "zh-CN": "主题",
    "zh-TW": "主題",
  },
  "plugins.categoryPackage": {
    "en": "Packages",
    "zh-CN": "安装包",
    "zh-TW": "安裝包",
  },
  "plugins.searchPlaceholder": {
    "en": "Search packages (e.g. pi-mcp-adapter, npm:pkg, git:repo)...",
    "zh-CN": "搜索或输入 package 名称 (如 pi-mcp-adapter, npm:pkg, git:repo)...",
    "zh-TW": "搜尋或輸入 package 名稱 (如 pi-mcp-adapter, npm:pkg, git:repo)...",
  },
  "plugins.reloadSession": {
    "en": "Reload Session",
    "zh-CN": "重载会话",
    "zh-TW": "重載會話",
  },
  "plugins.reloading": {
    "en": "Reloading...",
    "zh-CN": "正在重载...",
    "zh-TW": "正在重載...",
  },
  "plugins.enabled": {
    "en": "Enabled",
    "zh-CN": "已启用",
    "zh-TW": "已啟用",
  },
  "plugins.disabled": {
    "en": "Disabled",
    "zh-CN": "已禁用",
    "zh-TW": "已禁用",
  },
  "plugins.enable": {
    "en": "Enable",
    "zh-CN": "启用",
    "zh-TW": "啟用",
  },
  "plugins.disable": {
    "en": "Disable",
    "zh-CN": "禁用",
    "zh-TW": "禁用",
  },
  "plugins.update": {
    "en": "Update",
    "zh-CN": "更新",
    "zh-TW": "更新",
  },
  "plugins.updating": {
    "en": "Updating...",
    "zh-CN": "更新中...",
    "zh-TW": "更新中...",
  },
  "plugins.remove": {
    "en": "Uninstall",
    "zh-CN": "卸载",
    "zh-TW": "卸載",
  },
  "plugins.removing": {
    "en": "Removing...",
    "zh-CN": "移除中...",
    "zh-TW": "移除中...",
  },
  "plugins.installGlobal": {
    "en": "+ Global Install",
    "zh-CN": "+ 全局安装",
    "zh-TW": "+ 全域安裝",
  },
  "plugins.installProject": {
    "en": "+ Project Install",
    "zh-CN": "+ 项目专属",
    "zh-TW": "+ 專案專屬",
  },
  "plugins.installing": {
    "en": "Installing...",
    "zh-CN": "安装中...",
    "zh-TW": "安裝中...",
  },
  "plugins.installed": {
    "en": "Installed",
    "zh-CN": "已安装",
    "zh-TW": "已安裝",
  },
  "plugins.hasUpdate": {
    "en": "Update available",
    "zh-CN": "有新版本",
    "zh-TW": "有新版本",
  },
  "plugins.isLatest": {
    "en": "Latest",
    "zh-CN": "最新",
    "zh-TW": "最新",
  },
  "plugins.noInstalled": {
    "en": "No packages installed yet",
    "zh-CN": "暂无已安装的 Package",
    "zh-TW": "暫無已安裝的 Package",
  },
  "plugins.noDiscover": {
    "en": "No matching packages found",
    "zh-CN": "未找到匹配的 Package",
    "zh-TW": "未找到匹配的 Package",
  },
  "plugins.scopeGlobal": {
    "en": "Global",
    "zh-CN": "全局",
    "zh-TW": "全域",
  },
  "plugins.scopeProject": {
    "en": "Project",
    "zh-CN": "项目专属",
    "zh-TW": "專案專屬",
  },
  "plugins.resources": {
    "en": "Resources",
    "zh-CN": "包含资源",
    "zh-TW": "包含資源",
  },
  "plugins.resourcesCount": {
    "en": "Resources ({count}) ▼",
    "zh-CN": "资源 ({count}) ▼",
    "zh-TW": "資源 ({count}) ▼",
  },
  "plugins.collapseResources": {
    "en": "Collapse ▲",
    "zh-CN": "收起明细 ▲",
    "zh-TW": "收起明細 ▲",
  },
  "plugins.confirmUninstallTitle": {
    "en": "Confirm Uninstall",
    "zh-CN": "确认卸载 Package",
    "zh-TW": "確認卸載 Package",
  },
  "plugins.confirmUninstallDesc": {
    "en": "Are you sure you want to uninstall {source}? All extensions and skills from this package will be removed.",
    "zh-CN": "您确定要卸载 {source} 吗？卸载后该包提供的所有扩展、技能和命令将被移除。",
    "zh-TW": "您確定要卸載 {source} 嗎？卸載後該套件提供的所有擴充、技能與指令將被移除。",
  },
  "plugins.cancel": {
    "en": "Cancel",
    "zh-CN": "取消",
    "zh-TW": "取消",
  },
  "plugins.viewOnWeb": {
    "en": "View on pi.dev",
    "zh-CN": "在 pi.dev 上查看",
    "zh-TW": "在 pi.dev 上檢視",
  },
  "plugins.loadMore": {
    "en": "Load More Packages",
    "zh-CN": "加载更多 Package",
    "zh-TW": "載入更多 Package",
  },
  "plugins.loadingMore": {
    "en": "Loading more...",
    "zh-CN": "正在加载更多...",
    "zh-TW": "正在載入更多...",
  },
  "plugins.allLoaded": {
    "en": "All packages loaded",
    "zh-CN": "已加载全部 Package",
    "zh-TW": "已載入全部 Package",
  },
};

/**
 * PowerI 多语言翻译辅助函数
 */
export function tp(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const dict = poweriMessages[key];
  if (!dict) return key;
  let text = dict[locale] || dict["en"] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

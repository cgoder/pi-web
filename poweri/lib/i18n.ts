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
    "zh-TW": "（記憶體中）",
  },
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
    "en": "Configure and manage available skills.",
    "zh-CN": "配置与管理可用技能。",
    "zh-TW": "配置與管理可用技能。",
  },
  "skills.manageSubscriptions": {
    "en": "Manage Sources ({count})",
    "zh-CN": "管理订阅源 ({count})",
    "zh-TW": "管理訂閱源 ({count})" ,
  },
  "skills.collapseSubscriptions": {
    "en": "Collapse Sources",
    "zh-CN": "收起订阅源",
    "zh-TW": "收起訂閱源",
  },
  "skills.inputPlaceholder": {
    "en": "Paste Git repo URL or Manifest JSON URL...",
    "zh-CN": "粘贴 Git 仓库 (如 https://.../skills.git) 或 Manifest URL",
    "zh-TW": "貼上 Git 倉庫或 Manifest URL",
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
    "zh-CN": "已订阅的业务源：",
    "zh-TW": "已訂閱的業務源：",
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
    "zh-CN": "正在加载并同步业务技能源...",
    "zh-TW": "正在加載並同步技能源...",
  },
  "skills.loadFailed": {
    "en": "Load failed: {error}",
    "zh-CN": "加载失败: {error}",
    "zh-TW": "加載失敗: {error}",
  },
  "skills.noMatch": {
    "en": "No matching skills found",
    "zh-CN": "没有匹配的业务技能",
    "zh-TW": "沒有匹配的技能",
  },
  "skills.empty": {
    "en": "No skills available. Click 'Manage Sources' to add a source.",
    "zh-CN": "暂无可用技能，请点击右上角「管理订阅源」添加业务仓库链接",
    "zh-TW": "暫無可用技能，請點擊右上角「管理訂閱源」新增倉庫連結",
  },
  "skills.sourceGit": {
    "en": "Git Source",
    "zh-CN": "Git 业务源",
    "zh-TW": "Git 業務源",
  },
  "skills.sourceManifest": {
    "en": "Manifest Source",
    "zh-CN": "企业清单",
    "zh-TW": "企業清單",
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

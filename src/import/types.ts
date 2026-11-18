/**
 * 导入管线共享类型与工具（纯逻辑，不依赖 react-native，可在 Node 中测试）
 */
import type { ImportConversation } from '@/db/repo';
import type { SessionSource } from '@/types';

export type ExportFormat =
  | 'chatgpt-conversations' // ChatGPT / DeepSeek 官方导出的 conversations.json（树状 mapping）
  | 'deepseek-web' // chat.deepseek.com 站点格式（messages + parent_id + contentFragments）
  | 'gemini-activity' // Google Takeout My Activity（Gemini Apps）JSON
  | 'gemini-conversations' // {"conversations":[...]} / gemini_chats.ndjson（scraper）
  | 'generic-messages'; // 兜底：[{conversation_id, messages:[{role,content}]}]

export interface ImportStats {
  format: ExportFormat;
  files: number;
  conversations: number;
  messages: number;
  /** Gemini My Activity 常见：只有提问没有回复 */
  withoutResponse: number;
  skippedRecords: number;
  note?: string;
}

export interface ParsedExport {
  format: ExportFormat;
  /** 会话归属平台（chatgpt-compatible 格式允许用户在向导中改判来源） */
  source: SessionSource;
  conversations: ImportConversation[];
  stats: ImportStats;
}

/** 任意时间戳 → epoch ms；数值按 秒/毫秒 自适应，字符串尝试 ISO 解析 */
export function toMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && isFinite(v)) {
    if (v <= 0) return null;
    return v < 1e12 ? Math.round(v * 1000) : Math.round(v);
  }
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return isFinite(t) ? t : null;
  }
  return null;
}

export function cleanText(s: unknown): string {
  return typeof s === 'string' ? s.replace(/\u00a0/g, ' ').trim() : '';
}

/** 从首个用户消息生成默认标题 */
export function titleFromMessages(
  messages: Array<{ role: string; content: string }>,
  fallback = '(未命名)'
): string {
  const first = messages.find((m) => m.role === 'user' && m.content.trim());
  const t = first?.content.trim().replace(/\s+/g, ' ') ?? '';
  return t ? t.slice(0, 40) : fallback;
}

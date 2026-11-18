/**
 * 导入口径：自动识别格式并解析
 *
 * 识别优先级：
 * 1. 数组元素含 mapping          → ChatGPT/DeepSeek 官方 conversations.json（树）
 * 2. 数组元素 messages[].parent_id / contentFragments / message_role → DeepSeek 站点格式
 * 3. 数组元素含 header/title/time → Gemini My Activity
 * 4. 数组元素含 messages[].role+content → 通用消息数组（DeepSeek 导出变体等）
 * 5. 对象含 conversations[]      → Gemini conversations / scraper ndjson
 * 6. 对象含 items/activities/data[] → 递归识别
 * 7. 顶层 messages[]             → DeepSeek API 单会话
 * 8. JSON.parse 失败但逐行可解析 → NDJSON（scraper 或 role/content 行）
 */
import { parseChatGptConversations } from './chatgpt';
import { parseDeepSeekWeb } from './deepseek';
import { parseGeminiActivity, parseGeminiConversations } from './gemini';
import { titleFromMessages, type ExportFormat, type ParsedExport } from './types';
import type { ImportConversation } from '@/db/repo';
import type { SessionSource } from '@/types';

export type { ExportFormat, ImportStats, ParsedExport } from './types';

/** ChatGPT 导出无稳定 id：用 指纹（标题+首条用户消息+条数）做幂等键 */
function fingerprint(conv: ImportConversation): string {
  const firstUser = conv.messages.find((m) => m.role === 'user')?.content ?? '';
  const raw = `${conv.title}|${firstUser.slice(0, 200)}|${conv.messages.length}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return `fp:${(h >>> 0).toString(36)}:${conv.messages.length}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function messagesShape(arr: unknown[] | undefined): 'deepseek-web' | 'generic' | null {
  if (!arr?.length) return null;
  const first = arr[0];
  if (!isPlainObject(first)) return 'generic';
  if (
    'parent_id' in first || 'parent_message_id' in first ||
    'contentFragments' in first || 'message_role' in first
  ) return 'deepseek-web';
  const roleish = 'role' in first || 'type' in first;
  const contentish = 'content' in first || 'text' in first;
  return roleish && contentish ? 'generic' : null;
}

function detectArray(arr: unknown[]): ParsedExport | null {
  const firstObj = arr.find(isPlainObject);
  if (!firstObj) return null;

  if (isPlainObject(firstObj.mapping)) {
    const { conversations, stats } = parseChatGptConversations(arr);
    for (const c of conversations) c.sourceId ??= null;
    // 指纹幂等
    for (const c of conversations) if (!c.sourceId) c.sourceId = fingerprint(c);
    return {
      format: 'chatgpt-conversations',
      source: 'chatgpt',
      conversations,
      stats: {
        format: 'chatgpt-conversations',
        files: 1,
        conversations: conversations.length,
        messages: stats.messages,
        withoutResponse: 0,
        skippedRecords: stats.total - conversations.length,
      },
    };
  }

  if (Array.isArray(firstObj.messages)) {
    const shape = messagesShape(firstObj.messages as unknown[]);
    if (shape === 'deepseek-web') {
      const { conversations, stats } = parseDeepSeekWeb(arr);
      return {
        format: 'deepseek-web',
        source: 'deepseek',
        conversations,
        stats: {
          format: 'deepseek-web',
          files: 1,
          conversations: conversations.length,
          messages: stats.messages,
          withoutResponse: 0,
          skippedRecords: stats.total - conversations.length,
        },
      };
    }
    if (shape === 'generic') {
      // DeepSeek 导出变体 / 通用 [{conversation_id, messages}]
      const convs = parseGenericArray(arr);
      return {
        format: 'generic-messages',
        source: 'deepseek',
        conversations: convs,
        stats: {
          format: 'generic-messages',
          files: 1,
          conversations: convs.length,
          messages: convs.reduce((n, c) => n + c.messages.length, 0),
          withoutResponse: 0,
          skippedRecords: arr.length - convs.length,
        },
      };
    }
  }

  if ('header' in firstObj && 'title' in firstObj && 'time' in firstObj) {
    const { conversations, stats } = parseGeminiActivity(arr);
    return {
      format: 'gemini-activity',
      source: 'gemini',
      conversations,
      stats: {
        format: 'gemini-activity',
        files: 1,
        conversations: conversations.length,
        messages: stats.messages,
        withoutResponse: stats.withoutResponse,
        skippedRecords: stats.skippedNonGemini,
        note: stats.withoutResponse
          ? `${stats.withoutResponse} 个会话只有提问没有回复（My Activity 不导出回复）`
          : undefined,
      },
    };
  }
  return null;
}

function parseGenericArray(arr: unknown[]): ImportConversation[] {
  const convs: ImportConversation[] = [];
  arr.forEach((item, idx) => {
    if (!isPlainObject(item) || !Array.isArray(item.messages)) return;
    const msgs: ImportConversation['messages'] = [];
    for (const m of item.messages as Array<Record<string, unknown>>) {
      const role = String(m.role ?? m.type ?? '').toLowerCase();
      if (role !== 'user' && role !== 'assistant') continue;
      const content = typeof m.content === 'string' ? m.content.trim() : '';
      if (!content) continue;
      msgs.push({ role, content });
    }
    if (!msgs.length) return;
    const itemTitle = typeof item.title === 'string' ? item.title.trim() : '';
    convs.push({
      sourceId:
        (typeof item.conversation_id === 'string' && item.conversation_id) ||
        (typeof item.id === 'string' && item.id) ||
        `gen-${idx}`,
      title: itemTitle || titleFromMessages(msgs),
      createdAt: null,
      messages: msgs,
      meta: { format: 'generic-messages' },
    });
  });
  return convs;
}

function detectObject(obj: Record<string, unknown>): ParsedExport | null {
  if (Array.isArray(obj.conversations)) {
    const list = obj.conversations;
    if (list.length && isPlainObject(list[0]) && ('turns' in list[0] || 'entries' in list[0] || 'messages' in list[0])) {
      const { conversations, stats } = parseGeminiConversations(list);
      return {
        format: 'gemini-conversations',
        source: 'gemini',
        conversations,
        stats: {
          format: 'gemini-conversations',
          files: 1,
          conversations: conversations.length,
          messages: stats.messages,
          withoutResponse: stats.withoutResponse,
          skippedRecords: stats.total - conversations.length,
        },
      };
    }
  }
  for (const key of ['items', 'activities', 'data'] as const) {
    if (Array.isArray(obj[key])) {
      const nested = detectArray(obj[key] as unknown[]);
      if (nested) return nested;
    }
  }
  if (Array.isArray(obj.messages)) {
    const shape = messagesShape(obj.messages as unknown[]);
    if (shape) {
      const single = [{ title: '导入的对话', messages: obj.messages }];
      const convs = shape === 'deepseek-web'
        ? parseDeepSeekWeb(single).conversations
        : parseGenericArray(single);
      return {
        format: shape === 'deepseek-web' ? 'deepseek-web' : 'generic-messages',
        source: 'deepseek',
        conversations: convs,
        stats: {
          format: shape === 'deepseek-web' ? 'deepseek-web' : 'generic-messages',
          files: 1,
          conversations: convs.length,
          messages: convs.reduce((n, c) => n + c.messages.length, 0),
          withoutResponse: 0,
          skippedRecords: 0,
        },
      };
    }
  }
  return null;
}

function detectNdjson(text: string): ParsedExport | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const parsed: unknown[] = [];
  for (const line of lines) {
    try { parsed.push(JSON.parse(line)); } catch { return null; }
  }
  const objs = parsed.filter(isPlainObject);
  if (objs.length !== parsed.length) return null;

  // gemini-chat-exporter scraper 输出：每行一个 {id, title, turns:[{role,text}]}
  if (objs.some((o) => Array.isArray(o.turns))) {
    const { conversations, stats } = parseGeminiConversations(objs);
    return {
      format: 'gemini-conversations',
      source: 'gemini',
      conversations,
      stats: {
        format: 'gemini-conversations',
        files: 1,
        conversations: conversations.length,
        messages: stats.messages,
        withoutResponse: stats.withoutResponse,
        skippedRecords: 0,
        note: 'NDJSON（scraper 导出）',
      },
    };
  }
  // 每行 {role, content}：单个会话
  if (objs.every((o) => ('role' in o || 'type' in o) && ('content' in o || 'text' in o))) {
    const single = [{ title: '导入的对话', messages: objs }];
    const convs = parseGenericArray(single);
    if (convs.length) {
      return {
        format: 'generic-messages',
        source: 'deepseek',
        conversations: convs,
        stats: {
          format: 'generic-messages',
          files: 1,
          conversations: 1,
          messages: convs[0].messages.length,
          withoutResponse: 0,
          skippedRecords: 0,
          note: 'NDJSON（role/content 行）',
        },
      };
    }
  }
  // 每行一个会话对象（含 messages）
  const asArray = objs.filter((o) => Array.isArray(o.messages));
  if (asArray.length) {
    const nested = detectArray(asArray);
    if (nested) return { ...nested, stats: { ...nested.stats, note: 'NDJSON' } };
  }
  return null;
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/**
 * 解析导出文本。sourceOverride 用于 conversations.json 兼容格式：
 * DeepSeek 官方导出与 ChatGPT 同构，由向导让用户确认来源。
 */
export function parseExportText(text: string, sourceOverride?: SessionSource): ParsedExport {
  const trimmed = text.trim();
  if (!trimmed) throw new ImportError('文件为空');

  let json: unknown;
  let isNdjson = false;
  try {
    json = JSON.parse(trimmed);
  } catch {
    isNdjson = true;
  }

  let result: ParsedExport | null = null;
  if (!isNdjson) {
    result = Array.isArray(json)
      ? detectArray(json)
      : isPlainObject(json)
        ? detectObject(json)
        : null;
    if (!result && Array.isArray(json) && json.length === 0) {
      throw new ImportError('文件里没有对话记录');
    }
  } else {
    result = detectNdjson(trimmed);
  }

  if (!result || !result.conversations.length) {
    throw new ImportError(
      '无法识别的导出格式。支持：ChatGPT/DeepSeek conversations.json、DeepSeek 站点导出、Google Takeout（Gemini Apps）JSON、通用消息 JSON/NDJSON。'
    );
  }
  if (sourceOverride) result.source = sourceOverride;
  return result;
}

/**
 * chat.deepseek.com 站点格式解析器（浏览器扩展/抓包导出的完整站点数据）
 *
 * 观测结构（社区工具 deepseek-pp / chat-exporter / DeepSeek Exporter）:
 * [
 *   {
 *     id | chat_session_id | session_id | conversation_id: "...",
 *     title, created_at, updated_at | updatedAt (unix 秒),
 *     messages: [
 *       {
 *         message_id | id,
 *         parent_id | parent_message_id | null,
 *         message_role | role | type: "USER"|"ASSISTANT"|...,
 *         content: "..." 或 contentFragments: [{ text }],
 *         thinking?: boolean, thinking_enabled?: boolean,
 *         search_enabled?: boolean,
 *         created_at (unix 秒)
 *       }, ...
 *     ]
 *   }, ...
 * ]
 *
 * 分支感知：按 parent_id 构树，取"最晚 created_at 的消息"向上回溯为活跃路径；
 * 无 parent 字段时保持原数组顺序（线性会话）。
 */
import { cleanText, titleFromMessages, toMs } from './types';
import type { ImportConversation } from '@/db/repo';

interface DsMessage {
  message_id?: string;
  id?: string;
  parent_id?: string | null;
  parent_message_id?: string | null;
  parentMessageId?: string | null;
  message_role?: string;
  role?: string;
  type?: string;
  content?: unknown;
  contentFragments?: Array<{ text?: string }>;
  thinking_content?: string;
  reasoning_content?: string;
  thinking?: boolean;
  thinking_enabled?: boolean;
  search_enabled?: boolean;
  created_at?: unknown;
  createdAt?: unknown;
  inserted_at?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
}

interface DsSession {
  id?: string;
  chat_session_id?: string;
  session_id?: string;
  conversation_id?: string;
  title?: string;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
  update_time?: unknown;
  messages?: DsMessage[];
}

function normRole(v: string | undefined): 'user' | 'assistant' | null {
  const r = (v ?? '').trim().toUpperCase();
  if (r === 'USER' || r === 'HUMAN') return 'user';
  if (r === 'ASSISTANT' || r === 'AI' || r === 'MODEL' || r === 'CHAT') return 'assistant';
  return null; // SYSTEM / 其他跳过
}

function extractContent(m: DsMessage): string {
  if (typeof m.content === 'string') return m.content.trim();
  if (Array.isArray(m.contentFragments)) {
    return m.contentFragments
      .map((f) => cleanText(f?.text))
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }
  if (m.content && typeof m.content === 'object') {
    const c = m.content as { text?: unknown; parts?: unknown[] };
    if (typeof c.text === 'string') return c.text.trim();
    if (Array.isArray(c.parts)) {
      return c.parts.filter((p): p is string => typeof p === 'string').join('\n').trim();
    }
  }
  return '';
}

function msgTime(m: DsMessage): number | null {
  return toMs(m.created_at) ?? toMs(m.createdAt) ?? toMs(m.inserted_at) ?? toMs(m.updated_at) ?? toMs(m.updatedAt);
}

function parentId(m: DsMessage): string | null {
  return m.parent_id ?? m.parent_message_id ?? m.parentMessageId ?? null;
}

function ownId(m: DsMessage, i: number): string {
  return m.message_id ?? m.id ?? `idx-${i}`;
}

/** 按 parent 树还原活跃路径（最晚消息向上回溯），线性时返回 null */
function orderActivePath(messages: DsMessage[]): DsMessage[] | null {
  const hasTree = messages.some((m) => parentId(m) !== undefined && parentId(m) !== null);
  if (!hasTree) return null;

  const byId = new Map<string, { m: DsMessage; i: number }>();
  messages.forEach((m, i) => byId.set(ownId(m, i), { m, i }));

  // 找时间最晚的消息作为活跃叶子
  let leaf: { m: DsMessage; i: number } | null = null;
  let leafTime = -Infinity;
  for (const entry of byId.values()) {
    const t = msgTime(entry.m) ?? entry.i;
    if (t > leafTime) { leafTime = t; leaf = entry; }
  }
  if (!leaf) return null;

  const path: DsMessage[] = [];
  let cursor: { m: DsMessage; i: number } | undefined = leaf;
  const seen = new Set<string>();
  while (cursor) {
    const key = ownId(cursor.m, cursor.i);
    if (seen.has(key)) break;
    seen.add(key);
    path.push(cursor.m);
    const pid = parentId(cursor.m);
    cursor = pid != null ? byId.get(pid) : undefined;
  }
  path.reverse();
  return path.length ? path : null;
}

export function parseDeepSeekWeb(raw: unknown): {
  conversations: ImportConversation[];
  stats: { total: number; messages: number };
} {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)
      ? ((raw as { data: unknown[] }).data as unknown[])
      : [];
  const conversations: ImportConversation[] = [];
  let messageCount = 0;

  for (const s of list as DsSession[]) {
    const rawMsgs = Array.isArray(s.messages) ? s.messages : [];
    if (!rawMsgs.length) continue;

    const ordered = orderActivePath(rawMsgs) ?? rawMsgs;
    const msgs: ImportConversation['messages'] = [];
    let thinking: boolean | null = null;
    let search: boolean | null = null;

    ordered.forEach((m, i) => {
      const role = normRole(m.message_role ?? m.role ?? m.type);
      if (!role) return;
      const content = extractContent(m);
      const reasoning = cleanText(m.thinking_content) || cleanText(m.reasoning_content) || null;
      if (!content && !reasoning) return;
      if (typeof m.thinking_enabled === 'boolean') thinking = m.thinking_enabled;
      else if (typeof m.thinking === 'boolean') thinking = m.thinking;
      if (typeof m.search_enabled === 'boolean') search = m.search_enabled;
      msgs.push({
        role,
        content,
        reasoning,
        createdAt: msgTime(m) ?? toMs(s.created_at) ?? toMs(s.createdAt) ?? (Date.now() + i),
      });
    });

    if (!msgs.length) continue;
    messageCount += msgs.length;
    conversations.push({
      sourceId: cleanText(s.id ?? s.chat_session_id ?? s.session_id ?? s.conversation_id) || null,
      title: cleanText(s.title) || titleFromMessages(msgs),
      createdAt: toMs(s.created_at) ?? toMs(s.createdAt),
      messages: msgs,
      meta: {
        format: 'deepseek-web',
        thinkingEnabled: thinking,
        searchEnabled: search,
      },
    });
  }

  return { conversations, stats: { total: list.length, messages: messageCount } };
}

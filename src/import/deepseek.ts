/**
 * chat.deepseek.com 站点格式解析器（浏览器扩展/抓包导出的完整站点数据）
 *
 * 观测结构（社区工具 deepseek-pp / chat-exporter / DeepSeek Exporter）:
 * [{ id, title, updated_at, messages: [{ message_id, parent_id, message_role,
 *    content | contentFragments: [{text}], created_at, thinking_enabled, search_enabled }] }]
 *
 * 健壮性设计（应对损坏/恶意文件）：
 * - 会话与消息先过对象守卫，损坏项计入 skipped 不抛异常
 * - 分支还原：先求"真叶节点"（未被任何消息作为 parent 引用），再取时间最晚者，
 *   避免"全局最晚消息恰好是非叶节点"时导错分支
 * - ID 归一化为字符串；重复 ID 追加后缀而非静默覆盖
 * - 回溯遇缺失父节点即停，并在统计中标注"分支不完整"
 */
import { LIMITS, cleanText, filterObjects, titleFromMessages, toMs } from './types';
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
  contentFragments?: { text?: string }[];
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
  messages?: unknown[];
}

function normRole(v: unknown): 'user' | 'assistant' | null {
  const r = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (r === 'USER' || r === 'HUMAN') return 'user';
  if (r === 'ASSISTANT' || r === 'AI' || r === 'MODEL' || r === 'CHAT') return 'assistant';
  return null; // SYSTEM / 其他跳过
}

function extractContent(m: DsMessage): string {
  let text = '';
  if (typeof m.content === 'string') text = m.content.trim();
  else if (Array.isArray(m.contentFragments)) {
    text = m.contentFragments
      .slice(0, LIMITS.maxFragments)
      .map((f) => cleanText(f?.text))
      .filter(Boolean)
      .join('\n\n')
      .trim();
  } else if (m.content && typeof m.content === 'object') {
    const c = m.content as { text?: unknown; parts?: unknown[] };
    if (typeof c.text === 'string') text = c.text.trim();
    else if (Array.isArray(c.parts)) {
      text = c.parts.filter((p): p is string => typeof p === 'string').join('\n').trim();
    }
  }
  return text.length > LIMITS.maxContentLength
    ? text.slice(0, LIMITS.maxContentLength)
    : text;
}

function msgTime(m: DsMessage): number | null {
  return toMs(m.created_at) ?? toMs(m.createdAt) ?? toMs(m.inserted_at) ?? toMs(m.updated_at) ?? toMs(m.updatedAt);
}

/** 消息 ID 归一化：字符串或有限数字 → 字符串（站点导出常见数字 ID） */
function normalizeId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function parentId(m: DsMessage): string | null {
  return normalizeId(m.parent_id ?? m.parent_message_id ?? m.parentMessageId);
}

/** 建节点表：ID 归一化为字符串；重复 ID 追加后缀而非覆盖 */
function buildNodeMap(messages: DsMessage[]): Map<string, { m: DsMessage; i: number }> {
  const byId = new Map<string, { m: DsMessage; i: number }>();
  const dupCount = new Map<string, number>();
  messages.forEach((m, i) => {
    let key = normalizeId(m.message_id ?? m.id) ?? `idx-${i}`;
    if (byId.has(key)) {
      const n = (dupCount.get(key) ?? 0) + 1;
      dupCount.set(key, n);
      key = `${key}#dup${n}`;
    }
    byId.set(key, { m, i });
  });
  return byId;
}

/** 分支还原：真叶节点（未被引用为 parent）中取时间最晚者，向上回溯 */
function orderActivePath(messages: DsMessage[]): { path: DsMessage[] | null; truncated: boolean } {
  const hasTree = messages.some((m) => parentId(m) !== null);
  if (!hasTree) return { path: null, truncated: false };

  const byId = buildNodeMap(messages);
  const referenced = new Set<string>();
  for (const { m } of byId.values()) {
    const p = parentId(m);
    if (p != null) referenced.add(p);
  }

  // 真叶 = 未被任何 parent 引用的节点；优先非重复 ID 的候选
  const leaves = [...byId.entries()].filter(([key]) => !referenced.has(key));
  const primary = leaves.filter(([key]) => !key.includes('#dup'));
  const candidates = primary.length ? primary : leaves;
  if (!candidates.length) return { path: null, truncated: true };

  let leaf: [string, { m: DsMessage; i: number }] | null = null;
  let leafTime = -Infinity;
  for (const entry of candidates) {
    const t = msgTime(entry[1].m) ?? entry[1].i;
    if (t > leafTime) { leafTime = t; leaf = entry; }
  }
  if (!leaf) return { path: null, truncated: true };

  const path: DsMessage[] = [];
  let cursor: [string, { m: DsMessage; i: number }] | undefined = leaf;
  const seen = new Set<string>();
  let truncated = false;
  while (cursor) {
    if (seen.has(cursor[0])) break;
    seen.add(cursor[0]);
    path.push(cursor[1].m);
    const pid = parentId(cursor[1].m);
    if (pid != null && !byId.has(pid)) { truncated = true; break; }
    const next = pid != null ? byId.get(pid) : undefined;
    cursor = next ? [pid as string, next] : undefined;
  }
  path.reverse();
  return { path: path.length ? path : null, truncated };
}

export interface DeepSeekParseResult {
  conversations: ImportConversation[];
  stats: { total: number; messages: number; skipped: number; branchNotes: number };
}

export function parseDeepSeekWeb(raw: unknown): DeepSeekParseResult {
  const listRaw = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)
      ? ((raw as { data: unknown[] }).data)
      : [];
  const { items: list, skipped: skippedSessions } = filterObjects(listRaw as unknown[]);
  const conversations: ImportConversation[] = [];
  let messageCount = 0;
  let skippedTotal = skippedSessions;
  let branchNotes = 0;

  if (list.length > LIMITS.maxSessions) {
    throw new Error(`会话数过多（${list.length}，上限 ${LIMITS.maxSessions}）`);
  }

  for (const s of list as DsSession[]) {
    const rawMsgs = Array.isArray(s.messages) ? s.messages : [];
    const { items: msgObjs, skipped: skippedMsgs } = filterObjects(rawMsgs);
    skippedTotal += skippedMsgs;
    if (msgObjs.length > LIMITS.maxMessagesPerSession) {
      throw new Error(`单会话消息数过多（${msgObjs.length}，上限 ${LIMITS.maxMessagesPerSession}）`);
    }
    if (!msgObjs.length) continue;

    const ordered = orderActivePath(msgObjs as unknown as DsMessage[]);
    if (ordered.truncated) branchNotes++;
    const msgsSrc = ordered.path ?? msgObjs as unknown as DsMessage[];
    const baseTime = toMs(s.created_at) ?? toMs(s.createdAt);
    const msgs: ImportConversation['messages'] = [];
    let thinking: boolean | null = null;
    let search: boolean | null = null;

    msgsSrc.forEach((m, i) => {
      const role = normRole(m.message_role ?? m.role ?? m.type);
      if (!role) return;
      const content = extractContent(m);
      const reasoning = cleanText(m.thinking_content) || cleanText(m.reasoning_content) || null;
      if (!content && !reasoning) return;
      if (typeof m.thinking_enabled === 'boolean') thinking = m.thinking_enabled;
      else if (typeof m.thinking === 'boolean') thinking = m.thinking;
      if (typeof m.search_enabled === 'boolean') search = m.search_enabled;
      // 时间回退链稳定：消息时间 → 会话时间 → null（不用当前时间）
      msgs.push({ role, content, reasoning, createdAt: msgTime(m) ?? baseTime ?? null });
      void i;
    });

    if (!msgs.length) continue;
    messageCount += msgs.length;
    conversations.push({
      // 会话 ID 与消息 ID 同一归一化（数字/字符串皆可）
      sourceId: normalizeId(s.id ?? s.chat_session_id ?? s.session_id ?? s.conversation_id),
      title: cleanText(s.title) || titleFromMessages(msgs),
      createdAt: baseTime,
      messages: msgs,
      meta: {
        format: 'deepseek-web',
        thinkingEnabled: thinking,
        searchEnabled: search,
        note: ordered.truncated ? '分支不完整：存在缺失的父节点，已导入可达部分' : undefined,
      },
    });
  }

  return { conversations, stats: { total: list.length, messages: messageCount, skipped: skippedTotal, branchNotes } };
}

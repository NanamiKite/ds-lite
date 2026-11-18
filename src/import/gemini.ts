/**
 * Google Takeout（Gemini Apps）解析器
 *
 * 移植 gemini-chat-exporter takeout.py 的容错策略（MIT, David Malko）：
 * https://github.com/davidmalko87/gemini-chat-exporter
 *
 * 两种形态：
 * 1. My Activity 数组：[{header, title("Prompted X"), titleUrl(".../app/<id>"),
 *    time(ISO), products, subtitles:[{name}], description}] —— 按会话 id 分组；
 *    My Activity 是"以提问为中心"的，常缺模型回复。
 * 2. Conversations 对象：{conversations:[{title, create_time, entries|messages|turns:
 *    [{role|author, text|content}]}]} —— 完整多轮（Takeout/scraper ndjson）。
 */
import { cleanText, titleFromMessages, toMs } from './types';
import type { ImportConversation } from '@/db/repo';

const APP_ID_RE = /\/app\/([0-9a-fA-F]+)/;
const PROMPTED_PREFIX_RE = /^(?:prompted|asked)\b[:\s]+/i;
const GEMINI_HEADERS = new Set(['gemini apps', 'bard', 'gemini', '']);

interface ActivityRecord {
  header?: string;
  title?: string;
  titleUrl?: string;
  time?: string;
  subtitles?: Array<{ name?: string }>;
  description?: string;
  response?: string;
  answer?: string;
}

interface ConvFormConversation {
  id?: string;
  conversation_id?: string;
  title?: string;
  create_time?: unknown;
  created?: unknown;
  time?: unknown;
  entries?: TurnEntry[];
  messages?: TurnEntry[];
  turns?: TurnEntry[];
}

interface TurnEntry {
  role?: string;
  author?: string;
  text?: string;
  content?: string;
}

function normRole(v: string | undefined): 'user' | 'assistant' {
  const r = (v ?? '').trim().toLowerCase();
  if (r === 'user' || r === 'you' || r === 'human' || r === 'david') return 'user';
  return 'assistant';
}

function extractResponse(r: ActivityRecord): string {
  if (Array.isArray(r.subtitles)) {
    const joined = r.subtitles
      .map((s) => cleanText(s?.name))
      .filter(Boolean)
      .join('\n');
    if (joined) return joined;
  }
  for (const key of ['response', 'answer', 'description'] as const) {
    const v = r[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function parseGeminiActivity(raw: unknown): {
  conversations: ImportConversation[];
  stats: { records: number; kept: number; skippedNonGemini: number; withoutResponse: number; messages: number };
} {
  const records = Array.isArray(raw) ? (raw as ActivityRecord[]) : [];
  const groups = new Map<string, ActivityRecord[]>();
  let kept = 0;
  let skipped = 0;
  let order = 0;

  for (const r of records) {
    const header = cleanText(r.header).toLowerCase();
    if (header && !GEMINI_HEADERS.has(header)) { skipped++; continue; }
    kept++;
    const m = APP_ID_RE.exec(r.titleUrl ?? '');
    const cid = m ? m[1] : `activity-${order++}`;
    const bucket = groups.get(cid);
    if (bucket) bucket.push(r);
    else groups.set(cid, [r]);
  }

  const conversations: ImportConversation[] = [];
  let withoutResponse = 0;
  let messageCount = 0;

  for (const [cid, recs] of groups) {
    // 同一会话内按时间排序
    recs.sort((a, b) => (toMs(a.time) ?? 0) - (toMs(b.time) ?? 0));
    const msgs: ImportConversation['messages'] = [];
    let firstPrompt = '';
    let hasResponse = false;

    for (const r of recs) {
      const prompt = cleanText(r.title).replace(PROMPTED_PREFIX_RE, '').trim();
      if (prompt) {
        msgs.push({ role: 'user', content: prompt, createdAt: toMs(r.time) });
        firstPrompt = firstPrompt || prompt;
      }
      const response = extractResponse(r);
      if (response) {
        msgs.push({ role: 'assistant', content: response, createdAt: toMs(r.time) });
        hasResponse = true;
      }
    }
    if (!msgs.length) continue;
    if (!hasResponse) withoutResponse++;
    messageCount += msgs.length;
    conversations.push({
      sourceId: cid,
      title: firstPrompt ? firstPrompt.slice(0, 60) : titleFromMessages(msgs),
      createdAt: toMs(recs[0]?.time),
      messages: msgs,
      meta: {
        format: 'gemini-activity',
        note: hasResponse ? undefined : 'My Activity 导出仅含提问，无模型回复',
      },
    });
  }

  return {
    conversations,
    stats: { records: records.length, kept, skippedNonGemini: skipped, withoutResponse, messages: messageCount },
  };
}

export function parseGeminiConversations(raw: unknown): {
  conversations: ImportConversation[];
  stats: { total: number; withoutResponse: number; messages: number };
} {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { conversations?: unknown[] }).conversations)
      ? ((raw as { conversations: unknown[] }).conversations)
      : [];
  const conversations: ImportConversation[] = [];
  let withoutResponse = 0;
  let messageCount = 0;

  (list as ConvFormConversation[]).forEach((c, idx) => {
    const entries = c.entries ?? c.messages ?? c.turns ?? [];
    const msgs: ImportConversation['messages'] = [];
    for (const e of entries) {
      const role = normRole(e.role ?? e.author);
      const text = cleanText(e.text ?? e.content);
      if (!text) continue;
      msgs.push({ role, content: text });
    }
    if (!msgs.length) return;
    if (!msgs.some((m) => m.role === 'assistant' && m.content.trim())) withoutResponse++;
    messageCount += msgs.length;
    conversations.push({
      sourceId: cleanText(c.id ?? c.conversation_id) || `takeout-${idx}`,
      title: cleanText(c.title) || titleFromMessages(msgs),
      createdAt: toMs(c.create_time) ?? toMs(c.created) ?? toMs(c.time),
      messages: msgs,
      meta: { format: 'gemini-conversations' },
    });
  });

  return { conversations, stats: { total: list.length, withoutResponse, messages: messageCount } };
}

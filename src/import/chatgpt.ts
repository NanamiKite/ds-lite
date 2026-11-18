/**
 * ChatGPT / DeepSeek 官方导出的 conversations.json 解析器
 *
 * 结构（ChatGPT Data Export，DeepSeek 官方导出为兼容格式）:
 * [
 *   {
 *     title, create_time (unix 秒), update_time,
 *     current_node: "<uuid>",
 *     mapping: {
 *       "<uuid>": {
 *         id, parent: "<uuid>"|null, children: ["<uuid>"],
 *         message: {
 *           author: { role: "user"|"assistant"|"system"|"tool" },
 *           create_time, content: { content_type: "text", parts: ["..."] },
 *           metadata: {...}
 *         } | null
 *       }, ...
 *     }
 *   }, ...
 * ]
 *
 * 还原对话：沿 current_node 向上回溯到根节点，取活跃分支。
 */
import { cleanText, titleFromMessages, toMs, type ExportFormat } from './types';
import type { ImportConversation } from '@/db/repo';

interface CgContent {
  content_type?: string;
  parts?: unknown[];
}

interface CgMessage {
  author?: { role?: string };
  create_time?: number | null;
  content?: CgContent | null;
  status?: string;
  metadata?: Record<string, unknown>;
}

interface CgNode {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: CgMessage | null;
}

interface CgConversation {
  title?: string | null;
  create_time?: number | null;
  update_time?: number | null;
  current_node?: string | null;
  default_model_slug?: string;
  mapping?: Record<string, CgNode>;
}

function extractText(content?: CgContent | null): string {
  if (!content) return '';
  const parts = content.parts ?? [];
  // parts 可能混有字符串与图片指针对象（multimodal），只取字符串
  return parts.filter((p): p is string => typeof p === 'string').join('\n').trim();
}

/** 从 current_node 回溯到根，得到活跃路径节点序列 */
function activePath(mapping: Record<string, CgNode>, currentNode: string | null | undefined): CgNode[] {
  const path: CgNode[] = [];
  let cursorId = currentNode ?? null;
  const seen = new Set<string>();
  while (cursorId && mapping[cursorId] && !seen.has(cursorId)) {
    seen.add(cursorId);
    const node = mapping[cursorId];
    path.push(node);
    cursorId = node.parent ?? null;
  }
  return path.reverse();
}

/** 无 current_node 时：从根沿子节点下钻（优先最后一个子节点） */
function fallbackPath(mapping: Record<string, CgNode>): CgNode[] {
  const roots = Object.values(mapping).filter((n) => !n.parent);
  if (!roots.length) return [];
  const path: CgNode[] = [];
  let node: CgNode | undefined = roots[0];
  const seen = new Set<string>();
  while (node && !seen.has(node.id ?? '')) {
    seen.add(node.id ?? '');
    path.push(node);
    const kids: CgNode[] = (node.children ?? [])
      .map((id) => mapping[id])
      .filter((n): n is CgNode => !!n);
    node = kids.length ? kids[kids.length - 1] : undefined;
  }
  return path;
}

export function parseChatGptConversations(
  raw: unknown,
  format: ExportFormat = 'chatgpt-conversations'
): { conversations: ImportConversation[]; stats: { total: number; messages: number } } {
  const list = Array.isArray(raw) ? raw : [];
  const conversations: ImportConversation[] = [];
  let messageCount = 0;

  for (const conv of list as CgConversation[]) {
    const mapping = conv.mapping ?? {};
    const nodes = activePath(mapping, conv.current_node);
    const path = nodes.length ? nodes : fallbackPath(mapping);

    const msgs: ImportConversation['messages'] = [];
    for (const node of path) {
      const m = node.message;
      if (!m) continue;
      const role = m.author?.role;
      if (role !== 'user' && role !== 'assistant') continue;
      const text = extractText(m.content);
      if (!text) continue;
      msgs.push({
        role,
        content: text,
        createdAt: toMs(m.create_time) ?? toMs(conv.create_time),
      });
    }
    if (!msgs.length) continue;
    messageCount += msgs.length;
    const model = cleanText(conv.default_model_slug) || null;
    conversations.push({
      sourceId: null, // ChatGPT 导出数组中无稳定 id 字段，幂等去重靠消息指纹见 index.ts
      title: cleanText(conv.title) || titleFromMessages(msgs),
      createdAt: toMs(conv.create_time) ?? toMs(conv.update_time),
      messages: msgs,
      meta: { format, sourceModel: model },
    });
  }

  return { conversations, stats: { total: list.length, messages: messageCount } };
}

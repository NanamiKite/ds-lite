/**
 * 单次请求消息组装（纯逻辑，可测）
 *
 * 缓存友好设计（配合 DeepSeek 自动前缀缓存，命中部分约 1/10 计费）：
 * 1. system 固定段（人设+个性+记忆）尽量不变 → 前缀稳定
 * 2. 预算内发送全量历史（追加式）→ 每轮只在尾部追加，前缀全部命中缓存
 * 3. 超出 token 预算才从头裁剪，被裁部分交给滚动摘要（summary）承接
 * 4. 联网搜索由服务端工具完成（不进提示词），历史思维链按需回传
 */
import type { ApiChatMessage } from '@/types';

/** 粗估 token：中文约 0.6 token/字，混合场景取保守值 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.6) + 4;
}

export interface HistoryItem {
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string | null;
}

export interface AssembleInput {
  /** 稳定 system 段：基础人设 + 个性 + 记忆 */
  systemPrompt: string;
  /** 旧对话滚动摘要（已覆盖 seq <= summarySeq 的消息） */
  summary?: string | null;
  summarySeq?: number;
  /** 全部历史（seq 升序） */
  history: HistoryItem[];
  /** 上下文 token 预算 */
  tokenBudget: number;
  /** 声明联网工具时为 true：assistant 历史需回传 reasoning_content */
  includeReasoning?: boolean;
  /** 给回复预留的 token */
  reserveTokens?: number;
}

export interface AssembledTurn {
  messages: ApiChatMessage[];
  /** 因超预算被裁掉、尚未被摘要覆盖的消息数（摘要器据此触发） */
  droppedCount: number;
  droppedThroughSeq: number;
}

export function assembleTurnMessages(input: AssembleInput): AssembledTurn {
  const { systemPrompt, summary, tokenBudget } = input;
  const summarySeq = input.summarySeq ?? 0;
  const reserve = input.reserveTokens ?? 1500;

  const summaryMsg = summary?.trim()
    ? `以下是本对话较早内容的自动摘要（原始消息已省略）：\n${summary.trim()}`
    : null;

  // 预算：system + 摘要 + 回复预留 先扣掉
  let budget = tokenBudget - reserve;
  budget -= estimateTokens(systemPrompt);
  if (summaryMsg) budget -= estimateTokens(summaryMsg);

  // 从尾部往前保留，直到预算耗尽；cut = 保留部分的起始下标（0 = 全保留）
  const beyond = input.history.filter((h) => h.seq > summarySeq);
  let cut = 0;
  let used = 0;
  for (let i = beyond.length - 1; i >= 0; i--) {
    const cost = estimateTokens(beyond[i].content) + 4;
    if (used + cost > budget) { cut = i + 1; break; }
    used += cost;
  }
  const keptFinal = beyond.slice(Math.min(cut, beyond.length));
  const droppedItems = beyond.slice(0, Math.min(cut, beyond.length));
  // 兜底：单条超预算时至少保留最后一条，避免空上下文
  const keptSafe = keptFinal.length ? keptFinal : beyond.slice(-1);
  const droppedCount = beyond.length - keptSafe.length;
  const droppedThroughSeq = droppedCount > 0 && droppedItems.length ? droppedItems[droppedItems.length - 1].seq : summarySeq;

  const messages: ApiChatMessage[] = [{ role: 'system', content: systemPrompt }];
  if (summaryMsg) messages.push({ role: 'system', content: summaryMsg });
  for (const h of keptSafe) {
    if (h.role === 'assistant' && input.includeReasoning && h.reasoning) {
      messages.push({ role: h.role, content: h.content, reasoning_content: h.reasoning });
    } else {
      messages.push({ role: h.role, content: h.content });
    }
  }
  return { messages, droppedCount, droppedThroughSeq };
}

/** 组装"压缩请求"的消息：把即将被裁掉的历史压成要点摘要 */
export function buildSummaryPrompt(items: HistoryItem[], previousSummary: string | null): ApiChatMessage[] {
  const transcript = items
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n')
    .slice(-12000);
  return [
    {
      role: 'system',
      content:
        '你是对话压缩器。把输入的多轮对话压缩成要点摘要，供后续对话作为背景。保留：用户的目标与身份信息、关键事实与数据、已达成的决定与结论、尚未解决的问题。省略寒暄与重复。输出不超过 300 字的要点式中文摘要，不要任何额外说明。',
    },
    {
      role: 'user',
      content: `${previousSummary ? `已有前情摘要（在此基础上合并更新）：\n${previousSummary}\n\n` : ''}需要压缩的对话：\n${transcript}`,
    },
  ];
}

/** 组装"会话摘要"请求：用户可见的整段对话内容概括（话题/人物设定/进展） */
export function buildDigestPrompt(items: HistoryItem[], previousDigest: string | null): ApiChatMessage[] {
  const transcript = items
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content.slice(0, 2000)}`)
    .join('\n')
    .slice(-10000);
  return [
    {
      role: 'system',
      content:
        '你是对话内容摘要器。为一段完整的对话写一段供用户回顾与分享的中文摘要，不超过 120 字。涵盖：对话主题；如有人设/角色扮演/剧情设定，概括人物与世界观；当前进展或结论。直接输出摘要正文，不要标题、引号或任何额外说明。',
    },
    {
      role: 'user',
      content: `${previousDigest ? `已有旧摘要（在其基础上合并更新，保持连贯）：\n${previousDigest}\n\n` : ''}对话内容：\n${transcript}`,
    },
  ];
}

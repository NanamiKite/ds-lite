/**
 * 聊天引擎：发送、流式接收、深度思考、官方联网搜索、中断、重新生成
 * 模型: deepseek-flash（thinking 参数控制思考模式；联网搜索为服务端工具
 * deepseek_web_search，引用通过 annotations 返回；会话标题用官方 title 能力）
 * 上下文策略（缓存友好，见 src/chat/assemble.ts）：
 *   稳定 system（人设+个性+记忆） → 滚动摘要 → 预算内全量历史（追加式，命中前缀缓存）
 *   → 超预算部分后台压缩成摘要；声明联网工具时历史回传 reasoning_content
 */
import { create } from 'zustand';
import { MODEL_FLASH, DeepSeekError, chatOnce, streamChat } from '@/api/deepseek';
import {
  appendMessage,
  deleteMessagesFromSeq,
  getSession,
  lastMessage,
  listMessages,
  renameSession,
  touchSession,
  updateMessage,
  updateSessionDigest,
  updateSessionSummary,
} from '@/db/repo';
import { getApiKey } from '@/storage/secure';
import { addMemory, listMemories } from '@/db/memoryRepo';
import { dedupeMemories } from '@/memory/parse';
import { buildCrossChatPrompt, buildMemoryPrompt, buildPersonaPrompt, composeSystemPrompt } from '@/memory/prompt';
import { extractMemories } from '@/memory/auto';
import { listRecentDigests } from '@/db/repo';
import {
  assembleTurnMessages,
  buildDigestPrompt,
  buildSummaryPrompt,
  type HistoryItem,
} from '@/chat/assemble';
import { useSettings } from './settings';
import type { ApiChatMessage, SearchResult } from '@/types';

export interface SendOptions {
  thinking: boolean;
  search: boolean;
}

interface LiveStream {
  sessionId: string;
  messageId: string;
  content: string;
  reasoning: string;
  status: 'streaming' | 'error' | 'stopped';
  model: string;
  search?: { query: string; results: SearchResult[] };
  error?: string;
}

interface ChatStore {
  live: LiveStream | null;
  /** 递增触发界面刷新流式消息 */
  tick: number;
  busySession: string | null;
  abortController: AbortController | null;
  /** 自动记忆提取结果提示（聊天页 toast 用） */
  memoryToast: { items: string[]; at: number } | null;
  /** 等待续发的排队消息数 */
  queueCount: number;

  send(sessionId: string, text: string, opts: SendOptions): Promise<void>;
  regenerate(sessionId: string, opts: SendOptions): Promise<void>;
  stop(): void;
  clearLive(): void;
  clearMemoryToast(): void;
}

const SYSTEM_PROMPT = '你是 DeepSeek，一个忠于事实、乐于助人的 AI 助手。';

interface BuiltContext {
  apiMessages: ApiChatMessage[];
  dropped: HistoryItem[];
  droppedThroughSeq: number;
}

/** 组装单次请求：稳定 system + 摘要 + 预算内历史（联网走服务端工具，不进提示词） */
function buildContext(sessionId: string, opts: SendOptions): BuiltContext {
  const settings = useSettings.getState();
  const session = getSession(sessionId);
  const history: HistoryItem[] = listMessages(sessionId)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
    .map((m) => ({
      seq: m.seq,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      reasoning: m.reasoning,
    }));

  // 稳定段：人设 + 个性 + 记忆（不含易变内容，保证前缀缓存命中）
  // 对话级开关：session.memoryEnabled === false 时本对话不注入记忆
  const persona = buildPersonaPrompt({
    enabled: settings.personaEnabled,
    about: settings.personaAbout,
    style: settings.personaStyle,
  });
  const memories = settings.memoryMode !== 'off' && session?.memoryEnabled !== false
    ? buildMemoryPrompt(listMemories({ onlyActive: true }).map((m) => m.content))
    : '';
  // 跨对话参考：近期其他对话的摘要注入（开关控制，排除对话级关闭记忆的会话）
  const crossChat = settings.crossChatReference && session?.memoryEnabled !== false
    ? buildCrossChatPrompt(
        listRecentDigests(sessionId).map((d) => ({ title: d.title, digest: d.digest }))
      )
    : '';
  const systemPrompt = composeSystemPrompt({ base: SYSTEM_PROMPT, persona, memories, crossChat });

  const assembled = assembleTurnMessages({
    systemPrompt,
    summary: session?.summary ?? null,
    summarySeq: session?.summarySeq ?? 0,
    history,
    tokenBudget: settings.contextTokens,
    // 声明联网工具的请求需回传历史思维链（DeepSeek 要求）
    includeReasoning: opts.search,
  });

  const summarySeq = session?.summarySeq ?? 0;
  const dropped = history.filter(
    (h) => h.seq > summarySeq && h.seq <= assembled.droppedThroughSeq && assembled.droppedCount > 0
  );
  return { apiMessages: assembled.messages, dropped, droppedThroughSeq: assembled.droppedThroughSeq };
}

/** 单条超长内容的兜底裁剪（如超长导入消息） */
function clampHistoryForSummary(items: HistoryItem[]): HistoryItem[] {
  return items.map((h) => ({ ...h, content: h.content.slice(0, 4000) }));
}

export const useChatStore = create<ChatStore>()((set, get) => {
  /** 发送队列：回复进行中收到的新消息，当前回复结束后自动续发（stop/出错时清空） */
  const pendingQueue: Array<{ sessionId: string; text: string; opts: SendOptions }> = [];

  async function runCompletion(sessionId: string, opts: SendOptions): Promise<void> {
    const key = await getApiKey();
    let outcome: 'done' | 'error' | 'stopped' = 'error';

    const finishAll = () => {
      set({ live: null, abortController: null, busySession: null, tick: get().tick + 1 });
    };

    if (!key) {
      const msg = appendMessage(sessionId, {
        role: 'assistant',
        content: '',
        status: 'error',
        error: '尚未绑定 API Key，请到「设置」绑定后再试',
      });
      pendingQueue.length = 0;
      set({
        queueCount: 0,
        busySession: null,
        live: { sessionId, messageId: msg.id, content: '', reasoning: '', status: 'error', model: MODEL_FLASH, error: msg.error ?? undefined },
      });
      return;
    }

    const ctx = buildContext(sessionId, opts);
    const session = getSession(sessionId);
    const needTitle = !session?.title || session.title === '新对话';
    let titleSet = false;

    const message = appendMessage(sessionId, { role: 'assistant', content: '', status: 'streaming' });
    let live: LiveStream = {
      sessionId,
      messageId: message.id,
      content: '',
      reasoning: '',
      status: 'streaming',
      model: MODEL_FLASH,
    };
    set({ live });

    const startedAt = Date.now();
    const searchResults: SearchResult[] = [];
    const meta = () => ({
      model: MODEL_FLASH,
      elapsedMs: Date.now() - startedAt,
      search: searchResults.length ? { query: '联网搜索', results: searchResults } : undefined,
    });

    let content = '';
    let reasoning = '';
    let lastFlush = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFlush = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        updateMessage(message.id, { content, reasoning: reasoning || null, status: 'streaming', meta: meta() });
      }, 700);
    };

    const ac = new AbortController();
    set({ abortController: ac });

    try {
      await streamChat({
        apiKey: key,
        model: MODEL_FLASH,
        messages: ctx.apiMessages,
        signal: ac.signal,
        thinking: opts.thinking,
        tools: opts.search ? [{ type: 'deepseek_web_search', name: 'deepseek_web_search' }] : undefined,
        requestTitle: needTitle,
        includeUsage: true,
        callbacks: {
          onContent: (d) => {
            content += d;
            live = { ...live, content };
            set({ live, tick: get().tick + 1 });
            if (Date.now() - lastFlush > 700) { lastFlush = Date.now(); scheduleFlush(); }
          },
          onReasoning: (d) => {
            reasoning += d;
            live = { ...live, reasoning };
            set({ live, tick: get().tick + 1 });
          },
          onAnnotations: (fresh) => {
            searchResults.push(...fresh);
            live = { ...live, search: { query: '联网搜索', results: [...searchResults] } };
            set({ live, tick: get().tick + 1 });
          },
          onTitle: (title) => {
            titleSet = true;
            if (title.trim()) renameSession(sessionId, title.trim().slice(0, 60));
          },
        },
      });
      updateMessage(message.id, {
        content,
        reasoning: reasoning || null,
        status: 'done',
        error: null,
        meta: meta(),
      });
      outcome = 'done';
      finishAll();
      // 后台任务：自动记忆提取 + 滚动摘要压缩 + 会话摘要更新（不阻塞界面）
      void maybeExtractMemories(sessionId, ctx.apiMessages, content, key);
      void maybeSummarize(sessionId, key, ctx);
      void maybeDigest(sessionId, key);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      const msg = aborted
        ? '已停止'
        : e instanceof DeepSeekError
          ? e.message
          : `请求失败：${e instanceof Error ? e.message : String(e)}`;
      outcome = aborted ? 'stopped' : 'error';
      live = { ...live, status: aborted ? 'stopped' : 'error', error: msg };
      updateMessage(message.id, {
        content,
        reasoning: reasoning || null,
        status: aborted ? 'stopped' : 'error',
        error: msg,
      });
      finishAll();
    } finally {
      if (timer) clearTimeout(timer);
      // 官方标题未返回时兜底：用首条用户消息命名
      if (needTitle && !titleSet) {
        const lastUser = [...ctx.apiMessages].reverse().find((m) => m.role === 'user');
        if (lastUser) renameSession(sessionId, lastUser.content.replace(/\s+/g, ' ').slice(0, 40));
      }
      touchSession(sessionId, MODEL_FLASH);
      // 队列续发：正常完成 → 发下一条；停止/出错 → 清空队列（消息保留在历史，可手动重发）
      if (outcome === 'done') void drainQueue();
      else {
        pendingQueue.length = 0;
        set({ queueCount: 0 });
      }
    }
  }

  /** 队列续发 */
  async function drainQueue(): Promise<void> {
    if (get().busySession) return;
    const next = pendingQueue.shift();
    set({ queueCount: pendingQueue.length });
    if (!next) return;
    set({ busySession: next.sessionId });
    await runCompletion(next.sessionId, next.opts);
  }

  let extracting = false;
  /** 自动记忆：每轮完成后提取一次，去重入库并触发 toast；对话级关闭时不提取 */
  async function maybeExtractMemories(
    sessionId: string,
    apiMessages: ApiChatMessage[],
    assistantContent: string,
    apiKey: string
  ): Promise<void> {
    if (useSettings.getState().memoryMode !== 'auto' || extracting) return;
    const session = getSession(sessionId);
    if (session?.memoryEnabled === false) return;
    const lastUser = [...apiMessages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    extracting = true;
    try {
      const facts = await extractMemories(apiKey, lastUser.content, assistantContent);
      if (!facts.length) return;
      const existing = listMemories().map((m) => m.content);
      const fresh = dedupeMemories(existing, facts);
      if (!fresh.length) return;
      fresh.forEach((f) => addMemory(f, 'auto'));
      set({ memoryToast: { items: fresh, at: Date.now() } });
    } catch {
      // 提取失败静默跳过，不影响对话
    } finally {
      extracting = false;
    }
  }

  let summarizing = false;
  /** 滚动摘要：被预算裁掉的历史压缩成摘要（≥8 条才值得压缩），下次请求以摘要携带 */
  async function maybeSummarize(sessionId: string, apiKey: string, ctx: BuiltContext): Promise<void> {
    if (summarizing || ctx.dropped.length < 8) return;
    summarizing = true;
    try {
      const session = getSession(sessionId);
      const { content } = await chatOnce({
        apiKey,
        model: MODEL_FLASH,
        thinking: false,
        temperature: 0.3,
        messages: buildSummaryPrompt(clampHistoryForSummary(ctx.dropped), session?.summary ?? null),
        callbacks: undefined,
      });
      const merged = content.trim().slice(0, 1200);
      if (merged.length >= 20) {
        updateSessionSummary(sessionId, merged, ctx.droppedThroughSeq);
      }
    } catch {
      // 摘要失败静默跳过：下次超预算时会再尝试
    } finally {
      summarizing = false;
    }
  }

  let digesting = false;
  /**
   * 会话摘要：为用户可见的内容概括（话题/人物设定/进展）。
   * 自动模式：无摘要时 ≥6 条触发；有摘要时新消息 ≥8 条滚动更新。
   */
  async function maybeDigest(sessionId: string, apiKey: string, minCount?: number): Promise<void> {
    if (digesting) return;
    digesting = true;
    try {
      const session = getSession(sessionId);
      const digestSeq = session?.digestSeq ?? 0;
      const items: HistoryItem[] = listMessages(sessionId)
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim() && m.seq > digestSeq)
        .map((m) => ({ seq: m.seq, role: m.role as 'user' | 'assistant', content: m.content }));
      if (!items.length) return;
      const need = minCount ?? (session?.digest ? 8 : 6);
      if (items.length < need) return;
      const { content } = await chatOnce({
        apiKey,
        model: MODEL_FLASH,
        thinking: false,
        temperature: 0.3,
        messages: buildDigestPrompt(items, session?.digest ?? null),
        callbacks: undefined,
      });
      const digest = content.trim().slice(0, 400);
      if (digest.length >= 10) {
        updateSessionDigest(sessionId, digest, items[items.length - 1].seq);
      }
    } catch {
      // 摘要失败静默跳过
    } finally {
      digesting = false;
    }
  }

  return {
    live: null,
    tick: 0,
    busySession: null,
    abortController: null,
    memoryToast: null,
    queueCount: 0,

    send: async (sessionId, text, opts) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // 用户消息立即插入并刷新界面（不等模型）
      appendMessage(sessionId, { role: 'user', content: trimmed });
      set({ tick: get().tick + 1 });
      touchSession(sessionId);

      // 正在回复 → 入队，当前回复结束后自动续发
      if (get().busySession) {
        pendingQueue.push({ sessionId, text: trimmed, opts });
        set({ queueCount: pendingQueue.length });
        return;
      }
      set({ busySession: sessionId });
      await runCompletion(sessionId, opts);
    },

    regenerate: async (sessionId, opts) => {
      if (get().busySession) return;
      const last = lastMessage(sessionId);
      if (!last) return;
      set({ busySession: sessionId });
      if (last.role === 'assistant') {
        deleteMessagesFromSeq(sessionId, last.seq);
      }
      await runCompletion(sessionId, opts);
    },

    stop: () => {
      const { abortController, live } = get();
      // 中止当前回复，同时取消排队中的消息（消息保留在历史，可再发）
      pendingQueue.length = 0;
      set({ queueCount: 0 });
      abortController?.abort();
      if (live) set({ live: { ...live, status: 'stopped' } });
    },

    clearLive: () => set({ live: null }),

    clearMemoryToast: () => set({ memoryToast: null }),
  };
});

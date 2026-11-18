/**
 * DeepSeek OpenAPI 客户端
 * 文档: https://api-docs.deepseek.com/
 * - 模型: deepseek-flash / deepseek-v4-pro（思考模式由 thinking 参数控制）
 * - 联网搜索: 服务端工具 deepseek_web_search（tools 声明，服务端搜索并返回 annotations 引用）
 * - 流式: SSE (data: {...}\n\n)，思维链在 reasoning_content
 * 使用 expo/fetch —— 原生流式实现，支持 ReadableStream 与 AbortSignal。
 */
import { fetch } from 'expo/fetch';
import { createSseParser } from './sse';
import type { ApiChatMessage, SearchResult, Usage } from '@/types';

export const DEEPSEEK_BASE = 'https://api.deepseek.com';
export const MODEL_FLASH = 'deepseek-flash';
export const MODEL_PRO = 'deepseek-v4-pro';

export class DeepSeekError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'DeepSeekError';
  }
}

function friendlyError(status: number, raw?: string): DeepSeekError {
  let detail = raw;
  try {
    const j = JSON.parse(raw ?? '');
    detail = j?.error?.message ?? j?.message ?? raw;
  } catch { /* keep raw */ }
  const map: Record<number, string> = {
    400: `请求无效：${detail ?? '参数错误'}`,
    401: 'API Key 无效或已过期，请检查后重新绑定',
    402: '账户余额不足，请前往 platform.deepseek.com 充值',
    404: `接口不存在：${detail ?? ''}`,
    422: `参数无法处理：${detail ?? ''}`,
    429: '请求过于频繁，请稍后再试',
    500: 'DeepSeek 服务暂时不可用，请稍后再试',
    503: 'DeepSeek 服务维护中，请稍后再试',
  };
  return new DeepSeekError(map[status] ?? `请求失败 (HTTP ${status})${detail ? `：${detail}` : ''}`, status);
}

async function parseErrorBody(res: Response): Promise<DeepSeekError> {
  let raw = '';
  try { raw = await res.text(); } catch { /* ignore */ }
  return friendlyError(res.status, raw);
}

// ---------------------------------------------------------------------------
// Key 校验与账户信息
// ---------------------------------------------------------------------------

export interface KeyValidation {
  ok: boolean;
  models: string[];
  balance?: { currency: string; amount: string };
  error?: string;
}

/** 校验 API Key：GET /models，再顺带取余额展示 */
export async function validateKey(apiKey: string): Promise<KeyValidation> {
  try {
    const res = await fetch(`${DEEPSEEK_BASE}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const err = await parseErrorBody(res);
      return { ok: false, models: [], error: err.message };
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    const models = (data.data ?? []).map((m) => m.id);
    let balance: KeyValidation['balance'];
    try {
      const bRes = await fetch(`${DEEPSEEK_BASE}/user/balance`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (bRes.ok) {
        const b = (await bRes.json()) as {
          balance_infos?: { currency: string; total_balance: string }[];
        };
        const first = b.balance_infos?.[0];
        if (first) balance = { currency: first.currency, amount: first.total_balance };
      }
    } catch { /* 余额获取失败不影响校验 */ }
    return { ok: true, models, balance };
  } catch (e) {
    return { ok: false, models: [], error: `网络错误：${e instanceof Error ? e.message : String(e)}` };
  }
}

// ---------------------------------------------------------------------------
// 流式对话
// ---------------------------------------------------------------------------

export interface Annotation {
  url?: string;
  title?: string | null;
  type?: string;
}

export interface StreamCallbacks {
  onReasoning?: (delta: string) => void;
  onContent?: (delta: string) => void;
  onUsage?: (usage: Usage) => void;
  onModel?: (model: string) => void;
  /** 联网搜索引用（annotations），逐步累积下发 */
  onAnnotations?: (results: SearchResult[]) => void;
  /** 官方会话标题（title.enabled 时返回一次） */
  onTitle?: (title: string) => void;
}

export interface ServerTool {
  type: 'deepseek_web_search' | 'deepseek_read_url';
  name?: string;
}

export interface StreamChatOptions {
  apiKey: string;
  model: string;
  messages: ApiChatMessage[];
  signal?: AbortSignal;
  /** 思考模式开关；省略时由服务端默认（开启） */
  thinking?: boolean;
  /** 声明服务端联网工具（是否搜索由模型判断） */
  tools?: ServerTool[];
  /** 返回官方生成的会话标题 */
  requestTitle?: boolean;
  temperature?: number;
  includeUsage?: boolean;
  callbacks?: StreamCallbacks;
}

/** 非流式调用（工具类轻量请求：记忆提取/摘要等） */
export async function chatOnce(opts: StreamChatOptions): Promise<{
  content: string;
  usage?: Usage;
  annotations?: SearchResult[];
}> {
  const res = await requestChat(opts, false);
  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        annotations?: Annotation[];
      };
    }[];
    usage?: Usage;
  };
  const annotations = (data.choices?.[0]?.message?.annotations ?? [])
    .filter((a) => a.url)
    .map((a) => ({ title: a.title ?? a.url ?? '', url: a.url ?? '' }));
  return { content: data.choices?.[0]?.message?.content ?? '', usage: data.usage, annotations };
}

export async function streamChat(opts: StreamChatOptions): Promise<void> {
  const res = await requestChat(opts, true);
  const body = res.body;
  if (!body) throw new DeepSeekError('当前环境不支持流式响应');

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  const sse = createSseParser();
  const seenUrls = new Set<string>();

  const handleEvent = (dataStr: string) => {
    if (dataStr === '[DONE]') return;
    let json: {
      model?: string;
      title?: string;
      error?: { message?: string; type?: string };
      choices?: {
        finish_reason?: string | null;
        delta?: {
          content?: string | null;
          reasoning_content?: string | null;
          annotations?: Annotation[];
          title?: string;
        };
      }[];
      usage?: Usage;
    };
    try {
      json = JSON.parse(dataStr);
    } catch {
      return;
    }
    // 生成开始后出错：最后一个 chunk 带 error
    if (json.error?.message) {
      throw new DeepSeekError(json.error.message);
    }
    if (json.model) opts.callbacks?.onModel?.(json.model);
    if (json.title) opts.callbacks?.onTitle?.(json.title);
    if (json.usage) opts.callbacks?.onUsage?.(json.usage);
    const choice = json.choices?.[0];
    if (choice?.delta?.title) opts.callbacks?.onTitle?.(choice.delta.title);
    const delta = choice?.delta;
    if (delta?.reasoning_content) opts.callbacks?.onReasoning?.(delta.reasoning_content);
    if (delta?.content) opts.callbacks?.onContent?.(delta.content);
    if (delta?.annotations?.length) {
      const fresh: SearchResult[] = [];
      for (const a of delta.annotations) {
        if (a.url && !seenUrls.has(a.url)) {
          seenUrls.add(a.url);
          fresh.push({ title: a.title || a.url, url: a.url });
        }
      }
      if (fresh.length) opts.callbacks?.onAnnotations?.(fresh);
    }
    if (choice?.finish_reason === 'content_filter') {
      throw new DeepSeekError('回复被内容安全过滤，请调整提问后重试');
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const ev of sse.push(decoder.decode(value, { stream: true }))) {
        handleEvent(ev.data);
      }
    }
    for (const ev of sse.flush()) handleEvent(ev.data);
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

async function requestChat(opts: StreamChatOptions, stream: boolean): Promise<Response> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream,
  };
  if (opts.thinking !== undefined) body.thinking = { type: opts.thinking ? 'enabled' : 'disabled' };
  if (opts.tools?.length) body.tools = opts.tools;
  if (opts.requestTitle) body.title = { enabled: true };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (stream && opts.includeUsage) body.stream_options = { include_usage: true };

  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw await parseErrorBody(res);
  return res;
}

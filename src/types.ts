/**
 * deepseek-lite 共享领域类型
 */

export type Role = 'user' | 'assistant' | 'system';

/** 会话来源：本地新建，或从某平台导入 */
export type SessionSource = 'local' | 'chatgpt' | 'gemini' | 'deepseek';

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** DeepSeek 前缀缓存命中/未命中 token（命中部分约 1/10 计费） */
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface MessageMeta {
  model?: string;
  usage?: Usage;
  /** 联网搜索增强：搜索词与来源 */
  search?: { query: string; results: SearchResult[] };
  elapsedMs?: number;
  /** 导入消息保留的原始模型名 */
  sourceModel?: string;
}

/** 导入会话保留的源平台元信息 */
export interface ImportedMeta {
  sourceModel?: string | null;
  thinkingEnabled?: boolean | null;
  searchEnabled?: boolean | null;
  format?: string;
  note?: string;
}

export interface Session {
  id: string;
  title: string;
  source: SessionSource;
  /** 源平台的会话 id，用于幂等导入（重复导入自动跳过） */
  sourceSessionId: string | null;
  model: string | null;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  importedMeta: ImportedMeta | null;
  /** 滚动摘要：旧对话压缩文本（覆盖 seq <= summarySeq 的消息） */
  summary?: string | null;
  summarySeq?: number;
  /** 会话内容摘要（用户可见，120字左右：话题/人物设定/进展） */
  digest?: string | null;
  digestSeq?: number;
  /** 对话级记忆开关：null=跟随全局默认，false=本对话不注入不提取 */
  memoryEnabled?: boolean | null;
}

export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error' | 'stopped';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  reasoning: string | null;
  createdAt: number;
  status: MessageStatus;
  error: string | null;
  seq: number;
  meta: MessageMeta | null;
}

/** 发送给 API 的消息（纯文本，不含内部状态） */
export interface ApiChatMessage {
  role: Role;
  content: string;
  /** 声明联网工具的请求需回传历史思维链（DeepSeek 要求） */
  reasoning_content?: string;
}

export const SOURCE_LABEL: Record<SessionSource, string> = {
  local: '本地',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
};

export const SOURCE_COLOR: Record<SessionSource, string> = {
  local: '#4D6BFE',
  chatgpt: '#10A37F',
  gemini: '#886FE4',
  deepseek: '#1B6EF3',
};

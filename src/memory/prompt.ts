/**
 * 系统提示词组装（纯逻辑，可在 Node 中测试）
 *
 * 结构：基础人设 → 个性（自定义指令） → 长期记忆 → 联网搜索上下文
 * 各段仅在非空时拼接，保持提示词紧凑。
 */

export const MAX_MEMORIES_IN_PROMPT = 30;
export const MAX_MEMORY_LENGTH = 120;

export interface PersonaConfig {
  enabled: boolean;
  /** 关于我：身份/背景/约束（ChatGPT Custom Instructions 第一栏） */
  about: string;
  /** 回复风格：希望模型如何回应（第二栏） */
  style: string;
}

export function buildPersonaPrompt(p: PersonaConfig): string {
  if (!p.enabled) return '';
  const parts: string[] = [];
  if (p.about.trim()) parts.push(`关于用户：${p.about.trim()}`);
  if (p.style.trim()) parts.push(`回复风格要求：${p.style.trim()}`);
  return parts.join('\n');
}

export function buildMemoryPrompt(memories: string[]): string {
  const items = memories
    .map((m) => m.trim().slice(0, MAX_MEMORY_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_MEMORIES_IN_PROMPT);
  if (!items.length) return '';
  return ['以下是关于用户的长期记忆，回答时自然地参考（不必逐条复述）：', ...items.map((m) => `- ${m}`)].join('\n');
}

export interface SystemPromptParts {
  base: string;
  persona?: string;
  memories?: string;
  search?: string;
}

export function composeSystemPrompt({ base, persona, memories, search }: SystemPromptParts): string {
  return [base, persona, memories, search]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
}

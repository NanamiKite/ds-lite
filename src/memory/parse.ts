/**
 * 记忆解析与去重（纯逻辑，可在 Node 中测试）
 *
 * 支持的输入：
 * 1. ChatGPT 导出中的 memories 类 JSON（如有）：[{content}|{text}|{memory}|...]，
 *    或 {"memories":[...]} / {"items":[...]} 包装；纯字符串数组也接受
 * 2. Gemini「保存的信息」(gemini.google.com/saved-info) 页面复制的粘贴文本：
 *    首行 "Saved info"，其后为 "- " / "* " / "• " 项目符号行
 * 3. 任意按行组织的纯文本（每行一条）
 */
export interface ParsedMemories {
  items: string[];
  format: 'json' | 'paste';
}

export function parseMemoriesText(text: string): ParsedMemories {
  const trimmed = text.trim();
  if (!trimmed) return { items: [], format: 'paste' };

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed) as unknown;
      const items = extractFromJson(json);
      if (items.length) return { items, format: 'json' };
    } catch {
      // 非合法 JSON → 按粘贴文本处理
    }
  }
  return { items: extractFromPaste(trimmed), format: 'paste' };
}

function extractFromJson(json: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(json)) list = json;
  else if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    for (const key of ['memories', 'items', 'data', 'saved_info']) {
      if (Array.isArray(obj[key])) { list = obj[key] as unknown[]; break; }
    }
  }
  const out: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      if (item.trim()) out.push(item.trim());
      continue;
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const v = firstString(o.content, o.text, o.memory, o.value, o.fact, o.detail);
      if (v) out.push(v);
    }
  }
  return out.slice(0, 200);
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function extractFromPaste(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    // 丢弃标题行（如 "Saved info" / "保存的信息"）
    if (/^(saved info|保存的信息)$/i.test(line)) continue;
    // 去掉项目符号
    line = line.replace(/^[-*•·]\s+/, '');
    if (line) out.push(line.slice(0, 200));
  }
  return out.slice(0, 200);
}

// ---------------------------------------------------------------------------
// 去重
// ---------------------------------------------------------------------------

/** 归一化：小写、去空白与常见标点，用于比较 */
export function normalizeForDedupe(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s，。、！？；：,.!?;:'"「」『』（）()【】\[\]_-]/g, '');
}

/**
 * 从候选中过滤掉与已有记忆重复的条目。
 * 判定：归一化后相等；或一方包含另一方（较短一方 ≥ 6 字，避免短词误杀）。
 */
export function dedupeMemories(existing: string[], incoming: string[]): string[] {
  const existingNorms = existing.map(normalizeForDedupe).filter(Boolean);
  const kept: string[] = [];
  for (const item of incoming) {
    const norm = normalizeForDedupe(item);
    if (!norm) continue;
    const dup = existingNorms.some((e) => {
      if (!e) return false;
      if (e === norm) return true;
      const shorter = Math.min(e.length, norm.length);
      return shorter >= 6 && (e.includes(norm) || norm.includes(e));
    });
    if (!dup) kept.push(item);
    if (kept.length >= 20) break; // 单次入库上限
  }
  return kept;
}

/**
 * 解析记忆提取模型的原始输出：截取首个 JSON 数组，过滤合法短句。
 * （宽容处理模型偶尔包一层 ```json 围栏或多余文字的情况）
 */
export function parseFacts(raw: string): string[] {
  const match = /\[[\s\S]*\]/.exec(raw.trim());
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 80)
      .slice(0, 3);
  } catch {
    return [];
  }
}

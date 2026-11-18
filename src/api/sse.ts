/**
 * SSE 流解析（纯逻辑，可测）
 *
 * 按 SSE 规范处理：事件以空行（\n\n 或 \r\n\r\n）分隔；一个事件可含多个
 * data: 行（以 \n 连接）；注释行（: 开头）忽略；跨网络 chunk 的残余缓冲保留。
 */

export interface SseEvent {
  /** 合并后的 data 内容（多行 data 以 \n 连接） */
  data: string;
}

export function createSseParser(): {
  push: (chunk: string) => SseEvent[];
  flush: () => SseEvent[];
} {
  let buffer = '';

  const parseBlock = (block: string): SseEvent | null => {
    const dataLines: string[] = [];
    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine.replace(/\r$/, '');
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
      // 其余字段（event:/id:/retry:）当前不需要
    }
    if (!dataLines.length) return null;
    return { data: dataLines.join('\n') };
  };

  const drain = (final: boolean): SseEvent[] => {
    const events: SseEvent[] = [];
    // 按空行切块（兼容 \r\n）
    let idx: number;
    while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
      const ev = parseBlock(block);
      if (ev) events.push(ev);
    }
    if (final && buffer.trim()) {
      const ev = parseBlock(buffer);
      if (ev) events.push(ev);
      buffer = '';
    }
    return events;
  };

  return {
    push: (chunk) => {
      buffer += chunk;
      return drain(false);
    },
    flush: () => drain(true),
  };
}

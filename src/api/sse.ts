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
    // 按空行切块（已归一化为 \n）
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
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

  /** 换行归一化：\r\n 与孤立 \r 都转 \n；缓冲末尾的孤立 \r 可能是 \r\n 的前半，保留到下一 chunk */
  const normalizeBuffer = (final: boolean) => {
    let safe = buffer;
    let tail = '';
    if (!final && safe.endsWith('\r')) {
      tail = '\r';
      safe = safe.slice(0, -1);
    }
    buffer = safe.replace(/\r\n?/g, '\n') + tail;
  };

  return {
    push: (chunk) => {
      buffer += chunk;
      normalizeBuffer(false);
      return drain(false);
    },
    flush: () => {
      normalizeBuffer(true);
      return drain(true);
    },
  };
}

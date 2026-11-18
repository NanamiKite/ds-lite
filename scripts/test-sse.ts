/**
 * SSE 流解析测试：事件边界 / CRLF / 多行 data / 注释 / 跨 chunk 残余
 */
import assert from 'node:assert/strict';
import { createSseParser } from '../src/api/sse';

let passed = 0;
const results: Array<{ name: string; ok: boolean; note?: string }> = [];

function test(name: string, fn: () => void | string) {
  try {
    const note = fn();
    results.push({ name, ok: true, note: typeof note === 'string' ? note : undefined });
    passed++;
  } catch (e) {
    results.push({ name, ok: false, note: e instanceof Error ? e.message : String(e) });
  }
}

test('基础：空行分隔的多个事件', () => {
  const p = createSseParser();
  const evs = p.push('data: {"a":1}\n\ndata: {"a":2}\n\n');
  assert.equal(evs.length, 2);
  assert.equal(evs[0].data, '{"a":1}');
  assert.equal(evs[1].data, '{"a":2}');
});

test('跨 chunk 边界：事件在 chunk 中间被切断', () => {
  const p = createSseParser();
  const a = p.push('data: {"a":1}\n\nda');
  assert.equal(a.length, 1, '第一个事件应完整吐出');
  assert.equal(a[0].data, '{"a":1}');
  const b = p.push('ta: {"a":2}\n');
  assert.equal(b.length, 0, '第二事件未完结');
  const c = p.push('\n');
  assert.equal(c.length, 1);
  assert.equal(c[0].data, '{"a":2}');
});

test('CRLF 分隔（\\r\\n\\r\\n）与行尾 \\r', () => {
  const p = createSseParser();
  const evs = p.push('data: {"a":1}\r\n\r\ndata: {"a":2}\r\n\r\n');
  assert.equal(evs.length, 2);
  assert.equal(evs[0].data, '{"a":1}');
});

test('一个事件的多行 data 合并以 \\n 连接', () => {
  const p = createSseParser();
  const evs = p.push('data: line1\ndata: line2\n\n');
  assert.equal(evs.length, 1);
  assert.equal(evs[0].data, 'line1\nline2');
});

test('注释行与 keep-alive 忽略', () => {
  const p = createSseParser();
  const evs = p.push(': keep-alive\n\ndata: {"ok":1}\n\n');
  assert.equal(evs.length, 1);
  assert.equal(evs[0].data, '{"ok":1}');
});

test('flush 吐出无结尾空行的最后事件', () => {
  const p = createSseParser();
  assert.equal(p.push('data: [DONE]').length, 0);
  const evs = p.flush();
  assert.equal(evs.length, 1);
  assert.equal(evs[0].data, '[DONE]');
});

test('非 data 行不产生事件', () => {
  const p = createSseParser();
  assert.equal(p.push('event: x\nid: 1\n\n').length, 0);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.note ? ` — ${r.note}` : ''}`);
}
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) process.exit(1);

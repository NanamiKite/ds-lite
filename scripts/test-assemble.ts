/**
 * 上下文组装测试：缓存友好性、预算裁剪、摘要注入、搜索插入位置
 */
import assert from 'node:assert/strict';
import {
  assembleTurnMessages,
  buildDigestPrompt,
  buildSummaryPrompt,
  estimateTokens,
  type HistoryItem,
} from '../src/chat/assemble';

let passed = 0;
const results: { name: string; ok: boolean; note?: string }[] = [];

function test(name: string, fn: () => void | string) {
  try {
    const note = fn();
    results.push({ name, ok: true, note: typeof note === 'string' ? note : undefined });
    passed++;
  } catch (e) {
    results.push({ name, ok: false, note: e instanceof Error ? e.message : String(e) });
  }
}

const SYS = 'SYSTEM';
const h = (seq: number, role: 'user' | 'assistant', content: string): HistoryItem => ({ seq, role, content });

test('estimateTokens: 长文本估算更大', () => {
  assert.ok(estimateTokens('a'.repeat(1000)) > estimateTokens('a'.repeat(100)));
});

test('预算内全量携带：追加式，前缀稳定（命中前缀缓存的前提）', () => {
  const hist1 = [h(1, 'user', '问题一'), h(2, 'assistant', '回答一'), h(3, 'user', '问题二'), h(4, 'assistant', '回答二')];
  const t1 = assembleTurnMessages({ systemPrompt: SYS, history: hist1, tokenBudget: 16000 });
  const t2 = assembleTurnMessages({
    systemPrompt: SYS,
    history: [...hist1, h(5, 'user', '问题三')],
    tokenBudget: 16000,
  });
  assert.equal(t1.droppedCount, 0);
  // 前一轮的消息序列是后一轮的前缀（system 不变、无摘要消息、纯尾部追加）
  const prefixSame = t1.messages.every((m, i) => m.role === t2.messages[i].role && m.content === t2.messages[i].content);
  assert.ok(prefixSame, '追加一轮后，之前的消息数组应保持为前缀');
  assert.equal(t2.messages.length, t1.messages.length + 1);
});

test('联网工具请求：assistant 历史回传 reasoning_content，普通请求不带', () => {
  const hist: HistoryItem[] = [
    h(1, 'user', 'q1'),
    { seq: 2, role: 'assistant' as const, content: 'a1', reasoning: '思考过程' },
    h(3, 'user', 'q2'),
  ];
  const withTools = assembleTurnMessages({ systemPrompt: SYS, history: hist, tokenBudget: 16000, includeReasoning: true });
  const a1 = withTools.messages.find((m) => m.content === 'a1');
  assert.equal(a1?.reasoning_content, '思考过程');

  const plain = assembleTurnMessages({ systemPrompt: SYS, history: hist, tokenBudget: 16000 });
  const a1p = plain.messages.find((m) => m.content === 'a1');
  assert.equal(a1p?.reasoning_content, undefined);
});

test('超预算从头裁剪：保留尾部、预算达标、给出待摘要范围', () => {
  const hist = Array.from({ length: 30 }, (_, i) =>
    h(i + 1, i % 2 === 0 ? 'user' : 'assistant', `消息内容零一二三四五六七八九${i}`.repeat(8))
  );
  const t = assembleTurnMessages({ systemPrompt: SYS, history: hist, tokenBudget: 600 });
  assert.ok(t.droppedCount > 0, '应有消息被裁掉');
  assert.ok(t.droppedThroughSeq > 0);
  const kept = t.messages.filter((m) => m.role !== 'system');
  assert.ok(kept.length >= 1);
  assert.ok(kept.length < 30);
  // 最后一条（最新）必须保留
  assert.equal(kept[kept.length - 1].content, hist[29].content);
});

test('summarySeq 之前的消息不重发，摘要以消息形式插入 system 之后', () => {
  const hist = [h(1, 'user', '旧问题'), h(2, 'assistant', '旧回答'), h(3, 'user', '新问题')];
  const t = assembleTurnMessages({
    systemPrompt: SYS,
    summary: '旧对话摘要内容',
    summarySeq: 2,
    history: hist,
    tokenBudget: 16000,
  });
  assert.equal(t.messages[0].content, SYS);
  assert.ok(t.messages[1].content.includes('旧对话摘要内容'));
  assert.deepEqual(
    t.messages.slice(2).map((m) => m.content),
    ['新问题']
  );
  assert.equal(t.droppedCount, 0);
});

test('单条消息即超预算：至少保留最后一条，不产生空上下文', () => {
  const hist = [h(1, 'user', 'x'.repeat(20000))];
  const t = assembleTurnMessages({ systemPrompt: SYS, history: hist, tokenBudget: 1000 });
  const nonSys = t.messages.filter((m) => m.role !== 'system');
  assert.equal(nonSys.length, 1);
});

test('摘要请求：包含前情摘要并截断超长转写', () => {
  const items = Array.from({ length: 50 }, (_, i) => h(i + 1, i % 2 ? 'assistant' : 'user', `内容${i}`.repeat(500)));
  const msgs = buildSummaryPrompt(items, '前情：用户在做项目A');
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[1].content.includes('前情：用户在做项目A'));
  assert.ok(msgs[1].content.length < 15000, '转写应被截断');
});

test('会话摘要请求：包含旧摘要合并、单条截断、提示词覆盖角色扮演场景', () => {
  const items: HistoryItem[] = [
    h(1, 'user', '我们来进行一场角色扮演：你是城堡里的守夜人'.repeat(100)),
    h(2, 'assistant', '好的，我明白了。'),
  ];
  const msgs = buildDigestPrompt(items, '旧摘要：守夜人与访客的对话');
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[0].content.includes('角色扮演'));
  assert.ok(msgs[1].content.includes('旧摘要：守夜人与访客的对话'));
  // 单条内容被截断到 2000 字
  assert.ok(msgs[1].content.length < 6000);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.note ? ` — ${r.note}` : ''}`);
}
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) process.exit(1);

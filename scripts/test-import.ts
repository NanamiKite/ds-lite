/**
 * 导入解析器 fixture 测试（Node 环境，tsx 运行）
 * 验证：格式识别、分支还原、角色过滤、Gemini 分组/无回复统计、指纹幂等
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { parseExportText } from '../src/import';
import { toMs } from '../src/import/types';

const dir = join(process.cwd(), 'scripts', 'fixtures');
const read = (name: string) => readFileSync(join(dir, name), 'utf-8');

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

// ── ChatGPT / DeepSeek 官方 conversations.json ─────────────────────────
const cg = parseExportText(read('chatgpt-conversations.json'));
test('chatgpt: 识别格式与来源', () => {
  assert.equal(cg.format, 'chatgpt-conversations');
  assert.equal(cg.source, 'chatgpt');
});
test('chatgpt: 2 个会话 6 条消息（4 活跃 + 2 线性）', () => {
  assert.equal(cg.conversations.length, 2);
  assert.equal(cg.stats.messages, 6);
});
test('chatgpt: 活跃分支正确（含被弃分支、system/tool/图片指针过滤）', () => {
  const c1 = cg.conversations[0];
  const texts = c1.messages.map((m) => m.content).join('|');
  assert.ok(texts.includes('Try bacalhau'), '应有活跃分支回答');
  assert.ok(!texts.includes('被放弃的分支'), '不应含被弃分支');
  assert.ok(!texts.includes('You are helpful'), 'system 应被过滤');
  assert.ok(!texts.includes('tool output'), 'tool 应被过滤');
  assert.ok(!texts.includes('file-x'), '图片指针应被过滤');
  assert.ok(texts.includes('Day 1: Alfama'), 'multimodal 文本部分应保留');
});
test('chatgpt: 标题回退 + 指纹幂等', () => {
  assert.equal(cg.conversations[1].title, '用一句话介绍里斯本');
  assert.ok(cg.conversations[0].sourceId?.startsWith('fp:'), '无 id 时应有指纹');
  const again = parseExportText(read('chatgpt-conversations.json'));
  assert.deepEqual(
    again.conversations.map((c) => c.sourceId),
    cg.conversations.map((c) => c.sourceId),
    '重复解析指纹一致'
  );
});
test('chatgpt: sourceOverride 可改判来源', () => {
  const ds = parseExportText(read('chatgpt-conversations.json'), 'deepseek');
  assert.equal(ds.source, 'deepseek');
});

// ── DeepSeek 站点格式 ──────────────────────────────────────────────────
const dw = parseExportText(read('deepseek-web.json'));
test('deepseek-web: 识别格式与来源', () => {
  assert.equal(dw.format, 'deepseek-web');
  assert.equal(dw.source, 'deepseek');
});
test('deepseek-web: 分支感知取最新路径', () => {
  const c = dw.conversations[0];
  assert.equal(c.sourceId, 'sess1');
  assert.equal(c.messages.length, 4, '应为 m0,m1,m4,m5');
  const texts = c.messages.map((m) => m.content).join('|');
  assert.ok(texts.includes('分支B回答'));
  assert.ok(!texts.includes('分支A'));
  assert.ok(texts.includes('你好！\n\n有什么可以帮你？'), 'contentFragments 应拼接');
});
test('deepseek-web: thinking/search 元信息保留', () => {
  assert.equal(dw.conversations[0].meta?.thinkingEnabled, true);
  assert.equal(dw.conversations[0].meta?.searchEnabled, false);
});

// ── Gemini My Activity ────────────────────────────────────────────────
const ga = parseExportText(read('gemini-myactivity.json'));
test('gemini-activity: 按 app id 分组 + 过滤非 Gemini', () => {
  assert.equal(ga.format, 'gemini-activity');
  assert.equal(ga.stats.skippedRecords, 1, 'Search 记录应跳过');
  assert.equal(ga.conversations.length, 2, 'abc/def 两个会话');
});
test('gemini-activity: Prompted 前缀剥离 + 双路回复提取', () => {
  const abc = ga.conversations.find((c) => c.sourceId === 'abc123');
  if (!abc) throw new Error('abc 会话应存在');
  const texts = abc.messages.map((m) => m.content).join('|');
  assert.ok(!texts.includes('Prompted '), '前缀应剥离');
  assert.ok(texts.includes('Lisbon itinerary'), 'subtitles 回复应提取');
  assert.ok(texts.includes('puff pastry'), 'description 回复应提取');
  assert.equal(abc.messages.filter((m) => m.role === 'user').length, 2);
});
test('gemini-activity: 无回复会话计数', () => {
  assert.equal(ga.stats.withoutResponse, 1, 'def 会话无回复');
});

// ── Gemini conversations / ndjson ─────────────────────────────────────
const gc = parseExportText(read('gemini-conversations.json'));
test('gemini-conversations: 对象形态', () => {
  assert.equal(gc.format, 'gemini-conversations');
  assert.equal(gc.conversations.length, 1);
  assert.equal(gc.conversations[0].messages.length, 2);
  assert.equal(gc.conversations[0].messages[1].role, 'assistant');
});
const nd = parseExportText(read('gemini.ndjson'));
test('gemini ndjson（scraper）: 每行一会话', () => {
  assert.equal(nd.format, 'gemini-conversations');
  assert.equal(nd.conversations.length, 2);
  assert.equal(nd.conversations[0].sourceId, 'n1');
});

// ── 通用消息数组 ──────────────────────────────────────────────────────
const gn = parseExportText(read('deepseek-generic.json'));
test('generic-messages: 识别与角色过滤', () => {
  assert.equal(gn.format, 'generic-messages');
  assert.equal(gn.source, 'deepseek');
  assert.equal(gn.conversations[0].sourceId, 'c1');
  assert.equal(gn.conversations[0].messages.length, 2, 'system 应被过滤');
});

// ── 工具函数 ──────────────────────────────────────────────────────────
test('toMs: 秒/毫秒/ISO 自适应', () => {
  assert.equal(toMs(1700000000), 1700000000000);
  assert.equal(toMs(1700000000000), 1700000000000);
  assert.equal(toMs('2026-05-14T09:21:03.512Z'), 1778750463512);
  assert.equal(toMs(null), null);
});

// ── 错误路径 ──────────────────────────────────────────────────────────
test('无法识别的格式应报错', () => {
  assert.throws(() => parseExportText('{"foo": 1}'), /无法识别/);
  assert.throws(() => parseExportText(''), /为空/);
});

// ── 汇总 ──────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.note ? ` — ${r.note}` : ''}`);
}
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) process.exit(1);

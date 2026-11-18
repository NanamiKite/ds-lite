/**
 * 个性与记忆纯逻辑测试（Node 环境）
 * 覆盖：记忆解析（JSON/粘贴）、去重、提示词组装、提取输出解析
 */
import assert from 'node:assert/strict';
import { parseMemoriesText, dedupeMemories, normalizeForDedupe, parseFacts } from '../src/memory/parse';
import { buildPersonaPrompt, buildMemoryPrompt, composeSystemPrompt, MAX_MEMORIES_IN_PROMPT } from '../src/memory/prompt';

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

// ── 记忆解析 ──────────────────────────────────────────────────────────
test('parse: ChatGPT 风格 [{content}] JSON', () => {
  const r = parseMemoriesText('[{"content":"用户是素食者"},{"content":"用户在上海工作"}]');
  assert.equal(r.format, 'json');
  assert.deepEqual(r.items, ['用户是素食者', '用户在上海工作']);
});
test('parse: {"memories":[{text}]} 包装与纯字符串数组', () => {
  assert.deepEqual(parseMemoriesText('{"memories":[{"text":"记住了"}]}').items, ['记住了']);
  assert.deepEqual(parseMemoriesText('["a","b"]').items, ['a', 'b']);
});
test('parse: Gemini Saved Info 粘贴文本（含标题行与三种符号）', () => {
  const text = 'Saved info\n- 我是素食者\n* 我在上海工作\n• 偏好简洁回答';
  const r = parseMemoriesText(text);
  assert.equal(r.format, 'paste');
  assert.deepEqual(r.items, ['我是素食者', '我在上海工作', '偏好简洁回答']);
});
test('parse: 非法 JSON 回退按行解析', () => {
  const r = parseMemoriesText('[broken\n- 仍然能解析这条');
  assert.equal(r.format, 'paste');
  assert.ok(r.items.some((i) => i.includes('仍然能解析')));
});
test('parse: 空输入返回空', () => {
  assert.deepEqual(parseMemoriesText('   ').items, []);
});

// ── 去重 ──────────────────────────────────────────────────────────────
test('dedupe: 精确与归一化重复被过滤', () => {
  const existing = ['用户是素食者', '用户在上海工作'];
  const kept = dedupeMemories(existing, ['用户是素食者', '用户是 素食者！', '用户养了一只猫']);
  assert.deepEqual(kept, ['用户养了一只猫']);
});
test('dedupe: 包含关系（≥6字）视为重复', () => {
  const kept = dedupeMemories(['用户是素食者'], ['用户是素食者，不吃香菜']);
  assert.equal(kept.length, 0);
});
test('dedupe: 短包含不误杀', () => {
  const kept = dedupeMemories(['用户养猫'], ['用户养猫头鹰']); // 短方 4 字 < 6
  assert.equal(kept.length, 1);
});
test('dedupe: 单次入库上限 20 条', () => {
  const many = Array.from({ length: 50 }, (_, i) => `事实编号${i}号内容`);
  assert.equal(dedupeMemories([], many).length, 20);
});

// ── 提取输出解析 ──────────────────────────────────────────────────────
test('parseFacts: 正常 JSON 数组', () => {
  assert.deepEqual(parseFacts('["用户是素食者","用户在备考托福"]'), ['用户是素食者', '用户在备考托福']);
});
test('parseFacts: 围栏与多余文字宽容', () => {
  assert.deepEqual(parseFacts('好的，提取结果如下：\n```json\n["用户是素食者"]\n```'), ['用户是素食者']);
});
test('parseFacts: 空数组/超长/非字符串过滤，最多 3 条', () => {
  assert.deepEqual(parseFacts('[]'), []);
  const r = parseFacts('["事实a","事实b","事实c","事实d"]');
  assert.equal(r.length, 3);
  assert.deepEqual(parseFacts('["ok", 123, null]'), ['ok']);
});

// ── 提示词组装 ────────────────────────────────────────────────────────
test('persona: 关闭时为空，开启拼接两栏', () => {
  assert.equal(buildPersonaPrompt({ enabled: false, about: 'x', style: 'y' }), '');
  const s = buildPersonaPrompt({ enabled: true, about: '我是后端工程师', style: '简洁直接' });
  assert.ok(s.includes('关于用户：我是后端工程师'));
  assert.ok(s.includes('回复风格要求：简洁直接'));
});
test('memoryPrompt: 条数与长度上限', () => {
  assert.equal(buildMemoryPrompt([]), '');
  const many = Array.from({ length: 40 }, (_, i) => `记忆${i}`);
  assert.equal(buildMemoryPrompt(many).split('\n').length - 1, MAX_MEMORIES_IN_PROMPT);
  const long = ['x'.repeat(300)];
  assert.ok(buildMemoryPrompt(long).includes('x'.repeat(120)));
  assert.ok(!buildMemoryPrompt(long).includes('x'.repeat(121)));
});
test('composeSystemPrompt: 非空段以空行连接，空段跳过', () => {
  const s = composeSystemPrompt({ base: 'BASE', persona: 'P', memories: '', search: 'S' });
  assert.equal(s, 'BASE\n\nP\n\nS');
  assert.equal(composeSystemPrompt({ base: 'B' }), 'B');
});

// ── 汇总 ──────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.note ? ` — ${r.note}` : ''}`);
}
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) process.exit(1);

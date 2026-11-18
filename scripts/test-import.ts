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
// ── 健壮性（损坏输入 / 数字时间串 / 真叶节点 / 重复 ID / NDJSON 容错） ───
test('健壮性：混合数组（null/字符串/数字）不崩溃且跳过计数', () => {
  const mixed = '[null, "junk", 42, {"id":"s1","title":"ok","messages":[{"message_id":"m0","parent_id":null,"message_role":"USER","content":"hi","created_at":1700000000}]}]';
  const r = parseExportText(mixed);
  assert.equal(r.format, 'deepseek-web');
  assert.equal(r.conversations.length, 1);
  assert.equal(r.conversations[0].messages[0].content, 'hi');
  assert.ok(r.stats.skippedRecords >= 3, `应跳过 3 个损坏项，实际 ${r.stats.skippedRecords}`);
});

test('健壮性：消息数组里混入 null 不崩溃', () => {
  const raw = '[{"header":"Gemini Apps","title":"Prompted hi","titleUrl":"https://gemini.google.com/app/zz9","time":"2026-05-14T09:00:00Z"}, null, 123]';
  const r = parseExportText(raw);
  assert.equal(r.conversations.length, 1);
});

test('toMs: 纯数字字符串按秒/毫秒解析', () => {
  assert.equal(toMs('1700000000'), 1700000000000);
  assert.equal(toMs('1700000000000'), 1700000000000);
  assert.equal(toMs('0'), null);
  assert.equal(toMs('abc'), null);
});

test('deepseek-web: 时间最晚的非叶节点不劫持分支（真叶选择）', () => {
  const raw = JSON.stringify([{
    id: 'leaf-test', title: 't', created_at: 1700000000,
    messages: [
      { message_id: 'a', parent_id: null, message_role: 'USER', content: 'root', created_at: 1700000001 },
      { message_id: 'b', parent_id: 'a', message_role: 'ASSISTANT', content: '真实回答', created_at: 1700000002 },
      // 孤儿节点时间最晚，但没有子节点也不是正确叶子？——它是真叶，会被选中：
      // 此用例改为：时间最晚者是"被引用的中间节点"，不应被选为叶子
      { message_id: 'mid', parent_id: 'b', message_role: 'USER', content: '中间', created_at: 1799999999 },
      { message_id: 'leaf', parent_id: 'mid', message_role: 'ASSISTANT', content: '最终', created_at: 1700000005 },
    ],
  }]);
  const r = parseExportText(raw);
  const texts = r.conversations[0].messages.map((m) => m.content).join('|');
  assert.ok(texts.includes('最终'), '应选中真叶 leaf（时间较晚但确是叶子），而非时间最晚的中间节点 mid');
});

test('deepseek-web: 缺失父节点标注分支不完整', () => {
  const raw = JSON.stringify([{
    id: 'orphan', title: 't', created_at: 1700000000,
    messages: [
      { message_id: 'x', parent_id: 'ghost', message_role: 'USER', content: '断链', created_at: 1700000001 },
    ],
  }]);
  const r = parseExportText(raw);
  assert.equal(r.conversations.length, 1);
  assert.ok(r.stats.note?.includes('分支不完整'), `note 应标注分支不完整：${r.stats.note}`);
});

test('deepseek-web: 重复消息 ID 不互相覆盖', () => {
  const raw = JSON.stringify([{
    id: 'dup', title: 't', created_at: 1700000000,
    messages: [
      { message_id: 'same', parent_id: null, message_role: 'USER', content: '第一条', created_at: 1700000001 },
      { message_id: 'same', parent_id: null, message_role: 'USER', content: '第二条', created_at: 1700000002 },
    ],
  }]);
  const r = parseExportText(raw);
  const texts = r.conversations[0].messages.map((m) => m.content);
  assert.ok(texts.includes('第一条') && texts.includes('第二条'), '重复 ID 应两条都可见');
});

test('generic: 无 ID 时用内容指纹，不同内容不互撞', () => {
  const a = parseExportText('[{"title":"A","messages":[{"role":"user","content":"苹果"}]}]');
  const b = parseExportText('[{"title":"B","messages":[{"role":"user","content":"香蕉"}]}]');
  assert.notEqual(a.conversations[0].sourceId, b.conversations[0].sourceId, '不同内容的指纹幂等键应不同');
  const a2 = parseExportText('[{"title":"A","messages":[{"role":"user","content":"苹果"}]}]');
  assert.equal(a.conversations[0].sourceId, a2.conversations[0].sourceId, '同内容指纹稳定');
});

test('ndjson: 允许少量坏行并在 note 报告', () => {
  const text = '{"id":"n1","title":"a","turns":[{"role":"user","text":"q"}]}\nnot-json\n{"id":"n2","title":"b","turns":[{"role":"user","text":"w"}]}';
  const r = parseExportText(text);
  assert.equal(r.conversations.length, 2);
  assert.ok(r.stats.note?.includes('1 个坏行'));
});

test('ndjson: 坏行超限整体失败', () => {
  const lines = Array.from({ length: 50 }, (_, i) => (i % 2 ? 'garbage' : `{"id":"n${i}","title":"t","turns":[{"role":"user","text":"q"}]}`)).join('\n');
  assert.throws(() => parseExportText(lines), /无效行过多/);
});

test('匿名 DeepSeek 会话：重复导入指纹幂等', () => {
  const raw = JSON.stringify([{
    title: '没有ID的会话',
    created_at: 1700000000,
    messages: [
      { message_id: 'a', parent_id: null, message_role: 'USER', content: '问题', created_at: 1700000001 },
      { message_id: 'b', parent_id: 'a', message_role: 'ASSISTANT', content: '回答', created_at: 1700000002 },
    ],
  }]);
  const r1 = parseExportText(raw);
  const r2 = parseExportText(raw);
  assert.ok(r1.conversations[0].sourceId, '应生成指纹幂等键');
  assert.equal(r1.conversations[0].sourceId, r2.conversations[0].sourceId, '两次导入指纹一致');
});

test('DeepSeek 数字 ID：父子关系可还原', () => {
  const raw = JSON.stringify([{
    id: 'num-id', title: 't', created_at: 1700000000,
    messages: [
      { message_id: 1, parent_id: null, message_role: 'USER', content: '根', created_at: 1700000001 },
      { message_id: 2, parent_id: 1, message_role: 'ASSISTANT', content: '子回答', created_at: 1700000002 },
      { message_id: 3, parent_id: 2, message_role: 'USER', content: '孙提问', created_at: 1700000003 },
      // 时间最晚的是数字 ID 的中间节点，真叶 4 才应胜出
      { message_id: 4, parent_id: 3, message_role: 'ASSISTANT', content: '最终回答', created_at: 1700000004 },
    ],
  }]);
  const r = parseExportText(raw);
  const texts = r.conversations[0].messages.map((m) => m.content).join('|');
  assert.ok(texts.includes('最终回答'), '数字 ID 链应完整还原到真叶');
  assert.ok(!r.stats.note?.includes('分支不完整'), `不应有断链：${r.stats.note}`);
});

test('格式识别：首条消息损坏不误导（DeepSeek 特征字段在后）', () => {
  const raw = JSON.stringify([{
    id: 's1', title: 't', created_at: 1700000000,
    messages: [
      null,
      'garbage',
      { message_id: 'a', parent_id: null, message_role: 'USER', content: '你好', created_at: 1700000001 },
      { message_id: 'b', parent_id: 'a', message_role: 'ASSISTANT', contentFragments: [{ text: '回你' }], created_at: 1700000002 },
    ],
  }]);
  const r = parseExportText(raw);
  assert.equal(r.format, 'deepseek-web', '应识别为 deepseek-web 而非 generic');
  assert.equal(r.conversations[0].messages.length, 2);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.note ? ` — ${r.note}` : ''}`);
}
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) process.exit(1);

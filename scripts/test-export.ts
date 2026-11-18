/**
 * 导出格式测试（纯逻辑）
 */
import assert from 'node:assert/strict';
import {
  buildBackup, isBackupJson, sanitizeBackupSessions, sessionToMarkdown, sessionsToMarkdown,
  type ExportSession,
} from '../src/export/format';

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

const s = (id: string, title: string): ExportSession => ({
  id, title, source: 'local', createdAt: 1700000000000, updatedAt: 1700000600000,
  digest: '讨论了里斯本旅行计划',
  messages: [
    { role: 'user', content: '帮我规划三天行程', createdAt: 1700000001000 },
    { role: 'assistant', content: '第一天：阿尔法玛老城区…', reasoning: '考虑用户偏好步行', createdAt: 1700000010000 },
  ],
});

test('备份 JSON：结构标记与识别', () => {
  const b = buildBackup([s('1', '里斯本')], [{ content: '素食者', source: 'manual', active: true, createdAt: 1 }]);
  assert.equal(b.app, 'ds-lite');
  assert.equal(b.schema, 1);
  assert.ok(isBackupJson(b));
  assert.ok(!isBackupJson({ app: 'other' }));
  assert.ok(!isBackupJson(null));
  // 往返：JSON 序列化后仍可识别
  assert.ok(isBackupJson(JSON.parse(JSON.stringify(b))));
  // 兼容旧版 deepseek-lite 备份标记
  assert.ok(isBackupJson({ app: 'deepseek-lite', sessions: [] }));
});

test('单会话 Markdown：标题/摘要/角色标签；默认不含思维链（隐私）', () => {
  const md = sessionToMarkdown(s('1', '里斯本'));
  assert.ok(md.startsWith('# 里斯本'));
  assert.ok(md.includes('摘要：讨论了里斯本旅行计划'));
  assert.ok(md.includes('### 我 ·'));
  assert.ok(md.includes('### DeepSeek ·'));
  assert.ok(md.includes('第一天：阿尔法玛老城区'));
  assert.ok(!md.includes('思维链'), '默认导出不应包含思维链');
  const mdFull = sessionToMarkdown(s('1', '里斯本'), true);
  assert.ok(mdFull.includes('<details><summary>思维链</summary>'), '显式开启后应包含');
});

test('全会话 Markdown：汇总头部与分隔', () => {
  const md = sessionsToMarkdown([s('1', 'A'), s('2', 'B')]);
  assert.ok(md.includes('# DS Lite 对话记录'));
  assert.ok(md.includes('2 个对话'));
  assert.ok(md.includes('# A') && md.includes('# B'));
});

test('备份清洗：损坏会话/消息跳过，合法数据保留', () => {
  const raw = [
    { id: 'ok1', title: 'A', messages: [
      { role: 'user', content: 'q', createdAt: 1 },
      { role: 'system', content: 'sys 应跳过' },            // 非法 role
      null,                                                    // 损坏消息
      { role: 'assistant', content: 123 },                    // content 非字符串
    ] },
    null,                                                      // 损坏会话
    { title: '无 id 应跳过', messages: [{ role: 'user', content: 'x' }] },
    { id: 'bad', messages: 'not-array' },                      // messages 非数组 → 会话跳过
    { id: 99, messages: [{ role: 'assistant', content: '答' }] }, // 数字 id 保留
  ];
  const s = sanitizeBackupSessions(raw);
  assert.equal(s.sessions.length, 2);
  assert.equal(s.sessions[0].id, 'ok1');
  assert.equal(s.sessions[0].messages.length, 1, '仅保留合法消息');
  assert.equal(s.sessions[1].id, '99', '数字 id 归一化');
  assert.equal(s.skippedSessions, 3);
  assert.equal(s.skippedMessages, 3);
  assert.equal(sanitizeBackupSessions(null).sessions.length, 0, '顶层非数组不崩');
});

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.note ? ` — ${r.note}` : ''}`);
}
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) process.exit(1);

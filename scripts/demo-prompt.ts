/**
 * 演示：个性 + 记忆 实际注入时，App 组装出的 system prompt。
 * 使用与 App 相同的纯逻辑函数（src/memory/prompt.ts）。
 * 注：联网搜索由 DeepSeek 服务端工具完成，不进入提示词。
 */
import { buildPersonaPrompt, buildMemoryPrompt, composeSystemPrompt } from '../src/memory/prompt';

const persona = buildPersonaPrompt({
  enabled: true,
  about: '我是后端工程师，在上海工作，养了一只猫',
  style: '简洁直接，先给结论，必要时才展开细节',
});

const memories = buildMemoryPrompt([
  '用户是素食者',
  '用户在备考托福',
  '用户偏好中文回答',
]);

const system = composeSystemPrompt({
  base: '你是 DeepSeek，一个忠于事实、乐于助人的 AI 助手。',
  persona,
  memories,
});

console.log('══════════ 每次发送时实际注入的 system prompt ══════════\n');
console.log(system);
console.log('\n════════════════════════════════════════════════════════');
console.log(`共 ${system.length} 字符 · 联网搜索由服务端工具 deepseek_web_search 完成，不改提示词`);

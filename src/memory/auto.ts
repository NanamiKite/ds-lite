/**
 * 自动记忆提取：对话完成后用一次廉价的 deepseek-chat 调用，
 * 从最新一轮交流中提取 0-3 条"值得长期记住的用户事实"。
 */
import { MODEL_FLASH, chatOnce } from '@/api/deepseek';
import { parseFacts } from './parse';

const EXTRACT_SYSTEM = `你是记忆提取器。从给定的对话片段中提取"值得长期记住的、关于用户本人的事实或偏好"。

规则：
1. 只提取稳定信息：用户的身份、职业、偏好、习惯、目标、约束条件等
2. 不要提取：一次性问题、与用户本人无关的内容、对话中的临时上下文
3. 每条用简短的第三人称中文陈述（如"用户是素食者"），不超过 40 字
4. 没有值得提取的内容时返回 []
5. 只输出严格的 JSON 数组，不要任何其他文字，最多 3 项

示例输出：["用户是素食者","用户在准备托福考试"]`;

export async function extractMemories(
  apiKey: string,
  userText: string,
  assistantText: string
): Promise<string[]> {
  const user = userText.trim().slice(0, 1500);
  const assistant = assistantText.trim().slice(0, 2000);
  if (!user) return [];

  try {
    const { content } = await chatOnce({
      apiKey,
      model: MODEL_FLASH,
      thinking: false,
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content: `<用户消息>${user}</用户消息>\n<助手回复>${assistant || '（无）'}</助手回复>` },
      ],
      temperature: 0,
      callbacks: undefined,
    });
    return parseFacts(content);
  } catch {
    return [];
  }
}

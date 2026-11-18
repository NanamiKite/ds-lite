/**
 * 导出：写入缓存文件并调系统分享（保存到文件/发送/云盘）
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { exportAllSessions, getSession, listMessages } from '@/db/repo';
import { listMemories } from '@/db/memoryRepo';
import { buildBackup, sessionsToMarkdown, sessionToMarkdown } from './format';

async function shareFile(filename: string, content: string, mime: string): Promise<void> {
  const dir = `${FileSystem.cacheDirectory}exports/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const path = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前环境不支持系统分享');
  await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: filename });
}

const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

/** 全量 JSON 备份（会话+消息+记忆），可从另一台设备「从备份恢复」 */
export async function shareJsonBackup(): Promise<void> {
  const sessions = exportAllSessions();
  const memories = listMemories().map((m) => ({
    content: m.content,
    source: m.source,
    active: m.active,
    createdAt: m.createdAt,
  }));
  const payload = buildBackup(sessions, memories);
  await shareFile(`ds-lite-backup-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

/** 全部对话导出为 Markdown */
export async function shareAllMarkdown(): Promise<void> {
  const md = sessionsToMarkdown(exportAllSessions());
  await shareFile(`ds-lite-对话-${stamp()}.md`, md, 'text/markdown');
}

/** 单个对话导出为 Markdown（含摘要） */
export async function shareSessionMarkdown(sessionId: string): Promise<void> {
  const s = getSession(sessionId);
  if (!s) return;
  const md = sessionToMarkdown({
    id: s.id,
    title: s.title,
    source: s.source,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    digest: s.digest ?? null,
    messages: listMessages(sessionId).map((m) => ({
      role: m.role,
      content: m.content,
      reasoning: m.reasoning,
      createdAt: m.createdAt,
      status: m.status,
    })),
  });
  const safe = s.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30) || '对话';
  await shareFile(`${safe}-${stamp()}.md`, md, 'text/markdown');
}

/**
 * 数据导出格式化（纯逻辑，可测）
 * - JSON 备份：全量会话+消息+记忆，供另一台设备恢复
 * - Markdown：人类可读的对话记录
 */

export interface ExportSession {
  id: string;
  title: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  digest?: string | null;
  messages: {
    role: string;
    content: string;
    reasoning?: string | null;
    createdAt: number;
    status?: string;
  }[];
}

export interface ExportMemories {
  content: string;
  source: string;
  active: boolean;
  createdAt: number;
}

export interface BackupPayload {
  app: 'deepseek-lite';
  schema: 1;
  exportedAt: number;
  sessions: ExportSession[];
  memories: ExportMemories[];
}

export function buildBackup(sessions: ExportSession[], memories: ExportMemories[]): BackupPayload {
  return {
    app: 'deepseek-lite',
    schema: 1,
    exportedAt: Date.now(),
    sessions,
    memories,
  };
}

export function isBackupJson(v: unknown): v is BackupPayload {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as { app?: unknown }).app === 'deepseek-lite' &&
    Array.isArray((v as { sessions?: unknown }).sessions)
  );
}

/** 备份恢复前的运行时清洗：损坏会话/消息跳过而非整批失败（结果可测） */
export interface SanitizedBackup {
  sessions: {
    id: string;
    title: string;
    source?: string;
    createdAt?: number;
    updatedAt?: number;
    digest?: string | null;
    messages: { role: 'user' | 'assistant'; content: string; createdAt?: number }[];
  }[];
  skippedSessions: number;
  skippedMessages: number;
}

export function sanitizeBackupSessions(raw: unknown): SanitizedBackup {
  const out: SanitizedBackup = { sessions: [], skippedSessions: 0, skippedMessages: 0 };
  if (!Array.isArray(raw)) return out;
  const validRoles = new Set(['user', 'assistant']);
  for (const s of raw) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) { out.skippedSessions++; continue; }
    const o = s as Record<string, unknown>;
    const id = typeof o.id === 'string' || typeof o.id === 'number' ? String(o.id) : '';
    if (!id) { out.skippedSessions++; continue; }
    const messages: SanitizedBackup['sessions'][number]['messages'] = [];
    if (Array.isArray(o.messages)) {
      for (const m of o.messages) {
        if (!m || typeof m !== 'object' || Array.isArray(m)) { out.skippedMessages++; continue; }
        const mo = m as Record<string, unknown>;
        const role = typeof mo.role === 'string' ? mo.role : '';
        const content = typeof mo.content === 'string' ? mo.content.trim() : '';
        if (!validRoles.has(role) || !content) { out.skippedMessages++; continue; }
        const createdAt = typeof mo.createdAt === 'number' && isFinite(mo.createdAt) ? mo.createdAt : undefined;
        messages.push({ role: role as 'user' | 'assistant', content, createdAt });
      }
    }
    if (!messages.length) { out.skippedSessions++; continue; }
    out.sessions.push({
      id,
      title: typeof o.title === 'string' && o.title.trim() ? o.title : '导入对话',
      source: typeof o.source === 'string' ? o.source : undefined,
      createdAt: typeof o.createdAt === 'number' && isFinite(o.createdAt) ? o.createdAt : undefined,
      updatedAt: typeof o.updatedAt === 'number' && isFinite(o.updatedAt) ? o.updatedAt : undefined,
      digest: typeof o.digest === 'string' ? o.digest : null,
      messages,
    });
  }
  return out;
}

const ROLE_LABEL: Record<string, string> = {
  user: '我',
  assistant: 'DeepSeek',
  system: '系统',
};

export function sessionToMarkdown(s: ExportSession, includeReasoning = false): string {
  const lines: string[] = [];
  const date = (ts: number) => new Date(ts).toLocaleString('zh-CN');
  lines.push(`# ${s.title}`);
  lines.push('');
  lines.push(`> ${date(s.createdAt)} · ${s.messages.length} 条消息${s.digest ? `\n> 摘要：${s.digest}` : ''}`);
  lines.push('');
  for (const m of s.messages) {
    lines.push(`### ${ROLE_LABEL[m.role] ?? m.role} · ${date(m.createdAt)}`);
    lines.push('');
    lines.push(m.content);
    if (includeReasoning && m.reasoning) {
      lines.push('');
      lines.push('<details><summary>思维链</summary>');
      lines.push('');
      lines.push(m.reasoning);
      lines.push('');
      lines.push('</details>');
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

export function sessionsToMarkdown(sessions: ExportSession[]): string {
  const header = [
    '# DeepSeek Lite 对话记录',
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')} · ${sessions.length} 个对话`,
    '',
    '---',
    '',
  ].join('\n');
  return header + sessions.map((s) => sessionToMarkdown(s)).join('\n');
}

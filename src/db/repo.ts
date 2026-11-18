/**
 * 会话与消息仓储
 */
import { getDb } from './database';
import { uuid } from '@/theme';
import type {
  ChatMessage,
  ImportedMeta,
  MessageMeta,
  MessageStatus,
  Role,
  Session,
  SessionSource,
} from '@/types';

interface SessionRow {
  id: string;
  title: string;
  source: string;
  source_session_id: string | null;
  model: string | null;
  created_at: number;
  updated_at: number;
  pinned: number;
  imported_meta: string | null;
  summary: string | null;
  summary_seq: number;
  digest: string | null;
  digest_seq: number;
  memory_enabled: number | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  reasoning: string | null;
  created_at: number;
  status: string;
  error: string | null;
  meta: string | null;
  seq: number;
}

/** 安全 JSON 解析：损坏数据返回 null 而非抛异常（单条损坏不应拖垮整个列表） */
function safeJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    title: r.title,
    source: r.source as SessionSource,
    sourceSessionId: r.source_session_id,
    model: r.model,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    pinned: !!r.pinned,
    importedMeta: safeJson<ImportedMeta>(r.imported_meta),
    summary: r.summary,
    summarySeq: r.summary_seq,
    digest: r.digest,
    digestSeq: r.digest_seq,
    memoryEnabled: r.memory_enabled === null ? null : !!r.memory_enabled,
  };
}

function rowToMessage(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    sessionId: r.session_id,
    role: r.role as Role,
    content: r.content,
    reasoning: r.reasoning,
    createdAt: r.created_at,
    status: r.status as MessageStatus,
    error: r.error,
    seq: r.seq,
    meta: safeJson<MessageMeta>(r.meta),
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function listSessions(search?: string): Session[] {
  const db = getDb();
  const like = `%${(search ?? '').trim()}%`;
  const rows = search?.trim()
    ? db.getAllSync<SessionRow>(
        `SELECT s.* FROM sessions s
         LEFT JOIN messages m ON m.session_id = s.id AND m.content LIKE ?
         WHERE s.title LIKE ? OR m.content LIKE ?
         GROUP BY s.id
         ORDER BY s.pinned DESC, s.updated_at DESC
         LIMIT 500`,
        [like, like, like]
      )
    : db.getAllSync<SessionRow>(
        'SELECT * FROM sessions ORDER BY pinned DESC, updated_at DESC LIMIT 500'
      );
  return rows.map(rowToSession);
}

export function getSession(id: string): Session | null {
  const row = getDb().getFirstSync<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id]);
  return row ? rowToSession(row) : null;
}

export function createSession(opts: { title?: string; source?: SessionSource } = {}): Session {
  const db = getDb();
  const now = Date.now();
  const s: Session = {
    id: uuid(),
    title: opts.title?.trim() || '新对话',
    source: opts.source ?? 'local',
    sourceSessionId: null,
    model: null,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    importedMeta: null,
  };
  db.runSync(
    `INSERT INTO sessions (id, title, source, source_session_id, model, created_at, updated_at, pinned)
     VALUES (?, ?, ?, NULL, ?, ?, ?, 0)`,
    [s.id, s.title, s.source, s.model, s.createdAt, s.updatedAt]
  );
  return s;
}

export function renameSession(id: string, title: string): void {
  getDb().runSync('UPDATE sessions SET title = ? WHERE id = ?', [title.trim() || '新对话', id]);
}

export function touchSession(id: string, model?: string): void {
  getDb().runSync(
    'UPDATE sessions SET updated_at = ?, model = COALESCE(?, model) WHERE id = ?',
    [Date.now(), model ?? null, id]
  );
}

export function togglePin(id: string): void {
  getDb().runSync('UPDATE sessions SET pinned = 1 - pinned WHERE id = ?', [id]);
}

export function deleteSession(id: string): void {
  getDb().runSync('DELETE FROM sessions WHERE id = ?', [id]);
}

/** 更新会话滚动摘要（覆盖到 seq 为止的旧消息） */
export function updateSessionSummary(id: string, summary: string, throughSeq: number): void {
  getDb().runSync(
    'UPDATE sessions SET summary = ?, summary_seq = ? WHERE id = ?',
    [summary.slice(0, 2000), throughSeq, id]
  );
}

/** 更新会话内容摘要（用户可见，覆盖到 seq 为止） */
export function updateSessionDigest(id: string, digest: string, throughSeq: number): void {
  getDb().runSync(
    'UPDATE sessions SET digest = ?, digest_seq = ? WHERE id = ?',
    [digest.slice(0, 600), throughSeq, id]
  );
}

/** 对话级记忆开关（null = 跟随全局） */
export function setSessionMemoryEnabled(id: string, enabled: boolean | null): void {
  getDb().runSync('UPDATE sessions SET memory_enabled = ? WHERE id = ?', [
    enabled === null ? null : enabled ? 1 : 0,
    id,
  ]);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export function listMessages(sessionId: string): ChatMessage[] {
  const rows = getDb().getAllSync<MessageRow>(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY seq ASC',
    [sessionId]
  );
  return rows.map(rowToMessage);
}

export function appendMessage(
  sessionId: string,
  m: {
    role: Role;
    content?: string;
    reasoning?: string | null;
    status?: MessageStatus;
    error?: string | null;
    meta?: MessageMeta | null;
  }
): ChatMessage {
  const db = getDb();
  const msg: ChatMessage = {
    id: uuid(),
    sessionId,
    role: m.role,
    content: m.content ?? '',
    reasoning: m.reasoning ?? null,
    createdAt: Date.now(),
    status: m.status ?? 'done',
    error: m.error ?? null,
    seq: 0,
    meta: m.meta ?? null,
  };
  // 事务内取 MAX(seq)+1 并插入；UNIQUE(session_id, seq) 兜底并发冲突
  db.withTransactionSync(() => {
    const max = db.getFirstSync<{ m: number }>(
      'SELECT MAX(seq) AS m FROM messages WHERE session_id = ?',
      [sessionId]
    );
    let seq = (max?.m ?? 0) + 1;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        db.runSync(
          `INSERT INTO messages (id, session_id, role, content, reasoning, created_at, status, error, meta, seq)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            msg.id, msg.sessionId, msg.role, msg.content, msg.reasoning,
            msg.createdAt, msg.status, msg.error,
            msg.meta ? JSON.stringify(msg.meta) : null, seq,
          ]
        );
        msg.seq = seq;
        return msg;
      } catch (e) {
        // 唯一约束冲突：seq 被并发占用，递增重试
        if (String(e).includes('UNIQUE')) { seq++; continue; }
        throw e;
      }
    }
    throw new Error('消息序号冲突重试次数用尽');
  });
  return msg;
}

export function updateMessage(
  id: string,
  patch: {
    content?: string;
    reasoning?: string | null;
    status?: MessageStatus;
    error?: string | null;
    meta?: MessageMeta | null;
  }
): void {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.content !== undefined) { sets.push('content = ?'); args.push(patch.content); }
  if (patch.reasoning !== undefined) { sets.push('reasoning = ?'); args.push(patch.reasoning); }
  if (patch.status !== undefined) { sets.push('status = ?'); args.push(patch.status); }
  if (patch.error !== undefined) { sets.push('error = ?'); args.push(patch.error); }
  if (patch.meta !== undefined) { sets.push('meta = ?'); args.push(patch.meta ? JSON.stringify(patch.meta) : null); }
  if (!sets.length) return;
  args.push(id);
  getDb().runSync(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`, args);
}

/** 删除某 seq 之后（含该条）的消息，用于"重新生成" */
export function deleteMessagesFromSeq(sessionId: string, seq: number): void {
  getDb().runSync('DELETE FROM messages WHERE session_id = ? AND seq >= ?', [sessionId, seq]);
}

/** 会话内最后一条消息 */
export function lastMessage(sessionId: string): ChatMessage | null {
  const row = getDb().getFirstSync<MessageRow>(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY seq DESC LIMIT 1',
    [sessionId]
  );
  return row ? rowToMessage(row) : null;
}

// ---------------------------------------------------------------------------
// 导入（幂等：同 source + source_session_id 已存在则跳过）
// ---------------------------------------------------------------------------

export interface ImportConversation {
  sourceId?: string | null;
  title: string;
  createdAt?: number | null;
  messages: {
    role: Role;
    content: string;
    reasoning?: string | null;
    createdAt?: number | null;
    sourceModel?: string | null;
  }[];
  meta?: ImportedMeta;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  sessionIds: string[];
}

export function importConversations(
  source: SessionSource,
  conversations: ImportConversation[]
): ImportResult {
  const db = getDb();
  const result: ImportResult = { imported: 0, skipped: 0, sessionIds: [] };

  for (const conv of conversations) {
    const msgs = conv.messages.filter((m) => m.content.trim().length > 0 || (m.reasoning ?? '').trim().length > 0);
    if (!msgs.length) { result.skipped++; continue; }

    if (conv.sourceId) {
      const exists = db.getFirstSync<{ id: string }>(
        'SELECT id FROM sessions WHERE source = ? AND source_session_id = ?',
        [source, conv.sourceId]
      );
      if (exists) { result.skipped++; continue; }
    }

    let sessionId = '';
    db.withTransactionSync(() => {
      const now = Date.now();
      sessionId = uuid();
      const base = conv.createdAt ?? now;
      db.runSync(
        `INSERT INTO sessions (id, title, source, source_session_id, model, created_at, updated_at, pinned, imported_meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          sessionId,
          conv.title.slice(0, 120),
          source,
          conv.sourceId ?? null,
          conv.meta?.sourceModel ?? null,
          base,
          base + msgs.length,
          conv.meta ? JSON.stringify(conv.meta) : null,
        ]
      );
      msgs.forEach((m, i) => {
        db.runSync(
          `INSERT INTO messages (id, session_id, role, content, reasoning, created_at, status, error, meta, seq)
           VALUES (?, ?, ?, ?, ?, ?, 'done', NULL, ?, ?)`,
          [
            uuid(),
            sessionId,
            m.role,
            m.content,
            m.reasoning ?? null,
            m.createdAt ?? base + i,
            m.sourceModel ? JSON.stringify({ sourceModel: m.sourceModel } satisfies MessageMeta) : null,
            i + 1,
          ]
        );
      });
    });
    result.imported++;
    result.sessionIds.push(sessionId);
  }
  return result;
}

export function dbStats(): { sessions: number; messages: number } {
  const db = getDb();
  const s = db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM sessions');
  const m = db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM messages');
  return { sessions: s?.c ?? 0, messages: m?.c ?? 0 };
}

/** 跨对话参考：近期其他对话的摘要（排除本对话与对话级关闭记忆的） */
export function listRecentDigests(
  excludeSessionId: string,
  limit = 5
): { id: string; title: string; digest: string; updatedAt: number }[] {
  const rows = getDb().getAllSync<SessionRow>(
    `SELECT * FROM sessions
     WHERE id != ? AND digest IS NOT NULL AND digest != ''
       AND (memory_enabled IS NULL OR memory_enabled = 1)
     ORDER BY updated_at DESC LIMIT ?`,
    [excludeSessionId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    digest: r.digest ?? '',
    updatedAt: r.updated_at,
  }));
}

/** 导出全部数据（会话+消息） */
export function exportAllSessions(): {
  id: string; title: string; source: string; createdAt: number; updatedAt: number;
  digest?: string | null; messages: { role: string; content: string; reasoning: string | null; createdAt: number; status: string }[];
}[] {
  const db = getDb();
  const sessions = db.getAllSync<SessionRow>('SELECT * FROM sessions ORDER BY updated_at ASC').map(rowToSession);
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    source: s.source,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    digest: s.digest ?? null,
    messages: listMessages(s.id).map((m) => ({
      role: m.role,
      content: m.content,
      reasoning: m.reasoning,
      createdAt: m.createdAt,
      status: m.status,
    })),
  }));
}

/** 从备份恢复（幂等：按会话 id 跳过已存在） */
export function importBackup(sessions: {
  id: string; title: string; source?: string; createdAt?: number; updatedAt?: number;
  digest?: string | null; messages: { role: string; content: string; createdAt?: number }[];
}[]): { imported: number; skipped: number } {
  const db = getDb();
  const result = { imported: 0, skipped: 0 };
  for (const s of sessions) {
    const exists = db.getFirstSync<{ id: string }>('SELECT id FROM sessions WHERE id = ?', [s.id]);
    if (exists) { result.skipped++; continue; }
    const now = Date.now();
    const base = s.createdAt ?? now;
    db.withTransactionSync(() => {
      db.runSync(
        `INSERT INTO sessions (id, title, source, source_session_id, model, created_at, updated_at, pinned, imported_meta, digest, digest_seq, memory_enabled)
         VALUES (?, ?, ?, NULL, NULL, ?, ?, 0, NULL, ?, 0, NULL)`,
        [s.id, s.title || '导入对话', s.source ?? 'local', base, s.updatedAt ?? base + s.messages.length, s.digest ?? null]
      );
      s.messages.forEach((m, i) => {
        if (!m.content?.trim()) return;
        db.runSync(
          `INSERT INTO messages (id, session_id, role, content, reasoning, created_at, status, error, meta, seq)
           VALUES (?, ?, ?, ?, NULL, ?, 'done', NULL, NULL, ?)`,
          [uuid(), s.id, m.role, m.content, m.createdAt ?? base + i, i + 1]
        );
      });
    });
    result.imported++;
  }
  return result;
}

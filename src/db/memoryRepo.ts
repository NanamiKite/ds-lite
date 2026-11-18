/**
 * 记忆仓储：手动添加 / 导入 / 自动提取 的用户事实
 */
import { getDb } from './database';
import { uuid } from '@/theme';

export type MemorySource = 'manual' | 'auto' | 'import';

export interface MemoryItem {
  id: string;
  content: string;
  source: MemorySource;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

interface MemoryRow {
  id: string;
  content: string;
  source: string;
  active: number;
  created_at: number;
  updated_at: number;
}

function rowToMemory(r: MemoryRow): MemoryItem {
  return {
    id: r.id,
    content: r.content,
    source: r.source as MemorySource,
    active: !!r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listMemories(opts: { onlyActive?: boolean } = {}): MemoryItem[] {
  const rows = opts.onlyActive
    ? getDb().getAllSync<MemoryRow>(
        'SELECT * FROM memories WHERE active = 1 ORDER BY updated_at DESC LIMIT 200'
      )
    : getDb().getAllSync<MemoryRow>('SELECT * FROM memories ORDER BY updated_at DESC LIMIT 500');
  return rows.map(rowToMemory);
}

export function addMemory(content: string, source: MemorySource = 'manual'): MemoryItem | null {
  const text = content.trim();
  if (!text) return null;
  const now = Date.now();
  const item: MemoryItem = { id: uuid(), content: text.slice(0, 200), source, active: true, createdAt: now, updatedAt: now };
  getDb().runSync(
    'INSERT INTO memories (id, content, source, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
    [item.id, item.content, item.source, item.createdAt, item.updatedAt]
  );
  return item;
}

export function updateMemory(id: string, patch: { content?: string; active?: boolean }): void {
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (patch.content !== undefined) {
    const t = patch.content.trim();
    if (!t) return;
    sets.push('content = ?');
    args.push(t.slice(0, 200));
  }
  if (patch.active !== undefined) { sets.push('active = ?'); args.push(patch.active ? 1 : 0); }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  args.push(Date.now(), id);
  getDb().runSync(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`, args);
}

export function deleteMemory(id: string): void {
  getDb().runSync('DELETE FROM memories WHERE id = ?', [id]);
}

export function countMemories(): { total: number; active: number } {
  const db = getDb();
  const t = db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM memories');
  const a = db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM memories WHERE active = 1');
  return { total: t?.c ?? 0, active: a?.c ?? 0 };
}

/** 批量导入（去重由调用方的 dedupeMemories 完成），返回新增条数 */
export function importMemories(items: string[], source: MemorySource = 'import'): number {
  let imported = 0;
  const db = getDb();
  db.withTransactionSync(() => {
    for (const raw of items) {
      const t = raw.trim();
      if (!t || t.length > 200) continue;
      db.runSync(
        'INSERT INTO memories (id, content, source, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
        [uuid(), t, source, Date.now(), Date.now()]
      );
      imported++;
    }
  });
  return imported;
}

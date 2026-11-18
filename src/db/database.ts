/**
 * SQLite 数据库初始化与迁移（expo-sqlite 同步 API）
 */
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('deepseek-lite.db');
    db.execSync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
    `);
    migrate(db);
  }
  return db;
}

function migrate(db: SQLite.SQLiteDatabase): void {
  const version = db.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const current = version?.user_version ?? 0;

  if (current < 1) {
    db.withTransactionSync(() => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL DEFAULT '新对话',
          source TEXT NOT NULL DEFAULT 'local',
          source_session_id TEXT,
          model TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          pinned INTEGER NOT NULL DEFAULT 0,
          imported_meta TEXT
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          reasoning TEXT,
          created_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'done',
          error TEXT,
          meta TEXT,
          seq INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
        CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_source
          ON sessions(source, source_session_id)
          WHERE source_session_id IS NOT NULL;
      `);
      db.execSync('PRAGMA user_version = 1;');
    });
  }

  if (current < 2) {
    db.withTransactionSync(() => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'manual',
          active INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(active, updated_at DESC);
      `);
      db.execSync('PRAGMA user_version = 2;');
    });
  }

  if (current < 3) {
    db.withTransactionSync(() => {
      db.execSync(`
        ALTER TABLE sessions ADD COLUMN summary TEXT;
        ALTER TABLE sessions ADD COLUMN summary_seq INTEGER NOT NULL DEFAULT 0;
      `);
      db.execSync('PRAGMA user_version = 3;');
    });
  }

  if (current < 4) {
    db.withTransactionSync(() => {
      db.execSync(`
        ALTER TABLE sessions ADD COLUMN digest TEXT;
        ALTER TABLE sessions ADD COLUMN digest_seq INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE sessions ADD COLUMN memory_enabled INTEGER;
      `);
      db.execSync('PRAGMA user_version = 4;');
    });
  }

  if (current < 5) {
    db.withTransactionSync(() => {
      db.execSync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_session_seq
          ON messages(session_id, seq);
      `);
      db.execSync('PRAGMA user_version = 5;');
    });
  }
}

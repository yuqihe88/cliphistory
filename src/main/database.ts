// ============================================================
// ClipHistory — SQLite 数据库模块（基于 sql.js / WASM）
// ============================================================

import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import type { ClipRecord, AppSettings, ClipType } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';

// ---- 数据库实例 ----
let db: SqlJsDatabase;

// ---- 目录路径 ----
let dbPath: string;
let imagesDir: string;

// ---- sql.js WASM 就绪 ----
let sqlReady = false;

// ---- 初始化 ----
export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData');

  dbPath = path.join(userDataPath, 'cliphistory.db');
  imagesDir = path.join(userDataPath, 'images');

  // 确保图片目录存在
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // 初始化 sql.js WASM
  const SQL = await initSqlJs();
  sqlReady = true;

  // 从文件加载或创建新数据库
  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } catch {
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS clipboard_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      type          TEXT    NOT NULL,
      content       TEXT,
      image_path    TEXT,
      image_size    INTEGER,
      is_pinned     INTEGER DEFAULT 0,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL
    );
  `);

  // 创建索引
  db.run('CREATE INDEX IF NOT EXISTS idx_created_at ON clipboard_history(created_at DESC);');
  db.run('CREATE INDEX IF NOT EXISTS idx_is_pinned  ON clipboard_history(is_pinned);');
  db.run('CREATE INDEX IF NOT EXISTS idx_type       ON clipboard_history(type);');

  // 创建设置表
  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 初始化默认设置
  initDefaultSettings();

  // 持久化
  saveToDisk();
}

// ---- 持久化到磁盘 ----
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePending = false;

/** 立即写入磁盘（关键操作使用） */
function saveToDisk(): void {
  if (!sqlReady) return;
  try {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    savePending = false;
  } catch (err) {
    console.error('保存数据库失败:', err);
  }
}

/** 防抖写入：在频繁变更时合并写入，最大延迟 1 秒 */
function saveToDiskDebounced(): void {
  if (!sqlReady) return;
  savePending = true;
  if (saveTimer) return; // 已有待执行的保存
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveToDisk();
  }, 1000);
}

/** 立即刷新待处理的写入（关闭数据库前使用） */
function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (savePending) {
    saveToDisk();
  }
}

// ---- 查询辅助 ----
/** 将 sql.js 行数组转换为 ClipRecord */
function rowToRecord(row: any[]): ClipRecord {
  return {
    id: row[0] as number,
    type: row[1] as ClipType,
    content: (row[2] ?? null) as string | null,
    imagePath: (row[3] ?? null) as string | null,
    imageSize: (row[4] ?? null) as number | null,
    isPinned: row[5] === 1,
    createdAt: row[6] as string,
    updatedAt: row[7] as string,
  };
}

/** 执行 SELECT 并将结果转为 ClipRecord[] */
function execSelect(sql: string, params?: any[]): ClipRecord[] {
  const results = db.exec(sql, params);
  if (results.length === 0 || results[0].values.length === 0) return [];
  return results[0].values.map(rowToRecord);
}

// ---- 设置操作 ----
function initDefaultSettings(): void {
  const r = db.exec("SELECT key FROM app_settings WHERE key = 'retentionDays'");
  if (r.length > 0 && r[0].values.length > 0) return;

  db.run('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
    ['retentionDays', String(DEFAULT_SETTINGS.retentionDays)]);
  db.run('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
    ['autoLaunch', String(DEFAULT_SETTINGS.autoLaunch)]);
  db.run('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
    ['shortcutKey', DEFAULT_SETTINGS.shortcutKey]);
  saveToDisk();
}

export function getSettings(): AppSettings {
  const results = db.exec('SELECT key, value FROM app_settings');
  const settings: Record<string, string> = {};
  if (results.length > 0) {
    for (const row of results[0].values) {
      settings[row[0] as string] = row[1] as string;
    }
  }
  return {
    retentionDays: (Number(settings['retentionDays']) || 3) as 1 | 3 | 5,
    autoLaunch: settings['autoLaunch'] !== 'false',
    shortcutKey: settings['shortcutKey'] || DEFAULT_SETTINGS.shortcutKey,
  };
}

export function saveSettings(partial: Partial<AppSettings>): boolean {
  try {
    if (partial.retentionDays !== undefined) {
      db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
        ['retentionDays', String(partial.retentionDays)]);
    }
    if (partial.autoLaunch !== undefined) {
      db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
        ['autoLaunch', String(partial.autoLaunch)]);
    }
    if (partial.shortcutKey !== undefined) {
      db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
        ['shortcutKey', partial.shortcutKey]);
    }
    saveToDisk();
    return true;
  } catch {
    return false;
  }
}

// ---- 粘贴板记录 CRUD ----

export function findExistingText(content: string): ClipRecord | null {
  const records = execSelect(
    'SELECT * FROM clipboard_history WHERE type = ? AND content = ? ORDER BY created_at DESC LIMIT 1',
    ['text', content]
  );
  return records.length > 0 ? records[0] : null;
}

export function insertRecord(
  type: ClipType,
  content: string | null,
  imagePath: string | null = null,
  imageSize: number | null = null
): ClipRecord {
  const now = new Date().toISOString();

  // 去重：文字内容已存在则更新 updated_at
  if (type === 'text' && content) {
    const existing = findExistingText(content);
    if (existing) {
      db.run('UPDATE clipboard_history SET updated_at = ? WHERE id = ?', [now, existing.id]);
      saveToDiskDebounced();
      return { ...existing, updatedAt: now };
    }
  }

  db.run(
    `INSERT INTO clipboard_history (type, content, image_path, image_size, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [type, content, imagePath, imageSize, now, now]
  );

  const idResult = db.exec('SELECT last_insert_rowid()');
  const id = Number(idResult[0].values[0][0]);

  saveToDiskDebounced();

  return { id, type, content, imagePath, imageSize, isPinned: false, createdAt: now, updatedAt: now };
}

export function getHistory(limit: number = 50, offset: number = 0): ClipRecord[] {
  return execSelect(
    `SELECT * FROM clipboard_history
     ORDER BY is_pinned DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
}

export function searchHistory(keyword: string): ClipRecord[] {
  return execSelect(
    `SELECT * FROM clipboard_history
     WHERE type = 'text' AND content LIKE ?
     ORDER BY is_pinned DESC, created_at DESC`,
    [`%${keyword}%`]
  );
}

export function setPinned(id: number, pinned: boolean): boolean {
  db.run('UPDATE clipboard_history SET is_pinned = ?, updated_at = ? WHERE id = ?', [
    pinned ? 1 : 0, new Date().toISOString(), id,
  ]);
  const changes = db.getRowsModified();
  saveToDiskDebounced();
  return changes > 0;
}

export function deleteRecord(id: number): boolean {
  const results = db.exec('SELECT * FROM clipboard_history WHERE id = ?', [id]);
  if (results.length === 0 || results[0].values.length === 0) return false;

  const row = results[0].values[0];
  if (row[1] === 'image' && row[3]) {
    try {
      if (fs.existsSync(row[3] as string)) fs.unlinkSync(row[3] as string);
    } catch { /* ignore */ }
  }

  db.run('DELETE FROM clipboard_history WHERE id = ?', [id]);
  const changes = db.getRowsModified();
  saveToDisk();
  return changes > 0;
}

export function getRecordById(id: number): ClipRecord | null {
  const records = execSelect('SELECT * FROM clipboard_history WHERE id = ?', [id]);
  return records.length > 0 ? records[0] : null;
}

export function cleanupOldRecords(retentionDays: number): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString();

  // 删除过期图片文件
  const imgResults = db.exec(
    `SELECT * FROM clipboard_history
     WHERE is_pinned = 0 AND type = 'image' AND created_at < ?`,
    [cutoffStr]
  );
  if (imgResults.length > 0) {
    for (const row of imgResults[0].values) {
      if (row[3]) {
        try { if (fs.existsSync(row[3] as string)) fs.unlinkSync(row[3] as string); } catch { /* */ }
      }
    }
  }

  db.run('DELETE FROM clipboard_history WHERE is_pinned = 0 AND created_at < ?', [cutoffStr]);
  const deleted = db.getRowsModified();
  saveToDisk();
  return deleted;
}

export function clearAll(): boolean {
  try {
    const imgResults = db.exec("SELECT image_path FROM clipboard_history WHERE type = 'image'");
    if (imgResults.length > 0) {
      for (const row of imgResults[0].values) {
        if (row[0]) {
          try { if (fs.existsSync(row[0] as string)) fs.unlinkSync(row[0] as string); } catch { /* */ }
        }
      }
    }
    db.run('DELETE FROM clipboard_history');
    saveToDisk();
    return true;
  } catch {
    return false;
  }
}

export function closeDatabase(): void {
  if (db) {
    flushSave();
    db.close();
  }
}

export { imagesDir };

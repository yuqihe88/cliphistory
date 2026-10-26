// ============================================================
// ClipHistory — SQLite 数据库模块（基于 sql.js / WASM）
// ============================================================

import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import type { ClipRecord, AppSettings, ClipType, ClipTypeFilter, PromptItem } from '../shared/types';
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

  // 创建常用提示词表（独立于历史记录：永不参与自动清理，仅手动删除）
  db.run(`
    CREATE TABLE IF NOT EXISTS prompts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
/** 是否为应用自己管理的图片文件（只有这些才允许随记录删除） */
function isManagedImagePath(p: string | null | undefined): boolean {
  if (!p) return false;
  try {
    return path.resolve(p).startsWith(path.resolve(imagesDir));
  } catch {
    return false;
  }
}

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
/** 解析排除应用名单（JSON 数组，容错） */
function safeParseArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.trim()) : [];
  } catch {
    return [];
  }
}

function initDefaultSettings(): void {
  const r = db.exec("SELECT key FROM app_settings WHERE key = 'retentionDays'");
  if (r.length > 0 && r[0].values.length > 0) return;

  db.run('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
    ['retentionDays', String(DEFAULT_SETTINGS.retentionDays)]);
  db.run('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
    ['autoLaunch', String(DEFAULT_SETTINGS.autoLaunch)]);
  db.run('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
    ['shortcutKey', DEFAULT_SETTINGS.shortcutKey]);
  db.run('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
    ['floatMode', String(DEFAULT_SETTINGS.floatMode)]);
  db.run('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
    ['paused', String(DEFAULT_SETTINGS.paused)]);
  db.run('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
    ['excludedApps', JSON.stringify(DEFAULT_SETTINGS.excludedApps)]);
  db.run('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
    ['maxRecords', String(DEFAULT_SETTINGS.maxRecords)]);
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
    floatMode: settings['floatMode'] === 'true',
    paused: settings['paused'] === 'true',
    excludedApps: safeParseArray(settings['excludedApps']),
    maxRecords: Number(settings['maxRecords'] ?? DEFAULT_SETTINGS.maxRecords) || 0,
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
    if (partial.floatMode !== undefined) {
      db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
        ['floatMode', String(partial.floatMode)]);
    }
    if (partial.paused !== undefined) {
      db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
        ['paused', String(partial.paused)]);
    }
    if (partial.excludedApps !== undefined) {
      db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
        ['excludedApps', JSON.stringify(partial.excludedApps.filter((x) => typeof x === 'string' && x.trim()))]);
    }
    if (partial.maxRecords !== undefined) {
      db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
        ['maxRecords', String(Math.max(0, Math.floor(partial.maxRecords)))]);
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

/** 按内容查找已有的文字/视频记录（去重用） */
function findExistingByContent(type: ClipType, content: string): ClipRecord | null {
  const records = execSelect(
    'SELECT * FROM clipboard_history WHERE type = ? AND content = ? ORDER BY created_at DESC LIMIT 1',
    [type, content]
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

  // 去重：文字/视频内容已存在则更新 updated_at
  if ((type === 'text' || type === 'video') && content) {
    const existing = findExistingByContent(type, content);
    if (existing) {
      db.run('UPDATE clipboard_history SET updated_at = ? WHERE id = ?', [now, existing.id]);
      saveToDiskDebounced();
      return { ...existing, updatedAt: now };
    }
  }

  // 去重：同一图片路径（位图捕获文件/引用的原文件）已存在则更新 updated_at
  if (type === 'image' && imagePath) {
    const existing = execSelect(
      'SELECT * FROM clipboard_history WHERE type = ? AND image_path = ? ORDER BY created_at DESC LIMIT 1',
      ['image', imagePath]
    );
    if (existing.length > 0) {
      const rec = existing[0];
      db.run('UPDATE clipboard_history SET updated_at = ? WHERE id = ?', [now, rec.id]);
      saveToDiskDebounced();
      return { ...rec, updatedAt: now };
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
  enforceRecordCap();

  return { id, type, content, imagePath, imageSize, isPinned: false, createdAt: now, updatedAt: now };
}

/** 条数上限：超出 maxRecords 时删除最旧的未置顶记录（置顶受保护，图片文件同步清理） */
export function enforceRecordCap(): void {
  const max = getSettings().maxRecords;
  if (!max || max <= 0) return;
  const countRes = db.exec('SELECT COUNT(*) FROM clipboard_history');
  const total = Number(countRes[0]?.values[0]?.[0] ?? 0);
  if (total <= max) return;

  const expired = execSelect(
    `SELECT * FROM clipboard_history
     WHERE is_pinned = 0 AND id NOT IN (
       SELECT id FROM clipboard_history ORDER BY is_pinned DESC, created_at DESC LIMIT ?
     )`,
    [max]
  );
  if (expired.length === 0) return;

  for (const rec of expired) {
    if (rec.type === 'image' && isManagedImagePath(rec.imagePath)) {
      try { if (fs.existsSync(rec.imagePath as string)) fs.unlinkSync(rec.imagePath as string); } catch { /* ignore */ }
    }
  }
  db.run(`DELETE FROM clipboard_history WHERE id IN (${expired.map(() => '?').join(',')})`, expired.map((r) => r.id));
  saveToDisk();
  console.log(`[Cap] 超出上限 ${max} 条，清理 ${expired.length} 条最旧记录`);
}

export function getHistory(limit: number = 50, offset: number = 0, type: ClipTypeFilter = 'all'): ClipRecord[] {
  if (type !== 'all') {
    return execSelect(
      `SELECT * FROM clipboard_history
       WHERE type = ?
       ORDER BY is_pinned DESC, created_at DESC
       LIMIT ? OFFSET ?`,
      [type, limit, offset]
    );
  }
  return execSelect(
    `SELECT * FROM clipboard_history
     ORDER BY is_pinned DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
}

export function searchHistory(keyword: string, type: ClipTypeFilter = 'all'): ClipRecord[] {
  const conditions = ['content LIKE ?'];
  const params: any[] = [`%${keyword}%`];
  if (type !== 'all') {
    conditions.push('type = ?');
    params.push(type);
  }
  return execSelect(
    `SELECT * FROM clipboard_history
     WHERE ${conditions.join(' AND ')}
     ORDER BY is_pinned DESC, created_at DESC`,
    params
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
  if (row[1] === 'image' && isManagedImagePath(row[3] as string)) {
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
      if (isManagedImagePath(row[3] as string)) {
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
        if (isManagedImagePath(row[0] as string)) {
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

// ---- 常用提示词 CRUD（永久保存模块，不参与自动清理） ----

function rowToPrompt(row: any[]): PromptItem {
  return {
    id: row[0] as number,
    content: row[1] as string,
    createdAt: row[2] as string,
    updatedAt: row[3] as string,
  };
}

export function getPrompts(): PromptItem[] {
  const results = db.exec('SELECT id, content, created_at, updated_at FROM prompts ORDER BY updated_at DESC');
  if (results.length === 0 || results[0].values.length === 0) return [];
  return results[0].values.map(rowToPrompt);
}

export function getPromptById(id: number): PromptItem | null {
  const results = db.exec('SELECT id, content, created_at, updated_at FROM prompts WHERE id = ?', [id]);
  if (results.length === 0 || results[0].values.length === 0) return null;
  return rowToPrompt(results[0].values[0]);
}

export function addPrompt(content: string): PromptItem {
  const now = new Date().toISOString();
  db.run('INSERT INTO prompts (content, created_at, updated_at) VALUES (?, ?, ?)', [content, now, now]);
  const id = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
  saveToDisk();
  return { id, content, createdAt: now, updatedAt: now };
}

export function updatePrompt(id: number, content: string): boolean {
  db.run('UPDATE prompts SET content = ?, updated_at = ? WHERE id = ?', [content, new Date().toISOString(), id]);
  const changed = db.getRowsModified();
  saveToDisk();
  return changed > 0;
}

export function deletePrompt(id: number): boolean {
  db.run('DELETE FROM prompts WHERE id = ?', [id]);
  const changed = db.getRowsModified();
  saveToDisk();
  return changed > 0;
}

export function closeDatabase(): void {
  if (db) {
    flushSave();
    db.close();
  }
}

export { imagesDir };

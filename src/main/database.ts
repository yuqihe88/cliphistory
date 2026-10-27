// ============================================================
// ClipHistory — SQLite 数据库模块（基于 sql.js / WASM）
// ============================================================

import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { app } from 'electron';
import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from 'sql.js';
import type { ClipRecord, AppSettings, ClipType, ClipTypeFilter, PromptItem, Project, ProjectItem, ProjectItemType, ProjectImportResult, ProjectTransferSource, ProjectTransferMode } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';

// ---- 数据库实例 ----
let db: SqlJsDatabase;
let DatabaseConstructor: SqlJsStatic['Database'];

// ---- 目录路径 ----
let dbPath: string;
let imagesDir: string;
let projectFilesDir: string;

// ---- sql.js WASM 就绪 ----
let sqlReady = false;

// ---- 初始化 ----
export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData');

  dbPath = path.join(userDataPath, 'cliphistory.db');
  imagesDir = path.join(userDataPath, 'images');
  projectFilesDir = path.join(userDataPath, 'project-files');

  // 确保图片目录存在
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // 初始化 sql.js WASM
  const SQL = await initSqlJs();
  DatabaseConstructor = SQL.Database;
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

  // 项目素材永久保存，与历史清理、条数上限和常用提示词相互独立。
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      file_path TEXT,
      file_name TEXT,
      file_size INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_project_items_project ON project_items(project_id, updated_at DESC);
  `);

  // 旧提示词入口已合并到项目；先迁移成功，再继续启动，失败时保留旧数据。
  migrateLegacyPrompts();

  // 初始化默认设置
  initDefaultSettings();

  // 持久化
  saveToDisk();
}

// ---- 持久化到磁盘 ----
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePending = false;

/** 立即写入磁盘（关键操作使用） */
function saveToDisk(throwOnError = false): void {
  if (!sqlReady) return;
  const temporaryPath = `${dbPath}.${randomUUID()}.tmp`;
  try {
    const data = db.export();
    // 同目录临时文件原子替换，写入失败时保留上一份完整数据库。
    fs.writeFileSync(temporaryPath, Buffer.from(data), { flag: 'wx' });
    fs.renameSync(temporaryPath, dbPath);
    savePending = false;
  } catch (err) {
    console.error('保存数据库失败:', err);
    if (throwOnError) throw new Error('保存失败，请检查磁盘空间和数据文件夹权限');
  } finally {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch { /* 下次写入使用独立临时文件 */ }
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

// ---- 项目素材（永久保存，不参与历史记录清理） ----

const PROJECT_ITEM_COLUMNS = 'id, project_id, type, title, content, file_path, file_name, file_size, created_at, updated_at';
const PROJECT_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);
const PROJECT_VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.ts', '.3gp', '.rmvb', '.rm']);

function projectName(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请输入项目名称');
  const name = value.trim();
  if (name.length > 60) throw new Error('项目名称不能超过 60 个字');
  return name;
}

function projectText(title: string, content: string): { title: string; content: string } {
  if (typeof content !== 'string' || !content.trim()) throw new Error('请输入文字内容');
  if (typeof title !== 'string' || title.trim().length > 120) throw new Error('素材标题不能超过 120 个字');
  return { title: title.trim() || content.trim().split(/\r?\n/)[0].slice(0, 60), content };
}

function requireProject(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0 || !db.exec('SELECT id FROM projects WHERE id = ?', [id])[0]?.values.length) {
    throw new Error('项目不存在，请重新选择项目');
  }
}

function rowToProjectItem(row: any[]): ProjectItem {
  return {
    id: row[0] as number,
    projectId: row[1] as number,
    type: row[2] as ProjectItemType,
    title: row[3] as string,
    content: (row[4] ?? null) as string | null,
    filePath: (row[5] ?? null) as string | null,
    fileName: (row[6] ?? null) as string | null,
    fileSize: (row[7] ?? null) as number | null,
    createdAt: row[8] as string,
    updatedAt: row[9] as string,
  };
}

/** sql.js 导出会结束事务，因此以快照恢复保证保存失败时内存和磁盘均保留旧数据。 */
function changeProjects<T>(change: () => T): T {
  const before = db.export();
  try {
    const result = change();
    saveToDisk(true);
    return result;
  } catch (error) {
    db.close();
    db = new DatabaseConstructor(before);
    throw error;
  }
}

/** 将旧提示词一次性归入专用项目；目标、来源清空和标记共用一次原子保存。 */
function migrateLegacyPrompts(): void {
  const rows = db.exec('SELECT id, content, created_at, updated_at FROM prompts ORDER BY created_at, id')[0]?.values ?? [];
  if (!rows.length) return;
  changeProjects(() => {
    const marker = db.exec("SELECT value FROM app_settings WHERE key = 'legacyPromptsProjectId'")[0]?.values[0]?.[0];
    let projectId = Number(marker);
    const existing = Number.isSafeInteger(projectId) && projectId > 0
      ? db.exec('SELECT created_at, updated_at FROM projects WHERE id = ?', [projectId])[0]?.values[0]
      : undefined;
    const createdAt = rows.map((row) => row[2] as string).sort()[0];
    const updatedAt = rows.map((row) => row[3] as string).sort().slice(-1)[0];
    if (!existing) {
      let name = '常用文本';
      let suffix = 0;
      while (db.exec('SELECT id FROM projects WHERE name = ?', [name])[0]?.values.length) {
        suffix += 1;
        name = suffix === 1 ? '常用文本（原提示词）' : `常用文本（原提示词）${suffix}`;
      }
      db.run('INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)', [name, createdAt, updatedAt]);
      projectId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
    } else {
      db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [[existing[1] as string, updatedAt].sort().slice(-1)[0], projectId]);
    }
    for (const row of rows) {
      db.run(`INSERT INTO project_items (project_id, type, title, content, created_at, updated_at)
        VALUES (?, 'text', '', ?, ?, ?)`, [projectId, row[1], row[2], row[3]]);
    }
    db.run('DELETE FROM prompts');
    db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('legacyPromptsProjectId', ?)", [String(projectId)]);
  });
}

export function getProjects(): Project[] {
  const rows = db.exec(`
    SELECT p.id, p.name, COUNT(i.id), p.created_at, p.updated_at
    FROM projects p LEFT JOIN project_items i ON i.project_id = p.id
    GROUP BY p.id ORDER BY p.updated_at DESC, p.id DESC
  `)[0]?.values ?? [];
  return rows.map((row) => ({
    id: row[0] as number, name: row[1] as string, itemCount: row[2] as number,
    createdAt: row[3] as string, updatedAt: row[4] as string,
  }));
}

export function createProject(name: string): Project {
  const validName = projectName(name);
  const now = new Date().toISOString();
  return changeProjects(() => {
    db.run('INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)', [validName, now, now]);
    const id = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
    return { id, name: validName, itemCount: 0, createdAt: now, updatedAt: now };
  });
}

export function renameProject(id: number, name: string): boolean {
  requireProject(id);
  const validName = projectName(name);
  return changeProjects(() => {
    db.run('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?', [validName, new Date().toISOString(), id]);
    return true;
  });
}

/** 仅删除 project-files/<UUID>/<原文件名> 内的副本，拒绝相似前缀和链接逃逸。 */
function removeProjectCopy(filePath: string | null): void {
  if (!filePath || !fs.existsSync(filePath)) return;
  const relative = path.relative(path.resolve(projectFilesDir), path.resolve(filePath));
  const parts = relative.split(path.sep);
  if (parts.length !== 2 || !/^[0-9a-f-]{36}$/i.test(parts[0]) || parts[1] === '..' || path.isAbsolute(relative)) {
    throw new Error('素材文件路径不在项目存储目录内');
  }
  const root = fs.realpathSync(projectFilesDir);
  const actualRelative = path.relative(root, fs.realpathSync(filePath));
  if (actualRelative !== relative) throw new Error('素材文件路径不在项目存储目录内');
  fs.unlinkSync(filePath);
  const directory = path.dirname(filePath);
  if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
}

export function deleteProject(id: number): boolean {
  requireProject(id);
  const items = getProjectItems(id);
  changeProjects(() => {
    db.run('DELETE FROM project_items WHERE project_id = ?', [id]);
    db.run('DELETE FROM projects WHERE id = ?', [id]);
  });
  // 数据库确认保存后才清理副本，避免磁盘写入失败时丢失仍在项目内的素材。
  for (const item of items) {
    try { removeProjectCopy(item.filePath); } catch (error) { console.error('清理项目文件副本失败:', error); }
  }
  return true;
}

export function getProjectItems(projectId: number): ProjectItem[] {
  requireProject(projectId);
  const rows = db.exec(`SELECT ${PROJECT_ITEM_COLUMNS} FROM project_items WHERE project_id = ? ORDER BY updated_at DESC, id DESC`, [projectId])[0]?.values ?? [];
  return rows.map(rowToProjectItem);
}

export function getProjectItemById(id: number): ProjectItem | null {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const row = db.exec(`SELECT ${PROJECT_ITEM_COLUMNS} FROM project_items WHERE id = ?`, [id])[0]?.values[0];
  return row ? rowToProjectItem(row) : null;
}

function insertProjectItem(
  projectId: number, type: ProjectItemType, title: string, content: string | null,
  filePath: string | null = null, fileName: string | null = null, fileSize: number | null = null,
  afterInsert?: () => void
): ProjectItem {
  requireProject(projectId);
  const now = new Date().toISOString();
  return changeProjects(() => {
    db.run(`INSERT INTO project_items (project_id, type, title, content, file_path, file_name, file_size, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [projectId, type, title, content, filePath, fileName, fileSize, now, now]);
    const id = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
    db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [now, projectId]);
    afterInsert?.();
    return { id, projectId, type, title, content, filePath, fileName, fileSize, createdAt: now, updatedAt: now };
  });
}

export function addProjectText(projectId: number, title: string, content: string): ProjectItem {
  const text = projectText(title, content);
  return insertProjectItem(projectId, 'text', text.title, text.content);
}

export function updateProjectText(id: number, title: string, content: string): boolean {
  const item = getProjectItemById(id);
  if (!item || item.type !== 'text') return false;
  const text = projectText(title, content);
  const now = new Date().toISOString();
  return changeProjects(() => {
    db.run('UPDATE project_items SET title = ?, content = ?, updated_at = ? WHERE id = ?', [text.title, text.content, now, id]);
    db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [now, item.projectId]);
    return true;
  });
}

async function copyProjectFile(
  sourcePath: string, save: (destination: string, fileName: string, fileSize: number) => ProjectItem
): Promise<ProjectItem> {
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) throw new Error('请选择本地文件');
  const source = path.resolve(sourcePath);
  const info = await fs.promises.stat(source);
  if (!info.isFile()) throw new Error('请选择文件，暂不支持文件夹');
  const fileName = path.basename(source);
  // 每个副本独立目录，复制到其他软件时仍保留原文件名。
  const directory = path.join(projectFilesDir, randomUUID());
  const destination = path.join(directory, fileName);
  await fs.promises.mkdir(directory, { recursive: true });
  try {
    await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
    const copiedInfo = await fs.promises.stat(destination);
    const currentInfo = await fs.promises.stat(source);
    if (info.size !== currentInfo.size || info.mtimeMs !== currentInfo.mtimeMs || info.ctimeMs !== currentInfo.ctimeMs) {
      throw new Error('源文件在复制过程中发生变化，请重试');
    }
    return save(destination, fileName, copiedInfo.size);
  } catch (error) {
    // 仅处理刚创建且已确认位于项目目录内的副本，不触及源文件。
    if (fs.existsSync(destination)) removeProjectCopy(destination);
    else if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
    throw error;
  }
}

async function importProjectFile(projectId: number, sourcePath: string): Promise<ProjectItem> {
  requireProject(projectId);
  if (typeof sourcePath !== 'string') throw new Error('请选择本地文件');
  const extension = path.extname(sourcePath).toLowerCase();
  const type = PROJECT_IMAGE_EXTENSIONS.has(extension) ? 'image' : PROJECT_VIDEO_EXTENSIONS.has(extension) ? 'video' : 'file';
  return copyProjectFile(sourcePath, (destination, fileName, fileSize) =>
    insertProjectItem(projectId, type, fileName.slice(0, 120), null, destination, fileName, fileSize));
}

export async function importProjectFiles(projectId: number, paths: string[]): Promise<ProjectImportResult> {
  requireProject(projectId);
  if (!Array.isArray(paths) || paths.some((value) => typeof value !== 'string')) throw new Error('请选择有效文件');
  const result: ProjectImportResult = { items: [], failed: [] };
  for (const sourcePath of paths) {
    try {
      result.items.push(await importProjectFile(projectId, sourcePath));
    } catch (error) {
      console.error('导入项目素材失败:', sourcePath, error);
      result.failed.push(path.basename(sourcePath));
    }
  }
  return result;
}

export async function saveHistoryToProject(projectId: number, recordId: number): Promise<ProjectItem> {
  return transferToProject({ kind: 'history', id: recordId }, projectId, 'copy');
}

function readTransferSource(source: ProjectTransferSource): {
  item: Pick<ProjectItem, 'type' | 'title' | 'content' | 'filePath' | 'fileName' | 'fileSize'>;
  projectId: number | null;
  version: string;
} {
  if (source.kind === 'project') {
    const item = getProjectItemById(source.id);
    if (!item) throw new Error('这条项目素材已被删除，请刷新后重试');
    return { item, projectId: item.projectId, version: JSON.stringify(item) };
  }
  if (source.kind === 'prompt') {
    const prompt = getPromptById(source.id);
    if (!prompt) throw new Error('这条提示词已被删除，请刷新后重试');
    const text = projectText('', prompt.content);
    return { item: { type: 'text', ...text, filePath: null, fileName: null, fileSize: null }, projectId: null, version: JSON.stringify(prompt) };
  }
  const record = getRecordById(source.id);
  if (!record) throw new Error('这条历史记录已被删除，请刷新后重试');
  const version = JSON.stringify(record);
  if (record.type === 'text') {
    const text = projectText('', record.content ?? '');
    return { item: { type: 'text', ...text, filePath: null, fileName: null, fileSize: null }, projectId: null, version };
  }
  const filePath = record.type === 'image' ? record.imagePath : record.content;
  if (!filePath) throw new Error('这条历史记录没有可保存的文件');
  const fileName = path.basename(filePath);
  return {
    item: { type: record.type, title: fileName.slice(0, 120), content: null, filePath, fileName, fileSize: record.imageSize },
    projectId: null, version,
  };
}

function cleanupMovedHistoryImage(filePath: string | null): void {
  if (!filePath || !fs.existsSync(filePath)) return;
  const relative = path.relative(path.resolve(imagesDir), path.resolve(filePath));
  if (!relative || relative === '..' || relative.includes(path.sep) || path.isAbsolute(relative)) return;
  const references = db.exec("SELECT image_path FROM clipboard_history WHERE type = 'image' AND image_path IS NOT NULL")[0]?.values ?? [];
  if (references.some((row) => path.resolve(row[0] as string).toLowerCase() === path.resolve(filePath).toLowerCase())) return;
  if (path.relative(fs.realpathSync(imagesDir), fs.realpathSync(filePath)) !== relative) return;
  fs.unlinkSync(filePath);
}

/** 将现有内容复制或移动到项目；源记录删除与目标记录新增共用一次持久化。 */
export async function transferToProject(
  source: ProjectTransferSource, targetProjectId: number, mode: ProjectTransferMode
): Promise<ProjectItem> {
  if (!source || !['history', 'project', 'prompt'].includes(source.kind) || !Number.isSafeInteger(source.id) || source.id <= 0) {
    throw new Error('请选择有效的来源内容');
  }
  if (mode !== 'copy' && mode !== 'move') throw new Error('请选择复制或移动');
  requireProject(targetProjectId);
  const initial = readTransferSource(source);
  if (initial.projectId === targetProjectId) throw new Error('请选择其他项目，内容已在当前项目中');

  if (source.kind === 'project' && mode === 'move') {
    // 移动仅调整归属，无需重新读取或复制文件，文件暂时不可访问时也能整理项目。
    return changeProjects(() => {
      const now = new Date().toISOString();
      db.run('UPDATE project_items SET project_id = ?, updated_at = ? WHERE id = ?', [targetProjectId, now, source.id]);
      db.run('UPDATE projects SET updated_at = ? WHERE id IN (?, ?)', [now, initial.projectId, targetProjectId]);
      return getProjectItemById(source.id)!;
    });
  }

  const save = (filePath: string | null, fileSize: number | null): ProjectItem => {
    requireProject(targetProjectId);
    if (readTransferSource(source).version !== initial.version) throw new Error('源内容已发生变化，请刷新后重试');
    const item = initial.item;
    const result = insertProjectItem(targetProjectId, item.type, item.title, item.content, filePath, item.fileName, fileSize, () => {
      if (mode === 'move') {
        // 项目来源的移动已由上方直接调整归属处理。
        if (source.kind === 'history') db.run('DELETE FROM clipboard_history WHERE id = ?', [source.id]);
        else if (source.kind === 'prompt') db.run('DELETE FROM prompts WHERE id = ?', [source.id]);
      }
    });
    if (mode === 'move' && source.kind === 'history' && item.type === 'image') {
      try { cleanupMovedHistoryImage(item.filePath); } catch (error) { console.error('清理已移动的历史图片失败:', error); }
    }
    return result;
  };
  if (initial.item.type === 'text') return save(null, null);
  if (!initial.item.filePath) throw new Error('这条素材没有可复制的文件');
  return copyProjectFile(initial.item.filePath, (destination, _fileName, fileSize) => save(destination, fileSize));
}

export function deleteProjectItem(id: number): boolean {
  const item = getProjectItemById(id);
  if (!item) return false;
  changeProjects(() => {
    db.run('DELETE FROM project_items WHERE id = ?', [id]);
    db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [new Date().toISOString(), item.projectId]);
  });
  try { removeProjectCopy(item.filePath); } catch (error) { console.error('清理项目文件副本失败:', error); }
  return true;
}

export function closeDatabase(): void {
  if (db) {
    flushSave();
    db.close();
  }
}

export { imagesDir };

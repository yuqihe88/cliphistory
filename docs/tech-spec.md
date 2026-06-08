# 技术规格说明 — ClipHistory

> 版本：v1.0 | 日期：2026-06-02

---

## 1. 技术栈

| 层级 | 技术 | 版本要求 |
|------|------|---------|
| 桌面框架 | Electron | ^28.0.0 |
| 前端库 | React | ^18.2.0 |
| 类型系统 | TypeScript | ^5.3.0 |
| 样式框架 | Tailwind CSS | ^3.4.0 |
| 构建工具 | Vite (renderer) + tsc (main) | ^5.0.0 |
| 本地数据库 | better-sqlite3 | ^11.0.0 |
| 打包工具 | electron-builder | ^24.0.0 |
| 开机自启 | electron-auto-launch | ^2.0.0 |
| 包管理 | npm | — |

---

## 2. 项目架构

```
┌─────────────────────────────────────────┐
│              Electron 主进程              │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 粘贴板   │ │ SQLite   │ │ 托盘/    │  │
│  │ 监听器   │ │ 数据库   │ │ 快捷键   │  │
│  └────┬────┘ └────┬─────┘ └────┬─────┘  │
│       │           │            │         │
│       └───────────┼────────────┘         │
│                   │ IPC (ipcMain)         │
├───────────────────┼──────────────────────┤
│                   │                      │
│  Electron 渲染进程  │                      │
│  ┌─────────────────┴──────────────────┐  │
│  │         React 应用                  │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐  │  │
│  │  │ 列表   │ │ 搜索   │ │ 设置   │  │  │
│  │  │ 组件   │ │ 组件   │ │ 组件   │  │  │
│  │  └────────┘ └────────┘ └────────┘  │  │
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│              共享类型层 (shared)           │
└──────────────────────────────────────────┘
```

### 通信方式

- 主进程 ↔ 渲染进程：Electron IPC（`ipcMain.handle` / `ipcRenderer.invoke`）
- 渲染进程不直接访问数据库或系统 API，全部通过 IPC 调用

---

## 3. 数据模型

### 3.1 数据库表：clipboard_history

```sql
CREATE TABLE IF NOT EXISTS clipboard_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT    NOT NULL,  -- 'text' | 'image'
  content       TEXT,              -- 文字内容（type='text'时）
  image_path    TEXT,              -- 图片文件路径（type='image'时）
  image_size    INTEGER,           -- 图片大小（字节）
  is_pinned     INTEGER DEFAULT 0, -- 0=未置顶, 1=已置顶
  created_at    TEXT    NOT NULL,  -- ISO 8601 时间戳
  updated_at    TEXT    NOT NULL   -- ISO 8601 时间戳
);
```

### 3.2 索引

```sql
CREATE INDEX idx_created_at ON clipboard_history(created_at DESC);
CREATE INDEX idx_is_pinned  ON clipboard_history(is_pinned);
CREATE INDEX idx_type       ON clipboard_history(type);
```

### 3.3 TypeScript 类型定义

```typescript
// src/shared/types.ts

export type ClipType = 'text' | 'image';

export interface ClipRecord {
  id: number;
  type: ClipType;
  content: string | null;      // 文字内容
  imagePath: string | null;     // 图片路径
  imageSize: number | null;     // 图片大小
  isPinned: boolean;
  createdAt: string;            // ISO 8601
  updatedAt: string;            // ISO 8601
}

export interface AppSettings {
  retentionDays: 1 | 3 | 5;    // 保留天数
  autoLaunch: boolean;          // 开机自启
  shortcutKey: string;          // 快捷键，默认 'Ctrl+Shift+V'
}

// IPC 通道名称
export const IPC_CHANNELS = {
  GET_HISTORY:    'clipboard:get-history',
  SEARCH:         'clipboard:search',
  PIN:            'clipboard:pin',
  UNPIN:          'clipboard:unpin',
  DELETE:         'clipboard:delete',
  COPY_TO_CLIP:   'clipboard:copy-to-clip',
  GET_SETTINGS:   'settings:get',
  SAVE_SETTINGS:  'settings:save',
  CLEANUP:        'clipboard:cleanup',
  CLEAR_ALL:      'clipboard:clear-all',
} as const;
```

---

## 4. 核心模块设计

### 4.1 粘贴板监听（main/clipboard.ts）

```
流程：
1. 使用 setInterval 每 500ms 轮询粘贴板内容
2. 读取 clipboard.readText() 和 clipboard.readImage()
3. 对比上次记录的内容 hash，相同则跳过
4. 新内容 → 调用 database.insert() 写入
5. 通过 IPC 通知渲染进程刷新列表
```

### 4.2 数据库操作（main/database.ts）

```
- 初始化：应用启动时创建数据库文件和表
- 数据库路径：app.getPath('userData')/cliphistory.db
- 图片存储路径：app.getPath('userData')/images/
- 核心方法：
  - insert(record)     — 插入新记录
  - getAll(limit, offset) — 分页查询（置顶优先 + 时间降序）
  - search(keyword)    — 模糊搜索文字记录
  - pin(id) / unpin(id) — 置顶/取消置顶
  - delete(id)         — 删除记录（含图片文件）
  - cleanup(days)      — 清理过期且未置顶的记录
  - clearAll()         — 清空全部
```

### 4.3 系统托盘（main/tray.ts）

```
- 图标：使用项目内的 16x16 / 32x32 PNG 图标
- 右键菜单项：
  1. 显示主窗口
  2. 分隔线
  3. 退出
- 双击托盘图标 → 显示主窗口
```

### 4.4 全局快捷键（main/shortcut.ts）

```
- 默认注册 'Ctrl+Shift+V'
- 触发时：toggle 主窗口显示/隐藏
- 注册失败时通过 IPC 通知渲染进程提示用户
```

---

## 5. IPC 接口规范

所有 IPC 通信使用 `ipcMain.handle` / `ipcRenderer.invoke` 的请求-响应模式。

| 通道 | 请求参数 | 响应 |
|------|---------|------|
| `clipboard:get-history` | `{ limit?: number, offset?: number }` | `ClipRecord[]` |
| `clipboard:search` | `{ keyword: string }` | `ClipRecord[]` |
| `clipboard:pin` | `{ id: number }` | `boolean` |
| `clipboard:unpin` | `{ id: number }` | `boolean` |
| `clipboard:delete` | `{ id: number }` | `boolean` |
| `clipboard:copy-to-clip` | `{ id: number }` | `boolean` |
| `settings:get` | 无 | `AppSettings` |
| `settings:save` | `Partial<AppSettings>` | `boolean` |
| `clipboard:cleanup` | 无 | `{ deleted: number }` |
| `clipboard:clear-all` | 无 | `boolean` |

---

## 6. 安全考虑

- 启用 `contextIsolation: true`
- 禁用 `nodeIntegration: false`
- 使用 `preload.ts` 通过 `contextBridge` 暴露安全的 API
- 图片文件保存在应用专属目录，不访问用户其他文件
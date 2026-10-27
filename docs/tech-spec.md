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

## 7. 项目素材（2026-10-26）

- `projects` 表保存项目名称与时间；`project_items` 表保存所属项目、类型、标题、文字内容或文件路径、原文件名、大小与时间。
- 所有 CRUD 在 `database.ts`，不参与 `clipboard_history` 的清理。项目变更持久化失败时恢复内存快照；数据库以同目录临时文件原子替换。
- 用户选择的文件异步复制到 `userData/project-files/<UUID>/<原文件名>`；多选导入返回 `{ items, failed }`，逐项反馈。历史收藏同样复制文件。
- 删除先持久化记录变更，再移除受管副本；文件清理校验目录边界和真实路径。源文件不会被删除。
- IPC 通道：`project:get/create/rename/delete/items/add-text/update-text/import/save-history/item-delete/item-copy/item-reveal`，统一在 `IPC_CHANNELS` 和沙箱 preload 中声明。
- `project:import` 由主进程打开多选文件对话框，渲染进程不直接访问文件系统。`item-copy` 按类型写入文字、图片或 Windows CF_HDROP；文件复制失败直接返回 false。
- `Projects.tsx` 管理项目选择、编辑、搜索与素材操作；文本编辑仅正文，存储层兼容旧标题元数据，界面不展示文本标题。卡片点击及 Enter/空格调用复制 API，内部操作按钮阻止触发卡片复制。
- `SaveToProjectDialog.tsx` 供历史和项目素材选择移动/复制与目标项目，均通过 `window.clipHistory` 调用。独立 `Prompts.tsx` 页面与导航已移除。
- `project:transfer` 接收 `{ source: { kind: 'history' | 'project' | 'prompt', id }, targetProjectId, mode: 'copy' | 'move' }`，返回目标 `ProjectItem`。移动来源删除与目标插入在同次数据库持久化中完成；历史图片在持久化成功后清理受管副本，外部源文件不删除。
- 项目间移动仅更新归属及双方时间，保留 ID/文件路径；复制文件异步生成独立副本，提交前重新校验来源和目标。存储失败回滚、清理未提交副本。
- 数据库初始化迁移旧 `prompts` 至 `project_items`，复用 `changeProjects` 确保目标插入、来源删除及迁移标记原子保存。标记项目 ID 保存在 `app_settings`；命名冲突时使用独立备用名称，迁移保留正文和时间。旧提示词 CRUD/IPC 仅保留兼容，不再提供页面入口。

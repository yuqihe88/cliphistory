// ============================================================
// ClipHistory — 共享类型定义
// ============================================================

/** 粘贴板内容类型 */
export type ClipType = 'text' | 'image' | 'video';

/** 类型过滤参数（用于列表/搜索） */
export type ClipTypeFilter = 'all' | ClipType;

/** 历史粘贴板记录 */
export interface ClipRecord {
  id: number;
  type: ClipType;
  content: string | null;       // 文字内容（type='text'时）
  imagePath: string | null;      // 图片文件路径（type='image'时）
  imageSize: number | null;      // 图片大小（字节）
  isPinned: boolean;             // 是否置顶
  createdAt: string;             // ISO 8601 时间戳
  updatedAt: string;             // ISO 8601 时间戳
}

/** 应用设置 */
export interface AppSettings {
  retentionDays: 1 | 3 | 5;     // 保留天数
  autoLaunch: boolean;           // 开机自启
  shortcutKey: string;           // 快捷键，默认 'Ctrl+Shift+V'
  floatMode: boolean;            // 悬浮桌面模式（置顶 + 贴边缩为图标）
  paused: boolean;               // 暂停记录（临时隐私模式）
  excludedApps: string[];        // 排除应用名单（进程名，来自这些应用的内容不记录）
  maxRecords: number;            // 最大记录条数（0 = 不限制），超出自动删除最旧的未置顶记录
}

/** 默认设置 */
export const DEFAULT_SETTINGS: AppSettings = {
  retentionDays: 3,
  autoLaunch: true,
  shortcutKey: 'Ctrl+Shift+V',
  floatMode: false,
  paused: false,
  excludedApps: [],
  maxRecords: 500,
};

/** IPC 通道名称 */
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
  ON_NEW_CLIP:    'clipboard:on-new-clip',    // 主→渲染：新内容通知
  ON_SETTINGS_CHANGED: 'settings:on-changed', // 主→渲染：设置变更
  // 应用控制（自定义无边框标题栏 / 菜单栏）
  WINDOW_CONTROL:   'app:window-control',     // 最小化/最大化还原/关闭(隐藏到托盘)
  OPEN_DATA_FOLDER: 'app:open-data-folder',
  QUIT_APP:         'app:quit',
  RELOAD:           'app:reload',
  TOGGLE_DEVTOOLS:  'app:toggle-devtools',
  ZOOM:             'app:zoom',               // in / out / reset
  SHOW_ABOUT:       'app:show-about',
  // 常用提示词（永久保存模块）
  PROMPT_GET:       'prompt:get',
  PROMPT_ADD:       'prompt:add',
  PROMPT_UPDATE:    'prompt:update',
  PROMPT_DELETE:    'prompt:delete',
  PROMPT_COPY:      'prompt:copy',
  // 悬浮桌面模式（贴边小图标窗口）
  DOCK_RESTORE:     'app:dock-restore',        // 图标点击 → 还原主窗口
  DOCK_MENU:        'app:dock-menu',           // 图标右键 → 弹出菜单
  DOCK_DRAG_START:  'app:dock-drag-start',     // 图标开始拖动
  DOCK_DRAG_MOVE:   'app:dock-drag-move',      // 图标拖动中（屏幕坐标）
  DOCK_DRAG_END:    'app:dock-drag-end',       // 图标拖动结束（moved=是否发生位移）
} as const;

/** 常用提示词（永久保存，不参与自动清理，UI 上不显示时间） */
export interface PromptItem {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** 窗口控制动作 */
export type WindowControlAction = 'minimize' | 'maximize' | 'close';

/** 缩放动作 */
export type ZoomAction = 'in' | 'out' | 'reset';

/** IPC 接口定义（请求-响应） */
export interface IpcRequest {
  'clipboard:get-history': { limit?: number; offset?: number; type?: ClipTypeFilter };
  'clipboard:search': { keyword: string; type?: ClipTypeFilter };
  'clipboard:pin': { id: number };
  'clipboard:unpin': { id: number };
  'clipboard:delete': { id: number };
  'clipboard:copy-to-clip': { id: number };
  'settings:get': void;
  'settings:save': Partial<AppSettings>;
  'clipboard:cleanup': void;
  'clipboard:clear-all': void;
}

/** IPC 接口定义（响应） */
export interface IpcResponse {
  'clipboard:get-history': ClipRecord[];
  'clipboard:search': ClipRecord[];
  'clipboard:pin': boolean;
  'clipboard:unpin': boolean;
  'clipboard:delete': boolean;
  'clipboard:copy-to-clip': boolean;
  'settings:get': AppSettings;
  'settings:save': boolean;
  'clipboard:cleanup': { deleted: number };
  'clipboard:clear-all': boolean;
}

/** Preload 暴露给渲染进程的 API 类型 */
export interface ClipHistoryApi {
  getHistory: (limit?: number, offset?: number, type?: ClipTypeFilter) => Promise<ClipRecord[]>;
  search: (keyword: string, type?: ClipTypeFilter) => Promise<ClipRecord[]>;
  pin: (id: number) => Promise<boolean>;
  unpin: (id: number) => Promise<boolean>;
  delete: (id: number) => Promise<boolean>;
  copyToClipboard: (id: number) => Promise<boolean>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<boolean>;
  cleanup: () => Promise<{ deleted: number }>;
  clearAll: () => Promise<boolean>;
  onNewClip: (callback: () => void) => () => void;
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void;
  // 应用控制（自定义无边框标题栏 / 菜单栏）
  windowControl: (action: WindowControlAction) => void;
  openDataFolder: () => void;
  quitApp: () => void;
  reloadApp: () => void;
  toggleDevTools: () => void;
  zoom: (action: ZoomAction) => void;
  showAbout: () => void;
  // 常用提示词（永久保存模块）
  getPrompts: () => Promise<PromptItem[]>;
  addPrompt: (content: string) => Promise<PromptItem>;
  updatePrompt: (id: number, content: string) => Promise<boolean>;
  deletePrompt: (id: number) => Promise<boolean>;
  copyPrompt: (id: number) => Promise<boolean>;
  // 悬浮桌面模式（贴边小图标窗口）
  dockRestore: () => void;
  dockMenu: () => void;
  dockDragStart: (point: { x: number; y: number }) => void;
  dockDragMove: (point: { x: number; y: number }) => void;
  dockDragEnd: (info: { moved: boolean }) => void;
}

// 扩展 Window 接口
declare global {
  interface Window {
    clipHistory: ClipHistoryApi;
  }
}

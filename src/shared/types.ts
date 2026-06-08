// ============================================================
// ClipHistory — 共享类型定义
// ============================================================

/** 粘贴板内容类型 */
export type ClipType = 'text' | 'image';

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
}

/** 默认设置 */
export const DEFAULT_SETTINGS: AppSettings = {
  retentionDays: 3,
  autoLaunch: true,
  shortcutKey: 'Ctrl+Shift+V',
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
} as const;

/** IPC 接口定义（请求-响应） */
export interface IpcRequest {
  'clipboard:get-history': { limit?: number; offset?: number };
  'clipboard:search': { keyword: string };
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
  getHistory: (limit?: number, offset?: number) => Promise<ClipRecord[]>;
  search: (keyword: string) => Promise<ClipRecord[]>;
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
}

// 扩展 Window 接口
declare global {
  interface Window {
    clipHistory: ClipHistoryApi;
  }
}

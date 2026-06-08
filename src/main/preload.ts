// ============================================================
// ClipHistory — Preload 脚本（contextBridge）
// 注意：preload 在沙箱环境中运行，不能 import 外部模块。
//       所有常量必须内联定义。
// ============================================================

import { contextBridge, ipcRenderer } from 'electron';

// ---- IPC 通道常量（内联，避免外部导入） ----
const IPC = {
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
  ON_NEW_CLIP:    'clipboard:on-new-clip',
  ON_SETTINGS_CHANGED: 'settings:on-changed',
} as const;

// ---- 暴露给渲染进程的安全 API ----
contextBridge.exposeInMainWorld('clipHistory', {
  getHistory: (limit = 50, offset = 0) =>
    ipcRenderer.invoke(IPC.GET_HISTORY, { limit, offset }),

  search: (keyword: string) =>
    ipcRenderer.invoke(IPC.SEARCH, { keyword }),

  pin: (id: number) =>
    ipcRenderer.invoke(IPC.PIN, { id }),

  unpin: (id: number) =>
    ipcRenderer.invoke(IPC.UNPIN, { id }),

  delete: (id: number) =>
    ipcRenderer.invoke(IPC.DELETE, { id }),

  copyToClipboard: (id: number) =>
    ipcRenderer.invoke(IPC.COPY_TO_CLIP, { id }),

  getSettings: () =>
    ipcRenderer.invoke(IPC.GET_SETTINGS),

  saveSettings: (settings: any) =>
    ipcRenderer.invoke(IPC.SAVE_SETTINGS, settings),

  cleanup: () =>
    ipcRenderer.invoke(IPC.CLEANUP),

  clearAll: () =>
    ipcRenderer.invoke(IPC.CLEAR_ALL),

  onNewClip: (callback: () => void) => {
    const handler = (): void => callback();
    ipcRenderer.on(IPC.ON_NEW_CLIP, handler);
    return () => {
      ipcRenderer.removeListener(IPC.ON_NEW_CLIP, handler);
    };
  },

  onSettingsChanged: (callback: (settings: any) => void) => {
    const handler = (_event: any, settings: any): void => callback(settings);
    ipcRenderer.on(IPC.ON_SETTINGS_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC.ON_SETTINGS_CHANGED, handler);
    };
  },
});

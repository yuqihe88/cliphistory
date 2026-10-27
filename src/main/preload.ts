// ============================================================
// ClipHistory — Preload 脚本（contextBridge）
// 注意：preload 在沙箱环境中运行，不能 import 外部模块。
//       所有常量必须内联定义。
// ============================================================

import { contextBridge, ipcRenderer } from 'electron';
import type { ProjectTransferSource, ProjectTransferMode } from '../shared/types';

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
  WINDOW_CONTROL:      'app:window-control',
  OPEN_DATA_FOLDER:    'app:open-data-folder',
  QUIT_APP:            'app:quit',
  RELOAD:              'app:reload',
  TOGGLE_DEVTOOLS:     'app:toggle-devtools',
  ZOOM:                'app:zoom',
  SHOW_ABOUT:          'app:show-about',
  PROMPT_GET:          'prompt:get',
  PROMPT_ADD:          'prompt:add',
  PROMPT_UPDATE:       'prompt:update',
  PROMPT_DELETE:       'prompt:delete',
  PROMPT_COPY:         'prompt:copy',
  PROJECT_GET:         'project:get',
  PROJECT_CREATE:      'project:create',
  PROJECT_RENAME:      'project:rename',
  PROJECT_DELETE:      'project:delete',
  PROJECT_ITEMS:       'project:items',
  PROJECT_ADD_TEXT:    'project:add-text',
  PROJECT_UPDATE_TEXT: 'project:update-text',
  PROJECT_IMPORT:      'project:import',
  PROJECT_SAVE_HISTORY: 'project:save-history',
  PROJECT_TRANSFER:    'project:transfer',
  PROJECT_ITEM_DELETE: 'project:item-delete',
  PROJECT_ITEM_COPY:   'project:item-copy',
  PROJECT_ITEM_REVEAL: 'project:item-reveal',
  DOCK_RESTORE:        'app:dock-restore',
  DOCK_MENU:           'app:dock-menu',
  DOCK_DRAG_START:     'app:dock-drag-start',
  DOCK_DRAG_MOVE:      'app:dock-drag-move',
  DOCK_DRAG_END:       'app:dock-drag-end',
} as const;

// ---- 暴露给渲染进程的安全 API ----
contextBridge.exposeInMainWorld('clipHistory', {
  getHistory: (limit = 50, offset = 0, type = 'all') =>
    ipcRenderer.invoke(IPC.GET_HISTORY, { limit, offset, type }),

  search: (keyword: string, type = 'all') =>
    ipcRenderer.invoke(IPC.SEARCH, { keyword, type }),

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

  // ---- 应用控制（自定义无边框标题栏 / 菜单栏） ----
  windowControl: (action: string) =>
    ipcRenderer.send(IPC.WINDOW_CONTROL, action),

  openDataFolder: () =>
    ipcRenderer.send(IPC.OPEN_DATA_FOLDER),

  quitApp: () =>
    ipcRenderer.send(IPC.QUIT_APP),

  reloadApp: () =>
    ipcRenderer.send(IPC.RELOAD),

  toggleDevTools: () =>
    ipcRenderer.send(IPC.TOGGLE_DEVTOOLS),

  zoom: (action: string) =>
    ipcRenderer.send(IPC.ZOOM, action),

  showAbout: () =>
    ipcRenderer.send(IPC.SHOW_ABOUT),

  // ---- 常用提示词（永久保存模块） ----
  getPrompts: () =>
    ipcRenderer.invoke(IPC.PROMPT_GET),

  addPrompt: (content: string) =>
    ipcRenderer.invoke(IPC.PROMPT_ADD, { content }),

  updatePrompt: (id: number, content: string) =>
    ipcRenderer.invoke(IPC.PROMPT_UPDATE, { id, content }),

  deletePrompt: (id: number) =>
    ipcRenderer.invoke(IPC.PROMPT_DELETE, { id }),

  copyPrompt: (id: number) =>
    ipcRenderer.invoke(IPC.PROMPT_COPY, { id }),

  // ---- 项目素材（永久保存模块） ----
  getProjects: () => ipcRenderer.invoke(IPC.PROJECT_GET),
  createProject: (name: string) => ipcRenderer.invoke(IPC.PROJECT_CREATE, { name }),
  renameProject: (id: number, name: string) => ipcRenderer.invoke(IPC.PROJECT_RENAME, { id, name }),
  deleteProject: (id: number) => ipcRenderer.invoke(IPC.PROJECT_DELETE, { id }),
  getProjectItems: (projectId: number) => ipcRenderer.invoke(IPC.PROJECT_ITEMS, { projectId }),
  addProjectText: (projectId: number, title: string, content: string) =>
    ipcRenderer.invoke(IPC.PROJECT_ADD_TEXT, { projectId, title, content }),
  updateProjectText: (id: number, title: string, content: string) =>
    ipcRenderer.invoke(IPC.PROJECT_UPDATE_TEXT, { id, title, content }),
  importProjectFiles: (projectId: number) => ipcRenderer.invoke(IPC.PROJECT_IMPORT, { projectId }),
  saveHistoryToProject: (projectId: number, recordId: number) =>
    ipcRenderer.invoke(IPC.PROJECT_SAVE_HISTORY, { projectId, recordId }),
  transferToProject: (source: ProjectTransferSource, targetProjectId: number, mode: ProjectTransferMode) =>
    ipcRenderer.invoke(IPC.PROJECT_TRANSFER, { source, targetProjectId, mode }),
  deleteProjectItem: (id: number) => ipcRenderer.invoke(IPC.PROJECT_ITEM_DELETE, { id }),
  copyProjectItem: (id: number) => ipcRenderer.invoke(IPC.PROJECT_ITEM_COPY, { id }),
  revealProjectItem: (id: number) => ipcRenderer.invoke(IPC.PROJECT_ITEM_REVEAL, { id }),

  // ---- 悬浮桌面模式（贴边小图标窗口） ----
  dockRestore: () =>
    ipcRenderer.send(IPC.DOCK_RESTORE),

  dockMenu: () =>
    ipcRenderer.send(IPC.DOCK_MENU),

  dockDragStart: (point: { x: number; y: number }) =>
    ipcRenderer.send(IPC.DOCK_DRAG_START, point),

  dockDragMove: (point: { x: number; y: number }) =>
    ipcRenderer.send(IPC.DOCK_DRAG_MOVE, point),

  dockDragEnd: (info: { moved: boolean }) =>
    ipcRenderer.send(IPC.DOCK_DRAG_END, info),
});

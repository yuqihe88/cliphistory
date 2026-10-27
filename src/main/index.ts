// ============================================================
// ClipHistory — Electron 主进程入口
// ============================================================

import { app, BrowserWindow, ipcMain, Menu, dialog, shell, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import { initDatabase, getHistory, searchHistory, setPinned, deleteRecord, getRecordById, getSettings, saveSettings, cleanupOldRecords, clearAll, closeDatabase, imagesDir, getPrompts, getPromptById, addPrompt, updatePrompt, deletePrompt, enforceRecordCap } from './database';
import { startClipboardMonitor, stopClipboardMonitor, writeToClipboard, writeTextWithoutCapture, setOnNewClip } from './clipboard';
import { syncOwnerTracker, stopOwnerTrackerOnQuit } from './clipboard-owner';
import { createTray, destroyTray, showTrayNotification } from './tray';
import { registerGlobalShortcut, unregisterAllShortcuts } from './shortcut';
import { syncAutoLaunch } from './auto-launch';
import { setFloatMode, handleMainWindowMoved, registerDockIpc, hideDockIfVisible } from './dock';
import { IPC_CHANNELS } from '../shared/types';
import { getProjects, createProject, renameProject, deleteProject, getProjectItems, getProjectItemById, addProjectText, updateProjectText, importProjectFiles, saveHistoryToProject, transferToProject, deleteProjectItem } from './database';
import { writeProjectItemToClipboard } from './clipboard';
import type { AppSettings, ClipRecord, ClipTypeFilter, PromptItem, WindowControlAction, ZoomAction, ProjectTransferSource, ProjectTransferMode } from '../shared/types';

// ---- 全局异常拦截 ----
// 桌面工具不允许因单次异常弹崩溃框；记录日志继续运行
process.on('uncaughtException', (err) => {
  console.error('[Main] 未捕获异常（已拦截）:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Main] 未处理的 Promise 拒绝（已拦截）:', reason);
});

// ---- 自定义协议 ----
// clipimg://local/<encodeURIComponent(绝对路径)> — 让渲染进程（http 页面）能安全加载本地图片
// 必须在 app ready 之前注册特权 scheme
protocol.registerSchemesAsPrivileged([
  { scheme: 'clipimg', privileges: { standard: true, stream: true, supportFetchAPI: true } },
]);

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
};

function registerClipImgProtocol(): void {
  protocol.handle('clipimg', (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'local') {
        return new Response(null, { status: 400 });
      }
      const filePath = decodeURIComponent(url.pathname.slice(1));
      const ext = path.extname(filePath).toLowerCase();
      if (!IMAGE_MIME[ext] || !fs.existsSync(filePath)) {
        return new Response(null, { status: 404 });
      }
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        headers: { 'content-type': IMAGE_MIME[ext] },
      });
    } catch {
      return new Response(null, { status: 500 });
    }
  });
}

// ---- 窗口 ----
let mainWindow: BrowserWindow | null = null;

// 通知渲染进程有新内容
function notifyNewClip(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('[Main] 发送 onNewClip 事件到渲染进程...');
    mainWindow.webContents.send(IPC_CHANNELS.ON_NEW_CLIP);
  } else {
    console.log('[Main] 窗口不可用，跳过通知');
  }
}

// ---- 创建主窗口 ----
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 360,
    minHeight: 400,
    title: 'ClipHistory',
    backgroundColor: '#DCEBFF',
    show: false, // 先隐藏，ready-to-show 后再显示避免闪烁
    frame: false, // 无边框：使用自定义菜单栏/标题栏（含窗口控制按钮）
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 加载渲染进程
  // 打包程序默认加载随包页面；仅显式指定 Vite URL 时使用开发服务器。
  if ((app.isPackaged || process.env.NODE_ENV === 'production') && !process.env.VITE_DEV_SERVER_URL) {
    // 生产模式：加载构建后的文件
    win.loadFile(path.join(__dirname, '../../renderer/index.html'));
  } else {
    // 开发模式：加载 Vite 开发服务器
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    win.loadURL(devUrl);
    // 仅当 DEV_TOOLS=1 时打开开发者工具
    if (process.env.DEV_TOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  }

  win.on('ready-to-show', () => {
    win.show();
  });

  // 关闭窗口 → 隐藏到托盘（而非退出）
  let hasShownTrayTip = false;
  win.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      win.hide();
      // 首次关闭时显示托盘提示气泡
      if (!hasShownTrayTip) {
        hasShownTrayTip = true;
        // 延迟一下确保窗口已隐藏
        setTimeout(() => {
          showTrayNotification('ClipHistory', '应用仍在后台运行，双击托盘图标可重新打开');
        }, 500);
      }
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

// ---- 菜单动作 ----
/** 立即清理过期记录，并通过托盘气泡反馈结果 */
function cleanupNow(): void {
  try {
    const settings = getSettings();
    const deleted = cleanupOldRecords(settings.retentionDays);
    showTrayNotification(
      'ClipHistory',
      deleted > 0 ? `清理完成：已删除 ${deleted} 条过期记录` : '没有需要清理的过期记录'
    );
    notifyNewClip();
  } catch (err) {
    console.error('[Menu] 手动清理失败:', err);
  }
}

/** 显示"关于"对话框 */
function showAboutDialog(): void {
  const options = {
    type: 'info' as const,
    title: '关于 ClipHistory',
    message: 'ClipHistory',
    detail:
      `版本 ${app.getVersion()}\n\n` +
      'Windows 桌面历史粘贴板：自动记录复制的文字、图片和视频，\n' +
      '支持搜索、置顶、定时清理，数据 100% 本地存储，完全离线。\n\n' +
      `全局快捷键 Ctrl+Shift+V 可在任意位置显示/隐藏窗口。`,
    buttons: ['确定'],
    noLink: true,
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBox(mainWindow, options);
  } else {
    dialog.showMessageBox(options);
  }
}

// ---- 注册 IPC 处理器 ----
function registerIpcHandlers(): void {
  // 窗口控制（自定义标题栏按钮）
  ipcMain.on(IPC_CHANNELS.WINDOW_CONTROL, (_event, action: WindowControlAction) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (action === 'minimize') {
      mainWindow.minimize();
    } else if (action === 'maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    } else if (action === 'close') {
      // 触发已有的 close 拦截逻辑 → 隐藏到托盘
      mainWindow.close();
    }
  });

  // 打开数据文件夹
  ipcMain.on(IPC_CHANNELS.OPEN_DATA_FOLDER, () => {
    shell.openPath(app.getPath('userData'));
  });

  // 退出应用
  ipcMain.on(IPC_CHANNELS.QUIT_APP, () => {
    app.quit();
  });

  // 重新加载页面
  ipcMain.on(IPC_CHANNELS.RELOAD, () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
  });

  // 开发者工具
  ipcMain.on(IPC_CHANNELS.TOGGLE_DEVTOOLS, () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.toggleDevTools();
  });

  // 缩放
  ipcMain.on(IPC_CHANNELS.ZOOM, (_event, action: ZoomAction) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const wc = mainWindow.webContents;
    if (action === 'in') wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 3));
    else if (action === 'out') wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3));
    else wc.setZoomLevel(0);
  });

  // 关于对话框
  ipcMain.on(IPC_CHANNELS.SHOW_ABOUT, () => {
    showAboutDialog();
  });

  // ---- 常用提示词（永久保存模块） ----
  ipcMain.handle(IPC_CHANNELS.PROMPT_GET, (): PromptItem[] => {
    return getPrompts();
  });

  ipcMain.handle(IPC_CHANNELS.PROMPT_ADD, (_event, { content }: { content: string }): PromptItem => {
    return addPrompt(String(content ?? '').trim());
  });

  ipcMain.handle(IPC_CHANNELS.PROMPT_UPDATE, (_event, { id, content }: { id: number; content: string }): boolean => {
    return updatePrompt(id, String(content ?? '').trim());
  });

  ipcMain.handle(IPC_CHANNELS.PROMPT_DELETE, (_event, { id }: { id: number }): boolean => {
    return deletePrompt(id);
  });

  ipcMain.handle(IPC_CHANNELS.PROMPT_COPY, (_event, { id }: { id: number }): boolean => {
    const prompt = getPromptById(id);
    if (!prompt) return false;
    return writeTextWithoutCapture(prompt.content);
  });

  // ---- 项目素材（永久保存模块） ----
  ipcMain.handle(IPC_CHANNELS.PROJECT_GET, () => getProjects());
  ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, (_event, { name }: { name: string }) => createProject(name));
  ipcMain.handle(IPC_CHANNELS.PROJECT_RENAME, (_event, { id, name }: { id: number; name: string }) => renameProject(id, name));
  ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, (_event, { id }: { id: number }) => deleteProject(id));
  ipcMain.handle(IPC_CHANNELS.PROJECT_ITEMS, (_event, { projectId }: { projectId: number }) => getProjectItems(projectId));
  ipcMain.handle(IPC_CHANNELS.PROJECT_ADD_TEXT, (_event, { projectId, title, content }: { projectId: number; title: string; content: string }) =>
    addProjectText(projectId, title, content));
  ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE_TEXT, (_event, { id, title, content }: { id: number; title: string; content: string }) =>
    updateProjectText(id, title, content));
  ipcMain.handle(IPC_CHANNELS.PROJECT_IMPORT, async (_event, { projectId }: { projectId: number }) => {
    if (!getProjects().some((project) => project.id === projectId)) throw new Error('项目不存在，请重新选择');
    const options: Electron.OpenDialogOptions = {
      title: '导入项目素材',
      buttonLabel: '保存到项目',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '所有文件', extensions: ['*'] },
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
        { name: '视频', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] },
      ],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled) return { items: [], failed: [] };
    return importProjectFiles(projectId, result.filePaths);
  });
  ipcMain.handle(IPC_CHANNELS.PROJECT_SAVE_HISTORY, (_event, { projectId, recordId }: { projectId: number; recordId: number }) =>
    saveHistoryToProject(projectId, recordId));
  ipcMain.handle(IPC_CHANNELS.PROJECT_TRANSFER, async (_event, { source, targetProjectId, mode }: { source: ProjectTransferSource; targetProjectId: number; mode: ProjectTransferMode }) => {
    const item = await transferToProject(source, targetProjectId, mode);
    if (source.kind === 'history' && mode === 'move') notifyNewClip();
    return item;
  });
  ipcMain.handle(IPC_CHANNELS.PROJECT_ITEM_DELETE, (_event, { id }: { id: number }) => deleteProjectItem(id));
  ipcMain.handle(IPC_CHANNELS.PROJECT_ITEM_COPY, (_event, { id }: { id: number }) => {
    const item = getProjectItemById(id);
    return item ? writeProjectItemToClipboard(item) : false;
  });
  ipcMain.handle(IPC_CHANNELS.PROJECT_ITEM_REVEAL, (_event, { id }: { id: number }) => {
    const item = getProjectItemById(id);
    if (!item?.filePath || !fs.existsSync(item.filePath)) return false;
    shell.showItemInFolder(item.filePath);
    return true;
  });

  // 获取历史记录（支持类型过滤）
  ipcMain.handle(
    IPC_CHANNELS.GET_HISTORY,
    (_event, { limit = 50, offset = 0, type = 'all' }: { limit?: number; offset?: number; type?: ClipTypeFilter }): ClipRecord[] => {
      return getHistory(limit, offset, type);
    }
  );

  // 搜索（支持类型过滤）
  ipcMain.handle(
    IPC_CHANNELS.SEARCH,
    (_event, { keyword, type = 'all' }: { keyword: string; type?: ClipTypeFilter }): ClipRecord[] => {
      if (!keyword.trim()) return getHistory(50, 0, type);
      return searchHistory(keyword.trim(), type);
    }
  );

  // 置顶
  ipcMain.handle(
    IPC_CHANNELS.PIN,
    (_event, { id }: { id: number }): boolean => {
      return setPinned(id, true);
    }
  );

  // 取消置顶
  ipcMain.handle(
    IPC_CHANNELS.UNPIN,
    (_event, { id }: { id: number }): boolean => {
      return setPinned(id, false);
    }
  );

  // 删除
  ipcMain.handle(
    IPC_CHANNELS.DELETE,
    (_event, { id }: { id: number }): boolean => {
      return deleteRecord(id);
    }
  );

  // 拷贝到粘贴板
  ipcMain.handle(
    IPC_CHANNELS.COPY_TO_CLIP,
    async (_event, { id }: { id: number }): Promise<boolean> => {
      const record = getRecordById(id);
      if (!record) return false;
      return writeToClipboard(record.type, record.content, record.imagePath);
    }
  );

  // 获取设置
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, (): AppSettings => {
    return getSettings();
  });

  // 保存设置
  ipcMain.handle(
    IPC_CHANNELS.SAVE_SETTINGS,
    (_event, partial: Partial<AppSettings>): boolean => {
      const result = saveSettings(partial);
      if (result && mainWindow) {
        const updated = getSettings();
        mainWindow.webContents.send(IPC_CHANNELS.ON_SETTINGS_CHANGED, updated);
        // 如果开机自启设置变了，同步
        if (partial.autoLaunch !== undefined) {
          syncAutoLaunch(partial.autoLaunch);
        }
        // 如果快捷键变了，重新注册
        if (partial.shortcutKey && mainWindow) {
          registerGlobalShortcut(mainWindow);
        }
        // 如果悬浮模式变了，开启/关闭贴边收缩
        if (partial.floatMode !== undefined) {
          setFloatMode(partial.floatMode, mainWindow);
        }
        // 排除应用名单变了，同步归属追踪进程
        if (partial.excludedApps !== undefined) {
          syncOwnerTracker(updated.excludedApps);
        }
        // 条数上限变了，立即执行一次清理
        if (partial.maxRecords !== undefined) {
          enforceRecordCap();
        }
      }
      return result;
    }
  );

  // 清理过期记录
  ipcMain.handle(IPC_CHANNELS.CLEANUP, (): { deleted: number } => {
    const settings = getSettings();
    const deleted = cleanupOldRecords(settings.retentionDays);
    return { deleted };
  });

  // 清空全部
  ipcMain.handle(IPC_CHANNELS.CLEAR_ALL, (): boolean => {
    return clearAll();
  });
}

// ---- 应用生命周期 ----
// 标记是否正在退出（区分关闭窗口 vs 退出应用）
;(app as any).isQuitting = false;

app.on('before-quit', () => {
  (app as any).isQuitting = true;
});

app.on('ready', async () => {
  try {
    // 1. 初始化数据库（异步：需要加载 sql.js WASM）
    await initDatabase();

    // 2. 注册 clipimg 协议（渲染进程加载本地图片）
    registerClipImgProtocol();

    // 3. 注册 IPC 处理器
    registerIpcHandlers();

    // 4. 创建主窗口
    mainWindow = createMainWindow();
    // 悬浮模式：拖近屏幕边缘时缩为小图标（move + moved 双保险，防抖在 dock 模块内）
    mainWindow.on('moved', () => {
      if (mainWindow) handleMainWindowMoved(mainWindow);
    });
    mainWindow.on('move', () => {
      if (mainWindow) handleMainWindowMoved(mainWindow);
    });

    // 4.1 注册图标窗口 IPC
    registerDockIpc(() => mainWindow);

    // 5. 创建系统托盘
    createTray(mainWindow);

    // 5. 禁用原生菜单（使用自定义 HTML 菜单栏）
    Menu.setApplicationMenu(null);

    // 6. 注册全局快捷键
    registerGlobalShortcut(mainWindow);

    // 6.1 恢复已保存的悬浮模式
    if (getSettings().floatMode) {
      setFloatMode(true, mainWindow);
    }

    // 7. 设置粘贴板监听的回调通知
    setOnNewClip(notifyNewClip);

    // 8. 启动粘贴板监听
    startClipboardMonitor();

    // 9. 同步开机自启状态
    const settings = getSettings();
    syncAutoLaunch(settings.autoLaunch);

    // 10. 应用启动时执行一次清理（按天 + 按条数上限）
    cleanupOldRecords(settings.retentionDays);
    enforceRecordCap();
    // 排除应用名单非空时启动归属追踪
    syncOwnerTracker(settings.excludedApps);

    // 11. 启动定时清理（每小时检查一次过期记录）
    setInterval(() => {
      try {
        const currentSettings = getSettings();
        const result = cleanupOldRecords(currentSettings.retentionDays);
        if (result > 0) {
          console.log(`[Cleanup] 定时清理: 删除 ${result} 条过期记录`);
        }
      } catch (err) {
        console.error('[Cleanup] 定时清理出错:', err);
      }
    }, 60 * 60 * 1000); // 每小时

    console.log('[Main] 应用启动完成');
  } catch (err) {
    console.error('[Main] 应用启动失败:', err);
    // 尝试显示错误对话框
    const { dialog } = require('electron');
    dialog.showErrorBox('启动失败', `ClipHistory 启动时发生错误：\n${(err as Error).message}\n\n请尝试重新安装应用。`);
    app.quit();
  }
});

app.on('will-quit', () => {
  stopClipboardMonitor();
  unregisterAllShortcuts();
  destroyTray();
  closeDatabase();
  stopOwnerTrackerOnQuit();
});

// 当所有窗口关闭时（macOS 行为，Windows 不会触发因为关闭=隐藏）
app.on('window-all-closed', () => {
  // Windows 下不会走到这里，因为窗口关闭被拦截为隐藏
  app.quit();
});

// macOS: 点击 dock 图标重新创建窗口
app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = createMainWindow();
  } else {
    mainWindow.show();
  }
});

// 防止多实例
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      hideDockIfVisible();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

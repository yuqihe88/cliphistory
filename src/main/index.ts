// ============================================================
// ClipHistory — Electron 主进程入口
// ============================================================

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { initDatabase, getHistory, searchHistory, setPinned, deleteRecord, getRecordById, getSettings, saveSettings, cleanupOldRecords, clearAll, closeDatabase } from './database';
import { startClipboardMonitor, stopClipboardMonitor, writeToClipboard, setOnNewClip } from './clipboard';
import { createTray, destroyTray, showTrayNotification } from './tray';
import { registerGlobalShortcut, unregisterAllShortcuts } from './shortcut';
import { syncAutoLaunch } from './auto-launch';
import { IPC_CHANNELS } from '../shared/types';
import type { AppSettings, ClipRecord } from '../shared/types';

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
    width: 380,
    height: 560,
    minWidth: 320,
    minHeight: 400,
    title: 'ClipHistory',
    backgroundColor: '#E3F2FD',
    show: false, // 先隐藏，ready-to-show 后再显示避免闪烁
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 加载渲染进程
  // 生产模式：NODE_ENV=production 且没有指定 Vite URL
  if (process.env.NODE_ENV === 'production' && !process.env.VITE_DEV_SERVER_URL) {
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

// ---- 注册 IPC 处理器 ----
function registerIpcHandlers(): void {
  // 获取历史记录
  ipcMain.handle(
    IPC_CHANNELS.GET_HISTORY,
    (_event, { limit = 50, offset = 0 }: { limit?: number; offset?: number }): ClipRecord[] => {
      return getHistory(limit, offset);
    }
  );

  // 搜索
  ipcMain.handle(
    IPC_CHANNELS.SEARCH,
    (_event, { keyword }: { keyword: string }): ClipRecord[] => {
      if (!keyword.trim()) return getHistory();
      return searchHistory(keyword.trim());
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
    (_event, { id }: { id: number }): boolean => {
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

    // 2. 注册 IPC 处理器
    registerIpcHandlers();

    // 3. 创建主窗口
    mainWindow = createMainWindow();

    // 4. 创建系统托盘
    createTray(mainWindow);

    // 5. 注册全局快捷键
    registerGlobalShortcut(mainWindow);

    // 6. 设置粘贴板监听的回调通知
    setOnNewClip(notifyNewClip);

    // 7. 启动粘贴板监听
    startClipboardMonitor();

    // 8. 同步开机自启状态
    const settings = getSettings();
    syncAutoLaunch(settings.autoLaunch);

    // 9. 应用启动时执行一次清理
    cleanupOldRecords(settings.retentionDays);

    // 10. 启动定时清理（每小时检查一次过期记录）
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
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

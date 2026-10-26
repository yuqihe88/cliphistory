// ============================================================
// ClipHistory — 悬浮桌面模式（贴边缩为小图标）
// 主窗口开启悬浮后置顶显示；拖近屏幕左/右边缘时自动隐藏，
// 并在边缘显示一个置顶小图标，点击还原、右键弹出菜单。
// ============================================================

import { BrowserWindow, Menu, screen, ipcMain } from 'electron';
import path from 'path';
import { saveSettings, getSettings } from './database';
import { IPC_CHANNELS } from '../shared/types';

const DOCK_WIDTH = 44;
const DOCK_HEIGHT = 84;
const SNAP_THRESHOLD = 28;      // 距边缘多少像素内触发贴边

let dockWindow: BrowserWindow | null = null;
let dockVisible = false;
let dockEdge: 'left' | 'right' | null = null;
let snapTimer: ReturnType<typeof setTimeout> | null = null;
let isFloatMode = false;
// 图标拖动状态（渲染进程用指针捕获跟踪，主进程负责移动窗口）
let dragState: { startX: number; startY: number; originY: number } | null = null;
// 抓取点相对图标左上角的偏移（保证自由跟随时图标不跳位）
let dragOffset = { x: 0, y: 0 };
// 拖动平滑跟随：主进程按 16ms 插值逼近目标位置，消除 IPC 抖动带来的顿挫感
let dragTarget: { x: number; y: number } | null = null;
let dragTicker: ReturnType<typeof setInterval> | null = null;
const DRAG_LERP = 0.35;      // 每帧逼近比例（越大跟得越紧）
const DRAG_TICK_MS = 16;     // 动画帧间隔

export function isDockVisible(): boolean {
  return dockVisible;
}

/** 悬浮模式开关：开启时主窗口置顶；关闭时取消置顶并还原 */
export function setFloatMode(enabled: boolean, mainWindow: BrowserWindow): void {
  isFloatMode = enabled;
  if (enabled) {
    mainWindow.setAlwaysOnTop(true, 'floating');
  } else {
    mainWindow.setAlwaysOnTop(false);
    if (dockVisible) restoreFromDock(mainWindow);
  }
}

/** 主窗口位置变化 → 防抖后检查贴边（仅悬浮模式下生效） */
export function handleMainWindowMoved(mainWindow: BrowserWindow): void {
  if (!isFloatMode || dockVisible) return;
  if (snapTimer) clearTimeout(snapTimer);
  snapTimer = setTimeout(() => {
    snapTimer = null;
    snapCheck(mainWindow);
  }, 250);
}

function canSnap(mainWindow: BrowserWindow): boolean {
  return (
    isFloatMode &&
    !dockVisible &&
    mainWindow &&
    !mainWindow.isDestroyed() &&
    mainWindow.isVisible() &&
    !mainWindow.isMinimized() &&
    !mainWindow.isMaximized() &&
    !mainWindow.isFullScreen()
  );
}

function snapCheck(mainWindow: BrowserWindow): void {
  if (!canSnap(mainWindow)) {
    console.log('[Dock] snapCheck skip: float=' + isFloatMode + ' dockVisible=' + dockVisible +
      ' visible=' + (mainWindow && !mainWindow.isDestroyed() ? mainWindow.isVisible() : 'n/a') +
      ' max=' + (mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : 'n/a'));
    return;
  }
  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const wa = display.workArea;

  let edge: 'left' | 'right' | null = null;
  if (bounds.x - wa.x <= SNAP_THRESHOLD) edge = 'left';
  else if (wa.x + wa.width - (bounds.x + bounds.width) <= SNAP_THRESHOLD) edge = 'right';
  if (!edge) {
    console.log('[Dock] snapCheck no-edge: x=' + bounds.x + ' wa.x=' + wa.x + ' wa.w=' + wa.width);
    return;
  }

  console.log('[Dock] snapping to ' + edge + ' edge');
  collapseToDock(mainWindow, edge, bounds, wa);
}

/** 隐藏主窗口，在边缘显示小图标 */
function collapseToDock(
  mainWindow: BrowserWindow,
  edge: 'left' | 'right',
  bounds: Electron.Rectangle,
  wa: Electron.Rectangle
): void {
  dockEdge = edge;
  const dock = createDockWindow();

  // 图标纵向对齐主窗口中心，夹在屏幕可用区内
  const centerY = Math.round(bounds.y + bounds.height / 2 - DOCK_HEIGHT / 2);
  const y = Math.max(wa.y + 8, Math.min(centerY, wa.y + wa.height - DOCK_HEIGHT - 8));
  const x = edge === 'left' ? wa.x + 2 : wa.x + wa.width - DOCK_WIDTH - 2;
  dock.setBounds({ x, y, width: DOCK_WIDTH, height: DOCK_HEIGHT });

  dock.showInactive(); // 不抢焦点：用户可能正在其他应用里工作
  dockVisible = true;
  mainWindow.hide();
}

function createDockWindow(): BrowserWindow {
  if (dockWindow && !dockWindow.isDestroyed()) return dockWindow;

  dockWindow = new BrowserWindow({
    width: DOCK_WIDTH,
    height: DOCK_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    title: 'ClipHistory Dock',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  dockWindow.setAlwaysOnTop(true, 'screen-saver');

  // 加载渲染页面（带 view=dock 参数让渲染进程渲染图标界面）
  if (process.env.NODE_ENV === 'production' && !process.env.VITE_DEV_SERVER_URL) {
    dockWindow.loadFile(path.join(__dirname, '../../renderer/index.html'), {
      query: { view: 'dock' },
    });
  } else {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    dockWindow.loadURL(devUrl + (devUrl.includes('?') ? '&' : '?') + 'view=dock');
  }

  dockWindow.webContents.on('context-menu', () => showDockMenu());
  dockWindow.on('closed', () => {
    dockWindow = null;
    dockVisible = false;
  });

  return dockWindow;
}

/** 从贴边状态还原主窗口：以图标当前位置为基准，在图标内侧展开 */
export function restoreFromDock(mainWindow: BrowserWindow): void {
  stopDragTicker();
  dragTarget = null;
  if (dockWindow && !dockWindow.isDestroyed()) dockWindow.hide();
  dockVisible = false;

  if (!mainWindow || mainWindow.isDestroyed()) return;

  // 图标可能被拖到了任意一边，还原位置必须跟随图标当前的位置和边缘，
  // 而不是首次贴边时记录的旧位置
  const db = dockWindow
    ? dockWindow.getBounds()
    : { x: 0, y: 0, width: DOCK_WIDTH, height: DOCK_HEIGHT };
  const display = screen.getDisplayNearestPoint({ x: db.x, y: db.y });
  const wa = display.workArea;
  const wb = mainWindow.getBounds();
  const edge = dockEdge ?? 'left';

  let x: number;
  if (edge === 'right') {
    x = Math.max(wa.x, db.x - wb.width - 8); // 图标左侧展开
  } else {
    x = Math.min(wa.x + wa.width - wb.width, db.x + DOCK_WIDTH + 8); // 图标右侧展开
  }
  let y = Math.round(db.y + DOCK_HEIGHT / 2 - wb.height / 2);
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - wb.height));

  mainWindow.setBounds({ x, y, width: wb.width, height: wb.height });
  mainWindow.show();
  mainWindow.focus();
}

/** 主窗口通过其他途径（快捷键/托盘）显示时，收起图标避免重复 */
export function hideDockIfVisible(): void {
  if (dockVisible && dockWindow && !dockWindow.isDestroyed()) {
    dockWindow.hide();
    dockVisible = false;
  }
}

/** 图标右键菜单 */
function showDockMenu(): void {
  if (!dockWindow || dockWindow.isDestroyed()) return;
  const mainWindow = BrowserWindow.getAllWindows().find((w) => w.title === 'ClipHistory');
  const menu = Menu.buildFromTemplate([
    {
      label: '还原窗口',
      click: () => {
        if (mainWindow) restoreFromDock(mainWindow);
      },
    },
    { type: 'separator' },
    {
      label: '退出悬浮模式',
      click: () => {
        if (mainWindow) exitFloatMode(mainWindow);
      },
    },
  ]);
  menu.popup({ window: dockWindow });
}

/** 退出悬浮模式：持久化设置 + 还原窗口 + 通知渲染进程 */
function exitFloatMode(mainWindow: BrowserWindow): void {
  saveSettings({ floatMode: false });
  setFloatMode(false, mainWindow);
  mainWindow.webContents.send(IPC_CHANNELS.ON_SETTINGS_CHANGED, getSettings());
}

function stopDragTicker(): void {
  if (dragTicker) {
    clearInterval(dragTicker);
    dragTicker = null;
  }
}

/** 插值动画：窗口位置逐帧逼近目标，到位后自动停帧 */
function startDragTicker(): void {
  if (dragTicker) return;
  dragTicker = setInterval(() => {
    if (!dragTarget || !dockWindow || dockWindow.isDestroyed()) {
      stopDragTicker();
      return;
    }
    const b = dockWindow.getBounds();
    const dx = dragTarget.x - b.x;
    const dy = dragTarget.y - b.y;
    if (Math.abs(dx) < 0.6 && Math.abs(dy) < 0.6) {
      dockWindow.setBounds({ x: dragTarget.x, y: dragTarget.y, width: DOCK_WIDTH, height: DOCK_HEIGHT });
      stopDragTicker();
      return;
    }
    dockWindow.setBounds({
      x: Math.round(b.x + dx * DRAG_LERP),
      y: Math.round(b.y + dy * DRAG_LERP),
      width: DOCK_WIDTH,
      height: DOCK_HEIGHT,
    });
  }, DRAG_TICK_MS);
}

/** 注册图标窗口的 IPC（点击还原 / 右键菜单 / 拖动沿边滑动） */
export function registerDockIpc(getMainWindow: () => BrowserWindow | null): void {
  // 校验渲染进程传来的屏幕坐标（防 NaN/undefined 传入 setBounds 导致主进程崩溃）
  const validPoint = (pt: unknown): pt is { x: number; y: number } => {
    const p = pt as { x?: unknown; y?: unknown };
    return (
      typeof p === 'object' && p !== null &&
      typeof p.x === 'number' && Number.isFinite(p.x) &&
      typeof p.y === 'number' && Number.isFinite(p.y)
    );
  };

  ipcMain.on(IPC_CHANNELS.DOCK_RESTORE, () => {
    try {
      const main = getMainWindow();
      if (main) restoreFromDock(main);
    } catch (err) {
      console.error('[Dock] restore error:', err);
    }
  });

  ipcMain.on(IPC_CHANNELS.DOCK_MENU, () => {
    try {
      showDockMenu();
    } catch (err) {
      console.error('[Dock] menu error:', err);
    }
  });

  // 开始拖动：记录起点、图标位置和抓取偏移
  ipcMain.on(IPC_CHANNELS.DOCK_DRAG_START, (_event, pt: { x: number; y: number }) => {
    try {
      if (!validPoint(pt) || !dockWindow || dockWindow.isDestroyed()) return;
      const b = dockWindow.getBounds();
      dragState = { startX: pt.x, startY: pt.y, originY: b.y };
      dragOffset = { x: pt.x - b.x, y: pt.y - b.y };
      dragTarget = { x: b.x, y: b.y };
      stopDragTicker();
    } catch (err) {
      console.error('[Dock] drag start error:', err);
      dragState = null;
    }
  });

  // 拖动中：图标 1:1 直接跟随鼠标（零延迟，夹在屏幕可用区内），不贴边。
  // 平滑动画只用于松手后的贴边滑入
  ipcMain.on(IPC_CHANNELS.DOCK_DRAG_MOVE, (_event, pt: { x: number; y: number }) => {
    try {
      if (!validPoint(pt) || !dragState || !dockWindow || dockWindow.isDestroyed()) return;
      const display = screen.getDisplayNearestPoint({ x: Math.round(pt.x), y: Math.round(pt.y) });
      const wa = display.workArea;
      const x = Math.round(Math.max(wa.x, Math.min(pt.x - dragOffset.x, wa.x + wa.width - DOCK_WIDTH)));
      const y = Math.round(Math.max(wa.y, Math.min(pt.y - dragOffset.y, wa.y + wa.height - DOCK_HEIGHT)));
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        dragState = null;
        stopDragTicker();
        return;
      }
      dragTarget = { x, y };
      dockWindow.setBounds({ x, y, width: DOCK_WIDTH, height: DOCK_HEIGHT });
    } catch (err) {
      console.error('[Dock] drag move error:', err);
      dragState = null;
      stopDragTicker();
    }
  });

  // 结束拖动：有位移 = 按松开位置吸附到最近的左/右边缘（插值滑入）；
  // 无位移 = 视为点击，还原主窗口
  ipcMain.on(IPC_CHANNELS.DOCK_DRAG_END, (_event, info: { moved: boolean }) => {
    try {
      const wasDrag = dragState !== null && !!info?.moved;
      dragState = null;
      stopDragTicker();
      if (dockWindow && !dockWindow.isDestroyed() && wasDrag) {
        // 松手贴边：比较图标中心到左/右可用区边缘的距离，取近的那边
        const b = dockWindow.getBounds();
        const centerX = b.x + DOCK_WIDTH / 2;
        const display = screen.getDisplayNearestPoint({ x: centerX, y: b.y + DOCK_HEIGHT / 2 });
        const wa = display.workArea;
        dockEdge = wa.x + wa.width - centerX >= centerX - wa.x ? 'left' : 'right';
        const snapX = dockEdge === 'left' ? wa.x + 2 : wa.x + wa.width - DOCK_WIDTH - 2;
        const snapY = Math.max(wa.y + 8, Math.min(b.y, wa.y + wa.height - DOCK_HEIGHT - 8));
        // 插值滑入边缘（动画到位后自动停帧）
        dragTarget = { x: snapX, y: snapY };
        startDragTicker();
        console.log(`[Dock] release: snap to ${dockEdge} edge at (${snapX},${snapY})`);
      } else if (!wasDrag) {
        const main = getMainWindow();
        if (main) restoreFromDock(main);
      }
    } catch (err) {
      console.error('[Dock] drag end error:', err);
      dragState = null;
      dragTarget = null;
      stopDragTicker();
    }
  });
}

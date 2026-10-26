// ============================================================
// ClipHistory — 系统托盘模块
// ============================================================

import { Tray, Menu, nativeImage, BrowserWindow, app, NativeImage } from 'electron';
import path from 'path';
import { hideDockIfVisible } from './dock';

let tray: Tray | null = null;

/** 创建系统托盘图标 */
export function createTray(mainWindow: BrowserWindow): Tray {
  // 创建托盘图标（使用简单的 16x16 图标）
  const iconPath = path.join(__dirname, '../../../assets/tray-icon.png');

  let icon: NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    // 如果图标文件不存在，创建一个简单的占位图标
    if (icon.isEmpty()) {
      icon = createDefaultTrayIcon();
    }
  } catch {
    icon = createDefaultTrayIcon();
  }

  // 调整图标大小以适配系统托盘
  const resizedIcon = icon.resize({ width: 16, height: 16 });
  tray = new Tray(resizedIcon);

  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        hideDockIfVisible();
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.exit(0);
      },
    },
  ]);

  tray.setToolTip('ClipHistory - 历史粘贴板');
  tray.setContextMenu(contextMenu);

  // 双击托盘图标显示主窗口
  tray.on('double-click', () => {
    hideDockIfVisible();
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}

/** 创建默认托盘图标（如果没有图标文件，用程序化方式生成） */
function createDefaultTrayIcon(): NativeImage {
  // 创建一个 16x16 的蓝色占位图标
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      // 圆角方形，使用 primary-500 色 (#2196F3)
      const cx = size / 2, cy = size / 2, r = size / 2 - 1;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      if (dist <= r) {
        buffer[offset] = 33;     // R
        buffer[offset + 1] = 150; // G
        buffer[offset + 2] = 243; // B
        buffer[offset + 3] = 255; // A
      } else {
        buffer[offset] = 0;
        buffer[offset + 1] = 0;
        buffer[offset + 2] = 0;
        buffer[offset + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

/** 销毁托盘 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/** 显示托盘气泡通知 */
export function showTrayNotification(title: string, body: string): void {
  if (tray && !tray.isDestroyed()) {
    tray.displayBalloon({
      title,
      content: body,
      iconType: 'info',
      largeIcon: false,
      noSound: true,
    });
  }
}

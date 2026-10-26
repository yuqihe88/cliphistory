// ============================================================
// ClipHistory — 全局快捷键模块
// ============================================================

import { globalShortcut, BrowserWindow } from 'electron';
import { getSettings } from './database';
import { hideDockIfVisible } from './dock';

let registeredKey: string | null = null;

/** 注册全局快捷键 */
export function registerGlobalShortcut(mainWindow: BrowserWindow): boolean {
  const settings = getSettings();
  const shortcutKey = settings.shortcutKey || 'Ctrl+Shift+V';

  // 如果已注册相同的快捷键，先不用重复注册
  if (registeredKey === shortcutKey && globalShortcut.isRegistered(shortcutKey)) {
    return true;
  }

  // 先注销旧的
  unregisterGlobalShortcut();

  const success = globalShortcut.register(shortcutKey, () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      hideDockIfVisible();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  if (success) {
    registeredKey = shortcutKey;
    console.log(`全局快捷键 "${shortcutKey}" 注册成功`);
  } else {
    console.warn(`全局快捷键 "${shortcutKey}" 注册失败（可能被其他应用占用）`);
  }

  return success;
}

/** 注销全局快捷键 */
export function unregisterGlobalShortcut(): void {
  if (registeredKey) {
    globalShortcut.unregister(registeredKey);
    registeredKey = null;
  }
}

/** 注销所有全局快捷键 */
export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll();
  registeredKey = null;
}

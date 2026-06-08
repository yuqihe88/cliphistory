// ============================================================
// ClipHistory — 开机自启模块
// ============================================================

import AutoLaunch from 'electron-auto-launch';
import { app } from 'electron';

const autoLauncher = new AutoLaunch({
  name: 'ClipHistory',
  // isHidden: true → 不弹出命令行窗口（Windows 下默认 false）
  isHidden: true,
});

/** 启用开机自启 */
export async function enableAutoLaunch(): Promise<boolean> {
  try {
    const enabled = await autoLauncher.isEnabled();
    if (!enabled) {
      await autoLauncher.enable();
      console.log('[AutoLaunch] 开机自启已启用');
    }
    return true;
  } catch (err) {
    console.error('[AutoLaunch] 启用失败:', err);
    return false;
  }
}

/** 禁用开机自启 */
export async function disableAutoLaunch(): Promise<boolean> {
  try {
    const enabled = await autoLauncher.isEnabled();
    if (enabled) {
      await autoLauncher.disable();
      console.log('[AutoLaunch] 开机自启已禁用');
    }
    return true;
  } catch (err) {
    console.error('[AutoLaunch] 禁用失败:', err);
    return false;
  }
}

/** 根据设定同步开机自启状态 */
export async function syncAutoLaunch(enabled: boolean): Promise<boolean> {
  return enabled ? enableAutoLaunch() : disableAutoLaunch();
}

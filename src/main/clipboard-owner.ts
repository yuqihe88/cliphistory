// ============================================================
// ClipHistory — 剪贴板归属进程追踪
// 排除应用功能需要知道"内容是从哪个应用复制的"。
// Electron 无此 API，这里维持一个常驻 PowerShell 辅助进程：
// 每 250ms 读取剪贴板所有者窗口的进程名，变化时输出一行。
// ============================================================

import { spawn, type ChildProcess } from 'child_process';
import readline from 'readline';

let proc: ChildProcess | null = null;
let lastOwner = '';

const HELPER_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ClipboardOwnerProbe {
  [DllImport("user32.dll")] public static extern IntPtr GetClipboardOwner();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint procId);
}
"@
$last = ''
while ($true) {
  Start-Sleep -Milliseconds 250
  try {
    $name = ''
    $h = [ClipboardOwnerProbe]::GetClipboardOwner()
    if ($h -ne [IntPtr]::Zero) {
      $procId = [uint32]0
      [ClipboardOwnerProbe]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
      if ($procId -gt 0) {
        $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($p) { $name = $p.ProcessName }
      }
    }
    if ($name -ne $last) { $last = $name; Write-Output $name }
  } catch {}
}
`;

/** 启动/停止归属追踪（名单为空时停止，节省资源） */
export function syncOwnerTracker(excludedApps: string[]): void {
  const needed = Array.isArray(excludedApps) && excludedApps.length > 0;
  if (needed && !proc) {
    startTracker();
  } else if (!needed && proc) {
    stopOwnerTracker();
  }
}

function startTracker(): void {
  try {
    proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-Command', HELPER_SCRIPT],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const rl = readline.createInterface({ input: proc.stdout! });
    rl.on('line', (line) => {
      lastOwner = line.trim();
    });
    proc.on('exit', () => {
      proc = null;
    });
    console.log('[OwnerTracker] 剪贴板归属追踪已启动');
  } catch (err) {
    console.error('[OwnerTracker] 启动失败:', err);
    proc = null;
  }
}

export function stopOwnerTracker(): void {
  if (proc) {
    proc.kill();
    proc = null;
  }
  lastOwner = '';
  console.log('[OwnerTracker] 剪贴板归属追踪已停止');
}

/** 当前剪贴板归属进程名（可能为空 = 未知） */
export function getClipboardOwnerName(): string {
  return lastOwner;
}

/** 应用退出时调用 */
export function stopOwnerTrackerOnQuit(): void {
  if (proc) {
    proc.kill();
    proc = null;
  }
}

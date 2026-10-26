// ============================================================
// ClipHistory — 粘贴板监听模块
// ============================================================

import { clipboard, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { insertRecord, imagesDir, getSettings } from './database';
import { getClipboardOwnerName } from './clipboard-owner';

// ---- 状态 ----
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let lastTextHash: string = '';
let lastImageHash: string = '';
let lastVideoPath: string = '';
let lastImageFilePath: string = '';
let onNewClipCallback: (() => void) | null = null;

/** 轮询间隔（毫秒） */
const POLL_INTERVAL = 500;

// ---- 图片大小限制（50MB） ----
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;

// ---- 视频文件扩展名 ----
const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.m4v', '.mpg', '.mpeg', '.ts', '.3gp', '.rmvb', '.rm',
];

// ---- 图片文件扩展名 ----
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];

function extOf(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

const isVideoPath = (p: string): boolean => VIDEO_EXTENSIONS.includes(extOf(p));
const isImagePath = (p: string): boolean => IMAGE_EXTENSIONS.includes(extOf(p));

/** 本次剪贴板内容是否来自排除名单里的应用（隐私保护） */
function isExcludedOwner(): boolean {
  const owner = getClipboardOwnerName();
  if (!owner) return false;
  const settings = getSettings();
  if (!settings.excludedApps || settings.excludedApps.length === 0) return false;
  const ownerLower = owner.toLowerCase().replace(/\.exe$/, '');
  return settings.excludedApps.some((a) => {
    const app = a.trim().toLowerCase().replace(/\.exe$/, '');
    return app.length > 0 && ownerLower === app;
  });
}

/** 计算字符串的简单 hash */
function hashString(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

/** 计算 Buffer 的 hash */
function hashBuffer(buf: Buffer): string {
  return crypto.createHash('md5').update(buf).digest('hex');
}

/** 检查粘贴板文字变化 */
function checkTextClipboard(): void {
  const text = clipboard.readText();
  if (!text) return;
  if (isExcludedOwner()) return; // 来自排除应用的内容不记录

  const hash = hashString(text);
  if (hash === lastTextHash) return; // 内容未变化

  console.log(`[Clipboard] 检测到新文字: "${text.substring(0, 30)}..."`);
  lastTextHash = hash;
  insertRecord('text', text);
  console.log('[Clipboard] 已写入数据库');
  if (onNewClipCallback) {
    console.log('[Clipboard] 通知渲染进程...');
    onNewClipCallback();
  }
}

/** 检查粘贴板文件变化（Windows 复制文件时 FileNameW 格式携带文件路径） */
function checkFileClipboard(): void {
  let filePath = '';
  try {
    const buf = clipboard.readBuffer('FileNameW');
    if (buf && buf.length > 1) {
      filePath = buf.toString('utf16le').replace(/\0+$/g, '').trim();
    }
  } catch {
    return; // 该格式不可用时静默跳过
  }
  if (!filePath) return;
  if (isExcludedOwner()) return; // 来自排除应用的内容不记录

  // Windows 复制文件会同时把路径放入文字区，先归类再抑制，避免重复入库
  const suppressText = (): void => {
    lastTextHash = hashString(filePath);
  };

  if (isVideoPath(filePath)) {
    if (filePath === lastVideoPath) return; // 内容未变化
    console.log(`[Clipboard] 检测到新视频文件: ${filePath}`);
    lastVideoPath = filePath;
    suppressText();
    insertRecord('video', filePath);
    if (onNewClipCallback) onNewClipCallback();
    return;
  }

  if (isImagePath(filePath)) {
    if (filePath === lastImageFilePath) return; // 内容未变化
    // 图片文件：直接引用原路径（不落盘拷贝），记录为图片类型
    let size: number | null = null;
    try {
      size = fs.statSync(filePath).size;
      if (size > MAX_IMAGE_SIZE) return; // 超大文件不记录
    } catch { /* 文件不可访问则忽略 */ return; }
    console.log(`[Clipboard] 检测到新图片文件: ${filePath}`);
    lastImageFilePath = filePath;
    suppressText();
    insertRecord('image', null, filePath, size);
    if (onNewClipCallback) onNewClipCallback();
  }
}

/** 检查粘贴板图片变化 */
function checkImageClipboard(): void {
  const img = clipboard.readImage();
  if (img.isEmpty()) return;
  if (isExcludedOwner()) return; // 来自排除应用的内容不记录

  // 超大图先缩到 1920px 内，再压成 JPEG（PNG 截图动辄数 MB，WebP 无原生支持）
  let out = img;
  const size = img.getSize();
  const maxDim = Math.max(size.width, size.height);
  if (maxDim > 1920) {
    const scale = 1920 / maxDim;
    out = img.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
  }
  const imageBuffer = out.toJPEG(80);
  if (!imageBuffer || imageBuffer.length === 0) return;

  const hash = hashBuffer(imageBuffer);
  if (hash === lastImageHash) return; // 内容未变化
  if (imageBuffer.length > MAX_IMAGE_SIZE) return;

  lastImageHash = hash;

  // 将图片保存到文件
  const fileName = `${Date.now()}_${hash.substring(0, 8)}.jpg`;
  const filePath = path.join(imagesDir, fileName);

  try {
    fs.writeFileSync(filePath, imageBuffer);
    insertRecord('image', null, filePath, imageBuffer.length);
    if (onNewClipCallback) onNewClipCallback();
  } catch (err) {
    console.error('保存图片失败:', err);
  }
}

/** 轮询粘贴板（文件优先：文件复制同时带文字路径，先归类避免重复；暂停时不采集） */
function pollClipboard(): void {
  if (getSettings().paused) return; // 暂停记录（隐私模式）
  checkFileClipboard();
  checkTextClipboard();
  checkImageClipboard();
}

/** 设置新内容回调 */
export function setOnNewClip(callback: () => void): void {
  onNewClipCallback = callback;
}

/** 开始监听粘贴板 */
export function startClipboardMonitor(): void {
  // 初始化当前粘贴板 hash（避免启动时立即记录）
  const currentText = clipboard.readText();
  const currentImage = clipboard.readImage();

  if (currentText) {
    lastTextHash = hashString(currentText);
  }
  if (!currentImage.isEmpty()) {
    const buf = currentImage.toPNG();
    if (buf) {
      lastImageHash = hashBuffer(buf);
    }
  }
  try {
    const buf = clipboard.readBuffer('FileNameW');
    if (buf && buf.length > 1) {
      const p = buf.toString('utf16le').replace(/\0+$/g, '').trim();
      if (isVideoPath(p)) lastVideoPath = p;
      else if (isImagePath(p)) lastImageFilePath = p;
      if (p) lastTextHash = hashString(clipboard.readText() || p);
    }
  } catch { /* ignore */ }

  pollingTimer = setInterval(pollClipboard, POLL_INTERVAL);
}

/** 停止监听粘贴板 */
export function stopClipboardMonitor(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

/**
 * 通过 PowerShell Set-Clipboard 把真实文件写入系统剪贴板（CF_HDROP）。
 * Electron 无原生 API 写文件剪贴板，借用系统命令实现"粘贴出真文件"。
 */
function writeFileToClipboard(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // 单引号内 '' 转义，防止路径含引号/空格出错
    const escaped = filePath.replace(/'/g, "''");
    const cmd = `Set-Clipboard -LiteralPath '${escaped}' -ErrorAction Stop`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', cmd],
      { windowsHide: true, timeout: 5000 },
      (err) => {
        if (err) {
          console.error('[Clipboard] Set-Clipboard 写入文件失败:', err);
          resolve(false);
        } else {
          resolve(true);
        }
      }
    );
  });
}

/** 写文本到剪贴板但不被监听器捕获（用于复制提示词，避免污染历史记录） */
export function writeTextWithoutCapture(text: string): boolean {
  try {
    clipboard.writeText(text);
    lastTextHash = hashString(text);
    return true;
  } catch {
    return false;
  }
}

/** 将记录内容写回系统粘贴板 */
export async function writeToClipboard(
  type: string,
  content: string | null,
  imagePath: string | null
): Promise<boolean> {
  try {
    if (type === 'text' && content) {
      clipboard.writeText(content);
      return true;
    }

    if (type === 'video' && content) {
      const ok = await writeFileToClipboard(content);
      if (ok) {
        // 回写后轮询会再次读到同一文件，抑制自捕获
        lastVideoPath = content;
        lastTextHash = hashString(content);
        return true;
      }
      clipboard.writeText(content); // 兜底：至少把路径写回
      lastTextHash = hashString(content);
      return true;
    }

    if (type === 'image' && imagePath) {
      if (!fs.existsSync(imagePath)) return false;

      // 引用原始文件的图片记录：回写真实文件（CF_HDROP）
      const managed = path.resolve(imagePath).startsWith(path.resolve(imagesDir));
      if (!managed) {
        const ok = await writeFileToClipboard(imagePath);
        if (ok) {
          lastImageFilePath = imagePath;
          lastTextHash = hashString(imagePath);
          return true;
        }
        const img = nativeImage.createFromPath(imagePath); // 兜底：回写位图
        if (!img.isEmpty()) {
          clipboard.writeImage(img);
          return true;
        }
        return false;
      }

      // 应用自捕获的位图记录：回写位图，并同步抑制自捕获
      const img = nativeImage.createFromPath(imagePath);
      if (img.isEmpty()) return false;
      clipboard.writeImage(img);
      const png = img.toPNG();
      if (png) lastImageHash = hashBuffer(png);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

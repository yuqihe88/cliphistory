// ============================================================
// ClipHistory — 粘贴板监听模块
// ============================================================

import { clipboard, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { insertRecord, imagesDir } from './database';

// ---- 状态 ----
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let lastTextHash: string = '';
let lastImageHash: string = '';
let onNewClipCallback: (() => void) | null = null;

/** 轮询间隔（毫秒） */
const POLL_INTERVAL = 500;

// ---- 图片大小限制（50MB） ----
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;

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

/** 检查粘贴板图片变化 */
function checkImageClipboard(): void {
  const img = clipboard.readImage();
  if (img.isEmpty()) return;

  // 转为 PNG Buffer
  const pngBuffer = img.toPNG();
  if (!pngBuffer || pngBuffer.length === 0) return;

  // 检查图片大小限制
  if (pngBuffer.length > MAX_IMAGE_SIZE) return;

  const hash = hashBuffer(pngBuffer);
  if (hash === lastImageHash) return; // 内容未变化

  lastImageHash = hash;

  // 将图片保存到文件
  const fileName = `${Date.now()}_${hash.substring(0, 8)}.png`;
  const filePath = path.join(imagesDir, fileName);

  try {
    fs.writeFileSync(filePath, pngBuffer);
    insertRecord('image', null, filePath, pngBuffer.length);
    if (onNewClipCallback) onNewClipCallback();
  } catch (err) {
    console.error('保存图片失败:', err);
  }
}

/** 轮询粘贴板 */
function pollClipboard(): void {
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

  pollingTimer = setInterval(pollClipboard, POLL_INTERVAL);
}

/** 停止监听粘贴板 */
export function stopClipboardMonitor(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

/** 将记录内容写回系统粘贴板 */
export function writeToClipboard(
  type: string,
  content: string | null,
  imagePath: string | null
): boolean {
  try {
    if (type === 'text' && content) {
      clipboard.writeText(content);
      return true;
    } else if (type === 'image' && imagePath) {
      if (fs.existsSync(imagePath)) {
        const img = nativeImage.createFromPath(imagePath);
        clipboard.writeImage(img);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

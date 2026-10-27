/** Real Electron UI/IPC smoke test. Run after npm run build; user data and clipboard stay isolated. */
import { app, BrowserWindow, clipboard, dialog, nativeImage, shell } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cliphistory-ui-'));
const outputDir = path.join(root, '.bin');
fs.mkdirSync(outputDir, { recursive: true });
app.setPath('userData', testDir);
app.disableHardwareAcceleration();
process.env.NODE_ENV = 'production';
delete process.env.VITE_DEV_SERVER_URL;
delete process.env.DEV_TOOLS;
BrowserWindow.prototype.show = function (): void { /* Test window stays hidden. */ };

let copiedText: string | null = null;
let copiedImage = false;
let clipboardWrites = 0;
clipboard.writeText = (value: string): void => { copiedText = value; clipboardWrites += 1; };
clipboard.writeImage = (): void => { copiedImage = true; clipboardWrites += 1; };
const revealedFiles: string[] = [];
shell.showItemInFolder = (filePath: string): void => { revealedFiles.push(filePath); };
const fileCopyCommands: string[] = [];
let failFileCopy = false;
const childProcess = require('node:child_process');
const originalExecFile = childProcess.execFile;
childProcess.execFile = (executable: string, args: string[], options: any, callback: any) => {
  if (executable === 'powershell.exe' && args.some((argument) => argument.startsWith('Set-Clipboard '))) {
    assert.equal(options.windowsHide, true);
    fileCopyCommands.push(args[args.length - 1]);
    clipboardWrites += 1;
    queueMicrotask(() => callback(failFileCopy ? new Error('Simulated system clipboard failure') : null));
    return;
  }
  return originalExecFile(executable, args, options, callback);
};

const database = require(path.join(root, 'dist/main/main/database.js'));
const originalInit = database.initDatabase;
let historyId: number;
database.initDatabase = async (): Promise<void> => {
  await originalInit();
  database.saveSettings({ paused: true, autoLaunch: false, floatMode: false });
  historyId = database.insertRecord('text', '历史收藏示例：每周固定发布的简介').id;
};
require(path.join(root, 'dist/main/main/auto-launch.js')).syncAutoLaunch = async () => true;
require(path.join(root, 'dist/main/main/shortcut.js')).registerGlobalShortcut = () => true;
require(path.join(root, 'dist/main/main/clipboard.js')).startClipboardMonitor = () => {};
require(path.join(root, 'dist/main/main/tray.js')).createTray = () => null;

const fixtureDir = path.join(testDir, 'fixtures');
fs.mkdirSync(fixtureDir);
const fixtureText = path.join(fixtureDir, '常用说明.txt');
const fixtureVideo = path.join(fixtureDir, '产品片段.mp4');
const fixtureImage = path.join(fixtureDir, '产品封面.png');
const missingFixture = path.join(fixtureDir, '未找到的文件.pdf');
fs.writeFileSync(fixtureText, '项目文件导入测试');
fs.writeFileSync(fixtureVideo, 'Fixture used for file storage and classification only.');
const bitmap = Buffer.alloc(180 * 100 * 4);
for (let y = 0; y < 100; y++) {
  for (let x = 0; x < 180; x++) {
    const offset = (y * 180 + x) * 4;
    bitmap[offset] = 210 + Math.round(y / 5);
    bitmap[offset + 1] = 120 + Math.round(x / 3);
    bitmap[offset + 2] = 65;
    bitmap[offset + 3] = 255;
  }
}
fs.writeFileSync(fixtureImage, nativeImage.createFromBitmap(bitmap, { width: 180, height: 100 }).toPNG());
(dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [fixtureImage, fixtureVideo, fixtureText, missingFixture] });
(dialog as any).showErrorBox = (title: string, message: string) => { throw new Error(`${title}: ${message}`); };

let win: BrowserWindow;
const rendererErrors: string[] = [];
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function run<T = any>(code: string): Promise<T> {
  try { return await win.webContents.executeJavaScript(code, true); }
  catch (error) { throw new Error(`Renderer action failed: ${code.slice(0, 240)}\n${String(error)}\n${rendererErrors.join('\n')}`); }
}
async function waitFor(code: string, label: string): Promise<void> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if (await run<boolean>(code)) return; } catch { /* Wait for navigation/render. */ }
    await delay(50);
  }
  throw new Error(`Timed out: ${label}`);
}
async function idle(): Promise<void> {
  await waitFor(`!document.querySelector('section[aria-label="项目素材"][aria-busy="true"]')`, 'project action completed');
}
async function click(label: string, selector = 'button'): Promise<void> {
  await run(`(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(element => element.textContent.trim() === ${JSON.stringify(label)});
    if (!button || button.disabled) throw new Error('Button unavailable: ' + ${JSON.stringify(label)});
    button.click();
  })()`);
}
async function fill(selector: string, value: string): Promise<void> {
  await run(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Input unavailable: ' + ${JSON.stringify(selector)});
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}
async function selectProject(id: number): Promise<void> {
  await run(`(() => { const select = document.querySelector('#project-select'); const value = ${JSON.stringify(String(id))}; if (select.value !== value) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  await idle();
}
async function newProject(name: string): Promise<number> {
  await click('＋ 新建项目');
  await fill('#project-name', name);
  await click('保存项目');
  await waitFor(`!document.querySelector('#project-name') && !!document.querySelector('#project-select')`, 'project created');
  await idle();
  return database.getProjects().find((project: any) => project.name === name).id;
}
async function articleAction(itemId: number, label: string): Promise<void> {
  const writesBefore = clipboardWrites;
  await run(`(() => {
    const article = document.querySelector('article[data-project-item-id="${itemId}"]');
    const button = [...(article?.querySelectorAll('button') || [])].find(element => element.textContent.trim() === ${JSON.stringify(label)});
    if (!button || button.disabled) throw new Error('Article action unavailable');
    button.click();
  })()`);
  await delay(50);
  assert.equal(clipboardWrites, writesBefore, `${label} must not also copy the card`);
}
async function copyCard(itemId?: number, key?: 'Enter' | ' '): Promise<void> {
  await run(`(() => {
    const article = document.querySelector(${JSON.stringify(itemId === undefined ? 'article' : `article[data-project-item-id="${itemId}"]`)});
    if (!article) throw new Error('Copy card unavailable');
    if (${JSON.stringify(key ?? null)}) {
      article.focus();
      article.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key ?? '')}, bubbles: true, cancelable: true }));
    } else {
      (article.querySelector('p, img') || article).click();
    }
  })()`);
  await idle();
}
async function captureViewport(fileName: string, width: number, height: number): Promise<void> {
  win.setSize(width + 1, height);
  await delay(100);
  win.setSize(width, height);
  await run(`document.getAnimations().forEach(animation => animation.finish())`);
  await delay(250);
  fs.writeFileSync(path.join(outputDir, fileName), (await win.webContents.capturePage()).toPNG());
}
async function dialogTarget(projectId: number | 'new'): Promise<void> {
  await waitFor(`!!document.querySelector('[role="dialog"] select')`, 'transfer target selector');
  await run(`(() => { const select = document.querySelector('[role="dialog"] select'); select.value = ${JSON.stringify(String(projectId))}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}
async function submitTransfer(mode: 'copy' | 'move'): Promise<void> {
  await run(`document.querySelector('[role="dialog"] [data-transfer-mode="${mode}"]').click()`);
  await run(`document.querySelector('[role="dialog"] button[type="submit"]').click()`);
  await waitFor(`!document.querySelector('[role="dialog"]')`, `${mode} transfer completed`);
  await idle();
}

let settled = false;
async function finish(code: number): Promise<void> {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  if (code && win && !win.isDestroyed()) {
    try { fs.writeFileSync(path.join(outputDir, 'project-ui-failure.png'), (await win.webContents.capturePage()).toPNG()); } catch { /* Preserve original error. */ }
  }
  app.once('quit', () => {
    const resolved = path.resolve(testDir);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('cliphistory-ui-'));
    try { fs.rmSync(resolved, { recursive: true, force: true }); } catch { /* Chromium may still hold a cache file briefly. */ }
  });
  process.exitCode = code;
  (app as any).isQuitting = true;
  app.once('will-quit', () => app.exit(code));
  app.quit();
}
const timeout = setTimeout(() => { console.error('FAIL: UI smoke test exceeded 90 seconds'); void finish(1); }, 90000);

app.whenReady().then(async () => {
  while (!BrowserWindow.getAllWindows().length) await delay(50);
  win = BrowserWindow.getAllWindows()[0];
  win.webContents.setBackgroundThrottling(false);
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) rendererErrors.push(message); });
  await waitFor(`document.readyState === 'complete' && !!window.clipHistory && !!document.querySelector('[title="项目素材"]')`, 'production renderer loaded');
  await run(`document.querySelector('[title="项目素材"]').click()`);
  await waitFor(`!!document.querySelector('section[aria-label="项目素材"]')`, 'project view');
  await idle();
  assert.equal(await run(`document.querySelector('[title="常用提示词"]') === null`), true, 'standalone prompt category removed');

  const customerId = await newProject('客户沟通');
  await click('＋ 添加文字');
  const originalText = '  您好，很高兴认识您！\n这是本周项目的沟通说明。  ';
  assert.equal(await run(`document.querySelector('#material-title') === null && document.querySelectorAll('section form input').length === 0`), true, 'text creation has no title field');
  await fill('#material-content', originalText);
  await click('保存文字');
  await waitFor(`document.querySelectorAll('article').length === 1 && !document.querySelector('#material-content')`, 'text saved');
  await idle();
  assert.equal(database.getProjectItems(customerId)[0].content, originalText);
  const textItemId = database.getProjectItems(customerId)[0].id;
  assert.equal(await run(`document.querySelector('article h3') === null && document.querySelectorAll('article p').length === 1`), true, 'text content displayed once without title');
  assert.equal(await run(`[...document.querySelectorAll('article button')].some(button => /^(复制文字|复制图片|复制文件|已复制)/.test(button.textContent.trim()))`), false, 'no separate card copy button');
  const beforeTextClick = clipboardWrites;
  await copyCard(textItemId);
  await idle();
  assert.equal(clipboardWrites, beforeTextClick + 1, 'one body click copies exactly once');
  assert.equal(copiedText, originalText, 'copy preserves leading/trailing whitespace');
  assert.ok(await run(`document.querySelector('article').textContent.includes('已复制')`), 'card displays copy feedback');
  await copyCard(textItemId, 'Enter');
  assert.equal(clipboardWrites, beforeTextClick + 2, 'Enter copies focused card once');
  await copyCard(textItemId, ' ');
  assert.equal(clipboardWrites, beforeTextClick + 3, 'Space copies focused card once');

  await articleAction(textItemId, '编辑');
  const editedText = '  您好，这是项目资料。\n附件与常用文案都在此项目中。  ';
  assert.equal(await run(`document.querySelector('#material-title') === null`), true, 'text editing has no title field');
  await fill('#material-content', editedText);
  await click('保存文字');
  await waitFor(`!document.querySelector('#material-content')`, 'text editor saved');
  await idle();
  assert.equal(database.getProjectItems(customerId)[0].content, editedText);
  await click('重命名');
  await fill('#project-name', '客户沟通 · 常用资料');
  await click('保存项目');
  await waitFor(`!document.querySelector('#project-name')`, 'project renamed');
  await idle();
  assert.equal(database.getProjects().find((project: any) => project.id === customerId).name, '客户沟通 · 常用资料');

  const videoId = await newProject('视频制作');
  assert.equal(await run(`document.querySelectorAll('article').length`), 0, 'new project starts empty');
  await click('导入图片 / 视频 / 文件');
  await waitFor(`document.querySelectorAll('article').length === 3`, 'files imported');
  await idle();
  assert.deepEqual(database.getProjectItems(videoId).map((item: any) => item.type).sort(), ['file', 'image', 'video']);
  assert.ok(await run(`document.querySelector('[role="alert"]').textContent.includes('未找到的文件.pdf')`), 'partial import failure visible');
  await click('关闭提示');
  await fill('#project-search', '产品封面');
  await waitFor(`document.querySelectorAll('article').length === 1`, 'search finds filename');
  const imageItem = database.getProjectItems(videoId).find((item: any) => item.type === 'image');
  await articleAction(imageItem.id, '定位文件');
  assert.equal(revealedFiles[revealedFiles.length - 1], imageItem.filePath);
  await copyCard(imageItem.id);
  await idle();
  assert.equal(copiedImage, true, 'image travels through real IPC clipboard handler');
  await click('清除');
  await click('视频', '[aria-label="素材类型"] button');
  await waitFor(`document.querySelectorAll('article').length === 1 && document.querySelector('article').textContent.includes('产品片段.mp4')`, 'type filter selects video');
  await copyCard();
  await idle();
  const videoItem = database.getProjectItems(videoId).find((item: any) => item.type === 'video');
  assert.equal(fileCopyCommands[fileCopyCommands.length - 1], `Set-Clipboard -LiteralPath '${videoItem.filePath.replace(/'/g, "''")}' -ErrorAction Stop`);
  assert.equal(path.basename(videoItem.filePath), '产品片段.mp4');
  await click('文件', '[aria-label="素材类型"] button');
  await waitFor(`document.querySelectorAll('article').length === 1 && document.querySelector('article').textContent.includes('常用说明.txt')`, 'file filter');
  await copyCard();
  await idle();
  const importedFile = database.getProjectItems(videoId).find((item: any) => item.type === 'file');
  assert.equal(fileCopyCommands[fileCopyCommands.length - 1], `Set-Clipboard -LiteralPath '${importedFile.filePath.replace(/'/g, "''")}' -ErrorAction Stop`);
  assert.equal(path.basename(importedFile.filePath), '常用说明.txt');
  const previousText = copiedText;
  failFileCopy = true;
  await copyCard();
  await idle();
  await waitFor(`!!document.querySelector('[role="alert"]')`, 'system file clipboard failure visible');
  assert.equal(copiedText, previousText, 'failed file copy must not silently copy a path string');
  failFileCopy = false;
  await click('关闭提示');
  await click('全部', '[aria-label="素材类型"] button');
  await waitFor(`document.querySelectorAll('article').length === 3`, 'all filter restored');

  const fileItem = database.getProjectItems(videoId).find((item: any) => item.type === 'file');
  fs.unlinkSync(fileItem.filePath);
  await fill('#project-search', '常用说明');
  await waitFor(`document.querySelectorAll('article').length === 1`, 'missing file selected');
  await copyCard();
  await idle();
  await waitFor(`!!document.querySelector('[role="alert"]')`, 'missing file failure visible');
  assert.ok(await run(`document.querySelector('[role="alert"]').textContent.includes('复制失败')`));
  await click('关闭提示');
  await articleAction(fileItem.id, '删除');
  await waitFor(`!!document.querySelector('.glass-dialog')`, 'item confirmation');
  await click('删除', '.glass-dialog button');
  await waitFor(`!document.querySelector('.glass-dialog')`, 'item deleted');
  await idle();
  assert.equal(database.getProjectItems(videoId).length, 2);
  await click('清除');

  await selectProject(customerId);
  await waitFor(`document.querySelectorAll('article').length === 1 && document.querySelector('article p').textContent === ${JSON.stringify(editedText)}`, 'project switching scopes contents');
  await click('全部');
  await waitFor(`!!document.querySelector('[aria-label="移动或复制到项目"]')`, 'history view');
  await run(`document.querySelector('[aria-label="移动或复制到项目"]').click()`);
  await waitFor(`!!document.querySelector('[role="dialog"] select')`, 'history picker');
  assert.ok(await run(`document.querySelector('[data-transfer-mode="copy"]').getAttribute('aria-pressed') === 'true'`), 'copy mode is default');
  await dialogTarget(customerId);
  await submitTransfer('copy');
  await waitFor(`!!document.querySelector('#project-select') && document.querySelectorAll('article').length === 2`, 'history saved into selected project');
  await idle();
  assert.equal(database.getProjectItems(customerId).length, 2);
  assert.ok(database.getRecordById(historyId), 'copy to project retains source history');

  // Renderer reload proves the UI reloads durable data through preload/IPC.
  await new Promise<void>((resolve) => { win.webContents.once('did-finish-load', () => resolve()); win.webContents.reload(); });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('[title="项目素材"]')`, 'renderer reloaded');
  await run(`document.querySelector('[title="项目素材"]').click()`);
  await waitFor(`!!document.querySelector('#project-select')`, 'persistent projects loaded');
  await idle();
  await selectProject(customerId);
  await waitFor(`document.querySelectorAll('article').length === 2`, 'saved text survives renderer reload');
  assert.ok(fs.statSync(path.join(testDir, 'cliphistory.db')).size > 0);

  // Show titleless text and one-click copy feedback at both native window sizes.
  await copyCard(textItemId);
  await run(`document.querySelector('section').scrollTop = 0`);
  await captureViewport('project-ui-desktop.png', 420, 560);
  await captureViewport('project-ui-small.png', 360, 400);
  assert.ok(await run(`document.documentElement.scrollWidth <= innerWidth`), 'small window has no page horizontal overflow');

  await selectProject(videoId);
  await waitFor(`document.querySelectorAll('article').length === 2`, 'other project selected for deletion');
  await click('删除', 'section > div > button');
  await waitFor(`!!document.querySelector('.glass-dialog')`, 'project confirmation');
  await click('删除', '.glass-dialog button');
  await waitFor(`!document.querySelector('.glass-dialog')`, 'project deleted');
  await idle();
  assert.equal(database.getProjects().length, 1);
  assert.equal(database.getProjectItems(customerId).length, 2, 'deleting another project preserves materials');
  assert.ok(fs.existsSync(fixtureImage) && fs.existsSync(fixtureVideo) && fs.existsSync(fixtureText), 'source files preserved');

  // Cross-project actions use the same production dialog and real transfer IPC.
  win.setSize(420, 560);
  const archiveId = await newProject('素材归档');
  await selectProject(customerId);
  await waitFor(`document.querySelectorAll('article').length === 2`, 'source project ready for transfer');
  const sourceText = database.getProjectItems(customerId).find((item: any) => item.content === editedText);
  const beforeCancelSource = database.getProjectItems(customerId).length;
  const beforeCancelTarget = database.getProjectItems(archiveId).length;
  await articleAction(sourceText.id, '移动 / 复制到项目');
  await waitFor(`!!document.querySelector('[role="dialog"] select')`, 'project transfer dialog');
  assert.ok(await run(`![...document.querySelector('[role="dialog"] select').options].some(option => option.value === ${JSON.stringify(String(customerId))})`), 'current project excluded from destination options');
  await dialogTarget(archiveId);
  await run(`document.querySelector('[data-transfer-mode="move"]').click()`);
  await captureViewport('project-transfer-desktop.png', 420, 560);
  await captureViewport('project-transfer-small.png', 360, 400);
  assert.ok(await run(`document.documentElement.scrollWidth <= innerWidth`), 'transfer dialog fits small window width');
  await click('取消', '[role="dialog"] button');
  await waitFor(`!document.querySelector('[role="dialog"]')`, 'transfer canceled');
  assert.equal(database.getProjectItems(customerId).length, beforeCancelSource);
  assert.equal(database.getProjectItems(archiveId).length, beforeCancelTarget);
  assert.ok(database.getProjectItemById(sourceText.id), 'cancel keeps source');
  win.setSize(420, 560);

  await articleAction(sourceText.id, '移动 / 复制到项目');
  await dialogTarget(archiveId);
  await submitTransfer('copy');
  assert.equal(await run(`document.querySelector('#project-select').value`), String(customerId), 'project transfer stays in current project');
  assert.ok(database.getProjectItemById(sourceText.id), 'copy preserves source item');
  assert.equal(database.getProjectItems(archiveId).length, beforeCancelTarget + 1);
  assert.equal(database.getProjectItems(archiveId)[0].content, editedText);
  await articleAction(sourceText.id, '移动 / 复制到项目');
  await dialogTarget(archiveId);
  await submitTransfer('move');
  assert.equal(await run(`document.querySelector('#project-select').value`), String(customerId));
  assert.equal(database.getProjectItems(customerId).length, beforeCancelSource - 1);
  assert.equal(database.getProjectItems(archiveId).length, beforeCancelTarget + 2);
  assert.equal(await run(`document.querySelectorAll('article').length`), beforeCancelSource - 1, 'moved item immediately leaves source view');

  // A copied file owns an independent copy, while the original project still has its file.
  await click('导入图片 / 视频 / 文件');
  await waitFor(`document.querySelectorAll('article').length === ${beforeCancelSource + 2}`, 'source project files imported');
  await idle();
  await click('关闭提示');
  const sourceImage = database.getProjectItems(customerId).find((item: any) => item.type === 'image');
  await articleAction(sourceImage.id, '移动 / 复制到项目');
  await dialogTarget(archiveId);
  await submitTransfer('copy');
  const copiedProjectImage = database.getProjectItems(archiveId).find((item: any) => item.type === 'image');
  assert.notEqual(copiedProjectImage.filePath, sourceImage.filePath);
  assert.ok(fs.existsSync(sourceImage.filePath));
  assert.deepEqual(fs.readFileSync(copiedProjectImage.filePath), fs.readFileSync(sourceImage.filePath));

  // History move can create its destination in the dialog and navigates to that project.
  await click('全部');
  await waitFor(`!!document.querySelector('[aria-label="移动或复制到项目"]')`, 'history source retained after copy');
  await run(`document.querySelector('[aria-label="移动或复制到项目"]').click()`);
  await dialogTarget('new');
  await fill('[role="dialog"] input', '每周发布');
  await submitTransfer('move');
  const publishingId = database.getProjects().find((project: any) => project.name === '每周发布').id;
  assert.equal(database.getRecordById(historyId), null, 'move removes source history');
  assert.equal(await run(`document.querySelector('#project-select').value`), String(publishingId), 'history transfer navigates to destination');
  assert.equal(database.getProjectItems(publishingId).length, 1);

  assert.equal(await run(`document.querySelector('[title="常用提示词"]') === null`), true, 'removed prompt category stays absent after navigation');
  assert.deepEqual(rendererErrors, [], 'renderer reports no console errors');
  console.log('PASS: Real production Electron UI/IPC: no text title field or duplicated title, no separate copy button, one-click card copy for text/image/video/file, Enter/Space card copy, action buttons never copy; prompt category removed; project CRUD, exact text editing, native file import/copy/failures, search/filter, persistence, deletion isolation, history/project transfers, independent files, and screenshots at 420x560/360x400.');
  await finish(0);
}).catch(async (error) => { console.error('FAIL:', error); await finish(1); });

// Register real app handlers synchronously before Electron emits ready.
require(path.join(root, 'dist/main/main/index.js'));

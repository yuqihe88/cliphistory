// Run after npm run build:main: node scripts/test-project-storage.ts
// Exercise the real sql.js store in an isolated workspace fixture, without opening Electron.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');

const workspace = path.resolve(__dirname, '..');
const fixtures = path.join(workspace, '.bin');
const fixture = path.join(fixtures, `project-storage-test-${randomUUID()}`);
const userData = path.join(fixture, 'data');
const originals = path.join(fixture, 'originals');
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(originals, { recursive: true });

const originalLoad = Module._load;
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') return { app: { getPath: () => userData } };
  return originalLoad.call(this, request, parent, isMain);
};
const store = require('../dist/main/main/database.js');
Module._load = originalLoad;

async function run(): Promise<void> {
  await store.initDatabase();
  assert.deepEqual(store.getProjects(), [], 'empty legacy store does not create a migration project');
  await testLegacyPromptMigration();
  const historyText = store.insertRecord('text', 'Existing clipboard history');
  store.closeDatabase();
  await store.initDatabase();
  assert.equal(store.getRecordById(historyText.id).content, 'Existing clipboard history');
  const prompt = store.addPrompt('Existing prompt');

  assert.throws(() => store.createProject('   '));
  assert.throws(() => store.createProject('x'.repeat(61)));
  const first = store.createProject('  客户资料  ');
  const second = store.createProject('视频工作');
  assert.equal(first.name, '客户资料');
  assert.throws(() => store.addProjectText(999999, '标题', '内容'));
  assert.throws(() => store.addProjectText(first.id, '', '   '));
  assert.throws(() => store.addProjectText(first.id, 'x'.repeat(121), '内容'));
  const text = store.addProjectText(first.id, '常用回复', '  第一行\n第二行  ');
  assert.equal(text.content, '  第一行\n第二行  ');
  assert.equal(store.getProjectItems(second.id).length, 0);
  assert.equal(store.updateProjectText(text.id, '更新标题', '\n 保留空格 \n'), true);
  assert.equal(store.getProjectItemById(text.id).content, '\n 保留空格 \n');
  assert.equal(store.renameProject(first.id, '新名称'), true);

  const image = path.join(originals, '照片 #1.png');
  const video = path.join(originals, '产品演示.mp4');
  const document = path.join(originals, '报价单.txt');
  fs.writeFileSync(image, Buffer.from([1, 2, 3, 4]));
  fs.writeFileSync(video, Buffer.from([5, 6, 7]));
  fs.writeFileSync(document, '报价内容');
  const imported = await store.importProjectFiles(first.id, [image, video, document, originals, path.join(originals, 'missing.pdf')]);
  assert.equal(imported.items.length, 3);
  assert.deepEqual(imported.items.map((item: { type: string }) => item.type), ['image', 'video', 'file']);
  assert.deepEqual(imported.failed, ['originals', 'missing.pdf']);
  assert.equal(imported.items[0].fileName, path.basename(image));
  assert.equal(path.basename(imported.items[0].filePath), path.basename(image));
  assert.equal(imported.items[2].fileSize, Buffer.byteLength('报价内容'));

  const managedHistoryImage = path.join(userData, 'images', 'history.jpg');
  fs.writeFileSync(managedHistoryImage, 'history image bytes');
  const historyImage = store.insertRecord('image', null, managedHistoryImage, 19);
  const savedImage = await store.saveHistoryToProject(second.id, historyImage.id);
  const savedText = await store.saveHistoryToProject(second.id, historyText.id);
  const historyVideo = store.insertRecord('video', video);
  const savedVideo = await store.saveHistoryToProject(second.id, historyVideo.id);
  assert.equal(savedText.content, 'Existing clipboard history');
  assert.notEqual(savedImage.filePath, managedHistoryImage);
  assert.notEqual(savedVideo.filePath, video);
  fs.unlinkSync(image);
  fs.unlinkSync(video);
  assert.deepEqual(fs.readFileSync(imported.items[0].filePath), Buffer.from([1, 2, 3, 4]));
  assert.deepEqual(fs.readFileSync(savedVideo.filePath), Buffer.from([5, 6, 7]));
  assert.equal(store.cleanupOldRecords(-1) >= 3, true);
  assert.equal(fs.existsSync(managedHistoryImage), false);
  assert.equal(fs.readFileSync(savedImage.filePath, 'utf8'), 'history image bytes');
  assert.equal(store.clearAll(), true);
  assert.equal(store.getProjectItems(first.id).length, 4);
  assert.equal(store.getProjectItems(second.id).length, 3);
  assert.equal(store.getPromptById(prompt.id).content, 'Existing prompt');
  store.deletePrompt(prompt.id);

  store.closeDatabase();
  await store.initDatabase();
  assert.equal(store.getProjects().find((project: { id: number }) => project.id === first.id).name, '新名称');
  assert.equal(store.getProjects().find((project: { id: number }) => project.id === first.id).itemCount, 4);
  assert.equal(store.getProjectItemById(text.id).content, '\n 保留空格 \n');

  // A partial temp-file write must neither truncate the durable DB nor commit memory changes.
  const databasePath = path.join(userData, 'cliphistory.db');
  const durableBefore = fs.readFileSync(databasePath);
  const realWrite = fs.writeFileSync;
  const realRename = fs.renameSync;
  const realError = console.error;
  let expectedFailures = 0;
  console.error = () => { expectedFailures += 1; };
  fs.writeFileSync = function (target: string, data: unknown, options: unknown) {
    if (String(target).startsWith(`${databasePath}.`) && String(target).endsWith('.tmp')) {
      realWrite.call(fs, target, Buffer.from('partial write'), options);
      throw new Error('Simulated ENOSPC');
    }
    return realWrite.call(fs, target, data, options);
  };
  try {
    assert.throws(() => store.createProject('Cannot save'));
    assert.equal(store.getProjects().length, 2);
    assert.throws(() => store.renameProject(first.id, 'Cannot rename'));
    assert.equal(store.getProjects().find((project: { id: number }) => project.id === first.id).name, '新名称');
    assert.throws(() => store.updateProjectText(text.id, 'Cannot edit', 'Changed text'));
    assert.equal(store.getProjectItemById(text.id).content, '\n 保留空格 \n');
    assert.throws(() => store.deleteProjectItem(imported.items[2].id));
    assert.equal(fs.existsSync(imported.items[2].filePath), true);
    assert.equal(store.getProjectItemById(imported.items[2].id).fileName, path.basename(document));
    assert.throws(() => store.deleteProject(first.id));
    assert.equal(store.getProjectItems(first.id).length, 4);
    assert.equal(fs.existsSync(imported.items[2].filePath), true);
    const rejectedImport = await store.importProjectFiles(first.id, [document]);
    assert.equal(rejectedImport.items.length, 0);
    assert.deepEqual(rejectedImport.failed, [path.basename(document)]);
    assert.equal(store.getProjectItems(first.id).length, 4);
    assert.equal(fs.readdirSync(path.join(userData, 'project-files')).length, 5);
  } finally {
    fs.writeFileSync = realWrite;
    console.error = realError;
  }
  assert.equal(expectedFailures >= 6, true);
  assert.deepEqual(fs.readFileSync(databasePath), durableBefore);
  assert.equal(fs.readdirSync(userData).some((name: string) => name.endsWith('.tmp')), false);
  fs.renameSync = function (source: string, destination: string) {
    if (destination === databasePath) throw new Error('Simulated rename failure');
    return realRename.call(fs, source, destination);
  };
  console.error = () => {};
  try { assert.throws(() => store.createProject('Cannot replace')); }
  finally { fs.renameSync = realRename; console.error = realError; }
  assert.deepEqual(fs.readFileSync(databasePath), durableBefore);
  assert.equal(store.getProjects().length, 2);
  assert.equal(fs.readdirSync(userData).some((name: string) => name.endsWith('.tmp')), false);

  assert.equal(store.deleteProjectItem(imported.items[2].id), true);
  assert.equal(fs.existsSync(document), true);
  assert.equal(fs.existsSync(imported.items[2].filePath), false);
  assert.equal(fs.existsSync(path.dirname(imported.items[2].filePath)), false);
  assert.equal(store.deleteProjectItem(imported.items[2].id), false);
  const firstPaths = store.getProjectItems(first.id).filter((item: { filePath: string | null }) => item.filePath).map((item: { filePath: string }) => item.filePath);
  assert.equal(store.deleteProject(first.id), true);
  assert.equal(firstPaths.every((filePath: string) => !fs.existsSync(filePath)), true);
  assert.equal(store.getProjectItems(second.id).length, 3);
  assert.throws(() => store.getProjectItems(first.id));
  assert.equal(store.deleteProject(second.id), true);
  assert.deepEqual(fs.readdirSync(path.join(userData, 'project-files')), []);
  assert.deepEqual(store.getProjects(), []);

  // A project deleted while an asynchronous file copy is running cannot gain orphan items.
  const duringImport = store.createProject('导入中删除');
  const pendingImport = store.importProjectFiles(duringImport.id, [document]);
  store.deleteProject(duringImport.id);
  const stoppedImport = await pendingImport;
  assert.equal(stoppedImport.items.length, 0);
  assert.deepEqual(stoppedImport.failed, [path.basename(document)]);
  assert.deepEqual(fs.readdirSync(path.join(userData, 'project-files')), []);

  await testTransfers();
  store.closeDatabase();
  console.log('PASS: atomic/idempotent legacy prompt migration preserving text/timestamps, name collisions and deletion; permanent project storage and transfers, all types, copy/move, independent files, races, persistence and disk-failure rollback.');
}

async function testLegacyPromptMigration(): Promise<void> {
  const unrelated = store.createProject('常用文本');
  const unrelatedItem = store.addProjectText(unrelated.id, '', '用户已有项目中的内容');
  const first = store.addPrompt('  旧提示词第一行\n第二行  ');
  const second = store.addPrompt('\n另一个提示词\n');
  const sourceRows = [first, second];
  const projectsBefore = store.getProjects();
  store.closeDatabase();
  const databasePath = path.join(userData, 'cliphistory.db');
  const durableBefore = fs.readFileSync(databasePath);
  const realRename = fs.renameSync;
  const realError = console.error;
  fs.renameSync = function (source: string, destination: string) {
    if (destination === databasePath) throw new Error('Simulated migration persistence failure');
    return realRename.call(fs, source, destination);
  };
  console.error = () => {};
  try {
    await assert.rejects(store.initDatabase(), /保存失败/);
    assert.deepEqual(store.getProjects(), projectsBefore);
    assert.deepEqual(store.getPrompts().map((entry: { id: number }) => entry.id).sort(), sourceRows.map((entry) => entry.id).sort());
    assert.deepEqual(fs.readFileSync(databasePath), durableBefore, 'failed migration leaves durable legacy source intact');
    assert.equal(fs.readdirSync(userData).some((name: string) => name.endsWith('.tmp')), false);
  } finally { fs.renameSync = realRename; console.error = realError; }
  store.closeDatabase();
  await store.initDatabase();
  assert.deepEqual(store.getPrompts(), []);
  const migrated = store.getProjects().find((project: { name: string }) => project.name === '常用文本（原提示词）');
  assert.ok(migrated);
  assert.equal(store.getProjects().length, 2);
  assert.equal(store.getProjectItems(unrelated.id)[0].id, unrelatedItem.id, 'same-named user project stays untouched');
  const migratedItems = store.getProjectItems(migrated.id);
  for (const source of sourceRows) {
    const item = migratedItems.find((entry: { content: string }) => entry.content === source.content);
    assert.ok(item);
    assert.equal(item.title, '');
    assert.equal(item.createdAt, source.createdAt);
    assert.equal(item.updatedAt, source.updatedAt);
  }
  store.closeDatabase();
  await store.initDatabase();
  assert.equal(store.getProjects().length, 2);
  assert.equal(store.getProjectItems(migrated.id).length, 2, 'restart never duplicates migrated rows');
  store.addPrompt('Later legacy text');
  store.closeDatabase();
  await store.initDatabase();
  assert.equal(store.getProjects().length, 2);
  assert.equal(store.getProjectItems(migrated.id).length, 3, 'legacy compatibility writes reuse marker project');
  store.deleteProject(migrated.id);
  store.closeDatabase();
  await store.initDatabase();
  assert.equal(store.getProjects().length, 1, 'deleted migration project is not resurrected');
  assert.deepEqual(store.getPrompts(), []);
  store.addPrompt('Legacy text after destination deletion');
  store.closeDatabase();
  await store.initDatabase();
  const replacement = store.getProjects().find((project: { id: number }) => project.id !== unrelated.id);
  assert.ok(replacement && replacement.id !== migrated.id);
  assert.equal(store.getProjectItems(replacement.id)[0].content, 'Legacy text after destination deletion');
  store.deleteProject(replacement.id);
  store.deleteProject(unrelated.id);
  assert.deepEqual(store.getProjects(), []);
}

async function testTransfers(): Promise<void> {
  const from = store.createProject('来源项目');
  const to = store.createProject('目标项目');
  const third = store.createProject('第三个项目');
  const exactText = ' \n 保留原文与空白 \n ';
  const historyText = store.insertRecord('text', exactText);
  const copiedText = await store.transferToProject({ kind: 'history', id: historyText.id }, to.id, 'copy');
  assert.equal(copiedText.content, exactText);
  assert.equal(store.getRecordById(historyText.id).content, exactText);
  const movedText = await store.transferToProject({ kind: 'history', id: historyText.id }, from.id, 'move');
  assert.equal(movedText.content, exactText);
  assert.equal(store.getRecordById(historyText.id), null);
  const prompt = store.addPrompt(exactText);
  const copiedPrompt = await store.transferToProject({ kind: 'prompt', id: prompt.id }, to.id, 'copy');
  assert.equal(copiedPrompt.content, exactText);
  assert.equal(store.getPromptById(prompt.id).content, exactText);
  const movedPrompt = await store.transferToProject({ kind: 'prompt', id: prompt.id }, from.id, 'move');
  assert.equal(movedPrompt.content, exactText);
  assert.equal(store.getPromptById(prompt.id), null);

  const image = path.join(originals, 'transfer-photo.png');
  const video = path.join(originals, 'transfer-video.mp4');
  const file = path.join(originals, 'transfer-document.txt');
  fs.writeFileSync(image, 'image contents');
  fs.writeFileSync(video, 'video contents');
  fs.writeFileSync(file, 'file contents');
  for (const [type, original] of [['image', image], ['video', video]]) {
    const record = store.insertRecord(type, type === 'video' ? original : null, type === 'image' ? original : null);
    const copy = await store.transferToProject({ kind: 'history', id: record.id }, to.id, 'copy');
    assert.equal(store.getRecordById(record.id).id, record.id);
    const move = await store.transferToProject({ kind: 'history', id: record.id }, to.id, 'move');
    assert.equal(store.getRecordById(record.id), null);
    assert.equal(fs.existsSync(original), true);
    assert.notEqual(copy.filePath, move.filePath);
    assert.equal(copy.type, type);
    assert.equal(move.type, type);
    assert.equal(fs.readFileSync(copy.filePath, 'utf8'), fs.readFileSync(original, 'utf8'));
    assert.equal(fs.readFileSync(move.filePath, 'utf8'), fs.readFileSync(original, 'utf8'));
  }

  const projectFiles = await store.importProjectFiles(from.id, [image, video, file]);
  const projectText = store.addProjectText(from.id, '自定义标题', exactText);
  for (const item of [projectText, ...projectFiles.items]) {
    await assert.rejects(store.transferToProject({ kind: 'project', id: item.id }, from.id, 'copy'), /其他项目/);
    await assert.rejects(store.transferToProject({ kind: 'project', id: item.id }, from.id, 'move'), /其他项目/);
    const copied = await store.transferToProject({ kind: 'project', id: item.id }, to.id, 'copy');
    assert.notEqual(copied.id, item.id);
    assert.equal(copied.title, item.title);
    assert.equal(copied.content, item.content);
    assert.equal(copied.fileName, item.fileName);
    assert.equal(store.getProjectItemById(item.id).projectId, from.id);
    if (item.filePath) {
      assert.notEqual(copied.filePath, item.filePath);
      assert.deepEqual(fs.readFileSync(copied.filePath), fs.readFileSync(item.filePath));
    }
    const moved = await store.transferToProject({ kind: 'project', id: item.id }, third.id, 'move');
    assert.equal(moved.id, item.id);
    assert.equal(moved.filePath, item.filePath);
    assert.equal(moved.title, item.title);
    assert.equal(moved.content, item.content);
    assert.equal(moved.projectId, third.id);
    assert.equal(store.getProjectItems(from.id).some((entry: { id: number }) => entry.id === item.id), false);
    assert.equal(store.getProjectItemById(copied.id).projectId, to.id);
  }

  // Moving between projects only changes ownership, even while the file is unavailable.
  const temporarilyMissing = projectFiles.items[0];
  const unavailablePath = `${temporarilyMissing.filePath}.unavailable`;
  fs.renameSync(temporarilyMissing.filePath, unavailablePath);
  const movedUnavailable = await store.transferToProject({ kind: 'project', id: temporarilyMissing.id }, from.id, 'move');
  assert.equal(movedUnavailable.id, temporarilyMissing.id);
  assert.equal(movedUnavailable.filePath, temporarilyMissing.filePath);
  await assert.rejects(store.transferToProject({ kind: 'project', id: temporarilyMissing.id }, to.id, 'copy'));
  fs.renameSync(unavailablePath, temporarilyMissing.filePath);

  for (const badSource of [null, { kind: 'invalid', id: 1 }, { kind: 'history', id: 0 }, { kind: 'project', id: 0.5 }]) {
    await assert.rejects(store.transferToProject(badSource, to.id, 'copy'), /有效的来源/);
  }
  await assert.rejects(store.transferToProject({ kind: 'project', id: projectText.id }, to.id, 'invalid'), /复制或移动/);
  await assert.rejects(store.transferToProject({ kind: 'project', id: projectText.id }, 999999, 'move'), /项目不存在/);
  await assert.rejects(store.transferToProject({ kind: 'prompt', id: 999999 }, to.id, 'copy'), /已被删除/);

  // Shared managed history files remain until the last referencing row has moved.
  const managedImage = path.join(userData, 'images', 'shared-transfer.jpg');
  fs.writeFileSync(managedImage, 'managed image contents');
  const managedRecord = store.insertRecord('image', null, managedImage, 22);
  store.closeDatabase();
  const SQL = await require('sql.js')();
  const stored = new SQL.Database(fs.readFileSync(path.join(userData, 'cliphistory.db')));
  stored.run(`INSERT INTO clipboard_history (type, image_path, image_size, created_at, updated_at)
    SELECT type, image_path, image_size, created_at, updated_at FROM clipboard_history WHERE id = ?`, [managedRecord.id]);
  const sharedRecordId = Number(stored.exec('SELECT last_insert_rowid()')[0].values[0][0]);
  fs.writeFileSync(path.join(userData, 'cliphistory.db'), Buffer.from(stored.export()));
  stored.close();
  await store.initDatabase();
  const firstManagedMove = await store.transferToProject({ kind: 'history', id: managedRecord.id }, to.id, 'move');
  assert.equal(fs.existsSync(managedImage), true);
  const lastManagedMove = await store.transferToProject({ kind: 'history', id: sharedRecordId }, to.id, 'move');
  assert.equal(fs.existsSync(managedImage), false);
  assert.equal(fs.readFileSync(firstManagedMove.filePath, 'utf8'), 'managed image contents');
  assert.equal(fs.readFileSync(lastManagedMove.filePath, 'utf8'), 'managed image contents');

  const failedManagedImage = path.join(userData, 'images', 'failed-transfer.jpg');
  fs.writeFileSync(failedManagedImage, 'must remain');
  const failedHistory = store.insertRecord('image', null, failedManagedImage, 11);
  const failedPrompt = store.addPrompt('Must remain a prompt');
  const failedText = store.insertRecord('text', 'Must remain history');
  const originalItems = store.getProjectItems(to.id);
  const originalFolders = fs.readdirSync(path.join(userData, 'project-files'));
  const databasePath = path.join(userData, 'cliphistory.db');
  const durableBefore = fs.readFileSync(databasePath);
  const realWrite = fs.writeFileSync;
  const realError = console.error;
  fs.writeFileSync = function (target: string, data: unknown, options: unknown) {
    if (String(target).startsWith(`${databasePath}.`) && String(target).endsWith('.tmp')) throw new Error('Simulated transfer save failure');
    return realWrite.call(fs, target, data, options);
  };
  console.error = () => {};
  try {
    for (const source of [
      { kind: 'history', id: failedHistory.id }, { kind: 'history', id: failedText.id },
      { kind: 'prompt', id: failedPrompt.id }, { kind: 'project', id: projectFiles.items[1].id },
    ]) {
      for (const mode of ['copy', 'move']) await assert.rejects(store.transferToProject(source, to.id, mode), /保存失败/);
    }
  } finally { fs.writeFileSync = realWrite; console.error = realError; }
  assert.deepEqual(store.getProjectItems(to.id), originalItems);
  assert.deepEqual(fs.readdirSync(path.join(userData, 'project-files')), originalFolders);
  assert.deepEqual(fs.readFileSync(databasePath), durableBefore);
  assert.equal(store.getRecordById(failedHistory.id).imagePath, failedManagedImage);
  assert.equal(store.getRecordById(failedText.id).content, 'Must remain history');
  assert.equal(store.getPromptById(failedPrompt.id).content, 'Must remain a prompt');
  assert.equal(fs.existsSync(failedManagedImage), true);
  assert.equal(store.getProjectItemById(projectFiles.items[1].id).projectId, third.id);

  // Pause at the file-copy boundary to deterministically exercise source/target races.
  const realCopy = fs.promises.copyFile;
  async function raceTransfer(start: () => Promise<unknown>, change: () => unknown): Promise<void> {
    let reached: () => void = () => {};
    let resume: () => void = () => {};
    const copying = new Promise<void>((resolve) => { reached = resolve; });
    const release = new Promise<void>((resolve) => { resume = resolve; });
    fs.promises.copyFile = async function (...args: unknown[]) {
      await realCopy.apply(fs.promises, args);
      reached();
      await release;
    };
    const pending = start();
    try {
      await copying;
      await change();
      resume();
      await assert.rejects(pending);
    } finally { resume(); fs.promises.copyFile = realCopy; }
  }
  const deletedTarget = store.createProject('即将删除的目标');
  await raceTransfer(
    () => store.transferToProject({ kind: 'history', id: failedHistory.id }, deletedTarget.id, 'move'),
    () => store.deleteProject(deletedTarget.id)
  );
  assert.equal(store.getRecordById(failedHistory.id).imagePath, failedManagedImage);
  assert.equal(fs.existsSync(failedManagedImage), true);
  assert.deepEqual(fs.readdirSync(path.join(userData, 'project-files')), originalFolders);
  await raceTransfer(
    () => store.transferToProject({ kind: 'project', id: projectFiles.items[1].id }, to.id, 'copy'),
    () => store.transferToProject({ kind: 'project', id: projectFiles.items[1].id }, from.id, 'move')
  );
  assert.equal(store.getProjectItemById(projectFiles.items[1].id).projectId, from.id);
  assert.deepEqual(store.getProjectItems(to.id), originalItems);
  assert.deepEqual(fs.readdirSync(path.join(userData, 'project-files')), originalFolders);
  await raceTransfer(
    () => store.transferToProject({ kind: 'history', id: failedHistory.id }, to.id, 'move'),
    () => store.setPinned(failedHistory.id, true)
  );
  assert.equal(store.getRecordById(failedHistory.id).isPinned, true);
  assert.equal(fs.existsSync(failedManagedImage), true);
  assert.deepEqual(fs.readdirSync(path.join(userData, 'project-files')), originalFolders);
  const deletedSource = store.insertRecord('video', video);
  await raceTransfer(
    () => store.transferToProject({ kind: 'history', id: deletedSource.id }, to.id, 'move'),
    () => store.deleteRecord(deletedSource.id)
  );
  assert.equal(store.getRecordById(deletedSource.id), null);
  assert.equal(fs.existsSync(video), true);
  assert.deepEqual(store.getProjectItems(to.id), originalItems);
  assert.deepEqual(fs.readdirSync(path.join(userData, 'project-files')), originalFolders);
  await raceTransfer(
    () => store.transferToProject({ kind: 'history', id: failedHistory.id }, to.id, 'move'),
    () => fs.writeFileSync(failedManagedImage, 'Source file changed while being copied, with different size')
  );
  assert.equal(store.getRecordById(failedHistory.id).imagePath, failedManagedImage);
  assert.equal(fs.existsSync(failedManagedImage), true);
  assert.deepEqual(store.getProjectItems(to.id), originalItems);
  assert.deepEqual(fs.readdirSync(path.join(userData, 'project-files')), originalFolders);

  store.deletePrompt(failedPrompt.id);
  const projects = store.getProjects();
  for (const project of projects) assert.equal(project.itemCount, store.getProjectItems(project.id).length);
  store.closeDatabase();
  await store.initDatabase();
  assert.deepEqual(store.getProjects(), projects);
  assert.equal(store.getProjectItemById(movedText.id).content, exactText);
  assert.equal(store.getRecordById(historyText.id), null);
  assert.equal(store.getPromptById(prompt.id), null);
  assert.equal(store.getProjectItemById(projectFiles.items[1].id).projectId, from.id);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  // Only the exact isolated fixture under this workspace's ignored .bin is removed.
  const resolvedFixture = path.resolve(fixture);
  if (path.dirname(resolvedFixture) !== path.resolve(fixtures) || !path.basename(resolvedFixture).startsWith('project-storage-test-')) {
    throw new Error('Refusing to remove a path outside the test fixtures directory');
  }
  fs.rmSync(resolvedFixture, { recursive: true, force: true });
});

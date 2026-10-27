// 项目素材：沿用现有玻璃界面，在小窗口内按项目长期保存和复制素材。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, ProjectItem, ProjectItemType } from '../../shared/types';
import ConfirmDialog from './ConfirmDialog';
import SaveToProjectDialog from './SaveToProjectDialog';

interface Props {
  initialProjectId?: number;
}

type ProjectEditor = { mode: 'new' | 'rename'; name: string } | null;
type TextEditor = { id: number | null; content: string } | null;
type DeleteTarget = { kind: 'project'; project: Project } | { kind: 'item'; item: ProjectItem };

const labels: Record<ProjectItemType, string> = { text: '文字', image: '图片', video: '视频', file: '文件' };
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';
const secondary = `h-8 px-3 rounded-full text-button text-neutral-800 bg-white/65 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${focus}`;
const primary = `h-8 px-3.5 rounded-full text-button font-medium text-white bg-primary-700 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${focus}`;
const input = 'w-full min-w-0 rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-body text-neutral-900 placeholder-neutral-600 outline-none focus:ring-2 focus:ring-primary-600';

function formatSize(size: number | null): string {
  if (size === null) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function FolderIcon() {
  return <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>;
}

export default function Projects({ initialProjectId }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(initialProjectId ?? null);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [projectEditor, setProjectEditor] = useState<ProjectEditor>(null);
  const [textEditor, setTextEditor] = useState<TextEditor>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [transferTarget, setTransferTarget] = useState<ProjectItem | null>(null);
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState<'all' | ProjectItemType>('all');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const activeId = useRef<number | null>(initialProjectId ?? null);
  const loadSequence = useRef(0);
  const mounted = useRef(true);
  const selectedProject = projects.find((project) => project.id === selectedId);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadSequence.current += 1; };
  }, []);

  const selectProject = useCallback((id: number | null) => {
    activeId.current = id;
    loadSequence.current += 1;
    setSelectedId(id);
    setItems([]);
    setKeyword('');
    setType('all');
    setTextEditor(null);
    setProjectEditor(null);
    setError(null);
    setCopiedId(null);
  }, []);

  const loadProjects = useCallback(async () => {
    const data = await window.clipHistory.getProjects();
    if (!mounted.current) return;
    setProjects(data);
    if (!data.some((project) => project.id === activeId.current)) {
      selectProject(data[0]?.id ?? null);
    }
  }, [selectProject]);

  const loadItems = useCallback(async (projectId: number) => {
    const sequence = ++loadSequence.current;
    setLoadingItems(true);
    try {
      const data = await window.clipHistory.getProjectItems(projectId);
      if (mounted.current && sequence === loadSequence.current && activeId.current === projectId) setItems(data);
    } catch {
      if (mounted.current && sequence === loadSequence.current) setError('加载项目素材失败，请点击重试。');
    } finally {
      if (mounted.current && sequence === loadSequence.current) setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    loadProjects().catch(() => setError('加载项目失败，请点击重试。')).finally(() => setLoadingProjects(false));
  }, [loadProjects]);

  useEffect(() => {
    if (initialProjectId !== undefined) selectProject(initialProjectId);
  }, [initialProjectId, selectProject]);

  useEffect(() => {
    if (selectedId !== null) void loadItems(selectedId);
    else setLoadingItems(false);
  }, [selectedId, loadItems]);

  useEffect(() => {
    if (!notice && copiedId === null) return;
    const timer = setTimeout(() => { setNotice(null); setCopiedId(null); }, 3000);
    return () => clearTimeout(timer);
  }, [notice, copiedId]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      if (deleteTarget) setDeleteTarget(null);
      else if (textEditor) setTextEditor(null);
      else if (projectEditor) setProjectEditor(null);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [busy, deleteTarget, textEditor, projectEditor]);

  const perform = async (action: () => Promise<void>, message: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await action(); } catch { if (mounted.current) setError(message); }
    finally { if (mounted.current) setBusy(false); }
  };

  const refresh = async (projectId: number) => {
    await loadProjects();
    if (activeId.current === projectId) await loadItems(projectId);
  };

  const saveProject = (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectEditor?.name.trim()) return;
    const editor = projectEditor;
    void perform(async () => {
      if (editor.mode === 'new') {
        const project = await window.clipHistory.createProject(editor.name.trim());
        selectProject(project.id);
      } else {
        if (selectedId === null || !await window.clipHistory.renameProject(selectedId, editor.name.trim())) throw new Error();
        setProjectEditor(null);
      }
      await loadProjects();
    }, '保存项目失败，请检查名称后重试。');
  };

  const saveText = (event: React.FormEvent) => {
    event.preventDefault();
    if (!textEditor?.content.trim() || selectedId === null) return;
    const editor = textEditor;
    const projectId = selectedId;
    void perform(async () => {
      if (editor.id === null) await window.clipHistory.addProjectText(projectId, '', editor.content);
      else if (!await window.clipHistory.updateProjectText(editor.id, '', editor.content)) throw new Error();
      setTextEditor(null);
      await refresh(projectId);
      setNotice('文字已保存');
    }, '保存文字失败，请重试。');
  };

  const importFiles = () => {
    if (selectedId === null) return;
    const projectId = selectedId;
    void perform(async () => {
      const result = await window.clipHistory.importProjectFiles(projectId);
      if (result.items.length) {
        await refresh(projectId);
        setNotice(`已保存 ${result.items.length} 个文件副本`);
      }
      if (result.failed.length) setError(`${result.failed.length} 个文件未能导入：${result.failed.slice(0, 3).join('、')}${result.failed.length > 3 ? '等' : ''}。请检查文件是否可读取后重试。`);
    }, '导入失败，请检查文件是否可读取、磁盘空间是否充足后重试。');
  };

  const copyItem = (item: ProjectItem) => void perform(async () => {
    if (!await window.clipHistory.copyProjectItem(item.id)) throw new Error();
    setCopiedId(item.id);
  }, '复制失败，请重试；文件可能已被移除，可尝试重新导入。');

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    void perform(async () => {
      try {
        if (target.kind === 'project') {
          if (!await window.clipHistory.deleteProject(target.project.id)) throw new Error();
          setDeleteTarget(null);
          await loadProjects();
        } else {
          if (!await window.clipHistory.deleteProjectItem(target.item.id)) throw new Error();
          setDeleteTarget(null);
          await refresh(target.item.projectId);
        }
      } catch (failure) {
        setDeleteTarget(null);
        throw failure;
      }
    }, '删除失败，请重试。');
  };

  const search = keyword.trim().toLocaleLowerCase();
  const visibleItems = items.filter((item) => (type === 'all' || item.type === type)
    && (!search || (item.type === 'text' ? item.content ?? '' : item.fileName ?? item.title).toLocaleLowerCase().includes(search)));

  return (
    <section className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 text-neutral-800" aria-label="项目素材" aria-busy={busy || loadingProjects || loadingItems}>
      <header className="flex items-start justify-between gap-3 pt-3 pb-3 px-1">
        <div className="min-w-0">
          <h2 className="text-title text-neutral-900">项目素材</h2>
          <p className="text-caption text-neutral-600 mt-1">长期保存，点击素材即可复制。</p>
        </div>
        <button className={`${primary} shrink-0`} disabled={busy || loadingProjects || textEditor !== null || projectEditor !== null} onClick={() => setProjectEditor({ mode: 'new', name: '' })}>＋ 新建项目</button>
      </header>

      {error && <div role="alert" className="rounded-xl bg-white/80 border border-danger/30 px-3 py-2 mb-3 text-caption text-neutral-900 break-words">
        <p>{error}</p>
        <div className="flex gap-3 mt-1">
          <button className={`underline ${focus}`} disabled={busy} onClick={() => void perform(async () => { await loadProjects(); if (activeId.current !== null) await loadItems(activeId.current); }, '加载失败，请重启应用后重试。')}>重试加载</button>
          <button className={`underline ${focus}`} onClick={() => setError(null)}>关闭提示</button>
        </div>
      </div>}
      {notice && <p role="status" className="mb-2 px-1 text-caption text-primary-700">{notice}</p>}

      {projectEditor && <form onSubmit={saveProject} className="glass rounded-2xl p-3 mb-3">
        <label className="block text-button font-medium text-neutral-900 mb-2" htmlFor="project-name">{projectEditor.mode === 'new' ? '新建项目' : '重命名项目'}</label>
        <input id="project-name" className={input} placeholder="例如：客户沟通、视频制作、工作资料" autoFocus maxLength={60} value={projectEditor.name} disabled={busy} onChange={(event) => setProjectEditor({ ...projectEditor, name: event.target.value })} />
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className={secondary} disabled={busy} onClick={() => setProjectEditor(null)}>取消</button>
          <button type="submit" className={primary} disabled={busy || !projectEditor.name.trim()}>{busy ? '保存中…' : '保存项目'}</button>
        </div>
      </form>}

      {loadingProjects ? <p role="status" className="py-12 text-center text-body text-neutral-600">加载项目中…</p> : projects.length === 0 ? (
        !projectEditor && <div className="py-12 px-4 text-center">
          <div className="flex justify-center text-primary-700 mb-3"><FolderIcon /></div>
          <h3 className="text-body font-medium text-neutral-900">为经常做的事，建一个项目</h3>
          <p className="text-caption text-neutral-600 mt-2 leading-5">把常用文字、图片、视频和文件放在一起。<br />项目素材不会随剪贴板历史自动清理。</p>
          <button className={`${primary} mt-5`} onClick={() => setProjectEditor({ mode: 'new', name: '' })}>新建第一个项目</button>
        </div>
      ) : <>
        <div className="flex items-center gap-1.5 mb-3">
          <label htmlFor="project-select" className="sr-only">选择项目</label>
          <select id="project-select" className={`${input} flex-1 h-9 py-1.5`} disabled={busy || projectEditor !== null || textEditor !== null} value={selectedId ?? ''} onChange={(event) => selectProject(Number(event.target.value))}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}（{project.itemCount}）</option>)}
          </select>
          <button className={`${secondary} px-2.5 shrink-0`} disabled={busy || !selectedProject || !!projectEditor || !!textEditor} onClick={() => selectedProject && setProjectEditor({ mode: 'rename', name: selectedProject.name })}>重命名</button>
          <button className={`${secondary} px-2.5 shrink-0 hover:text-danger`} disabled={busy || !selectedProject || !!projectEditor || !!textEditor} onClick={() => selectedProject && setDeleteTarget({ kind: 'project', project: selectedProject })}>删除</button>
        </div>

        {selectedProject && <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button className={primary} disabled={busy || !!projectEditor || !!textEditor} onClick={() => setTextEditor({ id: null, content: '' })}>＋ 添加文字</button>
            <button className={secondary} disabled={busy || !!projectEditor || !!textEditor} onClick={importFiles}>{busy ? '处理中…' : '导入图片 / 视频 / 文件'}</button>
          </div>
          <p className="text-caption text-neutral-600 px-1 mb-3">文件保存独立副本，点击卡片即可复制。</p>

          {textEditor && <form onSubmit={saveText} className="glass rounded-2xl p-3 mb-3">
            <h3 className="text-button font-medium text-neutral-900 mb-2">{textEditor.id === null ? '添加文字' : '编辑文字'}</h3>
            <label htmlFor="material-content" className="sr-only">文字内容</label>
            <textarea id="material-content" className={`${input} resize-y min-h-[96px]`} rows={5} required placeholder="输入经常需要复制粘贴的文字…" autoFocus value={textEditor.content} disabled={busy} onChange={(event) => setTextEditor({ ...textEditor, content: event.target.value })} />
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" className={secondary} disabled={busy} onClick={() => setTextEditor(null)}>取消</button>
              <button type="submit" className={primary} disabled={busy || !textEditor.content.trim()}>{busy ? '保存中…' : '保存文字'}</button>
            </div>
          </form>}

          <div className="flex items-center gap-2 mb-2">
            <label className="sr-only" htmlFor="project-search">搜索当前项目</label>
            <input id="project-search" className={`${input} h-9`} placeholder="搜索当前项目的内容、文件名…" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            {keyword && <button className={`${secondary} shrink-0`} onClick={() => setKeyword('')}>清除</button>}
          </div>
          <div className="flex items-center flex-wrap gap-1 pb-3" role="group" aria-label="素材类型">
            {(['all', 'text', 'image', 'video', 'file'] as const).map((value) => <button key={value} aria-pressed={type === value} className={`h-7 px-3 rounded-full text-caption transition-colors ${focus} ${type === value ? 'bg-primary-700 text-white' : 'text-neutral-800 hover:bg-white/70'}`} onClick={() => setType(value)}>{value === 'all' ? '全部' : labels[value]}</button>)}
          </div>

          {loadingItems ? <p role="status" className="py-8 text-center text-body text-neutral-600">加载素材中…</p> : visibleItems.length === 0 ? <div className="py-8 px-4 text-center">
            <p className="text-body font-medium text-neutral-900">{items.length === 0 ? '这个项目还没有素材' : '没有找到匹配的素材'}</p>
            <p className="text-caption text-neutral-600 mt-2 leading-5">{items.length === 0 ? '添加常用文字，或导入图片、视频和文件。也可以从历史记录「存入项目」。' : '试试其他关键词，或切换素材类型。'}</p>
            {items.length > 0 && <button className={`${secondary} mt-3`} onClick={() => { setKeyword(''); setType('all'); }}>显示全部素材</button>}
          </div> : <div className="space-y-2.5" aria-label="项目素材列表">
            {visibleItems.map((item) => <article
              key={item.id}
              data-project-item-id={item.id}
              tabIndex={0}
              aria-label={`点击复制${labels[item.type]}：${item.type === 'text' ? (item.content ?? '').trim().slice(0, 80) : item.fileName || item.title}`}
              aria-disabled={busy}
              className={`glass-card rounded-2xl p-3 cursor-pointer ${focus} ${copiedId === item.id ? 'card-flash' : ''}`}
              onClick={(event) => {
                if (busy || (event.target as Element).closest('button, input, textarea, select, a')) return;
                copyItem(item);
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget || busy || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                copyItem(item);
              }}
            >
              <div className="flex items-start gap-2 mb-2">
                <span className="shrink-0 text-caption text-primary-700 bg-white/70 rounded px-1.5 py-0.5">{labels[item.type]}</span>
                {item.type !== 'text' && <h3 className="text-body font-medium text-neutral-900 break-words min-w-0">{item.fileName || item.title || '未命名素材'}</h3>}
                {copiedId === item.id && <span className="ml-auto shrink-0 text-caption font-medium text-primary-700">已复制</span>}
              </div>
              {item.type === 'text' ? <p className="text-body text-neutral-800 whitespace-pre-wrap break-words max-h-28 overflow-y-auto">{item.content}</p> : <>
                {item.type === 'image' && item.filePath && <img src={`clipimg://local/${encodeURIComponent(item.filePath)}`} alt={item.title || item.fileName || '项目图片'} className="max-h-36 max-w-full object-contain rounded-lg mb-2" loading="lazy" />}
                {item.fileSize !== null && <p className="text-caption text-neutral-600">{formatSize(item.fileSize)}</p>}
              </>}
              <div className="flex flex-wrap items-center justify-end gap-1.5 mt-3">
                <button className={secondary} disabled={busy || !!projectEditor || !!textEditor} onClick={() => setTransferTarget(item)}>移动 / 复制到项目</button>
                {item.type === 'text' ? <button className={secondary} disabled={busy || !!projectEditor || !!textEditor} onClick={() => setTextEditor({ id: item.id, content: item.content ?? '' })}>编辑</button> : <button className={secondary} disabled={busy} onClick={() => void perform(async () => { if (!await window.clipHistory.revealProjectItem(item.id)) throw new Error(); }, '无法定位文件，可能已被移除，请重新导入。')}>定位文件</button>}
                <button className={`${secondary} hover:text-danger`} disabled={busy || !!projectEditor || !!textEditor} onClick={() => setDeleteTarget({ kind: 'item', item })}>删除</button>
              </div>
            </article>)}
          </div>}
          <span className="sr-only" role="status">{copiedId !== null ? '素材已复制到剪贴板' : ''}</span>
        </>}
      </>}

      {transferTarget && <SaveToProjectDialog
        source={{ kind: 'project', id: transferTarget.id }}
        sourceProjectId={transferTarget.projectId}
        summary={transferTarget.type === 'text' ? transferTarget.content ?? '' : transferTarget.title || transferTarget.fileName || '文件素材'}
        onClose={() => setTransferTarget(null)}
        onSaved={(_projectId, mode) => {
          const sourceProjectId = transferTarget.projectId;
          if (mode === 'move') setItems((current) => current.filter((item) => item.id !== transferTarget.id));
          setTransferTarget(null);
          void perform(async () => {
            await refresh(sourceProjectId);
            setNotice(mode === 'move' ? '已移动到目标项目' : '已复制到目标项目，原素材已保留');
          }, '内容已归档，但刷新失败，请重试加载。');
        }}
      />}

      {deleteTarget && <ConfirmDialog title={deleteTarget.kind === 'project' ? '删除项目' : '删除素材'} message={deleteTarget.kind === 'project'
        ? `确定删除「${deleteTarget.project.name}」及其中的 ${deleteTarget.project.itemCount} 条素材吗？\n项目保存的文件副本也会删除，导入前的原文件不受影响。此操作不可撤销。`
        : `确定删除「${deleteTarget.item.type === 'text' ? (deleteTarget.item.content ?? '').trim().slice(0, 80) || '这条文字' : deleteTarget.item.fileName || deleteTarget.item.title || '这条素材'}」吗？${deleteTarget.item.filePath ? '\n项目保存的文件副本也会删除。' : ''}`}
        confirmLabel={busy ? '删除中…' : '删除'} confirmDanger busy={busy} onConfirm={confirmDelete} onCancel={() => { if (!busy) setDeleteTarget(null); }} />}
    </section>
  );
}

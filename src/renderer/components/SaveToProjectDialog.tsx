// ClipHistory — 将历史、项目素材或提示词移动 / 复制到项目。
import React, { useEffect, useId, useRef, useState } from 'react';
import type { Project, ProjectTransferMode, ProjectTransferSource } from '../../shared/types';

interface Props {
  source: ProjectTransferSource;
  summary: string;
  sourceProjectId?: number;
  initialMode?: ProjectTransferMode;
  onClose: () => void;
  onSaved: (projectId: number, mode: ProjectTransferMode) => void;
}

export default function SaveToProjectDialog({ source, summary, sourceProjectId, initialMode = 'copy', onClose, onSaved }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [mode, setMode] = useState<ProjectTransferMode>(initialMode);
  const [selectedId, setSelectedId] = useState('new');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const projectInputId = useId();
  const nameInputId = useId();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.clipHistory.getProjects().then((data) => {
      if (cancelled) return;
      const targets = data.filter((project) => project.id !== sourceProjectId);
      setProjects(targets);
      setSelectedId(targets.length ? String(targets[0].id) : 'new');
    }).catch(() => {
      if (!cancelled) setError('加载项目失败，请重试。');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadAttempt, sourceProjectId]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    if (!loading) initialFocusRef.current?.focus();
  }, [loading, selectedId]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'
      );
      if (!controls?.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [busy, onClose]);

  const handleSave = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy || loading || (selectedId === 'new' && !name.trim())) return;
    setBusy(true);
    setError(null);
    try {
      let projectId = Number(selectedId);
      if (selectedId === 'new') {
        const project = await window.clipHistory.createProject(name.trim());
        setProjects((current) => [project, ...current]);
        setSelectedId(String(project.id));
        setName('');
        projectId = project.id;
      }
      await window.clipHistory.transferToProject(source, projectId, mode);
      onSaved(projectId, mode);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '') : '';
      setError(message || `${mode === 'move' ? '移动' : '复制'}失败，请重试。`);
    } finally {
      setBusy(false);
    }
  };

  const sourceName = source.kind === 'history' ? '剪贴板历史' : source.kind === 'project' ? '原项目' : '常用提示词';
  const actionLabel = mode === 'move' ? '移动到项目' : '复制到项目';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/20 backdrop-blur-sm"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy || loading}
        tabIndex={-1}
        className="glass-dialog w-full max-w-sm max-h-full overflow-y-auto rounded-3xl p-5 animate-pop-in outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-title text-neutral-900">移动或复制到项目</h2>
        <p id={descriptionId} className="text-caption text-neutral-600 mt-1">
          {mode === 'move' ? `保存成功后，从${sourceName}移除原内容。` : `在目标项目保存副本，保留${sourceName}中的原内容。`}
        </p>
        <div className="flex gap-1 mt-3 p-1 rounded-xl bg-white/50" role="group" aria-label="选择移动或复制">
          {(['copy', 'move'] as const).map((value) => <button
            key={value}
            type="button"
            data-transfer-mode={value}
            aria-pressed={mode === value}
            disabled={busy}
            onClick={() => { setMode(value); setError((current) => current === '加载项目失败，请重试。' ? current : null); }}
            className={`flex-1 h-9 rounded-lg text-button font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700 disabled:opacity-50 ${mode === value ? 'bg-primary-700 text-white shadow-sm' : 'text-neutral-800 hover:bg-white/70'}`}
          >{value === 'copy' ? '复制到项目' : '移动到项目'}</button>)}
        </div>
        <p className="mt-3 mb-4 px-3 py-2 rounded-xl bg-white/60 text-body text-neutral-800 line-clamp-2 break-words whitespace-pre-wrap">
          {summary}
        </p>
        {loading ? (
          <p role="status" className="text-body text-neutral-600 py-3">正在加载项目…</p>
        ) : (
          <form onSubmit={handleSave}>
            {projects.length > 0 && (
              <div className="mb-3">
                <label htmlFor={projectInputId} className="block text-caption font-medium text-neutral-800 mb-1.5">{mode === 'move' ? '移动到哪个项目' : '复制到哪个项目'}</label>
                <select
                  ref={(element) => { if (selectedId !== 'new') initialFocusRef.current = element; }}
                  id={projectInputId}
                  value={selectedId}
                  disabled={busy}
                  onChange={(event) => { setSelectedId(event.target.value); setError(null); }}
                  className="w-full h-10 px-3 rounded-xl bg-white/70 text-body text-neutral-800 outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-60"
                >
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}（{project.itemCount} 条）</option>)}
                  <option value="new">＋ 新建项目</option>
                </select>
              </div>
            )}
            {selectedId === 'new' && (
              <div className="mb-3">
                <label htmlFor={nameInputId} className="block text-caption font-medium text-neutral-800 mb-1.5">新项目名称</label>
                <input
                  ref={(element) => { if (selectedId === 'new') initialFocusRef.current = element; }}
                  id={nameInputId}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  placeholder="例如：客户沟通、视频创作"
                  disabled={busy}
                  required
                  className="w-full h-10 px-3 rounded-xl bg-white/70 text-body text-neutral-800 placeholder-neutral-600 outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-60"
                />
              </div>
            )}
            {error && <p role="alert" className="text-caption text-danger break-words mb-3">{error}</p>}
            {error === '加载项目失败，请重试。' && (
              <button type="button" className="text-button text-primary-700 mb-3" onClick={() => setLoadAttempt((value) => value + 1)}>重新加载</button>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" disabled={busy} onClick={onClose} className="h-9 px-4 rounded-full text-button text-neutral-800 bg-white/70 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 disabled:opacity-50">
                取消
              </button>
              <button type="submit" disabled={busy || error === '加载项目失败，请重试。' || (selectedId === 'new' && !name.trim())} className="h-9 px-4 rounded-full text-button text-white bg-primary-600 hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {busy ? `${mode === 'move' ? '移动' : '复制'}中…` : actionLabel}
              </button>
            </div>
          </form>
        )}
        {loading && <button type="button" onClick={onClose} className="block ml-auto mt-3 h-9 px-4 rounded-full text-button text-neutral-800 bg-white/70 hover:bg-white">取消</button>}
      </div>
    </div>
  );
}

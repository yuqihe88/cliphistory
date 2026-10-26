// ============================================================
// ClipHistory — 常用提示词页面
// 永久保存、不受自动清理影响、不显示时间，仅手动删除
// 点击卡片复制内容（不进入历史记录）
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import type { PromptItem } from '../../shared/types';
import ConfirmDialog from './ConfirmDialog';

type Editing = { mode: 'new' } | { mode: 'edit'; id: number } | null;

export default function Prompts() {
  const [items, setItems] = useState<PromptItem[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromptItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await window.clipHistory.getPrompts());
    } catch (err) {
      console.error('加载提示词失败:', err);
      setError('加载提示词失败');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 错误提示自动消失
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 2500);
      return () => clearTimeout(t);
    }
  }, [error]);

  const openNew = (): void => {
    setDraft('');
    setEditing({ mode: 'new' });
  };

  const openEdit = (item: PromptItem): void => {
    setDraft(item.content);
    setEditing({ mode: 'edit', id: item.id });
  };

  const handleSave = async (): Promise<void> => {
    const content = draft.trim();
    if (!content) return;
    try {
      if (editing?.mode === 'edit') {
        await window.clipHistory.updatePrompt(editing.id, content);
      } else {
        await window.clipHistory.addPrompt(content);
      }
      setEditing(null);
      setDraft('');
      load();
    } catch (err) {
      console.error('保存提示词失败:', err);
      setError('保存失败，请重试');
    }
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deleteTarget) return;
    try {
      await window.clipHistory.deletePrompt(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      console.error('删除提示词失败:', err);
      setError('删除失败，请重试');
    }
  };

  const handleCopy = async (item: PromptItem): Promise<void> => {
    try {
      const ok = await window.clipHistory.copyPrompt(item.id);
      if (ok) {
        setCopiedId(item.id);
        setTimeout(() => setCopiedId(null), 1500);
      }
    } catch (err) {
      console.error('复制提示词失败:', err);
      setError('复制失败，请重试');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-3">
      {/* 页头 */}
      <div className="flex items-center justify-between pt-3 pb-2 px-1">
        <div>
          <h2 className="text-title text-neutral-900">常用提示词</h2>
          <p className="text-caption text-neutral-500 mt-0.5">
            永久保存，不受自动清理影响 · 点击卡片即可复制
          </p>
        </div>
        {editing === null && (
          <button
            className="glass flex items-center gap-1 h-8 px-3.5 rounded-full
                       text-button font-medium text-primary-700 hover:brightness-105 active:scale-95 transition-all"
            onClick={openNew}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            添加
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="glass mx-1 mb-2 px-3 py-2 rounded-xl text-caption text-danger text-center animate-slide-down">
          {error}
        </div>
      )}

      {/* 新建 / 编辑面板 */}
      {editing !== null && (
        <div className="glass rounded-2xl p-3 mb-2.5 animate-slide-down">
          <p className="text-caption font-medium text-neutral-600 mb-2">
            {editing.mode === 'new' ? '新建提示词' : '编辑提示词'}
          </p>
          <textarea
            className="glass w-full rounded-xl p-3 text-body text-neutral-800 placeholder-neutral-400
                       outline-none resize-none focus:ring-2 focus:ring-primary-300/40"
            rows={6}
            placeholder="输入你的常用提示词..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2.5">
            <button
              className="h-8 px-4 rounded-full text-button text-neutral-600
                         bg-white/60 border border-white/80 hover:bg-white transition-all"
              onClick={() => setEditing(null)}
            >
              取消
            </button>
            <button
              className="h-8 px-5 rounded-full text-button font-medium text-white
                         bg-primary-500 hover:bg-primary-600 transition-all active:scale-95
                         disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={!draft.trim()}
              onClick={handleSave}
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* 提示词卡片列表 */}
      {items.map((item) => (
        <div
          key={item.id}
          className="glass-card group relative rounded-2xl px-3 py-3 mb-2.5 cursor-pointer"
          onClick={() => handleCopy(item)}
        >
          <p className="text-body text-neutral-800 whitespace-pre-wrap break-words max-h-40 overflow-y-auto pr-1">
            {item.content}
          </p>

          {/* 悬浮操作按钮（不显示时间） */}
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="w-6 h-6 flex items-center justify-center rounded-full bg-white/70
                         text-neutral-500 hover:text-primary-600 transition-colors"
              title="编辑"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(item);
              }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            </button>
            <button
              className="w-6 h-6 flex items-center justify-center rounded-full bg-white/70
                         text-neutral-500 hover:text-danger transition-colors"
              title="删除"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(item);
              }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-2 14H7L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </button>
          </div>

          {/* 复制成功提示 */}
          {copiedId === item.id && (
            <div className="absolute top-2 right-2 bg-primary-500 text-white text-caption px-2 py-0.5 rounded-full shadow-md animate-slide-down">
              已复制
            </div>
          )}
        </div>
      ))}

      {/* 空状态 */}
      {items.length === 0 && editing === null && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="glass w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-4">
            📝
          </div>
          <p className="text-body font-medium text-neutral-700 mb-1">还没有常用提示词</p>
          <p className="text-caption text-neutral-400">点击右上角「添加」保存你的第一条提示词</p>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <ConfirmDialog
          title="删除提示词"
          message={`确定要删除这条提示词吗？\n"${deleteTarget.content.slice(0, 50)}${deleteTarget.content.length > 50 ? '...' : ''}"`}
          confirmLabel="删除"
          confirmDanger
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

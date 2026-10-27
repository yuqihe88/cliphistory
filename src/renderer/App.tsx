// ============================================================
// ClipHistory — 主应用组件
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ClipRecord, AppSettings, ClipTypeFilter } from '../shared/types';
import MenuBar from './components/MenuBar';
import TypeTabs from './components/TypeTabs';
import SearchBar from './components/SearchBar';
import ClipList from './components/ClipList';
import ConfirmDialog from './components/ConfirmDialog';
import Settings from './components/Settings';
import EmptyState from './components/EmptyState';
import Projects from './components/Projects';
import SaveToProjectDialog from './components/SaveToProjectDialog';

type View = 'main' | 'settings' | 'projects';

export default function App() {
  const [view, setView] = useState<View>('main');
  const [records, setRecords] = useState<ClipRecord[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [activeType, setActiveType] = useState<ClipTypeFilter>('all');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<ClipRecord | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>();

  // 删除确认弹窗
  const [deleteTarget, setDeleteTarget] = useState<ClipRecord | null>(null);

  // 复制反馈
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // 清空确认
  const [showClearAll, setShowClearAll] = useState(false);

  // 列表容器引用（用于新记录到达时滚动到顶部）
  const listContainerRef = useRef<HTMLDivElement>(null);

  // ---- 搜索防抖（300ms） ----
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // ---- 加载数据 ----
  const loadHistory = useCallback(async () => {
    try {
      const data = debouncedKeyword
        ? await window.clipHistory.search(debouncedKeyword, activeType)
        : await window.clipHistory.getHistory(50, 0, activeType);
      setRecords(data);
      setLoading(false);
    } catch (err) {
      console.error('[Renderer] 加载历史记录失败:', err);
      setActionError('加载历史记录失败，请重启应用');
      setLoading(false);
    }
  }, [debouncedKeyword, activeType]);

  const loadSettings = useCallback(async () => {
    try {
      const s = await window.clipHistory.getSettings();
      setSettings(s);
    } catch (err) {
      console.error('加载设置失败:', err);
    }
  }, []);

  // 初始化加载
  useEffect(() => {
    loadHistory();
    loadSettings();
  }, [loadHistory, loadSettings]);

  // 监听新粘贴板内容
  useEffect(() => {
    console.log('[Renderer] 注册 onNewClip 监听...');
    const unsubscribe = window.clipHistory.onNewClip(() => {
      console.log('[Renderer] 收到 onNewClip 事件，刷新列表');
      setLoading(true);
      loadHistory();
      // 新记录到达时滚动到顶部
      setTimeout(() => {
        listContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 150);
    });
    return () => {
      console.log('[Renderer] 注销 onNewClip 监听');
      unsubscribe();
    };
  }, [loadHistory]);

  // 监听设置变更
  useEffect(() => {
    const unsubscribe = window.clipHistory.onSettingsChanged((newSettings) => {
      setSettings(newSettings);
    });
    return unsubscribe;
  }, []);

  // 搜索时重新加载（使用防抖后的关键词）
  useEffect(() => {
    loadHistory();
  }, [debouncedKeyword, loadHistory]);

  // 自动清除错误提示
  useEffect(() => {
    if (actionError) {
      const t = setTimeout(() => setActionError(null), 3000);
      return () => clearTimeout(t);
    }
  }, [actionError]);

  // ---- 事件处理 ----
  const handleCopy = async (record: ClipRecord) => {
    try {
      const success = await window.clipHistory.copyToClipboard(record.id);
      if (success) {
        setCopiedId(record.id);
        setTimeout(() => setCopiedId(null), 1500);
      }
    } catch (err) {
      console.error('复制失败:', err);
      setActionError('复制失败，请重试');
    }
  };

  const handlePin = async (record: ClipRecord) => {
    try {
      if (record.isPinned) {
        await window.clipHistory.unpin(record.id);
      } else {
        await window.clipHistory.pin(record.id);
      }
      loadHistory();
    } catch (err) {
      console.error('置顶操作失败:', err);
      setActionError('操作失败，请重试');
    }
  };

  const handleDeleteClick = (record: ClipRecord) => {
    setDeleteTarget(record);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await window.clipHistory.delete(deleteTarget.id);
      setDeleteTarget(null);
      loadHistory();
    } catch (err) {
      console.error('删除失败:', err);
      setActionError('删除失败，请重试');
    }
  };

  const handleClearAll = async () => {
    try {
      await window.clipHistory.clearAll();
      setShowClearAll(false);
      loadHistory();
    } catch (err) {
      console.error('清空失败:', err);
      setActionError('清空失败，请重试');
    }
  };

  const handleSaveSettings = async (partial: Partial<AppSettings>) => {
    try {
      await window.clipHistory.saveSettings(partial);
      loadSettings();
    } catch (err) {
      console.error('保存设置失败:', err);
      setActionError('保存设置失败，请重试');
    }
  };

  // ---- 渲染 ----
  return (
    <div className="flex flex-col h-full">
      {/* 自定义菜单栏（无边框窗口标题行） */}
      <MenuBar
        isSettings={view === 'settings'}
        onSettingsToggle={() => setView(view === 'settings' ? 'main' : 'settings')}
        onAfterCleanup={loadHistory}
        floatMode={settings?.floatMode ?? false}
        onToggleFloat={() => {
          if (settings) handleSaveSettings({ floatMode: !settings.floatMode });
        }}
        paused={settings?.paused ?? false}
        onTogglePaused={() => {
          if (settings) handleSaveSettings({ paused: !settings.paused });
        }}
      />

      {view !== 'settings' && (
        <>
          {/* 历史类型分区 + 项目入口 */}
          <TypeTabs
            value={activeType}
            onChange={(v) => {
              setActiveType(v);
              setView('main');
            }}
            projectsActive={view === 'projects'}
            onProjects={() => setView('projects')}
          />

          {/* 暂停记录横幅 */}
          {settings?.paused && view !== 'projects' && (
            <div className="mx-3 mt-2 px-3 py-1.5 rounded-xl bg-danger/10 border border-danger/30
                            text-caption text-danger text-center">
              记录已暂停 — 新的复制内容不会被保存（设置中可恢复）
            </div>
          )}
        </>
      )}

      {view === 'main' ? (
        <>
          {/* 搜索栏 */}
          <SearchBar
            value={searchKeyword}
            onChange={setSearchKeyword}
          />

          {/* 错误提示 */}
          {actionError && (
            <div className="glass mx-3 mt-2 px-3 py-2 rounded-xl text-caption text-danger text-center animate-slide-down">
              {actionError}
            </div>
          )}

          {/* 主内容区 */}
          <div className="flex-1 overflow-hidden px-3">
            {loading ? (
              <div className="flex items-center justify-center h-full text-neutral-400 text-body">
                加载中...
              </div>
            ) : records.length === 0 ? (
              <EmptyState hasSearch={searchKeyword.length > 0} />
            ) : (
              <ClipList
                records={records}
                copiedId={copiedId}
                onCopy={handleCopy}
                onPin={handlePin}
                onDelete={handleDeleteClick}
                onSaveToProject={setSaveTarget}
                containerRef={listContainerRef}
              />
            )}
          </div>
        </>
      ) : view === 'projects' ? (
        <Projects initialProjectId={selectedProjectId} />
      ) : (
        /* 设置页面 */
        settings && (
          <Settings
            settings={settings}
            onSave={handleSaveSettings}
            onClearAll={() => setShowClearAll(true)}
          />
        )
      )}

      {/* 删除确认弹窗 */}
      {saveTarget && (
        <SaveToProjectDialog
          source={{ kind: 'history', id: saveTarget.id }}
          summary={saveTarget.type === 'text'
            ? saveTarget.content ?? ''
            : (saveTarget.imagePath ?? saveTarget.content ?? '').split(/[\\/]/).pop() || '文件素材'}
          onClose={() => setSaveTarget(null)}
          onSaved={(projectId, mode) => {
            if (mode === 'move') setRecords((current) => current.filter((record) => record.id !== saveTarget.id));
            setSaveTarget(null);
            setSelectedProjectId(projectId);
            setView('projects');
            void loadHistory();
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <ConfirmDialog
          title="确认删除"
          message={
            deleteTarget.type === 'text'
              ? `确定要删除这条记录吗？\n"${deleteTarget.content?.slice(0, 50)}..."`
              : '确定要删除这张图片记录吗？'
          }
          confirmLabel="删除"
          confirmDanger
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* 清空全部确认弹窗 */}
      {showClearAll && (
        <ConfirmDialog
          title="清空全部历史"
          message="确定要清空所有历史记录吗？此操作不可撤销。"
          confirmLabel="清空"
          confirmDanger
          onConfirm={handleClearAll}
          onCancel={() => setShowClearAll(false)}
        />
      )}
    </div>
  );
}

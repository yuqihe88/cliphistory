// ============================================================
// ClipHistory — 自定义菜单栏（无边框窗口的标题行）
// 液态玻璃风格：左侧菜单下拉，右侧设置 + 窗口控制
// ============================================================

import React, { useState, useEffect, useRef } from 'react';

interface Props {
  isSettings: boolean;
  onSettingsToggle: () => void;
  /** 「立即清理」完成后刷新列表 */
  onAfterCleanup: () => void;
  /** 悬浮桌面模式 */
  floatMode: boolean;
  onToggleFloat: () => void;
  /** 暂停记录（隐私模式） */
  paused: boolean;
  onTogglePaused: () => void;
}

interface MenuItem {
  label: string;
  onClick?: () => void;
  separatorBefore?: boolean;
}

type MenuKey = 'file' | 'actions' | 'view' | 'help';

const MENU_TITLES: Record<MenuKey, string> = {
  file: '文件',
  actions: '操作',
  view: '视图',
  help: '帮助',
};

export default function MenuBar({ isSettings, onSettingsToggle, onAfterCleanup, floatMode, onToggleFloat, paused, onTogglePaused }: Props) {
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // 点击菜单栏外部时关闭下拉
  useEffect(() => {
    if (!openMenu) return;
    const handleMouseDown = (e: MouseEvent): void => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  const api = window.clipHistory;

  const menus: Record<MenuKey, MenuItem[]> = {
    file: [
      { label: floatMode ? '✓ 退出悬浮桌面模式' : '悬浮桌面模式', onClick: onToggleFloat },
      { label: '打开数据文件夹', separatorBefore: true, onClick: () => api.openDataFolder() },
      { label: '退出', separatorBefore: true, onClick: () => api.quitApp() },
    ],
    actions: [
      {
        label: paused ? '✓ 恢复记录' : '暂停记录',
        onClick: onTogglePaused,
      },
      {
        label: '立即清理过期记录',
        separatorBefore: true,
        onClick: async () => {
          try {
            await api.cleanup();
          } finally {
            onAfterCleanup();
          }
        },
      },
    ],
    view: [
      { label: '重新加载', onClick: () => api.reloadApp() },
      { label: '开发者工具', onClick: () => api.toggleDevTools() },
      { label: '放大', separatorBefore: true, onClick: () => api.zoom('in') },
      { label: '缩小', onClick: () => api.zoom('out') },
      { label: '重置缩放', onClick: () => api.zoom('reset') },
    ],
    help: [
      { label: '关于 ClipHistory', onClick: () => api.showAbout() },
    ],
  };

  /** 双击菜单栏空白处 最大化/还原 */
  const handleBarDoubleClick = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).closest('button')) return;
    api.windowControl('maximize');
  };

  return (
    <div
      ref={barRef}
      className="glass-bar relative z-50 flex items-center h-10 shrink-0 select-none"
      onDoubleClick={handleBarDoubleClick}
    >
      {/* 拖拽热区：独立的无特效覆盖层。
          注意：带 backdrop-filter 的元素上 -webkit-app-region:drag 会失效，
          所以拖拽层单独拆出来，中间的把手图标提示可拖拽 */}
      <div className="absolute inset-0 [-webkit-app-region:drag]">
        <div className="w-full h-full flex items-center justify-center pointer-events-none">
          <svg className="w-7 h-4 text-neutral-500/40" viewBox="0 0 28 16" fill="currentColor">
            <circle cx="5" cy="4" r="1.6" /><circle cx="12" cy="4" r="1.6" /><circle cx="19" cy="4" r="1.6" /><circle cx="26" cy="4" r="1.6" />
            <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /><circle cx="26" cy="12" r="1.6" />
          </svg>
        </div>
      </div>

      {/* 左侧菜单 */}
      <div className="relative z-10 flex items-center h-full pl-2 shrink-0 [-webkit-app-region:drag]">
        {(Object.keys(MENU_TITLES) as MenuKey[]).map((key) => (
          <div key={key} className="relative h-full flex items-center shrink-0">
            <button
              className={`
                flex items-center h-7 px-3 my-auto rounded-full text-caption font-medium
                whitespace-nowrap leading-none shrink-0 transition-colors [-webkit-app-region:no-drag]
                ${openMenu === key
                  ? 'bg-primary-500/15 text-primary-700'
                  : 'text-neutral-700 hover:bg-white/60 hover:text-primary-600'
                }
              `}
              onClick={() => setOpenMenu(openMenu === key ? null : key)}
            >
              {MENU_TITLES[key]}
            </button>

            {/* 下拉菜单 */}
            {openMenu === key && (
              <div
                className="glass-menu absolute left-0 top-[calc(100%+4px)] min-w-[168px] py-1.5 z-50
                           rounded-2xl animate-slide-down"
              >
                {menus[key].map((item, idx) => (
                  <React.Fragment key={item.label}>
                    {item.separatorBefore && idx > 0 && (
                      <div className="my-1 mx-3 border-t border-neutral-200/70" />
                    )}
                    <button
                      className="w-[calc(100%-12px)] mx-1.5 text-left px-3 py-1.5 rounded-lg
                                 text-caption text-neutral-700
                                 hover:bg-primary-500/10 hover:text-primary-700 transition-colors"
                      onClick={() => {
                        setOpenMenu(null);
                        item.onClick?.();
                      }}
                    >
                      {item.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 中间空白区（拖拽热区覆盖层已在上方铺满整条菜单栏） */}
      <div className="flex-1 h-full pointer-events-none" />

      {/* 右侧：设置 + 窗口控制 */}
      <div className="relative z-10 flex items-center h-full gap-1 pr-2.5 shrink-0 [-webkit-app-region:drag]">
        <button
          className="w-7 h-7 my-auto shrink-0 flex items-center justify-center rounded-full
                     text-neutral-600 hover:bg-white/70 hover:text-primary-600 transition-colors
                     [-webkit-app-region:no-drag]"
          onClick={onSettingsToggle}
          title={isSettings ? '返回主界面' : '设置'}
        >
          {isSettings ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          )}
        </button>

        {/* 最小化 */}
        <button
          className="w-7 h-7 my-auto shrink-0 flex items-center justify-center rounded-full
                     text-neutral-500 hover:bg-white/70 hover:text-neutral-800 transition-colors
                     [-webkit-app-region:no-drag]"
          onClick={() => api.windowControl('minimize')}
          title="最小化"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M5 12h14" />
          </svg>
        </button>

        {/* 最大化 / 还原 */}
        <button
          className="w-7 h-7 my-auto shrink-0 flex items-center justify-center rounded-full
                     text-neutral-500 hover:bg-white/70 hover:text-neutral-800 transition-colors
                     [-webkit-app-region:no-drag]"
          onClick={() => api.windowControl('maximize')}
          title="最大化/还原"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="5" y="5" width="14" height="14" rx="2.5" />
          </svg>
        </button>

        {/* 关闭（隐藏到托盘） */}
        <button
          className="w-7 h-7 my-auto mr-1 shrink-0 flex items-center justify-center rounded-full
                     text-neutral-500 hover:bg-danger hover:text-white transition-colors
                     [-webkit-app-region:no-drag]"
          onClick={() => api.windowControl('close')}
          title="关闭并最小化到托盘"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// ClipHistory — 标题栏组件
// ============================================================

import React from 'react';

interface Props {
  onSettingsClick: () => void;
  isSettings: boolean;
}

export default function TitleBar({ onSettingsClick, isSettings }: Props) {
  return (
    <div className="flex items-center justify-between h-12 bg-white border-b border-neutral-200 px-4 shrink-0">
      {/* 左侧：Logo 和标题 */}
      <div className="flex items-center gap-2">
        <svg
          className="w-5 h-5 text-primary-500"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1S9.6 1.84 9.18 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
        </svg>
        <span className="text-title text-neutral-900">ClipHistory</span>
      </div>

      {/* 右侧：设置按钮 */}
      <button
        onClick={onSettingsClick}
        className="flex items-center justify-center w-7 h-7 rounded text-neutral-600 hover:bg-neutral-100 transition-colors"
        title={isSettings ? '返回主界面' : '设置'}
      >
        {isSettings ? (
          // 返回箭头图标
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        ) : (
          // 齿轮图标
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        )}
      </button>
    </div>
  );
}

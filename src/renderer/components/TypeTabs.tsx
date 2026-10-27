// ============================================================
// ClipHistory — 类型分区标签（全部 / 文本 / 图片 / 视频 / 项目）
// 液态玻璃风格：玻璃胶囊容器 + 浮起白色活动段
// ============================================================

import React from 'react';
import type { ClipTypeFilter } from '../../shared/types';

interface Props {
  value: ClipTypeFilter;
  onChange: (value: ClipTypeFilter) => void;
  projectsActive: boolean;
  onProjects: () => void;
}

const TABS: { label: string; value: ClipTypeFilter; icon: React.ReactNode }[] = [
  {
    label: '全部',
    value: 'all',
    icon: (
      <path d="M4 6h16M4 12h16M4 18h10" />
    ),
  },
  {
    label: '文本',
    value: 'text',
    icon: (
      <path d="M4 7V5h16v2M12 5v14M9 19h6" />
    ),
  },
  {
    label: '图片',
    value: 'image',
    icon: (
      <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21" />
    ),
  },
  {
    label: '视频',
    value: 'video',
    icon: (
      <path d="M3 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z M16 10.5l5-3v9l-5-3" />
    ),
  },
];

export default function TypeTabs({ value, onChange, projectsActive, onProjects }: Props) {
  return (
    <div className="px-3 pt-2.5 pb-1 shrink-0">
      <div className="glass flex items-center rounded-2xl p-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = !projectsActive && value === tab.value;
          return (
            <button
              key={tab.value}
              className={`
                flex flex-1 shrink-0 items-center justify-center gap-1 h-8 px-2 rounded-xl text-caption font-medium whitespace-nowrap
                transition-all duration-200
                ${active
                  ? 'bg-white text-primary-700 shadow-[0_2px_8px_rgba(31,68,135,0.18)]'
                  : 'text-neutral-600 hover:text-primary-600'
                }
              `}
              onClick={() => onChange(tab.value)}
              aria-pressed={active}
            >
              <svg
                className={`w-3.5 h-3.5 max-[399px]:hidden ${active ? 'text-primary-500' : 'text-neutral-400'}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {tab.icon}
              </svg>
              {tab.label}
            </button>
          );
        })}

        <button
          className={`flex flex-1 shrink-0 items-center justify-center gap-1 h-8 px-2 rounded-xl text-caption font-medium whitespace-nowrap transition-colors ${projectsActive ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-600 hover:text-primary-600'}`}
          onClick={onProjects}
          title="项目素材"
          aria-pressed={projectsActive}
        >
          <svg className="w-3.5 h-3.5 max-[399px]:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          项目
        </button>
      </div>
    </div>
  );
}


// ============================================================
// ClipHistory — 搜索栏组件
// ============================================================

import React, { useRef } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="px-3 py-3 shrink-0">
      <div className="relative">
        {/* 搜索图标 */}
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>

        {/* 输入框 */}
        <input
          ref={inputRef}
          type="text"
          className="glass w-full h-10 pl-9 pr-9 rounded-2xl text-body text-neutral-800
                     placeholder-neutral-400 outline-none transition-all duration-200
                     focus:border-primary-300/70 focus:ring-2 focus:ring-primary-300/40"
          placeholder="搜索历史记录..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />

        {/* 清除按钮 */}
        {value.length > 0 && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center
                       rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            title="清除搜索"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

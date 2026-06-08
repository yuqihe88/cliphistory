// ============================================================
// ClipHistory — 设置页面组件
// ============================================================

import React from 'react';
import type { AppSettings } from '../../shared/types';

interface Props {
  settings: AppSettings;
  onSave: (partial: Partial<AppSettings>) => void;
  onClearAll: () => void;
}

const RETENTION_OPTIONS: { label: string; value: 1 | 3 | 5; desc: string }[] = [
  { label: '1 天', value: 1, desc: '仅保留最近一天的记录' },
  { label: '3 天', value: 3, desc: '保留最近三天的记录' },
  { label: '5 天', value: 5, desc: '保留最近五天的记录' },
];

export default function Settings({ settings, onSave, onClearAll }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {/* 保留天数 */}
      <section>
        <h3 className="text-body font-medium text-neutral-800 mb-3">存储时长</h3>
        <div className="grid grid-cols-3 gap-2">
          {RETENTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`
                flex flex-col items-center justify-center py-3 px-2 rounded-lg border-2 transition-all
                ${settings.retentionDays === opt.value
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400'
                }
              `}
              onClick={() => onSave({ retentionDays: opt.value })}
            >
              <span className="text-title">{opt.label}</span>
              <span className="text-[11px] mt-0.5 opacity-70">{opt.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 开机自启 */}
      <section>
        <h3 className="text-body font-medium text-neutral-800 mb-3">开机自启</h3>
        <div className="flex items-center justify-between bg-white rounded-lg px-4 py-3 shadow-sm">
          <span className="text-body text-neutral-800">开机时自动启动 ClipHistory</span>
          <button
            className={`
              relative w-10 h-5 rounded-full transition-colors duration-200
              ${settings.autoLaunch ? 'bg-primary-500' : 'bg-neutral-200'}
            `}
            onClick={() => onSave({ autoLaunch: !settings.autoLaunch })}
            title={settings.autoLaunch ? '已开启' : '已关闭'}
          >
            <div
              className={`
                absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
                ${settings.autoLaunch ? 'translate-x-[22px]' : 'translate-x-0.5'}
              `}
            />
          </button>
        </div>
      </section>

      {/* 全局快捷键 */}
      <section>
        <h3 className="text-body font-medium text-neutral-800 mb-3">全局快捷键</h3>
        <div className="bg-white rounded-lg px-4 py-3 shadow-sm">
          <span className="text-body text-neutral-600">当前快捷键：</span>
          <kbd className="ml-2 px-2 py-0.5 bg-neutral-100 border border-neutral-200 rounded text-caption font-mono text-neutral-800">
            {settings.shortcutKey}
          </kbd>
          <p className="text-caption text-neutral-400 mt-1">
            在任意应用中按下快捷键可显示/隐藏 ClipHistory
          </p>
        </div>
      </section>

      {/* 清空历史 */}
      <section>
        <h3 className="text-body font-medium text-neutral-800 mb-3">数据管理</h3>
        <button
          className="w-full h-8 rounded-md border border-danger text-danger text-button
                     hover:bg-danger hover:text-white transition-colors"
          onClick={onClearAll}
        >
          清空全部历史记录
        </button>
        <p className="text-caption text-neutral-400 mt-1 text-center">
          此操作不可撤销
        </p>
      </section>
    </div>
  );
}

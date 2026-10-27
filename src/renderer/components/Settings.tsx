// ============================================================
// ClipHistory — 设置页面组件（液态玻璃风格）
// ============================================================

import React, { useState } from 'react';
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

const MAX_RECORDS_OPTIONS: { label: string; value: number }[] = [
  { label: '100 条', value: 100 },
  { label: '500 条', value: 500 },
  { label: '1000 条', value: 1000 },
  { label: '不限', value: 0 },
];

export default function Settings({ settings, onSave, onClearAll }: Props) {
  const [excludedDraft, setExcludedDraft] = useState<string | null>(null);
  const excludedValue = excludedDraft ?? (settings.excludedApps || []).join('\n');

  const saveExcluded = (): void => {
    const list = excludedValue
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({ excludedApps: Array.from(new Set(list)) });
    setExcludedDraft(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* 存储时长 */}
      <section className="glass rounded-2xl p-4">
        <h3 className="text-body font-semibold text-neutral-800 mb-3">存储时长</h3>
        <div className="grid grid-cols-3 gap-2">
          {RETENTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`
                flex flex-col items-center justify-center py-3 px-2 rounded-xl transition-all
                ${settings.retentionDays === opt.value
                  ? 'bg-primary-500 text-white shadow-[0_4px_14px_rgba(33,150,243,0.35)] scale-[1.02]'
                  : 'bg-white/60 text-neutral-600 hover:bg-white/90'
                }
              `}
              onClick={() => onSave({ retentionDays: opt.value })}
            >
              <span className="text-title">{opt.label}</span>
              <span className={`text-[11px] mt-0.5 ${settings.retentionDays === opt.value ? 'opacity-80' : 'opacity-60'}`}>
                {opt.desc}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 记录上限 */}
      <section className="glass rounded-2xl p-4">
        <h3 className="text-body font-semibold text-neutral-800 mb-3">记录上限</h3>
        <div className="grid grid-cols-4 gap-2">
          {MAX_RECORDS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`
                py-2.5 rounded-xl text-caption font-medium transition-all
                ${settings.maxRecords === opt.value
                  ? 'bg-primary-500 text-white shadow-[0_4px_14px_rgba(33,150,243,0.35)]'
                  : 'bg-white/60 text-neutral-600 hover:bg-white/90'
                }
              `}
              onClick={() => onSave({ maxRecords: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-caption text-neutral-400 mt-2">
          超出上限时自动删除最旧的未置顶记录，防止占用过多磁盘
        </p>
      </section>

      {/* 隐私保护 */}
      <section className="glass rounded-2xl p-4">
        <h3 className="text-body font-semibold text-neutral-800 mb-3">隐私保护</h3>
        <div className="flex items-center justify-between bg-white/55 rounded-xl px-4 py-3">
          <span className="text-body text-neutral-800">暂停记录（临时隐私模式）</span>
          <button
            className={`
              relative w-11 h-6 rounded-full transition-colors duration-200 shadow-inner
              ${settings.paused ? 'bg-danger' : 'bg-neutral-300/80'}
            `}
            onClick={() => onSave({ paused: !settings.paused })}
            title={settings.paused ? '记录已暂停' : '记录中'}
          >
            <div
              className={`
                absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
                ${settings.paused ? 'translate-x-[22px]' : 'translate-x-0.5'}
              `}
            />
          </button>
        </div>

        <p className="text-caption text-neutral-600 mt-3 mb-1.5">
          排除应用：来自这些应用的内容不会被记录（每行一个进程名）
        </p>
        <textarea
          className="w-full rounded-xl bg-white/60 border border-white/80 p-3 text-caption text-neutral-800
                     font-mono placeholder-neutral-400 outline-none resize-none
                     focus:ring-2 focus:ring-primary-300/40"
          rows={4}
          placeholder={'例如：\nBitwarden\nkeepassxc'}
          value={excludedValue}
          onChange={(e) => setExcludedDraft(e.target.value)}
        />
        {excludedDraft !== null && (
          <div className="flex justify-end mt-2">
            <button
              className="h-8 px-4 rounded-full text-button font-medium text-white
                         bg-primary-500 hover:bg-primary-600 transition-all active:scale-95"
              onClick={saveExcluded}
            >
              保存名单
            </button>
          </div>
        )}
        <p className="text-caption text-neutral-400 mt-1.5">
          填写应用进程名即可，如 Bitwarden、keepassxc（不用带 .exe）
        </p>
      </section>

      {/* 开机自启 */}
      <section className="glass rounded-2xl p-4">
        <h3 className="text-body font-semibold text-neutral-800 mb-3">开机自启</h3>
        <div className="flex items-center justify-between bg-white/55 rounded-xl px-4 py-3">
          <span className="text-body text-neutral-800">开机时自动启动 ClipHistory</span>
          <button
            className={`
              relative w-11 h-6 rounded-full transition-colors duration-200 shadow-inner
              ${settings.autoLaunch ? 'bg-primary-500' : 'bg-neutral-300/80'}
            `}
            onClick={() => onSave({ autoLaunch: !settings.autoLaunch })}
            title={settings.autoLaunch ? '已开启' : '已关闭'}
          >
            <div
              className={`
                absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
                ${settings.autoLaunch ? 'translate-x-[22px]' : 'translate-x-0.5'}
              `}
            />
          </button>
        </div>
      </section>

      {/* 悬浮桌面 */}
      <section className="glass rounded-2xl p-4">
        <h3 className="text-body font-semibold text-neutral-800 mb-3">悬浮桌面</h3>
        <div className="bg-white/55 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-body text-neutral-800">悬浮桌面（贴边收缩）</span>
            <button
              className={`
                relative w-11 h-6 rounded-full transition-colors duration-200 shadow-inner
                ${settings.floatMode ? 'bg-primary-500' : 'bg-neutral-300/80'}
              `}
              onClick={() => onSave({ floatMode: !settings.floatMode })}
              title={settings.floatMode ? '已开启' : '已关闭'}
            >
              <div
                className={`
                  absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
                  ${settings.floatMode ? 'translate-x-[22px]' : 'translate-x-0.5'}
                `}
              />
            </button>
          </div>
          <p className="text-caption text-neutral-400 mt-1.5">
            开启后拖动窗口到屏幕左/右边缘会缩成小图标，点击图标还原；窗口不会置顶
          </p>
        </div>
      </section>

      {/* 全局快捷键 */}
      <section className="glass rounded-2xl p-4">
        <h3 className="text-body font-semibold text-neutral-800 mb-3">全局快捷键</h3>
        <div className="bg-white/55 rounded-xl px-4 py-3">
          <span className="text-body text-neutral-600">当前快捷键：</span>
          <kbd className="ml-2 px-2 py-0.5 bg-white border border-neutral-200/80 rounded-lg text-caption font-mono text-neutral-800 shadow-sm">
            {settings.shortcutKey}
          </kbd>
          <p className="text-caption text-neutral-400 mt-1.5">
            在任意应用中按下快捷键可显示/隐藏 ClipHistory
          </p>
        </div>
      </section>

      {/* 清空历史 */}
      <section className="glass rounded-2xl p-4">
        <h3 className="text-body font-semibold text-neutral-800 mb-3">数据管理</h3>
        <button
          className="w-full h-9 rounded-full border border-danger/40 text-danger text-button font-medium
                     bg-white/60 hover:bg-danger hover:border-danger hover:text-white
                     transition-all active:scale-[0.98]"
          onClick={onClearAll}
        >
          清空全部历史记录
        </button>
        <p className="text-caption text-neutral-400 mt-1.5 text-center">
          此操作不可撤销
        </p>
      </section>
    </div>
  );
}

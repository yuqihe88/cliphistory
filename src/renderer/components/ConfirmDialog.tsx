// ============================================================
// ClipHistory — 确认弹窗组件
// ============================================================

import React from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  confirmDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmDanger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(30, 41, 80, 0.22)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={onCancel}
    >
      <div
        className="glass-dialog rounded-3xl p-6 mx-4 max-w-[300px] w-full animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <h3 className="text-body font-semibold text-neutral-900 mb-2 text-center">
          {title}
        </h3>

        {/* 内容 */}
        <p className="text-caption text-neutral-600 mb-5 whitespace-pre-line text-center">
          {message}
        </p>

        {/* 按钮（iOS 风格胶囊） */}
        <div className="flex justify-center gap-3">
          <button
            className="h-9 px-5 rounded-full text-button font-medium text-neutral-600
                       bg-white/70 border border-white/80 shadow-sm
                       hover:bg-white transition-all"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className={`h-9 px-5 rounded-full text-button font-medium text-white shadow-sm
                        transition-all hover:brightness-105 active:scale-95 ${
              confirmDanger
                ? 'bg-danger hover:bg-red-600'
                : 'bg-primary-500 hover:bg-primary-600'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

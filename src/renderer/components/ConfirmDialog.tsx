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
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-lg p-6 mx-4 max-w-[300px] w-full animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <h3 className="text-body font-medium text-neutral-900 mb-2">
          {title}
        </h3>

        {/* 内容 */}
        <p className="text-caption text-neutral-600 mb-5 whitespace-pre-line">
          {message}
        </p>

        {/* 按钮 */}
        <div className="flex justify-end gap-3">
          <button
            className="h-8 px-4 rounded-md text-button text-neutral-600 hover:bg-neutral-100 transition-colors"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className={`h-8 px-4 rounded-md text-button text-white transition-colors ${
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

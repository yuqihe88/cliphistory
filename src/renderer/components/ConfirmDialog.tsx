// ============================================================
// ClipHistory — 确认弹窗组件
// ============================================================

import React, { useEffect, useId, useRef } from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  confirmDanger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmDanger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onCancel();
      }
      if (event.key !== 'Tab') return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!buttons?.length) { event.preventDefault(); return; }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(30, 41, 80, 0.22)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={() => { if (!busy) onCancel(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        aria-busy={busy}
        className="glass-dialog rounded-3xl p-6 mx-4 max-w-[300px] w-full animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <h3 id={titleId} className="text-body font-semibold text-neutral-900 mb-2 text-center">
          {title}
        </h3>

        {/* 内容 */}
        <p id={messageId} className="text-caption text-neutral-600 mb-5 whitespace-pre-line text-center">
          {message}
        </p>

        {/* 按钮（iOS 风格胶囊） */}
        <div className="flex justify-center gap-3">
          <button
            className="h-9 px-5 rounded-full text-button font-medium text-neutral-600
                       bg-white/70 border border-white/80 shadow-sm
                       hover:bg-white transition-all"
            disabled={busy}
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
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

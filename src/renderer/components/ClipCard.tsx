// ============================================================
// ClipHistory — 历史记录卡片组件
// ============================================================

import React from 'react';
import type { ClipRecord } from '../../shared/types';

interface Props {
  record: ClipRecord;
  isCopied: boolean;
  onCopy: (record: ClipRecord) => void;
  onPin: (record: ClipRecord) => void;
  onDelete: (record: ClipRecord) => void;
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return isoStr;
  }
}

/** 截断文字到100字符（设计规范） */
function truncate(text: string, maxLen = 100): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

export default function ClipCard({ record, isCopied, onCopy, onPin, onDelete }: Props) {
  const isText = record.type === 'text';
  const isVideo = record.type === 'video';

  /** 从路径中取文件名（渲染进程不能用 node path 模块） */
  const fileName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

  return (
    <div
      className={`
        glass-card group relative flex rounded-2xl px-3 py-3 gap-2 cursor-pointer shrink-0
        ${record.isPinned ? 'glass-card-pinned' : ''}
        ${isCopied ? (record.isPinned ? 'card-flash-pinned' : 'card-flash') : ''}
      `}
      onClick={() => onCopy(record)}
    >
      {/* 置顶按钮 */}
      <button
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-primary-200/50 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onPin(record);
        }}
        title={record.isPinned ? '取消置顶' : '置顶'}
      >
        <svg
          className={`w-4 h-4 ${record.isPinned ? 'text-primary-500' : 'text-neutral-400'}`}
          viewBox="0 0 24 24"
          fill={record.isPinned ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M16 3L9.5 9.5l-4-4L2 9l6 6-6 6h16l-6-6 6-6-3.5-3.5-4 4L16 3z" />
        </svg>
      </button>

      {/* 内容区 */}
      <div className="flex-1 min-w-0">
        {isText ? (
          <p className="text-body text-neutral-800 line-clamp-2 break-all">
            {truncate(record.content ?? '')}
          </p>
        ) : isVideo ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="shrink-0 w-8 h-8 rounded-xl bg-primary-500/15 border border-white/50 flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm15 3.5 3.4-2.55a.6.6 0 0 1 .96.48v7.14a.6.6 0 0 1-.96.48L19 12.5v-3z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-body text-neutral-800 truncate">
                {record.content ? fileName(record.content) : '视频'}
              </p>
              <p className="text-caption text-neutral-400 truncate">
                {record.content ?? ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {record.imagePath ? (
              <img
                src={`clipimg://local/${encodeURIComponent(record.imagePath)}`}
                alt="粘贴板图片"
                className="h-[60px] rounded-lg object-cover border border-white/60"
                style={{ maxWidth: '100%' }}
              />
            ) : (
              <div className="flex items-center gap-2 text-neutral-600">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className="text-caption text-neutral-600">图片</span>
                {record.imageSize && (
                  <span className="text-caption text-neutral-400">
                    ({Math.round(record.imageSize / 1024)} KB)
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* 时间戳 */}
        <p className="text-caption text-neutral-600 mt-1.5">
          {formatTime(record.createdAt)}
        </p>
      </div>

      {/* 删除按钮 */}
      <button
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-danger/10 transition-colors
                   opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(record);
        }}
        title="删除"
      >
        <svg className="w-4 h-4 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-2 14H7L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      </button>

      {/* 复制成功提示 */}
      {isCopied && (
        <div className="absolute top-2 right-2 bg-primary-500 text-white text-caption px-2 py-0.5 rounded shadow-md animate-slide-down">
          已复制
        </div>
      )}
    </div>
  );
}

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

  return (
    <div
      className={`
        group relative flex rounded-lg px-3 py-3 gap-2 cursor-pointer shrink-0
        shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)]
        transition-all duration-200
        ${record.isPinned
          ? 'bg-primary-100 border-l-[3px] border-l-primary-500'
          : 'bg-white'
        }
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
        ) : (
          <div className="flex items-center gap-2">
            {record.imagePath ? (
              <img
                src={`file://${record.imagePath}`}
                alt="粘贴板图片"
                className="h-[60px] rounded object-cover"
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

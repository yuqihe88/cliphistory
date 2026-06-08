// ============================================================
// ClipHistory — 空状态组件
// ============================================================

import React from 'react';

interface Props {
  hasSearch: boolean;
}

export default function EmptyState({ hasSearch }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      {/* 图标 */}
      <div className="text-5xl mb-4">
        {hasSearch ? '🔍' : '📋'}
      </div>

      {/* 标题 */}
      <p className="text-body text-neutral-600 mb-1">
        {hasSearch ? '没有找到匹配的记录' : '暂无复制记录'}
      </p>

      {/* 提示 */}
      <p className="text-caption text-neutral-400">
        {hasSearch
          ? '试试其他关键词吧'
          : '试试复制一些文字或图片吧'}
      </p>
    </div>
  );
}

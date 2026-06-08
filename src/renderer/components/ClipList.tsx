// ============================================================
// ClipHistory — 历史记录列表组件
// ============================================================

import React, { useRef, useCallback } from 'react';
import type { ClipRecord } from '../../shared/types';
import ClipCard from './ClipCard';

interface Props {
  records: ClipRecord[];
  copiedId: number | null;
  onCopy: (record: ClipRecord) => void;
  onPin: (record: ClipRecord) => void;
  onDelete: (record: ClipRecord) => void;
  containerRef?: React.RefObject<HTMLDivElement>;
}

export default function ClipList({ records, copiedId, onCopy, onPin, onDelete, containerRef }: Props) {
  const listRef = containerRef || useRef<HTMLDivElement>(null);

  return (
    <div
      ref={listRef}
      className="h-full overflow-y-auto pb-3 space-y-2"
    >
      {records.map((record) => (
        <ClipCard
          key={record.id}
          record={record}
          isCopied={copiedId === record.id}
          onCopy={onCopy}
          onPin={onPin}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

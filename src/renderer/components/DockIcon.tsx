// ============================================================
// ClipHistory — 悬浮贴边小图标（dock 窗口渲染内容）
// 原地松手 = 点击还原；按住拖动 = 沿屏幕边缘滑动换位置；
// 右键 = 弹出菜单
// ============================================================

import React, { useEffect, useRef, useState } from 'react';

export default function DockIcon() {
  // dock 窗口是透明的，清掉 body 的极光背景；标题独立便于识别
  useEffect(() => {
    document.body.style.background = 'transparent';
    document.title = 'ClipHistory Dock';
  }, []);

  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return; // 右键走 contextmenu
    // 指针捕获：拖出 44x84 的窗口范围后仍能收到 move 事件
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    movedRef.current = false;
    startRef.current = { x: e.screenX, y: e.screenY };
    setDragging(true);
    window.clipHistory.dockDragStart({ x: e.screenX, y: e.screenY });
  };

  const handlePointerMove = (e: React.PointerEvent): void => {
    if (!draggingRef.current) return;
    const dx = e.screenX - startRef.current.x;
    const dy = e.screenY - startRef.current.y;
    if (!movedRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      movedRef.current = true;
    }
    if (movedRef.current) {
      window.clipHistory.dockDragMove({ x: e.screenX, y: e.screenY });
    }
  };

  const handlePointerUp = (): void => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    window.clipHistory.dockDragEnd({ moved: movedRef.current });
  };

  return (
    <div className="w-full h-full flex items-center justify-center select-none">
      <div
        className={`w-9 h-[72px] rounded-full flex flex-col items-center justify-center gap-1
                   bg-white/25 backdrop-blur-md border border-white/60 cursor-grab
                   ${dragging ? 'scale-110 cursor-grabbing' : 'hover:scale-110 active:scale-95'}
                   transition-transform duration-200`}
        style={{ filter: 'drop-shadow(0 4px 12px rgba(30, 64, 140, 0.35))' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          window.clipHistory.dockMenu();
        }}
        title="点击还原 ClipHistory · 按住拖动换位置 · 右键更多操作"
      >
        <svg className="w-5 h-5 text-white drop-shadow pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1S9.6 1.84 9.18 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
        </svg>
        <div className="w-4 h-0.5 rounded-full bg-white/70 pointer-events-none" />
      </div>
    </div>
  );
}

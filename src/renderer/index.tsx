// ============================================================
// ClipHistory — 渲染进程入口
// ============================================================

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DockIcon from './components/DockIcon';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('找不到 #root 元素');

const root = createRoot(rootEl);

// 悬浮贴边的小图标窗口（?view=dock）只渲染图标界面
const isDockWindow = new URLSearchParams(window.location.search).get('view') === 'dock';

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {isDockWindow ? <DockIcon /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);

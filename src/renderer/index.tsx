// ============================================================
// ClipHistory — 渲染进程入口
// ============================================================

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('找不到 #root 元素');

const root = createRoot(rootEl);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

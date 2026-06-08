// ============================================================
// ClipHistory — React 错误边界
// ============================================================

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] 渲染错误:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 bg-primary-50">
          <div className="w-12 h-12 mb-4 rounded-full bg-danger/10 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-danger"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-body font-medium text-neutral-800 mb-2">
            出错了
          </h2>
          <p className="text-caption text-neutral-500 mb-4 text-center max-w-xs">
            应用遇到了一个意外错误，请尝试重新加载。
          </p>
          <p className="text-[11px] text-neutral-400 mb-4 font-mono bg-neutral-100 rounded px-3 py-1.5 max-w-full overflow-hidden text-ellipsis">
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            className="px-5 py-2 rounded-md bg-primary-500 text-white text-button
                       hover:bg-primary-600 transition-colors"
            onClick={this.handleRetry}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

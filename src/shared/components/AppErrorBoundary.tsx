import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Top-level safety net. Without this, any render-time throw unmounts the whole
 * tree and leaves a silent blank white screen.
 */
class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[storm] unhandled render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return <>{this.props.children}</>;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-3">
          <span className="text-2xl font-black tracking-tight text-primary">STORM</span>
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            This page stopped unexpectedly. Reloading usually puts things right.
          </p>
          <p className="text-xs text-muted-foreground/80 break-words">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;

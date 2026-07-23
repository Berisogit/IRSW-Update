import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  private static isIgnorableDevelopmentError(error: Error | unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const isDevelopment = typeof import.meta !== 'undefined' && 'env' in import.meta && Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
    if (!isDevelopment) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('websocket closed without opened') ||
      message.includes('failed to connect to websocket')
    );
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (ErrorBoundary.isIgnorableDevelopmentError(error)) {
      return;
    }

    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError && !ErrorBoundary.isIgnorableDevelopmentError(this.state.error)) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', margin: '20px', fontFamily: 'sans-serif' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Application Error</h2>
          <p style={{ marginTop: '10px' }}>{this.state.error?.message || 'An unexpected error occurred.'}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

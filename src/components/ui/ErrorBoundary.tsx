import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
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

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected system error has occurred.";
      
      try {
        // Check if it's a Firestore permission error (JSON string)
        if (this.state.error?.message.startsWith('{')) {
          const errData = JSON.parse(this.state.error.message);
          if (errData.error?.includes('insufficient permissions')) {
            errorMessage = `ACCESS DENIED: Insufficient permissions for ${errData.operationType} on ${errData.path || 'resource'}.`;
          }
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="fermata-card max-w-md w-full border-accent text-center">
            <AlertTriangle className="text-accent mx-auto mb-6" size={48} />
            <h2 className="text-2xl font-bold text-white mb-4 tracking-tighter uppercase">SYSTEM_CRITICAL_ERROR</h2>
            <p className="text-text-secondary text-sm mb-8 leading-relaxed">
              {errorMessage}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="fermata-button-primary w-full flex items-center justify-center gap-2"
            >
              <RefreshCcw size={18} />
              <span>REBOOT SYSTEM</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

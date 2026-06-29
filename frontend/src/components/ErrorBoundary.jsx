import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("UI error caught by boundary:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== "undefined") {
      try { localStorage.removeItem("access_token"); } catch { /* ignore */ }
      window.location.href = "/";
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-white" data-testid="error-boundary">
        <div className="max-w-md w-full text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-red-50 border border-red-200 rounded-sm flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight mb-2">Something went wrong</h1>
          <p className="text-sm text-zinc-500 mb-6">
            We hit an unexpected error. Tap reset to refresh the app — your data is safe.
          </p>
          <Button
            onClick={this.handleReset}
            data-testid="error-reset-button"
            className="rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10"
          >
            Reset & reload
          </Button>
          {this.state.error?.message && (
            <pre className="text-[10px] text-zinc-400 mt-6 text-left font-mono whitespace-pre-wrap break-words border border-zinc-200 p-3 rounded-sm bg-zinc-50">
              {String(this.state.error.message)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

import { Component, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Prevents a render exception in any page from producing a silently blank
 * <main>. Renders a readable, recoverable error card instead.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[RouteErrorBoundary]", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl border bg-card p-6 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto text-destructive mb-2" />
            <p className="text-sm font-semibold text-foreground">Something went wrong on this page</p>
            <p className="text-xs text-muted-foreground mt-1">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 h-8 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

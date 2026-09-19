import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Shown in the fallback so the reader knows which part failed. */
  label?: string;
  /** Changing any value resets the boundary — pass the route path to clear on navigation. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one broken subtree does not white-screen the app.
 *
 * There was no boundary anywhere in STORM: any unhandled render error took
 * the whole SPA down with a blank page and no telemetry. Wrap the app once
 * and each route once, so a failing page still leaves the shell usable.
 *
 * When an error reporter is added later, report it from componentDidCatch.
 */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the stack in the console until a reporting service is configured.
    console.error('Unhandled render error', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { label } = this.props;
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle>{label ? `${label} could not be displayed` : 'Something went wrong'}</CardTitle>
            </div>
            <CardDescription>
              This part of the page failed to render. The rest of STORM is still usable, and nothing you
              have entered elsewhere has been lost.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground break-words">{error.message}</p>
            <div className="flex gap-2">
              <Button onClick={this.reset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Try again
              </Button>
              <Button variant="outline" onClick={() => window.location.assign('/dashboard')}>
                Back to dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

export default ErrorBoundary;

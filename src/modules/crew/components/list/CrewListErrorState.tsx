import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CrewListErrorStateProps {
  error: Error | unknown;
  onRetry?: () => void;
}

export const CrewListErrorState: React.FC<CrewListErrorStateProps> = ({ error, onRetry }) => {
  const message = error instanceof Error ? error.message : 'Unknown error loading crew list.';
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 border rounded-md bg-card gap-4">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div>
        <h3 className="text-lg font-semibold">Could not load crew</h3>
        <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
};

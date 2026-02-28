import React, { useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useFeedbackStore } from '../store/feedbackStore';

const FeedbackResolvedToast: React.FC = () => {
  const { user } = useAuth();
  const { newlyResolved, dismissResolved, loadSubmissions } = useFeedbackStore();

  // Poll for resolved items every 60s
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => loadSubmissions(user.id), 60000);
    return () => clearInterval(interval);
  }, [user?.id, loadSubmissions]);

  if (newlyResolved.length === 0) return null;

  const item = newlyResolved[0];

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 z-50 w-80 rounded-lg border border-green-200 bg-background shadow-lg',
        'animate-in slide-in-from-bottom-4 fade-in duration-300',
        'dark:border-green-800'
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="rounded-full bg-green-100 p-1.5 dark:bg-green-900/30">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Your issue has been resolved</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">"{item.title}"</p>
          {item.admin_response && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {item.admin_response}
            </p>
          )}
          <p className="text-xs text-muted-foreground/60 mt-1">Thank you for your feedback.</p>
        </div>
        <button
          onClick={() => dismissResolved(item.id)}
          className="p-0.5 hover:bg-muted rounded"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
};

export default FeedbackResolvedToast;

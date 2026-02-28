import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Bug, Lightbulb, HelpCircle, Paperclip, Send, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useFeedbackStore } from '../store/feedbackStore';
import type { FeedbackType, FeedbackStatus, FeedbackSubmission } from '../types';

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'bug', label: 'Bug', icon: Bug, color: 'text-red-500' },
  { value: 'suggestion', label: 'Suggestion', icon: Lightbulb, color: 'text-amber-500' },
  { value: 'question', label: 'Question', icon: HelpCircle, color: 'text-blue-500' },
];

const STATUS_CONFIG: Record<FeedbackStatus, { label: string; className: string }> = {
  submitted: { label: 'Submitted', className: 'bg-muted text-muted-foreground' },
  in_review: { label: 'In Review', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  fixed: { label: 'Fixed', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

function getBrowserInfo(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'Unknown';
}

const FeedbackPanel: React.FC = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const {
    submissions,
    isLoading,
    panelOpen,
    setPanelOpen,
    loadSubmissions,
    submitFeedback,
  } = useFeedbackStore();

  const [view, setView] = useState<'list' | 'form'>('list');
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (panelOpen && user?.id) {
      loadSubmissions(user.id);
    }
  }, [panelOpen, user?.id, loadSubmissions]);

  // Reset form when panel closes
  useEffect(() => {
    if (!panelOpen) {
      setTimeout(() => {
        setView('list');
        resetForm();
      }, 300);
    }
  }, [panelOpen]);

  const resetForm = () => {
    setType('bug');
    setTitle('');
    setDescription('');
    setScreenshot(null);
    setSubmitted(false);
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !title.trim() || !description.trim()) return;

    setSubmitting(true);
    const success = await submitFeedback(
      user.id,
      { type, title: title.trim(), description: description.trim(), screenshot },
      {
        appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
        browser: `${getBrowserInfo()} / ${navigator.platform}`,
        pageUrl: location.pathname,
        userRole: profile?.role || 'unknown',
      }
    );
    setSubmitting(false);

    if (success) {
      setSubmitted(true);
      setTimeout(() => {
        setView('list');
        resetForm();
      }, 1500);
    }
  }, [user?.id, type, title, description, screenshot, location.pathname, profile?.role, submitFeedback]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size <= 5 * 1024 * 1024) {
      setScreenshot(file);
    }
  };

  const renderStatusBadge = (status: FeedbackStatus) => {
    const config = STATUS_CONFIG[status];
    return (
      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', config.className)}>
        {config.label}
      </span>
    );
  };

  const renderSubmissionItem = (item: FeedbackSubmission) => {
    const typeOption = TYPE_OPTIONS.find(t => t.value === item.type);
    const Icon = typeOption?.icon || Bug;

    return (
      <div key={item.id} className="border-b border-border last:border-0 px-4 py-3">
        <div className="flex items-start gap-2">
          <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', typeOption?.color)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className={cn('text-sm font-medium text-foreground truncate', item.status === 'fixed' && 'line-through text-muted-foreground')}>{item.title}</p>
              {renderStatusBadge(item.status)}
            </div>
            <p className={cn('text-xs text-muted-foreground mt-0.5 line-clamp-2', item.status === 'fixed' && 'line-through')}>{item.description}</p>
            {item.admin_response && (
              <div className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Response:</span> {item.admin_response}
              </div>
            )}
            <p className="text-xs text-muted-foreground/60 mt-1">
              {new Date(item.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      {panelOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          'fixed bottom-0 left-0 z-50 w-full sm:w-96 h-[85vh] sm:h-[70vh] bg-background border border-border rounded-t-xl sm:rounded-xl shadow-xl transition-all duration-300 ease-in-out flex flex-col',
          'sm:bottom-4 sm:left-[17rem]',
          panelOpen
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0 pointer-events-none'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {view === 'form' && (
              <button
                onClick={() => { setView('list'); resetForm(); }}
                className="p-1 hover:bg-muted rounded-md"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-sm font-semibold text-foreground">
              {view === 'list' ? 'Feedback' : 'Report an Issue'}
            </h2>
          </div>
          <button
            onClick={() => setPanelOpen(false)}
            className="p-1 hover:bg-muted rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {view === 'list' ? (
            <>
              {isLoading && submissions.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
              ) : submissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 px-6 text-center">
                  <p className="text-sm text-muted-foreground">No submissions yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Tap the button below to share feedback.
                  </p>
                </div>
              ) : (
                submissions.map(renderSubmissionItem)
              )}
            </>
          ) : submitted ? (
            <div className="flex flex-col items-center justify-center h-48 px-6 text-center">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                <Send className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-foreground">Thanks for your feedback!</p>
              <p className="text-xs text-muted-foreground mt-1">We'll take a look shortly.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Type selector */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  What's this about?
                </label>
                <div className="flex gap-2">
                  {TYPE_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setType(opt.value)}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                          type === opt.value
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Short summary
                </label>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={
                    type === 'bug' ? 'e.g. "Page won\'t load after clicking..."'
                    : type === 'suggestion' ? 'e.g. "Add a dark mode toggle"'
                    : 'e.g. "How do I export reports?"'
                  }
                  maxLength={100}
                  required
                  className="h-9 text-sm"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Tell us more
                </label>
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe what happened or what you'd like to see..."
                  rows={3}
                  required
                  className="text-sm resize-none"
                />
              </div>

              {/* Screenshot upload */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Screenshot (optional)
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg px-3 py-2 transition-colors">
                    <Paperclip className="w-3.5 h-3.5" />
                    {screenshot ? screenshot.name : 'Attach image'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  {screenshot && (
                    <button
                      type="button"
                      onClick={() => setScreenshot(null)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground/60 mt-1">Max 5MB</p>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={submitting || !title.trim() || !description.trim()}
                className="w-full h-9 text-sm"
              >
                {submitting ? 'Sending...' : 'Submit Feedback'}
              </Button>
            </form>
          )}
        </div>

        {/* Footer action - only in list view */}
        {view === 'list' && !submitted && (
          <div className="px-4 py-3 border-t border-border shrink-0">
            <Button
              onClick={() => setView('form')}
              className="w-full h-9 text-sm"
            >
              Report an Issue
            </Button>
          </div>
        )}
      </div>
    </>
  );
};

export default FeedbackPanel;

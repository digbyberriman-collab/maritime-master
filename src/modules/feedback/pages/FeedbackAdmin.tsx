import React, { useEffect, useState } from 'react';
import {
  Bug,
  Lightbulb,
  HelpCircle,
  MessageSquare,
  StickyNote,
  CheckCircle,
  Clock,
  Eye,
  Globe,
  User,
  Monitor,
  History,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useFeedbackStore } from '../store/feedbackStore';
import type { FeedbackSubmission, FeedbackStatus, FeedbackType } from '../types';

const TYPE_ICONS: Record<FeedbackType, React.ElementType> = {
  bug: Bug,
  suggestion: Lightbulb,
  question: HelpCircle,
};

const TYPE_COLORS: Record<FeedbackType, string> = {
  bug: 'text-red-500',
  suggestion: 'text-amber-500',
  question: 'text-blue-500',
};

const STATUS_CONFIG: Record<FeedbackStatus, { label: string; icon: React.ElementType; className: string }> = {
  submitted: { label: 'Submitted', icon: Clock, className: 'bg-muted text-muted-foreground' },
  in_review: { label: 'In Review', icon: Eye, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  fixed: { label: 'Fixed', icon: CheckCircle, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

const ACTION_LABELS: Record<string, string> = {
  created: 'Feedback submitted',
  status_changed: 'Status changed',
  note_added: 'Internal note added',
  response_sent: 'Response sent to user',
  screenshot_added: 'Screenshot attached',
};

const FeedbackAdmin: React.FC = () => {
  const { user } = useAuth();
  const {
    submissions,
    isLoading,
    activityEntries,
    loadAllSubmissions,
    updateStatus,
    addAdminNote,
    addAdminResponse,
    loadActivityLog,
  } = useFeedbackStore();

  const [filterStatus, setFilterStatus] = useState<'all' | FeedbackStatus>('all');
  const [filterType, setFilterType] = useState<'all' | FeedbackType>('all');
  const [selectedItem, setSelectedItem] = useState<FeedbackSubmission | null>(null);
  const [noteText, setNoteText] = useState('');
  const [responseText, setResponseText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAllSubmissions();
  }, [loadAllSubmissions]);

  const filtered = submissions.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (filterType !== 'all' && s.type !== filterType) return false;
    return true;
  });

  const openDetail = async (item: FeedbackSubmission) => {
    setSelectedItem(item);
    setNoteText(item.admin_note || '');
    setResponseText(item.admin_response || '');
    await loadActivityLog(item.id);
  };

  const handleStatusChange = async (status: FeedbackStatus) => {
    if (!selectedItem || !user?.id) return;
    setSaving(true);
    const success = await updateStatus(selectedItem.id, status, user.id);
    if (success) {
      setSelectedItem(prev => prev ? { ...prev, status } : null);
      toast.success(`Status updated to "${STATUS_CONFIG[status].label}"`);
      await loadActivityLog(selectedItem.id);
    } else {
      toast.error('Failed to update status');
    }
    setSaving(false);
  };

  const handleSaveNote = async () => {
    if (!selectedItem || !user?.id) return;
    setSaving(true);
    const success = await addAdminNote(selectedItem.id, noteText, user.id);
    if (success) {
      setSelectedItem(prev => prev ? { ...prev, admin_note: noteText } : null);
      toast.success('Internal note saved');
      await loadActivityLog(selectedItem.id);
    } else {
      toast.error('Failed to save note');
    }
    setSaving(false);
  };

  const handleSendResponse = async () => {
    if (!selectedItem || !responseText.trim() || !user?.id) return;
    setSaving(true);
    const success = await addAdminResponse(selectedItem.id, responseText.trim(), user.id);
    if (success) {
      setSelectedItem(prev => prev ? { ...prev, admin_response: responseText.trim() } : null);
      toast.success('Response sent to user');
      await loadActivityLog(selectedItem.id);
    } else {
      toast.error('Failed to send response');
    }
    setSaving(false);
  };

  const counts = {
    all: submissions.length,
    submitted: submissions.filter(s => s.status === 'submitted').length,
    in_review: submissions.filter(s => s.status === 'in_review').length,
    fixed: submissions.filter(s => s.status === 'fixed').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Feedback Manager</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and respond to user-submitted feedback, bugs, and suggestions.
        </p>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'all' as const, label: 'Total', count: counts.all, color: 'bg-primary/10 text-primary' },
          { key: 'submitted' as const, label: 'New', count: counts.submitted, color: 'bg-muted text-muted-foreground' },
          { key: 'in_review' as const, label: 'In Review', count: counts.in_review, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
          { key: 'fixed' as const, label: 'Fixed', count: counts.fixed, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
        ].map(card => (
          <button
            key={card.key}
            onClick={() => setFilterStatus(card.key)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              filterStatus === card.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
            )}
          >
            <p className="text-2xl font-bold">{card.count}</p>
            <p className="text-xs text-muted-foreground">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="bug">Bugs</SelectItem>
            <SelectItem value="suggestion">Suggestions</SelectItem>
            <SelectItem value="question">Questions</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="border border-border rounded-lg overflow-hidden">
        {isLoading && submissions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading feedback...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No feedback items match your filters.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(item => {
              const Icon = TYPE_ICONS[item.type];
              const statusConf = STATUS_CONFIG[item.status];
              return (
                <button
                  key={item.id}
                  onClick={() => openDetail(item)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 text-left transition-colors"
                >
                  <Icon className={cn('w-4 h-4 shrink-0', TYPE_COLORS[item.type])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusConf.className)}>
                      {statusConf.label}
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  {React.createElement(TYPE_ICONS[selectedItem.type], {
                    className: cn('w-5 h-5', TYPE_COLORS[selectedItem.type]),
                  })}
                  <DialogTitle className="text-base">{selectedItem.title}</DialogTitle>
                </div>
                <DialogDescription className="text-left">{selectedItem.description}</DialogDescription>
              </DialogHeader>

              {/* Auto-captured context */}
              <div className="space-y-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                <div className="flex items-center gap-2"><Globe className="w-3 h-3" /> Page: {selectedItem.page_url}</div>
                <div className="flex items-center gap-2"><Monitor className="w-3 h-3" /> Browser: {selectedItem.browser}</div>
                <div className="flex items-center gap-2"><User className="w-3 h-3" /> Role: {selectedItem.user_role}</div>
                <div className="flex items-center gap-2"><Clock className="w-3 h-3" /> {new Date(selectedItem.created_at).toLocaleString()}</div>
              </div>

              {selectedItem.screenshot_url && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Screenshot</p>
                  <img
                    src={selectedItem.screenshot_url}
                    alt="Screenshot"
                    className="rounded-md border border-border max-h-40 object-contain"
                  />
                </div>
              )}

              {/* Status control */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Status</p>
                <div className="flex gap-2">
                  {(['submitted', 'in_review', 'fixed'] as FeedbackStatus[]).map(status => {
                    const conf = STATUS_CONFIG[status];
                    const StatusIcon = conf.icon;
                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        disabled={saving}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                          selectedItem.status === status
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        )}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {conf.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Internal note */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <StickyNote className="w-3 h-3 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">Internal Note</p>
                </div>
                <Textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Add an internal note (not visible to user)..."
                  rows={2}
                  className="text-sm resize-none"
                />
                <Button
                  onClick={handleSaveNote}
                  disabled={saving}
                  variant="outline"
                  size="sm"
                  className="mt-1.5 h-7 text-xs"
                >
                  Save Note
                </Button>
              </div>

              {/* Response to user */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MessageSquare className="w-3 h-3 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">Reply to User</p>
                </div>
                <Textarea
                  value={responseText}
                  onChange={e => setResponseText(e.target.value)}
                  placeholder="Write a short response the user will see..."
                  rows={2}
                  className="text-sm resize-none"
                />
                <Button
                  onClick={handleSendResponse}
                  disabled={saving || !responseText.trim()}
                  size="sm"
                  className="mt-1.5 h-7 text-xs"
                >
                  Send Response
                </Button>
              </div>

              {/* Activity Log */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <History className="w-3 h-3 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">Activity Log</p>
                </div>
                {activityEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 py-2">No activity recorded yet.</p>
                ) : (
                  <div className="space-y-0 border-l-2 border-border ml-1.5 pl-3">
                    {activityEntries.map(entry => (
                      <div key={entry.id} className="relative pb-3 last:pb-0">
                        <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-muted-foreground/40" />
                        <p className="text-xs font-medium text-foreground">
                          {ACTION_LABELS[entry.action] || entry.action}
                        </p>
                        {entry.action === 'status_changed' && entry.old_value && entry.new_value && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <span className="capitalize">{entry.old_value.replace('_', ' ')}</span>
                            <ArrowRight className="w-3 h-3" />
                            <span className="capitalize">{entry.new_value.replace('_', ' ')}</span>
                          </p>
                        )}
                        {entry.action !== 'status_changed' && entry.new_value && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {entry.new_value}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                          {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeedbackAdmin;

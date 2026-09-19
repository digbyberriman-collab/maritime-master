import React, { useState } from 'react';
import { ArrowRightLeft, Lock, MessageSquare, Send, UserCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { PersonChip } from '@/modules/legal/components/PersonChip';
import type { LegalCommentRow } from '@/modules/legal/lib/requests';
import type { CommentType } from '@/modules/legal/lib/constants';

interface CommentThreadProps {
  comments: LegalCommentRow[];
  isLoading?: boolean;
  canPost: boolean;
  /** Legal team may post internal notes (hidden from the requester). */
  canPostInternal: boolean;
  onPost: (content: string, type: CommentType) => Promise<unknown>;
  isPosting?: boolean;
}

const SystemLine: React.FC<{ comment: LegalCommentRow; icon: React.ReactNode }> = ({ comment, icon }) => (
  <li className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">{icon}</span>
    <span className="flex-1">
      {comment.content} · <PersonChip userId={comment.author_id} size="sm" className="inline-flex align-middle [&_span]:text-xs" /> ·{' '}
      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
    </span>
  </li>
);

export const CommentThread: React.FC<CommentThreadProps> = ({ comments, isLoading, canPost, canPostInternal, onPost, isPosting }) => {
  const [draft, setDraft] = useState('');
  const [internal, setInternal] = useState(false);

  const submit = async () => {
    if (!draft.trim()) return;
    await onPost(draft, internal ? 'internal_note' : 'comment');
    setDraft('');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden /> Thread
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c) => {
              if (c.comment_type === 'status_change') return <SystemLine key={c.id} comment={c} icon={<ArrowRightLeft className="h-3 w-3" />} />;
              if (c.comment_type === 'assignment') return <SystemLine key={c.id} comment={c} icon={<UserCheck className="h-3 w-3" />} />;
              const isInternal = c.comment_type === 'internal_note';
              return (
                <li key={c.id} className={cn('rounded-lg border p-3', isInternal ? 'border-warning/30 bg-warning/5' : 'border-border bg-card')}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <PersonChip userId={c.author_id} />
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {isInternal && (
                        <span className="inline-flex items-center gap-1 font-medium text-warning">
                          <Lock className="h-3 w-3" /> Internal note
                        </span>
                      )}
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{c.content}</p>
                </li>
              );
            })}
          </ul>
        )}

        {canPost && (
          <div className="space-y-2 border-t border-border pt-4">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={internal ? 'Internal note (only the legal team can see this)' : 'Write a comment'}
              rows={3}
              disabled={isPosting}
              aria-label="New comment"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {canPostInternal ? (
                <div className="flex items-center gap-2">
                  <Checkbox id="legal-internal" checked={internal} onCheckedChange={(v) => setInternal(v === true)} />
                  <Label htmlFor="legal-internal" className="text-sm">
                    Internal note
                  </Label>
                </div>
              ) : (
                <span />
              )}
              <Button size="sm" onClick={submit} disabled={isPosting || !draft.trim()}>
                <Send className="mr-2 h-4 w-4" /> {internal ? 'Add note' : 'Post comment'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CommentThread;

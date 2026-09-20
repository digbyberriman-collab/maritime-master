import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { CommentType } from '@/modules/legal/lib/constants';
import type { LegalCommentRow, LegalEventRow } from '@/modules/legal/lib/requests';
import { errorMessage } from '@/modules/legal/lib/storage';
import { LEGAL_REQUEST_EVENTS_KEY } from './useLegalRequests';

export const LEGAL_COMMENTS_KEY = ['legal-comments'] as const;

export interface AddCommentArgs {
  content: string;
  comment_type?: CommentType;
  metadata?: Json;
}

/** Comment thread for a request, oldest first. */
export function useLegalComments(requestId: string | null | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...LEGAL_COMMENTS_KEY, requestId ?? null],
    enabled: Boolean(user) && Boolean(requestId),
    queryFn: async (): Promise<LegalCommentRow[]> => {
      const { data, error } = await supabase
        .from('legal_request_comments')
        .select('*')
        .eq('request_id', requestId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addComment = useMutation({
    mutationFn: async ({ content, comment_type = 'comment', metadata = {} }: AddCommentArgs): Promise<LegalCommentRow> => {
      if (!user?.id) throw new Error('You must be signed in to comment');
      if (!requestId) throw new Error('No request selected');
      const trimmed = content.trim();
      if (!trimmed) throw new Error('Write something first');
      const { data, error } = await supabase
        .from('legal_request_comments')
        .insert({ request_id: requestId, author_id: user.id, content: trimmed, comment_type, metadata })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: [...LEGAL_COMMENTS_KEY, requestId ?? null] });
      if (data.comment_type === 'comment' || data.comment_type === 'internal_note') toast.success(data.comment_type === 'internal_note' ? 'Internal note added' : 'Comment posted');
    },
    onError: (error) => toast.error('Could not post the comment', { description: errorMessage(error) }),
  });

  const deleteComment = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('legal_request_comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...LEGAL_COMMENTS_KEY, requestId ?? null] });
      toast.success('Comment removed');
    },
    onError: (error) => toast.error('Could not remove the comment', { description: errorMessage(error) }),
  });

  const comments = useMemo(() => query.data ?? [], [query.data]);
  return { ...query, comments, addComment, deleteComment };
}

/** Trigger-written audit trail for a request, oldest first. */
export function useLegalRequestEvents(requestId: string | null | undefined) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: [...LEGAL_REQUEST_EVENTS_KEY, requestId ?? null],
    enabled: Boolean(user) && Boolean(requestId),
    queryFn: async (): Promise<LegalEventRow[]> => {
      const { data, error } = await supabase
        .from('legal_request_events')
        .select('*')
        .eq('request_id', requestId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, events: query.data ?? [] };
}

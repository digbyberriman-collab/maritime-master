import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { FeedbackSubmission, FeedbackFormData, FeedbackActivityEntry } from '../types';

// Use untyped access since feedback_submissions may not be in generated types
const fb = () => supabase.from('feedback_submissions' as any);
const activityLog = () => supabase.from('feedback_activity_log' as any);

interface FeedbackState {
  submissions: FeedbackSubmission[];
  isLoading: boolean;
  error: string | null;
  panelOpen: boolean;
  newlyResolved: FeedbackSubmission[];
  activityEntries: FeedbackActivityEntry[];

  setPanelOpen: (open: boolean) => void;
  loadSubmissions: (userId: string) => Promise<void>;
  submitFeedback: (userId: string, data: FeedbackFormData, context: {
    appVersion: string;
    browser: string;
    pageUrl: string;
    userRole: string;
  }) => Promise<boolean>;
  dismissResolved: (id: string) => void;
  loadAllSubmissions: () => Promise<FeedbackSubmission[]>;
  updateStatus: (id: string, status: FeedbackSubmission['status'], userId: string) => Promise<boolean>;
  addAdminNote: (id: string, note: string, userId: string) => Promise<boolean>;
  addAdminResponse: (id: string, response: string, userId: string) => Promise<boolean>;
  loadActivityLog: (feedbackId: string) => Promise<FeedbackActivityEntry[]>;
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  submissions: [],
  isLoading: false,
  error: null,
  panelOpen: false,
  newlyResolved: [],
  activityEntries: [],

  setPanelOpen: (open) => set({ panelOpen: open }),

  loadSubmissions: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await fb()
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const submissions = (data || []) as unknown as FeedbackSubmission[];
      const previousIds = new Set(get().submissions.filter(s => s.status === 'fixed').map(s => s.id));
      const newlyResolved = submissions.filter(
        s => s.status === 'fixed' && !previousIds.has(s.id) && s.admin_response
      );

      set({ submissions, newlyResolved, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  submitFeedback: async (userId, data, context) => {
    set({ isLoading: true, error: null });
    try {
      let screenshotUrl: string | null = null;

      if (data.screenshot) {
        const fileExt = data.screenshot.name.split('.').pop();
        const filePath = `feedback/${userId}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('feedback-screenshots')
          .upload(filePath, data.screenshot);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('feedback-screenshots')
            .getPublicUrl(filePath);
          screenshotUrl = urlData.publicUrl;
        }
      }

      const { data: inserted, error } = await fb().insert({
        user_id: userId,
        type: data.type,
        title: data.title,
        description: data.description,
        screenshot_url: screenshotUrl,
        status: 'submitted',
        app_version: context.appVersion,
        browser: context.browser,
        page_url: context.pageUrl,
        user_role: context.userRole,
      }).select('id').single();

      if (error) throw error;

      // Log creation activity
      if (inserted?.id) {
        await activityLog().insert({
          feedback_id: inserted.id,
          user_id: userId,
          action: 'created',
          new_value: `${data.type}: ${data.title}`,
        });
      }

      await get().loadSubmissions(userId);
      set({ isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    }
  },

  dismissResolved: (id) => {
    set(state => ({
      newlyResolved: state.newlyResolved.filter(s => s.id !== id),
    }));
  },

  loadAllSubmissions: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await fb()
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const submissions = (data || []) as unknown as FeedbackSubmission[];
      set({ submissions, isLoading: false });
      return submissions;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return [];
    }
  },

  updateStatus: async (id, status, userId) => {
    try {
      // Get current status for activity log
      const current = get().submissions.find(s => s.id === id);
      const oldStatus = current?.status || 'unknown';

      const updateData: any = { status };
      if (status === 'fixed') {
        updateData.resolved_at = new Date().toISOString();
      }
      const { error } = await fb()
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // Log status change
      await activityLog().insert({
        feedback_id: id,
        user_id: userId,
        action: 'status_changed',
        old_value: oldStatus,
        new_value: status,
      });

      set(state => ({
        submissions: state.submissions.map(s =>
          s.id === id ? { ...s, status, updated_at: new Date().toISOString(), ...(status === 'fixed' ? { resolved_at: new Date().toISOString() } : {}) } : s
        ),
      }));
      return true;
    } catch {
      return false;
    }
  },

  addAdminNote: async (id, note, userId) => {
    try {
      const { error } = await fb()
        .update({ admin_note: note })
        .eq('id', id);

      if (error) throw error;

      // Log note added
      await activityLog().insert({
        feedback_id: id,
        user_id: userId,
        action: 'note_added',
        new_value: note,
      });

      set(state => ({
        submissions: state.submissions.map(s =>
          s.id === id ? { ...s, admin_note: note, updated_at: new Date().toISOString() } : s
        ),
      }));
      return true;
    } catch {
      return false;
    }
  },

  addAdminResponse: async (id, response, userId) => {
    try {
      const { error } = await fb()
        .update({ admin_response: response })
        .eq('id', id);

      if (error) throw error;

      // Log response sent
      await activityLog().insert({
        feedback_id: id,
        user_id: userId,
        action: 'response_sent',
        new_value: response,
      });

      set(state => ({
        submissions: state.submissions.map(s =>
          s.id === id ? { ...s, admin_response: response, updated_at: new Date().toISOString() } : s
        ),
      }));
      return true;
    } catch {
      return false;
    }
  },

  loadActivityLog: async (feedbackId: string) => {
    try {
      const { data, error } = await activityLog()
        .select('*')
        .eq('feedback_id', feedbackId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      const entries = (data || []) as unknown as FeedbackActivityEntry[];
      set({ activityEntries: entries });
      return entries;
    } catch {
      set({ activityEntries: [] });
      return [];
    }
  },
}));

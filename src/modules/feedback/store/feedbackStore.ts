import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { FeedbackSubmission, FeedbackFormData } from '../types';

interface FeedbackState {
  submissions: FeedbackSubmission[];
  isLoading: boolean;
  error: string | null;
  panelOpen: boolean;
  newlyResolved: FeedbackSubmission[];

  setPanelOpen: (open: boolean) => void;
  loadSubmissions: (userId: string) => Promise<void>;
  submitFeedback: (userId: string, data: FeedbackFormData, context: {
    appVersion: string;
    browser: string;
    pageUrl: string;
    userRole: string;
  }) => Promise<boolean>;
  dismissResolved: (id: string) => void;
  // Admin methods
  loadAllSubmissions: () => Promise<FeedbackSubmission[]>;
  updateStatus: (id: string, status: FeedbackSubmission['status']) => Promise<boolean>;
  addAdminNote: (id: string, note: string) => Promise<boolean>;
  addAdminResponse: (id: string, response: string) => Promise<boolean>;
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  submissions: [],
  isLoading: false,
  error: null,
  panelOpen: false,
  newlyResolved: [],

  setPanelOpen: (open) => set({ panelOpen: open }),

  loadSubmissions: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('feedback_submissions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }) as { data: FeedbackSubmission[] | null; error: any };

      if (error) throw error;

      const submissions = (data || []) as FeedbackSubmission[];

      // Check for newly resolved items (resolved since last load)
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

      const { error } = await supabase.from('feedback_submissions').insert({
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
      } as any) as { error: any };

      if (error) throw error;

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
      const { data, error } = await supabase
        .from('feedback_submissions')
        .select('*')
        .order('created_at', { ascending: false }) as { data: FeedbackSubmission[] | null; error: any };

      if (error) throw error;
      const submissions = (data || []) as FeedbackSubmission[];
      set({ submissions, isLoading: false });
      return submissions;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return [];
    }
  },

  updateStatus: async (id, status) => {
    try {
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (status === 'fixed') {
        updateData.resolved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('feedback_submissions')
        .update(updateData)
        .eq('id', id) as { error: any };

      if (error) throw error;
      set(state => ({
        submissions: state.submissions.map(s =>
          s.id === id ? { ...s, status, ...updateData } : s
        ),
      }));
      return true;
    } catch {
      return false;
    }
  },

  addAdminNote: async (id, note) => {
    try {
      const { error } = await supabase
        .from('feedback_submissions')
        .update({ admin_note: note, updated_at: new Date().toISOString() } as any)
        .eq('id', id) as { error: any };

      if (error) throw error;
      set(state => ({
        submissions: state.submissions.map(s =>
          s.id === id ? { ...s, admin_note: note } : s
        ),
      }));
      return true;
    } catch {
      return false;
    }
  },

  addAdminResponse: async (id, response) => {
    try {
      const { error } = await supabase
        .from('feedback_submissions')
        .update({ admin_response: response, updated_at: new Date().toISOString() } as any)
        .eq('id', id) as { error: any };

      if (error) throw error;
      set(state => ({
        submissions: state.submissions.map(s =>
          s.id === id ? { ...s, admin_response: response } : s
        ),
      }));
      return true;
    } catch {
      return false;
    }
  },
}));

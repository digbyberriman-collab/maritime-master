export type FeedbackType = 'bug' | 'suggestion' | 'question';
export type FeedbackStatus = 'submitted' | 'in_review' | 'fixed';
export type FeedbackAction = 'created' | 'status_changed' | 'note_added' | 'response_sent' | 'screenshot_added';

export interface FeedbackSubmission {
  id: string;
  user_id: string;
  type: FeedbackType;
  title: string;
  description: string;
  screenshot_url: string | null;
  status: FeedbackStatus;
  // Auto-captured context
  app_version: string;
  browser: string;
  page_url: string;
  user_role: string;
  created_at: string;
  updated_at: string;
  // Admin fields
  admin_note: string | null;
  admin_response: string | null;
  resolved_at: string | null;
}

export interface FeedbackActivityEntry {
  id: string;
  feedback_id: string;
  user_id: string;
  action: FeedbackAction;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface FeedbackFormData {
  type: FeedbackType;
  title: string;
  description: string;
  screenshot?: File | null;
}

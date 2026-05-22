import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface NotificationType {
  key: string;
  name: string;
  category: string;
  cadence: 'realtime' | 'daily' | 'weekly';
  description: string | null;
  sort_order: number;
}

export interface NotificationSubscription {
  id: string;
  company_id: string;
  notification_type_key: string;
  user_id: string | null;
  email: string | null;
  vessel_scope: 'all' | 'specific';
  vessel_ids: string[];
  channels: { in_app: boolean; email: boolean };
}

export function useNotificationTypes() {
  return useQuery({
    queryKey: ['notification-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_types')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as NotificationType[];
    },
  });
}

export function useNotificationSubscriptions() {
  return useQuery({
    queryKey: ['notification-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_subscriptions')
        .select('*');
      if (error) throw error;
      return (data ?? []) as unknown as NotificationSubscription[];
    },
  });
}

export function useSaveSubscriptions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: {
      typeKey: string;
      subscriptions: Array<Omit<NotificationSubscription, 'id' | 'company_id' | 'notification_type_key'>>;
    }) => {
      const { data: prof } = await supabase
        .from('profiles').select('company_id').eq('user_id', user!.id).maybeSingle();
      const companyId = prof?.company_id;
      if (!companyId) throw new Error('No company');
      const { error: delErr } = await supabase
        .from('notification_subscriptions')
        .delete()
        .eq('notification_type_key', args.typeKey)
        .eq('company_id', companyId);
      if (delErr) throw delErr;
      if (args.subscriptions.length === 0) return;
      const rows = args.subscriptions.map((s) => ({
        company_id: companyId,
        notification_type_key: args.typeKey,
        user_id: s.user_id,
        email: s.email,
        vessel_scope: s.vessel_scope,
        vessel_ids: s.vessel_ids,
        channels: s.channels,
        created_by: user!.id,
      }));
      const { error } = await supabase.from('notification_subscriptions').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-subscriptions'] });
    },
  });
}

export interface UserPreference {
  notification_type_key: string;
  in_app_enabled: boolean;
}

export function useMyNotificationPreferences() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['my-notif-prefs', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('notification_type_key, in_app_enabled')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []) as UserPreference[];
    },
  });
}

export function useToggleMyPreference() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { typeKey: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert(
          { user_id: user!.id, notification_type_key: args.typeKey, in_app_enabled: args.enabled },
          { onConflict: 'user_id,notification_type_key' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-notif-prefs'] });
    },
  });
}
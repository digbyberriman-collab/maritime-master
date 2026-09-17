import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LogbookAuditRow {
  id: string;
  entry_id: string;
  action: string;
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  actor_name: string | null;
  created_at: string;
}

export const useLogbookEntryAudit = (entryId: string | null) =>
  useQuery({
    queryKey: ['logbook-entry-audit', entryId],
    enabled: !!entryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logbook_entry_audit')
        .select('id, entry_id, action, changed_fields, old_values, new_values, actor_name, created_at')
        .eq('entry_id', entryId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LogbookAuditRow[];
    },
  });

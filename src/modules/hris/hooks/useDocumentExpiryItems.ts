import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';

/** Subset of `hr_expiry_items.item_type` that belongs to Documents & Certificates. */
export type DocumentExpiryItemType = 'certificate' | 'passport' | 'medical';

export const DOCUMENT_EXPIRY_ITEM_TYPES: readonly DocumentExpiryItemType[] = ['certificate', 'passport', 'medical'];

export interface DocumentExpiryItem {
  item_type: DocumentExpiryItemType;
  record_id: string;
  profile_id: string;
  user_id: string | null;
  crew_name: string;
  label: string;
  due_date: string;
  days_remaining: number;
}

export interface DocumentExpiryStats {
  total: number;
  expired: number;
  /** Due in 0–30 days (not expired). */
  dueIn30: number;
  /** Due in 0–90 days (not expired); includes the 30-day items. */
  dueIn90: number;
}

export const DOCUMENT_EXPIRY_KEY = ['hris', 'document-expiry-items'] as const;

const isDocumentType = (value: string | null): value is DocumentExpiryItemType =>
  value === 'certificate' || value === 'passport' || value === 'medical';

/**
 * Company-wide document expiry feed from the `hr_expiry_items` view,
 * restricted to certificates, passports and medicals. The view is
 * security_invoker so RLS on the underlying tables scopes the rows.
 */
export function useDocumentExpiryItems(options: { soonestLimit?: number } = {}) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const soonestLimit = options.soonestLimit ?? 50;

  const query = useQuery({
    queryKey: [...DOCUMENT_EXPIRY_KEY, companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    staleTime: 60_000,
    queryFn: async (): Promise<DocumentExpiryItem[]> => {
      const { data, error } = await supabase
        .from('hr_expiry_items')
        .select('item_type, record_id, profile_id, user_id, crew_name, label, due_date, days_remaining')
        .eq('company_id', companyId as string)
        .in('item_type', [...DOCUMENT_EXPIRY_ITEM_TYPES])
        .order('due_date', { ascending: true })
        .limit(2000);
      if (error) throw error;

      const items: DocumentExpiryItem[] = [];
      for (const row of data ?? []) {
        if (!isDocumentType(row.item_type) || !row.record_id || !row.profile_id || !row.due_date) continue;
        items.push({
          item_type: row.item_type,
          record_id: row.record_id,
          profile_id: row.profile_id,
          user_id: row.user_id,
          crew_name: row.crew_name ?? 'Unknown crew',
          label: row.label ?? row.item_type,
          due_date: row.due_date,
          days_remaining: row.days_remaining ?? 0,
        });
      }
      return items;
    },
  });

  const items = useMemo(() => query.data ?? [], [query.data]);

  const stats = useMemo<DocumentExpiryStats>(() => {
    let expired = 0;
    let dueIn30 = 0;
    let dueIn90 = 0;
    for (const item of items) {
      if (item.days_remaining < 0) expired += 1;
      else {
        if (item.days_remaining <= 30) dueIn30 += 1;
        if (item.days_remaining <= 90) dueIn90 += 1;
      }
    }
    return { total: items.length, expired, dueIn30, dueIn90 };
  }, [items]);

  const soonest = useMemo(() => items.slice(0, soonestLimit), [items, soonestLimit]);

  return { ...query, items, stats, soonest };
}

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { daysUntil } from '@/modules/health/lib/format';

export type SupplyLocation = Tables<'med_supply_locations'>;
export type SupplyItem = Tables<'med_supply_items'>;
export type SupplyTransaction = Tables<'med_supply_transactions'>;

export interface SupplyItemEntry extends SupplyItem {
  location_name: string | null;
  vessel_name: string | null;
  isLow: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysToExpiry: number | null;
}

export const SUPPLY_LOCATIONS_KEY = ['health', 'supply-locations'] as const;
export const SUPPLY_ITEMS_KEY = ['health', 'supply-items'] as const;
export const SUPPLY_TX_KEY = ['health', 'supply-transactions'] as const;

export const LOCATION_CATEGORIES = [
  { value: 'hospital', label: "Ship's hospital" },
  { value: 'dispensary', label: 'Dispensary' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'engine_room', label: 'Engine room' },
  { value: 'tender', label: 'Tender' },
  { value: 'grab_bag', label: 'Grab bag' },
  { value: 'liferaft', label: 'Liferaft' },
  { value: 'cabin', label: 'Cabin' },
  { value: 'gym', label: 'Gym' },
  { value: 'dive', label: 'Dive store' },
  { value: 'other', label: 'Other' },
] as const;

export const ITEM_CATEGORIES = [
  { value: 'medicine', label: 'Medicine' },
  { value: 'controlled_drug', label: 'Controlled drug' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'dressing', label: 'Dressing' },
  { value: 'instrument', label: 'Instrument' },
  { value: 'antidote', label: 'Antidote' },
  { value: 'ppe', label: 'PPE' },
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'other', label: 'Other' },
] as const;

export const TRANSACTION_TYPES = [
  { value: 'receipt', label: 'Received' },
  { value: 'issue', label: 'Issued' },
  { value: 'disposal', label: 'Disposed' },
  { value: 'adjustment', label: 'Adjusted' },
  { value: 'transfer', label: 'Transferred' },
  { value: 'stock_check', label: 'Stock check' },
  { value: 'return', label: 'Returned' },
] as const;

export const itemCategoryLabel = (value: string | null | undefined): string =>
  ITEM_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';

export const locationCategoryLabel = (value: string | null | undefined): string =>
  LOCATION_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';

export const transactionTypeLabel = (value: string | null | undefined): string =>
  TRANSACTION_TYPES.find((t) => t.value === value)?.label ?? '—';

/** Movements that reduce stock and so need a witness on controlled drugs. */
export const WITNESSED_TRANSACTIONS = ['issue', 'disposal', 'adjustment'];

export function useSupplyLocations(vesselId?: string | null) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...SUPPLY_LOCATIONS_KEY, companyId, vesselId ?? 'all'],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SupplyLocation[]> => {
      let request = supabase
        .from('med_supply_locations')
        .select('*')
        .eq('company_id', companyId as string)
        .order('name');
      if (vesselId) request = request.eq('vessel_id', vesselId);
      const { data, error } = await request;
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (values: Partial<SupplyLocation> & { name: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase.from('med_supply_locations').update(values).eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('med_supply_locations')
        .insert({ ...values, company_id: companyId } as TablesInsert<'med_supply_locations'>);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SUPPLY_LOCATIONS_KEY });
      toast({ title: 'Location saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  return { ...query, locations: query.data ?? [], save, isMutating: save.isPending };
}

interface ItemOptions {
  vesselId?: string | null;
  locationId?: string | null;
  controlledOnly?: boolean;
}

/**
 * Medical stores. Quantities are maintained by a database trigger on every
 * transaction, so the list is always the counted truth rather than something
 * the UI has to keep in step.
 */
export function useSupplyItems({ vesselId, locationId, controlledOnly }: ItemOptions = {}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...SUPPLY_ITEMS_KEY, companyId, vesselId ?? 'all', locationId ?? 'all', Boolean(controlledOnly)],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<SupplyItemEntry[]> => {
      let request = supabase
        .from('med_supply_items')
        .select('*, med_supply_locations(name), vessels(name)')
        .eq('company_id', companyId as string)
        .order('name');
      if (vesselId) request = request.eq('vessel_id', vesselId);
      if (locationId) request = request.eq('location_id', locationId);
      if (controlledOnly) request = request.eq('is_controlled', true);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as SupplyItem & {
          med_supply_locations?: { name: string } | null;
          vessels?: { name: string } | null;
        };
        const days = daysUntil(typed.expiry_date);
        return {
          ...typed,
          location_name: typed.med_supply_locations?.name ?? null,
          vessel_name: typed.vessels?.name ?? null,
          isLow: typed.quantity < typed.minimum_quantity,
          isExpired: days !== null && days < 0,
          isExpiringSoon: days !== null && days >= 0 && days <= 90,
          daysToExpiry: days,
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: SUPPLY_ITEMS_KEY });
    void queryClient.invalidateQueries({ queryKey: SUPPLY_TX_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<SupplyItem> & { name: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('med_supply_items')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('med_supply_items').insert({
        ...values,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'med_supply_items'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Item saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_supply_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Item removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  const seedCategoryA = useMutation({
    mutationFn: async (targetVesselId: string): Promise<number> => {
      const { data, error } = await supabase.rpc('med_seed_msn1768_category_a', {
        p_vessel_id: targetVesselId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (count) => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: SUPPLY_LOCATIONS_KEY });
      toast({
        title: count ? `${count} items added` : 'Already set up',
        description: count
          ? 'Count the stock in with a stock check on each line.'
          : 'This vessel already has the Category A list.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create the list', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      low: rows.filter((r) => r.isLow).length,
      expired: rows.filter((r) => r.isExpired).length,
      expiringSoon: rows.filter((r) => r.isExpiringSoon).length,
      controlled: rows.filter((r) => r.is_controlled).length,
    };
  }, [query.data]);

  return {
    ...query,
    items: query.data ?? [],
    summary,
    save,
    remove,
    seedCategoryA,
    isMutating: save.isPending || remove.isPending || seedCategoryA.isPending,
  };
}

export interface SupplyTransactionEntry extends SupplyTransaction {
  item_name: string | null;
  person_name: string | null;
  witness_display: string | null;
}

export interface RecordMovementInput {
  item_id: string;
  transaction_type: string;
  /** For a stock check this is the counted quantity, not a delta. */
  quantity: number;
  reason?: string | null;
  person_id?: string | null;
  consultation_id?: string | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  witnessed_by_practitioner_id?: string | null;
  witness_name?: string | null;
  notes?: string | null;
}

/**
 * Stock movements. The database applies the movement, enforces that stock
 * cannot go negative and refuses an unwitnessed controlled drug movement, so
 * this hook simply records the intent.
 */
export function useSupplyTransactions(itemId?: string | null, limit = 100) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...SUPPLY_TX_KEY, companyId, itemId ?? 'all', limit],
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: async (): Promise<SupplyTransactionEntry[]> => {
      let request = supabase
        .from('med_supply_transactions')
        .select('*, med_supply_items(name), hw_people(first_name, last_name, preferred_name), hw_practitioners(full_name)')
        .eq('company_id', companyId as string)
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (itemId) request = request.eq('item_id', itemId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as SupplyTransaction & {
          med_supply_items?: { name: string } | null;
          hw_people?: { first_name: string; last_name: string; preferred_name: string | null } | null;
          hw_practitioners?: { full_name: string } | null;
        };
        const p = typed.hw_people;
        return {
          ...typed,
          item_name: typed.med_supply_items?.name ?? null,
          person_name: p ? `${p.preferred_name ?? p.first_name} ${p.last_name}` : null,
          witness_display: typed.hw_practitioners?.full_name ?? typed.witness_name ?? null,
        };
      });
    },
  });

  const recordMovement = useMutation({
    mutationFn: async (input: RecordMovementInput) => {
      if (!companyId) throw new Error('No company on your profile');
      const payload: TablesInsert<'med_supply_transactions'> = {
        company_id: companyId,
        item_id: input.item_id,
        transaction_type: input.transaction_type,
        quantity_delta: input.quantity,
        reason: input.reason ?? null,
        person_id: input.person_id ?? null,
        consultation_id: input.consultation_id ?? null,
        batch_number: input.batch_number ?? null,
        expiry_date: input.expiry_date ?? null,
        witnessed_by_practitioner_id: input.witnessed_by_practitioner_id ?? null,
        witness_name: input.witness_name ?? null,
        notes: input.notes ?? null,
        performed_by: user?.id ?? null,
      };
      const { error } = await supabase.from('med_supply_transactions').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SUPPLY_TX_KEY });
      void queryClient.invalidateQueries({ queryKey: SUPPLY_ITEMS_KEY });
      toast({ title: 'Movement recorded' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not record the movement', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    transactions: query.data ?? [],
    recordMovement,
    isMutating: recordMovement.isPending,
  };
}

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { daysUntil } from '@/modules/health/lib/format';

export type MedicalEquipment = Tables<'med_equipment'>;
export type FirstAidKit = Tables<'med_first_aid_kits'>;
export type KitCheck = Tables<'med_kit_checks'>;

export const EQUIPMENT_KEY = ['health', 'medical-equipment'] as const;
export const KITS_KEY = ['health', 'first-aid-kits'] as const;
export const KIT_CHECKS_KEY = ['health', 'kit-checks'] as const;

export const EQUIPMENT_TYPES = [
  { value: 'aed', label: 'AED' },
  { value: 'defibrillator', label: 'Defibrillator' },
  { value: 'oxygen', label: 'Oxygen' },
  { value: 'suction', label: 'Suction' },
  { value: 'ventilator', label: 'Ventilator' },
  { value: 'monitor', label: 'Patient monitor' },
  { value: 'stretcher', label: 'Stretcher' },
  { value: 'spinal_board', label: 'Spinal board' },
  { value: 'nebuliser', label: 'Nebuliser' },
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'dental', label: 'Dental' },
  { value: 'other', label: 'Other' },
] as const;

export const EQUIPMENT_STATUSES = [
  { value: 'operational', label: 'Operational' },
  { value: 'defective', label: 'Defective' },
  { value: 'out_of_service', label: 'Out of service' },
  { value: 'in_service', label: 'Away for service' },
  { value: 'awaiting_parts', label: 'Awaiting parts' },
  { value: 'retired', label: 'Retired' },
] as const;

export const KIT_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'grab_bag', label: 'Grab bag' },
  { value: 'tender', label: 'Tender' },
  { value: 'dive', label: 'Dive' },
  { value: 'burns', label: 'Burns' },
  { value: 'trauma', label: 'Trauma' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'engine_room', label: 'Engine room' },
  { value: 'galley', label: 'Galley' },
  { value: 'sports', label: 'Sports' },
  { value: 'other', label: 'Other' },
] as const;

export const KIT_STATUSES = [
  { value: 'ready', label: 'Ready' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'expired', label: 'Expired contents' },
  { value: 'missing', label: 'Missing' },
  { value: 'in_use', label: 'In use' },
] as const;

export const equipmentTypeLabel = (value: string | null | undefined): string =>
  EQUIPMENT_TYPES.find((t) => t.value === value)?.label ?? 'Other';

export const equipmentStatusLabel = (value: string | null | undefined): string =>
  EQUIPMENT_STATUSES.find((s) => s.value === value)?.label ?? '—';

export const kitTypeLabel = (value: string | null | undefined): string =>
  KIT_TYPES.find((t) => t.value === value)?.label ?? 'Other';

export const kitStatusLabel = (value: string | null | undefined): string =>
  KIT_STATUSES.find((s) => s.value === value)?.label ?? '—';

export interface EquipmentEntry extends MedicalEquipment {
  location_name: string | null;
  vessel_name: string | null;
  checkOverdue: boolean;
  serviceOverdue: boolean;
  daysToCheck: number | null;
  daysToService: number | null;
}

export function useMedicalEquipment(vesselId?: string | null) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...EQUIPMENT_KEY, companyId, vesselId ?? 'all'],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<EquipmentEntry[]> => {
      let request = supabase
        .from('med_equipment')
        .select('*, med_supply_locations(name), vessels(name)')
        .eq('company_id', companyId as string)
        .order('name');
      if (vesselId) request = request.eq('vessel_id', vesselId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as MedicalEquipment & {
          med_supply_locations?: { name: string } | null;
          vessels?: { name: string } | null;
        };
        const check = daysUntil(typed.next_check_due);
        const service = daysUntil(typed.next_service_due);
        return {
          ...typed,
          location_name: typed.med_supply_locations?.name ?? null,
          vessel_name: typed.vessels?.name ?? null,
          checkOverdue: check !== null && check < 0,
          serviceOverdue: service !== null && service < 0,
          daysToCheck: check,
          daysToService: service,
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEY });
    void queryClient.invalidateQueries({ queryKey: KIT_CHECKS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<MedicalEquipment> & { name: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('med_equipment')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('med_equipment').insert({
        ...values,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'med_equipment'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Equipment saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_equipment').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Equipment removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      operational: rows.filter((r) => r.status === 'operational').length,
      defective: rows.filter((r) => r.status === 'defective' || r.status === 'out_of_service').length,
      checkOverdue: rows.filter((r) => r.checkOverdue).length,
      serviceOverdue: rows.filter((r) => r.serviceOverdue).length,
    };
  }, [query.data]);

  return { ...query, equipment: query.data ?? [], summary, save, remove, isMutating: save.isPending || remove.isPending };
}

export interface KitEntry extends FirstAidKit {
  location_name: string | null;
  vessel_name: string | null;
  inspectionOverdue: boolean;
  daysToInspection: number | null;
}

export function useFirstAidKits(vesselId?: string | null) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...KITS_KEY, companyId, vesselId ?? 'all'],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<KitEntry[]> => {
      let request = supabase
        .from('med_first_aid_kits')
        .select('*, med_supply_locations(name), vessels(name)')
        .eq('company_id', companyId as string)
        .order('name');
      if (vesselId) request = request.eq('vessel_id', vesselId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as FirstAidKit & {
          med_supply_locations?: { name: string } | null;
          vessels?: { name: string } | null;
        };
        const days = daysUntil(typed.next_inspection_due);
        return {
          ...typed,
          location_name: typed.med_supply_locations?.name ?? null,
          vessel_name: typed.vessels?.name ?? null,
          inspectionOverdue: days !== null && days < 0,
          daysToInspection: days,
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: KITS_KEY });
    void queryClient.invalidateQueries({ queryKey: KIT_CHECKS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<FirstAidKit> & { name: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('med_first_aid_kits')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('med_first_aid_kits').insert({
        ...values,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'med_first_aid_kits'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Kit saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_first_aid_kits').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Kit removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      ready: rows.filter((r) => r.status === 'ready').length,
      needsAttention: rows.filter((r) => r.status !== 'ready').length,
      overdue: rows.filter((r) => r.inspectionOverdue).length,
    };
  }, [query.data]);

  return { ...query, kits: query.data ?? [], summary, save, remove, isMutating: save.isPending || remove.isPending };
}

export interface KitCheckEntry extends KitCheck {
  kit_name: string | null;
  equipment_name: string | null;
}

export interface RecordCheckInput {
  kit_id?: string | null;
  equipment_id?: string | null;
  checked_on: string;
  result: string;
  findings?: string | null;
  actions?: string | null;
  items_replaced?: string | null;
  next_due?: string | null;
  checked_by_name?: string | null;
  notes?: string | null;
}

/**
 * Inspection history. The database rolls the next due date forward and marks
 * a failed item defective, so recording a check is a single insert.
 */
export function useKitChecks(options: { kitId?: string | null; equipmentId?: string | null; limit?: number } = {}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const { kitId, equipmentId, limit = 100 } = options;

  const query = useQuery({
    queryKey: [...KIT_CHECKS_KEY, companyId, kitId ?? 'all', equipmentId ?? 'all', limit],
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: async (): Promise<KitCheckEntry[]> => {
      let request = supabase
        .from('med_kit_checks')
        .select('*, med_first_aid_kits(name), med_equipment(name)')
        .eq('company_id', companyId as string)
        .order('checked_on', { ascending: false })
        .limit(limit);
      if (kitId) request = request.eq('kit_id', kitId);
      if (equipmentId) request = request.eq('equipment_id', equipmentId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as KitCheck & {
          med_first_aid_kits?: { name: string } | null;
          med_equipment?: { name: string } | null;
        };
        return {
          ...typed,
          kit_name: typed.med_first_aid_kits?.name ?? null,
          equipment_name: typed.med_equipment?.name ?? null,
        };
      });
    },
  });

  const recordCheck = useMutation({
    mutationFn: async (input: RecordCheckInput) => {
      if (!companyId) throw new Error('No company on your profile');
      const { error } = await supabase.from('med_kit_checks').insert({
        ...input,
        company_id: companyId,
        checked_by: user?.id ?? null,
      } as TablesInsert<'med_kit_checks'>);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KIT_CHECKS_KEY });
      void queryClient.invalidateQueries({ queryKey: KITS_KEY });
      void queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEY });
      toast({ title: 'Check recorded' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not record the check', description: error.message, variant: 'destructive' });
    },
  });

  return { ...query, checks: query.data ?? [], recordCheck, isMutating: recordCheck.isPending };
}

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { daysUntil, localDayIso } from '@/modules/health/lib/format';

export type SpaTreatment = Tables<'spa_treatments'>;
export type SpaRoom = Tables<'spa_rooms'>;
export type SpaBooking = Tables<'spa_bookings'>;
export type SpaInventoryItem = Tables<'spa_inventory_items'>;
export type SpaInventoryTransaction = Tables<'spa_inventory_transactions'>;

export const SPA_TREATMENTS_KEY = ['health', 'spa-treatments'] as const;
export const SPA_ROOMS_KEY = ['health', 'spa-rooms'] as const;
export const SPA_BOOKINGS_KEY = ['health', 'spa-bookings'] as const;
export const SPA_INVENTORY_KEY = ['health', 'spa-inventory'] as const;
export const SPA_INVENTORY_TX_KEY = ['health', 'spa-inventory-transactions'] as const;

export const TREATMENT_CATEGORIES = [
  { value: 'massage', label: 'Massage' },
  { value: 'facial', label: 'Facial' },
  { value: 'body', label: 'Body treatment' },
  { value: 'nail', label: 'Nails' },
  { value: 'hair', label: 'Hair' },
  { value: 'hydrotherapy', label: 'Hydrotherapy' },
  { value: 'sauna', label: 'Sauna and steam' },
  { value: 'wellness', label: 'Wellness' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'other', label: 'Other' },
] as const;

export const ROOM_TYPES = [
  { value: 'treatment', label: 'Treatment room' },
  { value: 'sauna', label: 'Sauna' },
  { value: 'steam', label: 'Steam room' },
  { value: 'hammam', label: 'Hammam' },
  { value: 'salon', label: 'Salon' },
  { value: 'gym', label: 'Gym' },
  { value: 'pool', label: 'Pool' },
  { value: 'other', label: 'Other' },
] as const;

export const BOOKING_STATUSES = [
  { value: 'requested', label: 'Requested' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
] as const;

export const BOOKING_SOURCES = [
  { value: 'staff', label: 'Spa team' },
  { value: 'self', label: 'Self booked' },
  { value: 'guest_services', label: 'Guest services' },
] as const;

export const SPA_ITEM_CATEGORIES = [
  { value: 'product', label: 'Product' },
  { value: 'linen', label: 'Linen' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'retail', label: 'Retail' },
  { value: 'other', label: 'Other' },
] as const;

export const SPA_TRANSACTION_TYPES = [
  { value: 'receipt', label: 'Received' },
  { value: 'use', label: 'Used' },
  { value: 'disposal', label: 'Disposed' },
  { value: 'adjustment', label: 'Adjusted' },
  { value: 'stock_check', label: 'Stock check' },
] as const;

export const treatmentCategoryLabel = (value: string | null | undefined): string =>
  TREATMENT_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';

export const roomTypeLabel = (value: string | null | undefined): string =>
  ROOM_TYPES.find((r) => r.value === value)?.label ?? 'Other';

export const bookingStatusLabel = (value: string | null | undefined): string =>
  BOOKING_STATUSES.find((s) => s.value === value)?.label ?? '—';

export const bookingSourceLabel = (value: string | null | undefined): string =>
  BOOKING_SOURCES.find((s) => s.value === value)?.label ?? '—';

export const spaItemCategoryLabel = (value: string | null | undefined): string =>
  SPA_ITEM_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';

export const spaTransactionTypeLabel = (value: string | null | undefined): string =>
  SPA_TRANSACTION_TYPES.find((t) => t.value === value)?.label ?? '—';

/** Badge tone for a booking status, using the shared semantic tokens. */
export const bookingStatusTone: Record<string, 'default' | 'good' | 'warning' | 'critical'> = {
  requested: 'warning',
  confirmed: 'default',
  in_progress: 'default',
  completed: 'good',
  cancelled: 'critical',
  no_show: 'critical',
};

/** Statuses the clash trigger ignores, and which therefore free the slot. */
export const RELEASED_STATUSES = ['cancelled', 'no_show'];

const useCompanyId = () => {
  const { profile } = useAuth();
  return profile?.company_id ?? null;
};

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
};

// ---------------------------------------------------------------------------
// Treatment menu
// ---------------------------------------------------------------------------

export interface TreatmentFormData {
  id?: string;
  name: string;
  category: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price_minor: number | null;
  currency: string | null;
  requires_room: boolean;
  equipment_required: string | null;
  products_used: string | null;
  contraindications: string | null;
  is_active: boolean;
  notes: string | null;
}

export const emptyTreatmentForm = (currency = 'EUR'): TreatmentFormData => ({
  name: '',
  category: 'massage',
  description: null,
  duration_minutes: 60,
  buffer_minutes: 15,
  price_minor: null,
  currency,
  requires_room: true,
  equipment_required: null,
  products_used: null,
  contraindications: null,
  is_active: true,
  notes: null,
});

/**
 * The spa treatment menu. Every booking takes its duration from here, so an
 * archived treatment is kept rather than deleted: past bookings still name it.
 */
export function useSpaTreatments(options: { includeInactive?: boolean } = {}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...SPA_TREATMENTS_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SpaTreatment[]> => {
      const { data, error } = await supabase
        .from('spa_treatments')
        .select('*')
        .eq('company_id', companyId as string)
        .order('category')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const treatments = useMemo(() => {
    const rows = query.data ?? [];
    return options.includeInactive ? rows : rows.filter((t) => t.is_active);
  }, [query.data, options.includeInactive]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: SPA_TREATMENTS_KEY });
  };

  const toColumns = (values: TreatmentFormData) => ({
    name: values.name.trim(),
    category: values.category,
    description: blankToNull(values.description),
    duration_minutes: values.duration_minutes,
    buffer_minutes: values.buffer_minutes,
    price_minor: values.price_minor,
    currency: blankToNull(values.currency),
    requires_room: values.requires_room,
    equipment_required: blankToNull(values.equipment_required),
    products_used: blankToNull(values.products_used),
    contraindications: blankToNull(values.contraindications),
    is_active: values.is_active,
    notes: blankToNull(values.notes),
  });

  const saveTreatment = useMutation({
    mutationFn: async (values: TreatmentFormData) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('spa_treatments')
          .update({ ...toColumns(values), updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const payload: TablesInsert<'spa_treatments'> = {
        ...toColumns(values),
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      };
      const { error } = await supabase.from('spa_treatments').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Treatment saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save the treatment', description: error.message, variant: 'destructive' });
    },
  });

  const setTreatmentActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('spa_treatments')
        .update({ is_active: isActive, updated_by: user?.id ?? null })
        .eq('id', id);
      if (error) throw error;
      return isActive;
    },
    onSuccess: (isActive) => {
      invalidate();
      toast({ title: isActive ? 'Treatment restored' : 'Treatment archived' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not change the treatment', description: error.message, variant: 'destructive' });
    },
  });

  const seedMenu = useMutation({
    mutationFn: async (): Promise<number> => {
      if (!companyId) throw new Error('No company on your profile');
      const { data, error } = await supabase.rpc('spa_seed_treatment_menu', {
        p_company_id: companyId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (count) => {
      invalidate();
      toast({
        title: count ? `${count} treatments added` : 'Menu already set up',
        description: count
          ? 'Set a price and a room requirement on each one before you take bookings.'
          : 'Every default treatment is already on your menu.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create the menu', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      active: rows.filter((t) => t.is_active).length,
      archived: rows.filter((t) => !t.is_active).length,
      priced: rows.filter((t) => t.price_minor !== null).length,
      categories: new Set(rows.filter((t) => t.is_active).map((t) => t.category)).size,
    };
  }, [query.data]);

  return {
    ...query,
    treatments,
    allTreatments: query.data ?? [],
    summary,
    saveTreatment,
    setTreatmentActive,
    seedMenu,
    isMutating: saveTreatment.isPending || setTreatmentActive.isPending || seedMenu.isPending,
  };
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export function useSpaRooms(options: { vesselId?: string | null; includeInactive?: boolean } = {}) {
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...SPA_ROOMS_KEY, companyId, options.vesselId ?? 'all'],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SpaRoom[]> => {
      let request = supabase
        .from('spa_rooms')
        .select('*')
        .eq('company_id', companyId as string)
        .order('name');
      if (options.vesselId) request = request.eq('vessel_id', options.vesselId);
      const { data, error } = await request;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rooms = useMemo(() => {
    const rows = query.data ?? [];
    return options.includeInactive ? rows : rows.filter((r) => r.is_active);
  }, [query.data, options.includeInactive]);

  const saveRoom = useMutation({
    mutationFn: async (values: Partial<SpaRoom> & { name: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase.from('spa_rooms').update(values).eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('spa_rooms')
        .insert({ ...values, company_id: companyId } as TablesInsert<'spa_rooms'>);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SPA_ROOMS_KEY });
      toast({ title: 'Room saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save the room', description: error.message, variant: 'destructive' });
    },
  });

  return { ...query, rooms, allRooms: query.data ?? [], saveRoom, isMutating: saveRoom.isPending };
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export interface SpaBookingEntry extends SpaBooking {
  person_name: string | null;
  person_cabin: string | null;
  treatment_name: string | null;
  treatment_category: string | null;
  therapist_name: string | null;
  room_name: string | null;
  durationMinutes: number;
  /** Local start in minutes from midnight, for laying a day column out. */
  startMinutes: number;
  dayIso: string;
  isPast: boolean;
}

export interface BookingFormData {
  id?: string;
  person_id: string;
  treatment_id: string | null;
  therapist_id: string | null;
  room_id: string | null;
  vessel_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  booking_source: string;
  client_notes: string | null;
  therapist_notes: string | null;
  contraindications_checked: boolean;
  cancelled_reason: string | null;
}

/** Re-exported so spa callers keep one import; the implementation is shared. */
export { localDayIso };

/** Combines a local day and a `HH:mm` time into a timestamptz string. */
export const combineDayAndTime = (dayIso: string, time: string): string => {
  const [h, m] = time.split(':').map((n) => Number(n) || 0);
  const d = new Date(`${dayIso}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const timeOfDay = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

export const addMinutesIso = (iso: string, minutes: number): string =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

/** Minutes from midnight for a `HH:mm` or `HH:mm:ss` time. */
export const minutesOfTime = (value: string | null | undefined, fallback: number): number => {
  if (!value) return fallback;
  const [h, m] = value.split(':').map((n) => Number(n));
  if (!Number.isFinite(h)) return fallback;
  return h * 60 + (Number.isFinite(m) ? m : 0);
};

export const emptyBookingForm = (dayIso: string, time = '09:00'): BookingFormData => ({
  person_id: '',
  treatment_id: null,
  therapist_id: null,
  room_id: null,
  vessel_id: null,
  starts_at: combineDayAndTime(dayIso, time),
  ends_at: combineDayAndTime(dayIso, time),
  status: 'confirmed',
  booking_source: 'staff',
  client_notes: null,
  therapist_notes: null,
  contraindications_checked: false,
  cancelled_reason: null,
});

interface BookingOptions {
  /** Inclusive local day the range starts on, `YYYY-MM-DD`. */
  fromDay?: string | null;
  /** Inclusive local day the range ends on, `YYYY-MM-DD`. */
  toDay?: string | null;
  personId?: string | null;
  therapistId?: string | null;
  enabled?: boolean;
}

const decorateBooking = (row: SpaBooking & Record<string, unknown>): SpaBookingEntry => {
  const person = row.hw_people as
    | { first_name: string; last_name: string; preferred_name: string | null; cabin: string | null }
    | null
    | undefined;
  const treatment = row.spa_treatments as { name: string; category: string } | null | undefined;
  const therapist = row.hw_practitioners as { full_name: string } | null | undefined;
  const room = row.spa_rooms as { name: string } | null | undefined;
  const start = new Date(row.starts_at);
  const end = new Date(row.ends_at);
  return {
    ...(row as SpaBooking),
    person_name: person ? `${person.preferred_name ?? person.first_name} ${person.last_name}` : null,
    person_cabin: person?.cabin ?? null,
    treatment_name: treatment?.name ?? null,
    treatment_category: treatment?.category ?? null,
    therapist_name: therapist?.full_name ?? null,
    room_name: room?.name ?? null,
    durationMinutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)),
    startMinutes: start.getHours() * 60 + start.getMinutes(),
    dayIso: localDayIso(start),
    isPast: end.getTime() < Date.now(),
  };
};

/**
 * Spa bookings in a local day range. The database refuses a therapist or room
 * double booking with an exception, so the mutation surfaces its message
 * rather than trying to pre-empt the clash in the browser.
 */
export function useSpaBookings(options: BookingOptions = {}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { fromDay = null, toDay = null, personId = null, therapistId = null } = options;

  const query = useQuery({
    queryKey: [...SPA_BOOKINGS_KEY, companyId, fromDay, toDay, personId, therapistId],
    enabled: Boolean(companyId) && options.enabled !== false,
    staleTime: 15_000,
    queryFn: async (): Promise<SpaBookingEntry[]> => {
      let request = supabase
        .from('spa_bookings')
        .select(
          '*, hw_people(first_name, last_name, preferred_name, cabin), spa_treatments(name, category), hw_practitioners(full_name), spa_rooms(name)',
        )
        .eq('company_id', companyId as string)
        .order('starts_at');
      if (fromDay) request = request.gte('starts_at', new Date(`${fromDay}T00:00:00`).toISOString());
      if (toDay) {
        const end = new Date(`${toDay}T00:00:00`);
        end.setDate(end.getDate() + 1);
        request = request.lt('starts_at', end.toISOString());
      }
      if (personId) request = request.eq('person_id', personId);
      if (therapistId) request = request.eq('therapist_id', therapistId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => decorateBooking(row as never));
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: SPA_BOOKINGS_KEY });
  };

  const toColumns = (values: BookingFormData) => ({
    person_id: values.person_id,
    treatment_id: values.treatment_id || null,
    therapist_id: values.therapist_id || null,
    room_id: values.room_id || null,
    vessel_id: values.vessel_id || null,
    starts_at: values.starts_at,
    ends_at: values.ends_at,
    status: values.status,
    booking_source: values.booking_source,
    client_notes: blankToNull(values.client_notes),
    therapist_notes: blankToNull(values.therapist_notes),
    contraindications_checked: values.contraindications_checked,
    cancelled_reason: blankToNull(values.cancelled_reason),
  });

  const saveBooking = useMutation({
    mutationFn: async (values: BookingFormData) => {
      if (!companyId) throw new Error('No company on your profile');
      if (!values.person_id) throw new Error('Choose the client first');
      if (new Date(values.ends_at) <= new Date(values.starts_at)) {
        throw new Error('The booking has to finish after it starts');
      }
      if (values.id) {
        const { error } = await supabase
          .from('spa_bookings')
          .update({ ...toColumns(values), updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const payload: TablesInsert<'spa_bookings'> = {
        ...toColumns(values),
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      };
      const { error } = await supabase.from('spa_bookings').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Booking saved' });
    },
    onError: (error: Error) => {
      // The clash trigger raises a readable message; pass it straight through.
      toast({ title: 'Could not save the booking', description: error.message, variant: 'destructive' });
    },
  });

  const setBookingStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      cancelledReason,
    }: {
      id: string;
      status: string;
      cancelledReason?: string | null;
    }) => {
      // Only touch the cancellation reason when the caller supplied one, or
      // when the booking is leaving the cancelled state. Writing it
      // unconditionally erased the recorded reason on every other transition.
      const patch: Record<string, unknown> = { status, updated_by: user?.id ?? null };
      if (cancelledReason !== undefined) {
        patch.cancelled_reason = blankToNull(cancelledReason);
      } else if (status !== 'cancelled') {
        patch.cancelled_reason = null;
      }
      const { error } = await supabase.from('spa_bookings').update(patch).eq('id', id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      invalidate();
      toast({ title: `Booking marked ${bookingStatusLabel(status).toLowerCase()}` });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update the booking', description: error.message, variant: 'destructive' });
    },
  });

  const deleteBooking = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('spa_bookings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Booking removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove the booking', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    const finished = rows.filter((b) => ['completed', 'no_show'].includes(b.status));
    return {
      total: rows.length,
      confirmed: rows.filter((b) => b.status === 'confirmed').length,
      requested: rows.filter((b) => b.status === 'requested').length,
      completed: rows.filter((b) => b.status === 'completed').length,
      cancelled: rows.filter((b) => b.status === 'cancelled').length,
      noShow: rows.filter((b) => b.status === 'no_show').length,
      minutesBooked: rows
        .filter((b) => !RELEASED_STATUSES.includes(b.status))
        .reduce((sum, b) => sum + b.durationMinutes, 0),
      completionRate: finished.length
        ? Math.round((finished.filter((b) => b.status === 'completed').length / finished.length) * 100)
        : null,
      noShowRate: finished.length
        ? Math.round((finished.filter((b) => b.status === 'no_show').length / finished.length) * 100)
        : null,
    };
  }, [query.data]);

  return {
    ...query,
    bookings: query.data ?? [],
    summary,
    saveBooking,
    setBookingStatus,
    deleteBooking,
    isMutating: saveBooking.isPending || setBookingStatus.isPending || deleteBooking.isPending,
  };
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface SpaInventoryEntry extends SpaInventoryItem {
  vessel_name: string | null;
  isLow: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysToExpiry: number | null;
}

export interface SpaItemFormData {
  id?: string;
  name: string;
  category: string;
  brand: string | null;
  unit: string;
  minimum_quantity: number;
  expiry_date: string | null;
  supplier: string | null;
  unit_cost_minor: number | null;
  currency: string | null;
  storage_location: string | null;
  vessel_id: string | null;
  is_active: boolean;
  notes: string | null;
}

export const emptySpaItemForm = (currency = 'EUR'): SpaItemFormData => ({
  name: '',
  category: 'product',
  brand: null,
  unit: 'unit',
  minimum_quantity: 0,
  expiry_date: null,
  supplier: null,
  unit_cost_minor: null,
  currency,
  storage_location: null,
  vessel_id: null,
  is_active: true,
  notes: null,
});

/**
 * Spa stock. Quantity is owned by the transaction trigger, so this form never
 * writes it: stock changes go through `recordMovement` on the transactions hook.
 */
export function useSpaInventory(
  options: { vesselId?: string | null; includeInactive?: boolean; expiryWarningDays?: number } = {},
) {
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const warningDays = options.expiryWarningDays ?? 90;

  const query = useQuery({
    queryKey: [...SPA_INVENTORY_KEY, companyId, options.vesselId ?? 'all', warningDays],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<SpaInventoryEntry[]> => {
      let request = supabase
        .from('spa_inventory_items')
        .select('*, vessels(name)')
        .eq('company_id', companyId as string)
        .order('name');
      if (options.vesselId) request = request.eq('vessel_id', options.vesselId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as SpaInventoryItem & { vessels?: { name: string } | null };
        const days = daysUntil(typed.expiry_date);
        return {
          ...typed,
          vessel_name: typed.vessels?.name ?? null,
          // minimum_quantity defaults to 0, so a bare `<` never flags an item
          // that has simply run out. Empty is always low.
          isLow:
            Number(typed.quantity) <= 0 ||
            Number(typed.quantity) < Number(typed.minimum_quantity),
          isExpired: days !== null && days < 0,
          isExpiringSoon: days !== null && days >= 0 && days <= warningDays,
          daysToExpiry: days,
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: SPA_INVENTORY_KEY });
    void queryClient.invalidateQueries({ queryKey: SPA_INVENTORY_TX_KEY });
  };

  const items = useMemo(() => {
    const rows = query.data ?? [];
    return options.includeInactive ? rows : rows.filter((i) => i.is_active);
  }, [query.data, options.includeInactive]);

  const saveItem = useMutation({
    mutationFn: async (values: SpaItemFormData) => {
      if (!companyId) throw new Error('No company on your profile');
      const columns = {
        name: values.name.trim(),
        category: values.category,
        brand: blankToNull(values.brand),
        unit: values.unit.trim() || 'unit',
        minimum_quantity: values.minimum_quantity,
        expiry_date: values.expiry_date || null,
        supplier: blankToNull(values.supplier),
        unit_cost_minor: values.unit_cost_minor,
        currency: blankToNull(values.currency),
        storage_location: blankToNull(values.storage_location),
        vessel_id: values.vessel_id || null,
        is_active: values.is_active,
        notes: blankToNull(values.notes),
      };
      if (values.id) {
        const { error } = await supabase.from('spa_inventory_items').update(columns).eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('spa_inventory_items')
        .insert({ ...columns, company_id: companyId } as TablesInsert<'spa_inventory_items'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Item saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save the item', description: error.message, variant: 'destructive' });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('spa_inventory_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Item removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove the item', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = (query.data ?? []).filter((i) => i.is_active);
    return {
      total: rows.length,
      low: rows.filter((i) => i.isLow).length,
      expired: rows.filter((i) => i.isExpired).length,
      expiringSoon: rows.filter((i) => i.isExpiringSoon).length,
      outOfStock: rows.filter((i) => Number(i.quantity) <= 0).length,
    };
  }, [query.data]);

  return {
    ...query,
    items,
    allItems: query.data ?? [],
    summary,
    saveItem,
    deleteItem,
    isMutating: saveItem.isPending || deleteItem.isPending,
  };
}

export interface SpaTransactionEntry extends SpaInventoryTransaction {
  item_name: string | null;
  item_unit: string | null;
}

export interface SpaMovementInput {
  item_id: string;
  transaction_type: string;
  /**
   * For a stock check this is the counted quantity, not a delta: the database
   * trigger turns it into the delta and writes the new figure back.
   */
  quantity: number;
  occurred_at?: string | null;
  booking_id?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export function useSpaInventoryTransactions(itemId?: string | null, limit = 100) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...SPA_INVENTORY_TX_KEY, companyId, itemId ?? 'all', limit],
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: async (): Promise<SpaTransactionEntry[]> => {
      let request = supabase
        .from('spa_inventory_transactions')
        .select('*, spa_inventory_items(name, unit)')
        .eq('company_id', companyId as string)
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (itemId) request = request.eq('item_id', itemId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as SpaInventoryTransaction & {
          spa_inventory_items?: { name: string; unit: string } | null;
        };
        return {
          ...typed,
          item_name: typed.spa_inventory_items?.name ?? null,
          item_unit: typed.spa_inventory_items?.unit ?? null,
        };
      });
    },
  });

  const recordMovement = useMutation({
    mutationFn: async (input: SpaMovementInput) => {
      if (!companyId) throw new Error('No company on your profile');
      const payload: TablesInsert<'spa_inventory_transactions'> = {
        company_id: companyId,
        item_id: input.item_id,
        transaction_type: input.transaction_type,
        quantity_delta: input.quantity,
        occurred_at: input.occurred_at || new Date().toISOString(),
        booking_id: input.booking_id ?? null,
        reason: blankToNull(input.reason),
        notes: blankToNull(input.notes),
        performed_by: user?.id ?? null,
      };
      const { error } = await supabase.from('spa_inventory_transactions').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SPA_INVENTORY_TX_KEY });
      void queryClient.invalidateQueries({ queryKey: SPA_INVENTORY_KEY });
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

// ---------------------------------------------------------------------------
// Client history
// ---------------------------------------------------------------------------

export interface SpaClientSummary {
  personId: string;
  visits: number;
  lastVisit: string | null;
  nextBooking: string | null;
  noShows: number;
  favourites: string[];
  bookings: SpaBookingEntry[];
}

/**
 * Everyone who has ever been booked in, with their visit history. Read over
 * the whole booking table rather than the person directory, because guests
 * come and go and the directory keeps them long after they have sailed.
 */
export function useSpaClients(limit = 1000) {
  const companyId = useCompanyId();

  const query = useQuery({
    queryKey: [...SPA_BOOKINGS_KEY, 'clients', companyId, limit],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<SpaBookingEntry[]> => {
      const { data, error } = await supabase
        .from('spa_bookings')
        .select(
          '*, hw_people(first_name, last_name, preferred_name, cabin), spa_treatments(name, category), hw_practitioners(full_name), spa_rooms(name)',
        )
        .eq('company_id', companyId as string)
        .order('starts_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => decorateBooking(row as never));
    },
  });

  const clients = useMemo(() => {
    const byPerson = new Map<string, SpaBookingEntry[]>();
    for (const booking of query.data ?? []) {
      byPerson.set(booking.person_id, [...(byPerson.get(booking.person_id) ?? []), booking]);
    }
    const now = Date.now();
    const result: SpaClientSummary[] = [];
    byPerson.forEach((bookings, personId) => {
      const attended = bookings.filter((b) => b.status === 'completed');
      const upcoming = bookings
        .filter((b) => !RELEASED_STATUSES.includes(b.status) && new Date(b.starts_at).getTime() >= now)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      const counts = new Map<string, number>();
      for (const b of attended) {
        if (b.treatment_name) counts.set(b.treatment_name, (counts.get(b.treatment_name) ?? 0) + 1);
      }
      result.push({
        personId,
        visits: attended.length,
        lastVisit: attended[0]?.starts_at ?? null,
        nextBooking: upcoming[0]?.starts_at ?? null,
        noShows: bookings.filter((b) => b.status === 'no_show').length,
        favourites: Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name]) => name),
        bookings,
      });
    });
    return result.sort((a, b) => (b.lastVisit ?? '').localeCompare(a.lastVisit ?? ''));
  }, [query.data]);

  return { ...query, clients, bookings: query.data ?? [] };
}

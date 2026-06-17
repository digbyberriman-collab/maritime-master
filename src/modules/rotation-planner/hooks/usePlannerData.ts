import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type {
  PlannerLane, RotationAssignment, VesselLocation,
  TravelMovement, PayrollTransfer, LeaveOverlayEntry,
} from '../types';
import { toISO } from '../lib/dateMath';

export interface PlannerWindow { start: Date; end: Date; vesselIds?: string[] | null }

export function usePlannerData(win: PlannerWindow) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const startISO = toISO(win.start);
  const endISO = toISO(win.end);
  const vesselKey = (win.vesselIds ?? []).join(',');

  const lanesQ = useQuery({
    queryKey: ['frp', 'lanes', vesselKey],
    queryFn: async (): Promise<PlannerLane[]> => {
      let q: any = (supabase as any).from('frp_planner_lanes').select('*').eq('active', true).order('lane_order');
      if (win.vesselIds?.length) q = q.in('vessel_id', win.vesselIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const assignmentsQ = useQuery({
    queryKey: ['frp', 'assignments', startISO, endISO, vesselKey],
    queryFn: async (): Promise<RotationAssignment[]> => {
      let q: any = (supabase as any).from('frp_rotation_assignments').select('*')
        .lte('start_date', endISO).gte('end_date', startISO);
      if (win.vesselIds?.length) q = q.in('vessel_id', win.vesselIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const locationsQ = useQuery({
    queryKey: ['frp', 'locations', startISO, endISO, vesselKey],
    queryFn: async (): Promise<VesselLocation[]> => {
      let q: any = (supabase as any).from('frp_vessel_locations').select('*')
        .lte('start_date', endISO).gte('end_date', startISO);
      if (win.vesselIds?.length) q = q.in('vessel_id', win.vesselIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const leaveQ = useQuery({
    queryKey: ['frp', 'leave-overlay', startISO, endISO],
    queryFn: async (): Promise<LeaveOverlayEntry[]> => {
      const { data, error } = await supabase.from('crew_leave_entries')
        .select('id,crew_id,date,status_code,vessel_id')
        .gte('date', startISO).lte('date', endISO);
      if (error) throw error;
      return (data ?? []) as LeaveOverlayEntry[];
    },
    enabled: !!user,
  });

  const travelQ = useQuery({
    queryKey: ['frp', 'travel', startISO, endISO, vesselKey],
    queryFn: async (): Promise<TravelMovement[]> => {
      let q: any = (supabase as any).from('frp_travel_movements').select('*');
      if (win.vesselIds?.length) q = q.in('vessel_id', win.vesselIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const payrollQ = useQuery({
    queryKey: ['frp', 'payroll', startISO, endISO],
    queryFn: async (): Promise<PayrollTransfer[]> => {
      const { data, error } = await (supabase as any).from('frp_payroll_vessel_transfers').select('*');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('frp-planner')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'frp_rotation_assignments' }, () => {
        qc.invalidateQueries({ queryKey: ['frp', 'assignments'] });
      })
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'frp_vessel_locations' }, () => {
        qc.invalidateQueries({ queryKey: ['frp', 'locations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const upsertAssignment = useMutation({
    mutationFn: async (row: Partial<RotationAssignment> & { id?: string }) => {
      const payload: any = { ...row };
      if (!row.id) payload.created_by = user?.id ?? null;
      payload.updated_by = user?.id ?? null;
      const { data, error } = await (supabase as any).from('frp_rotation_assignments').upsert(payload).select().single();
      if (error) throw error;
      return data as RotationAssignment;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frp', 'assignments'] }),
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('frp_rotation_assignments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frp', 'assignments'] }),
  });

  const upsertLocation = useMutation({
    mutationFn: async (row: Partial<VesselLocation> & { id?: string }) => {
      const payload: any = { ...row, updated_by: user?.id ?? null };
      if (!row.id) payload.created_by = user?.id ?? null;
      const { data, error } = await (supabase as any).from('frp_vessel_locations').upsert(payload).select().single();
      if (error) throw error;
      return data as VesselLocation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frp', 'locations'] }),
  });

  const upsertLane = useMutation({
    mutationFn: async (row: Partial<PlannerLane> & { id?: string }) => {
      const { data, error } = await (supabase as any).from('frp_planner_lanes').upsert(row).select().single();
      if (error) throw error;
      return data as PlannerLane;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frp', 'lanes'] }),
  });

  const loading = lanesQ.isLoading || assignmentsQ.isLoading || locationsQ.isLoading;

  return useMemo(() => ({
    lanes: lanesQ.data ?? [],
    assignments: assignmentsQ.data ?? [],
    locations: locationsQ.data ?? [],
    leave: leaveQ.data ?? [],
    travel: travelQ.data ?? [],
    payroll: payrollQ.data ?? [],
    loading,
    error: lanesQ.error || assignmentsQ.error || locationsQ.error,
    upsertAssignment, deleteAssignment, upsertLocation, upsertLane,
  }), [lanesQ, assignmentsQ, locationsQ, leaveQ, travelQ, payrollQ, loading, upsertAssignment, deleteAssignment, upsertLocation, upsertLane]);
}
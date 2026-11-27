/**
 * The legacy lane planner's data (frp_* tables, before X1-09B): lanes,
 * bars, vessel locations, the leave overlay, travel and payroll transfers,
 * and the direct bar writes under the legacy frp_can_edit policies.
 *
 * It is the D-01 fallback of the vessel planner's timeline (and the page of
 * /crew/rotation-planner for users without a vessel): once
 * 20261124060900 is applied the guards refuse direct status writes, and the
 * timeline writes through planner_period_upsert / _delete instead
 * (usePlannerPeriods). X1-09B typed every read and write on the generated
 * client (no casts; the pending-table ratchet only shrinks).
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type {
  PlannerLane, RotationAssignment, VesselLocation,
  TravelMovement, PayrollTransfer, LeaveOverlayEntry,
} from '../types';
import { toISO } from '../lib/dateMath';

export interface PlannerWindow { start: Date; end: Date; vesselIds?: string[] | null }

type AssignmentInsert = TablesInsert<'frp_rotation_assignments'>;
type AssignmentUpdate = TablesUpdate<'frp_rotation_assignments'>;

/** The columns a bar write may carry (never the server's stamps or version). */
const WRITABLE = [
  'id', 'company_id', 'vessel_id', 'lane_id', 'crew_user_id', 'crew_name_raw', 'start_date', 'end_date', 'label',
  'rotation_type', 'status', 'colour', 'notes', 'linked_leave_entry_id', 'linked_travel_movement_id',
  'linked_payroll_transfer_id', 'source_import_id',
] as const;
type Writable = (typeof WRITABLE)[number];

function pickWritable(row: Partial<RotationAssignment>): Partial<Pick<RotationAssignment, Writable>> {
  const out: Partial<Record<Writable, unknown>> = {};
  for (const k of WRITABLE) if (k in row) out[k] = row[k];
  return out as Partial<Pick<RotationAssignment, Writable>>;
}

/** A complete row for an insert; a row without its company or dates is refused here, never sent. */
export function toAssignmentInsert(row: Partial<RotationAssignment>, userId: string | null): AssignmentInsert {
  const w = pickWritable(row);
  if (!w.company_id || !w.start_date || !w.end_date) throw new Error('A block needs its company, start and end before it can be saved.');
  return { ...w, company_id: w.company_id, start_date: w.start_date, end_date: w.end_date, created_by: userId, updated_by: userId };
}

/** A partial update (the id is the filter, never part of the patch). */
export function toAssignmentUpdate(row: Partial<RotationAssignment>, userId: string | null): AssignmentUpdate {
  const { id: _id, ...rest } = pickWritable(row);
  return { ...rest, updated_by: userId };
}

export function usePlannerData(win: PlannerWindow) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const startISO = toISO(win.start);
  const endISO = toISO(win.end);
  const vesselKey = (win.vesselIds ?? []).join(',');
  const vesselIds = win.vesselIds?.length ? win.vesselIds : null;

  const lanesQ = useQuery({
    queryKey: ['frp', 'lanes', vesselKey],
    queryFn: async (): Promise<PlannerLane[]> => {
      let q = supabase.from('frp_planner_lanes').select('*').eq('active', true).order('lane_order');
      if (vesselIds) q = q.in('vessel_id', vesselIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const assignmentsQ = useQuery({
    queryKey: ['frp', 'assignments', startISO, endISO, vesselKey],
    queryFn: async (): Promise<RotationAssignment[]> => {
      let q = supabase.from('frp_rotation_assignments').select('*').lte('start_date', endISO).gte('end_date', startISO);
      if (vesselIds) q = q.in('vessel_id', vesselIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const locationsQ = useQuery({
    queryKey: ['frp', 'locations', startISO, endISO, vesselKey],
    queryFn: async (): Promise<VesselLocation[]> => {
      let q = supabase.from('frp_vessel_locations').select('*').lte('start_date', endISO).gte('end_date', startISO);
      if (vesselIds) q = q.in('vessel_id', vesselIds);
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
      return data ?? [];
    },
    enabled: !!user,
  });

  const travelQ = useQuery({
    queryKey: ['frp', 'travel', startISO, endISO, vesselKey],
    queryFn: async (): Promise<TravelMovement[]> => {
      let q = supabase.from('frp_travel_movements').select('*');
      if (vesselIds) q = q.in('vessel_id', vesselIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const payrollQ = useQuery({
    queryKey: ['frp', 'payroll', startISO, endISO],
    queryFn: async (): Promise<PayrollTransfer[]> => {
      const { data, error } = await supabase.from('frp_payroll_vessel_transfers').select('*');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('frp-planner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'frp_rotation_assignments' }, () => {
        qc.invalidateQueries({ queryKey: ['frp', 'assignments'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'frp_vessel_locations' }, () => {
        qc.invalidateQueries({ queryKey: ['frp', 'locations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const userId = user?.id ?? null;

  const upsertAssignment = useMutation({
    mutationFn: async (row: Partial<RotationAssignment> & { id?: string }) => {
      const payload = toAssignmentInsert(row, row.id ? null : userId);
      if (row.id) delete payload.created_by;
      payload.updated_by = userId;
      const { data, error } = await supabase.from('frp_rotation_assignments').upsert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frp', 'assignments'] }),
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('frp_rotation_assignments').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("This block wasn't removed. You may not have permission to change it.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frp', 'assignments'] }),
  });

  /** Batch insert of complete rows — paste, duplicate and undo-of-delete. */
  const insertManyAssignments = useMutation({
    mutationFn: async (rows: Partial<RotationAssignment>[]) => {
      if (!rows.length) return [] as RotationAssignment[];
      const payload = rows.map((r) => toAssignmentInsert(r, userId));
      const { data, error } = await supabase.from('frp_rotation_assignments').insert(payload).select();
      if (error) throw error;
      if ((data ?? []).length !== rows.length) throw new Error(`Only ${(data ?? []).length} of ${rows.length} blocks were saved.`);
      return data ?? [];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frp', 'assignments'] }),
  });

  /** Batch partial update by id — multi-select moves, resizes and conflict fixes. */
  const updateManyAssignments = useMutation({
    mutationFn: async (rows: (Partial<RotationAssignment> & { id: string })[]) => {
      for (const r of rows) {
        const { data, error } = await supabase
          .from('frp_rotation_assignments')
          .update(toAssignmentUpdate(r, userId))
          .eq('id', r.id)
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("A block wasn't changed. You may not have permission to change it.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frp', 'assignments'] }),
  });

  const deleteManyAssignments = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { data, error } = await supabase.from('frp_rotation_assignments').delete().in('id', ids).select('id');
      if (error) throw error;
      if ((data ?? []).length !== ids.length) throw new Error(`Only ${(data ?? []).length} of ${ids.length} blocks were removed.`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frp', 'assignments'] }),
  });

  const upsertLocation = useMutation({
    mutationFn: async (row: Partial<VesselLocation> & { id?: string }) => {
      if (!row.company_id || !row.vessel_id || !row.start_date || !row.end_date || !row.location_name) {
        throw new Error('A location needs its vessel, dates and name before it can be saved.');
      }
      const payload: TablesInsert<'frp_vessel_locations'> = {
        ...row,
        company_id: row.company_id,
        vessel_id: row.vessel_id,
        start_date: row.start_date,
        end_date: row.end_date,
        location_name: row.location_name,
        updated_by: userId,
        ...(row.id ? {} : { created_by: userId }),
      };
      const { data, error } = await supabase.from('frp_vessel_locations').upsert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frp', 'locations'] }),
  });

  const upsertLane = useMutation({
    mutationFn: async (row: Partial<PlannerLane> & { id?: string }) => {
      if (!row.company_id || !row.lane_label) throw new Error('A lane needs its company and label before it can be saved.');
      const payload: TablesInsert<'frp_planner_lanes'> = { ...row, company_id: row.company_id, lane_label: row.lane_label };
      const { data, error } = await supabase.from('frp_planner_lanes').upsert(payload).select().single();
      if (error) throw error;
      return data;
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
    insertManyAssignments, updateManyAssignments, deleteManyAssignments,
  }), [lanesQ, assignmentsQ, locationsQ, leaveQ, travelQ, payrollQ, loading,
    upsertAssignment, deleteAssignment, upsertLocation, upsertLane,
    insertManyAssignments, updateManyAssignments, deleteManyAssignments]);
}

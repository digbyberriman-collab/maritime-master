import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useActiveRoles } from '@/modules/auth/hooks/useUserRoles';
import {
  type CrewMemberLeave,
  type CrewLeaveEntry,
  type CrewLeaveCarryover,
  type CrewLeaveLockedMonth,
} from '@/modules/crew/leaveConstants';
import {
  endOfMonth,
  format,
  eachDayOfInterval,
  parseISO,
} from 'date-fns';
import { toast } from 'sonner';
import { logLeaveAudit } from '@/modules/leave/services/leaveAudit';
import { resolveLeavePolicy } from '@/modules/leave/services/leavePolicies';
import {
  calculateLeave,
  DEFAULT_LEAVE_POLICY,
  LeavePolicy,
} from '@/modules/leave/lib/leaveCalculator';

const sb = supabase as any;

interface CrewSourceRow {
  user_id: string;
  first_name: string;
  last_name: string;
  rank?: string | null;
  department?: string | null;
  hod_user_id?: string | null;
  joining_date?: string | null;
  leaving_date?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  rotation?: string | null;
  annual_leave_days?: number | null;
  position?: string | null;
  vessel_id?: string | null;
  vessel_name?: string | null;
  is_current?: boolean | null;
}

/**
 * Drive the leave planner / calendar / calculator from real data.
 *
 * Crew rows come from `crew_assignments` joined to `profiles`, scoped to:
 *  - the active vessel (if `useVesselFilter` and the user is *not* fleet-level)
 *  - the user's company otherwise
 *
 * Calendar entries / requests / carryover / locks are fetched scoped to the
 * same vessel or company as appropriate.
 *
 * Returned `crewLeaveData` includes a fully calculated leave summary
 * (entitlement / accrued / taken / booked / remaining / next leave) per
 * crew member.
 */
export function useCrewLeave(year: number, month: number, options: { useVesselFilter?: boolean } = {}) {
  const { useVesselFilter = true } = options;
  const { profile, user } = useAuth();
  const { selectedVessel } = useVessel();
  const { roles } = useActiveRoles();
  const companyId = profile?.company_id;
  const vesselId = selectedVessel?.id ?? null;

  const isFleetLevel = useMemo(
    () => roles.some((r) => ['superadmin', 'dpa', 'fleet_master'].includes(r)),
    [roles]
  );

  const [crewSource, setCrewSource] = useState<CrewSourceRow[]>([]);
  const [entries, setEntries] = useState<CrewLeaveEntry[]>([]);
  const [yearEntries, setYearEntries] = useState<CrewLeaveEntry[]>([]);
  const [carryovers, setCarryovers] = useState<CrewLeaveCarryover[]>([]);
  const [lockedMonths, setLockedMonths] = useState<CrewLeaveLockedMonth[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Record<string, LeavePolicy>>({});
  const [undoStack, setUndoStack] = useState<{ crewId: string; date: string; previousCode: string | null }[]>([]);

  // ----- Crew source: real assignments joined with profiles -----
  const loadCrewSource = useCallback(async () => {
    if (!companyId) return;
    let q = sb
      .from('crew_assignments')
      .select(`
        is_current, position, department, vessel_id,
        vessels:vessel_id ( id, name, company_id ),
        profiles:user_id (
          user_id, first_name, last_name, rank, department, hod_user_id,
          joining_date, leaving_date, contract_start_date, contract_end_date,
          rotation, annual_leave_days
        )
      `)
      .eq('is_current', true);

    // Vessel filter: only crew on selected vessel unless user is fleet-level
    if (useVesselFilter && vesselId && !isFleetLevel) {
      q = q.eq('vessel_id', vesselId);
    }

    const { data, error: err } = await q;
    if (err) {
      console.error('[leave] crew source load failed:', err);
      setError(err.message);
      return;
    }

    // Filter to company in app-layer (RLS already does this, but defensive).
    const rows: CrewSourceRow[] = (data || [])
      .filter((r: any) => r.profiles && r.vessels?.company_id === companyId)
      .map((r: any) => ({
        user_id: r.profiles.user_id,
        first_name: r.profiles.first_name,
        last_name: r.profiles.last_name,
        rank: r.profiles.rank ?? r.position ?? null,
        department: r.profiles.department ?? r.department ?? null,
        hod_user_id: r.profiles.hod_user_id ?? null,
        joining_date: r.profiles.joining_date,
        leaving_date: r.profiles.leaving_date,
        contract_start_date: r.profiles.contract_start_date,
        contract_end_date: r.profiles.contract_end_date,
        rotation: r.profiles.rotation,
        annual_leave_days: r.profiles.annual_leave_days,
        position: r.position ?? r.profiles.rank ?? null,
        vessel_id: r.vessel_id,
        vessel_name: r.vessels?.name ?? null,
        is_current: r.is_current,
      }));

    // Deduplicate on user_id (a crew member with two assignments shouldn't
    // appear twice in the planner).
    const seen = new Set<string>();
    const deduped: CrewSourceRow[] = [];
    for (const row of rows) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      deduped.push(row);
    }
    deduped.sort((a, b) =>
      `${a.last_name ?? ''} ${a.first_name ?? ''}`.localeCompare(
        `${b.last_name ?? ''} ${b.first_name ?? ''}`
      )
    );
    setCrewSource(deduped);
  }, [companyId, vesselId, isFleetLevel, useVesselFilter]);

  // ----- Calendar entries for visible month -----
  const loadMonthEntries = useCallback(async () => {
    if (!companyId) return;
    const monthStart = format(new Date(year, month - 1, 1), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(new Date(year, month - 1, 1)), 'yyyy-MM-dd');

    let q = sb
      .from('crew_leave_entries')
      .select('*')
      .eq('company_id', companyId)
      .gte('date', monthStart)
      .lte('date', monthEnd);
    if (useVesselFilter && vesselId && !isFleetLevel) q = q.eq('vessel_id', vesselId);
    const { data } = await q;
    setEntries((data || []) as CrewLeaveEntry[]);
  }, [companyId, vesselId, isFleetLevel, useVesselFilter, year, month]);

  // ----- Calendar entries for the YTD year (used for balance calc) -----
  const loadYearEntries = useCallback(async () => {
    if (!companyId) return;
    let q = sb
      .from('crew_leave_entries')
      .select('crew_id, date, status_code, vessel_id')
      .eq('company_id', companyId)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`);
    if (useVesselFilter && vesselId && !isFleetLevel) q = q.eq('vessel_id', vesselId);
    const { data } = await q;
    setYearEntries((data || []) as CrewLeaveEntry[]);
  }, [companyId, vesselId, isFleetLevel, useVesselFilter, year]);

  // ----- Carryover for accrual year -----
  const loadCarryovers = useCallback(async () => {
    if (!companyId) return;
    const { data } = await sb
      .from('crew_leave_carryover')
      .select('*')
      .eq('company_id', companyId)
      .eq('year', year);
    setCarryovers((data || []) as CrewLeaveCarryover[]);
  }, [companyId, year]);

  // ----- Locked months (vessel-aware) -----
  const loadLockedMonths = useCallback(async () => {
    if (!companyId) return;
    let q = sb
      .from('crew_leave_locked_months')
      .select('*')
      .eq('company_id', companyId)
      .eq('year', year);
    if (useVesselFilter && vesselId && !isFleetLevel) {
      // Locks may apply company-wide (vessel_id NULL) or vessel-specific
      q = q.or(`vessel_id.eq.${vesselId},vessel_id.is.null`);
    }
    const { data } = await q;
    setLockedMonths((data || []) as CrewLeaveLockedMonth[]);
  }, [companyId, vesselId, isFleetLevel, useVesselFilter, year]);

  // ----- Open / future leave requests for booked-leave totals -----
  const loadRequests = useCallback(async () => {
    if (!companyId) return;
    let q = sb
      .from('crew_leave_requests')
      .select('*')
      .eq('company_id', companyId)
      .gte('end_date', `${year}-01-01`)
      .lte('start_date', `${year + 1}-12-31`);
    if (useVesselFilter && vesselId && !isFleetLevel) q = q.eq('vessel_id', vesselId);
    const { data } = await q;
    setRequests(data || []);
  }, [companyId, vesselId, isFleetLevel, useVesselFilter, year]);

  // ----- Resolve effective policy per crew (cached) -----
  const loadPolicies = useCallback(async () => {
    if (crewSource.length === 0) return;
    const next: Record<string, LeavePolicy> = {};
    await Promise.all(
      crewSource.map(async (c) => {
        const p = await resolveLeavePolicy({
          crewId: c.user_id,
          vesselId: c.vessel_id ?? vesselId,
          companyId: companyId ?? null,
        });
        // If crew profile has its own annual_leave_days override, apply it
        if (typeof c.annual_leave_days === 'number' && c.annual_leave_days > 0) {
          next[c.user_id] = { ...p, annual_entitlement_days: c.annual_leave_days };
        } else {
          next[c.user_id] = p;
        }
      })
    );
    setPolicies(next);
  }, [crewSource, vesselId, companyId]);

  // ----- Top-level load -----
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadCrewSource();
      await Promise.all([
        loadMonthEntries(),
        loadYearEntries(),
        loadCarryovers(),
        loadLockedMonths(),
        loadRequests(),
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadCrewSource, loadMonthEntries, loadYearEntries, loadCarryovers, loadLockedMonths, loadRequests]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  const isMonthLocked = useCallback(
    (m: number) => lockedMonths.some((lm) => lm.month === m && lm.year === year),
    [lockedMonths, year]
  );

  // ----- Cell setEntry with audit logging -----
  const setEntry = useCallback(
    async (crewId: string, date: string, statusCode: string | null) => {
      if (!companyId) return;

      // Block edits to non-existent crew (catches the legacy seed-id bug).
      if (!crewSource.find((c) => c.user_id === crewId)) {
        toast.error('Cannot edit leave for unknown crew member.');
        return;
      }

      const d = parseISO(date);
      if (isMonthLocked(d.getMonth() + 1)) {
        toast.error('This month is locked. No edits allowed.');
        return;
      }

      const existing = entries.find((e) => e.crew_id === crewId && e.date === date);
      setUndoStack((prev) => [...prev, { crewId, date, previousCode: existing?.status_code ?? null }]);

      const crewVessel = crewSource.find((c) => c.user_id === crewId)?.vessel_id ?? vesselId ?? null;

      try {
        if (statusCode === null) {
          await sb
            .from('crew_leave_entries')
            .delete()
            .eq('crew_id', crewId)
            .eq('date', date);

          setEntries((prev) => prev.filter((e) => !(e.crew_id === crewId && e.date === date)));
          setYearEntries((prev) => prev.filter((e) => !(e.crew_id === crewId && e.date === date)));
        } else if (existing) {
          await sb
            .from('crew_leave_entries')
            .update({ status_code: statusCode })
            .eq('crew_id', crewId)
            .eq('date', date);

          setEntries((prev) =>
            prev.map((e) =>
              e.crew_id === crewId && e.date === date ? { ...e, status_code: statusCode } : e
            )
          );
          setYearEntries((prev) =>
            prev.map((e) =>
              e.crew_id === crewId && e.date === date ? { ...e, status_code: statusCode } : e
            )
          );
        } else {
          const { data } = await sb
            .from('crew_leave_entries')
            .insert({
              crew_id: crewId,
              date,
              status_code: statusCode,
              company_id: companyId,
              vessel_id: crewVessel,
            })
            .select()
            .single();
          if (data) {
            setEntries((prev) => [...prev, data as CrewLeaveEntry]);
            setYearEntries((prev) => [...prev, data as CrewLeaveEntry]);
          }
        }

        if (user?.id) {
          await logLeaveAudit({
            companyId,
            vesselId: crewVessel,
            crewId,
            actorId: user.id,
            action: statusCode === null ? 'leave_cell_cleared' : existing ? 'leave_cell_updated' : 'leave_cell_set',
            entityType: 'crew_leave_entry',
            entityId: existing?.id ?? null,
            oldValue: existing ? { status_code: existing.status_code, date } : null,
            newValue: statusCode ? { status_code: statusCode, date } : null,
          });
        }
      } catch (e) {
        console.error('[leave] setEntry failed:', e);
        toast.error('Failed to save leave change.');
      }
    },
    [companyId, vesselId, entries, isMonthLocked, crewSource, user?.id]
  );

  // ----- Bulk fill (drag) with locked-month skip + audit -----
  const bulkFill = useCallback(
    async (crewId: string, startDate: string, endDate: string, statusCode: string) => {
      if (!companyId) return;
      if (!crewSource.find((c) => c.user_id === crewId)) {
        toast.error('Cannot edit leave for unknown crew member.');
        return;
      }

      const start = parseISO(startDate);
      const end = parseISO(endDate);
      const days = eachDayOfInterval({ start, end });

      const lockedDays = days.filter((d) => isMonthLocked(d.getMonth() + 1));
      if (lockedDays.length > 0) {
        toast.warning(`${lockedDays.length} days in locked months were skipped.`);
      }
      const validDays = days.filter((d) => !isMonthLocked(d.getMonth() + 1));
      if (validDays.length === 0) return;

      const crewVessel = crewSource.find((c) => c.user_id === crewId)?.vessel_id ?? vesselId ?? null;

      const inserts = validDays.map((d) => ({
        crew_id: crewId,
        date: format(d, 'yyyy-MM-dd'),
        status_code: statusCode,
        company_id: companyId,
        vessel_id: crewVessel,
      }));

      // Replace existing entries day-by-day to satisfy unique(crew_id, date)
      for (const ins of inserts) {
        await sb
          .from('crew_leave_entries')
          .delete()
          .eq('crew_id', crewId)
          .eq('date', ins.date);
      }
      const { data } = await sb.from('crew_leave_entries').insert(inserts).select();

      if (data) {
        await Promise.all([loadMonthEntries(), loadYearEntries()]);
      }

      if (user?.id) {
        await logLeaveAudit({
          companyId,
          vesselId: crewVessel,
          crewId,
          actorId: user.id,
          action: 'leave_bulk_fill',
          entityType: 'crew_leave_entries',
          newValue: { start: startDate, end: endDate, status_code: statusCode, days: validDays.length },
        });
      }

      toast.success(`Filled ${validDays.length} days with ${statusCode}`);
    },
    [companyId, vesselId, isMonthLocked, crewSource, loadMonthEntries, loadYearEntries, user?.id]
  );

  // ----- Undo last edit -----
  const undo = useCallback(async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((prev) => prev.slice(0, -1));
    await setEntry(last.crewId, last.date, last.previousCode);
    // Remove the stack entry that the setEntry call appended
    setUndoStack((prev) => prev.slice(0, -1));
  }, [undoStack, setEntry]);

  // ----- Toggle month lock (vessel-scoped if vessel selected) -----
  const toggleMonthLock = useCallback(
    async (m: number) => {
      if (!companyId) return;
      const existing = lockedMonths.find((lm) => lm.month === m && lm.year === year);
      if (existing) {
        await sb.from('crew_leave_locked_months').delete().eq('id', existing.id);
        setLockedMonths((prev) => prev.filter((lm) => lm.id !== existing.id));
        toast.success(`${new Date(year, m - 1).toLocaleString('default', { month: 'long' })} unlocked`);
      } else {
        const { data } = await sb
          .from('crew_leave_locked_months')
          .insert({
            year,
            month: m,
            company_id: companyId,
            vessel_id: vesselId,
            locked_by: user?.id ?? null,
          })
          .select()
          .single();
        if (data) {
          setLockedMonths((prev) => [...prev, data as CrewLeaveLockedMonth]);
          toast.success(`${new Date(year, m - 1).toLocaleString('default', { month: 'long' })} locked`);
        }
      }

      if (user?.id) {
        await logLeaveAudit({
          companyId,
          vesselId,
          actorId: user.id,
          action: existing ? 'month_unlocked' : 'month_locked',
          entityType: 'crew_leave_locked_month',
          metadata: { year, month: m },
        });
      }
    },
    [companyId, vesselId, year, lockedMonths, user?.id]
  );

  // ----- Build crewLeaveData with full calculator results -----
  const today = useMemo(() => new Date(), []);
  const crewLeaveData = useMemo<CrewMemberLeave[]>(() => {
    return crewSource.map((c) => {
      const policy = policies[c.user_id] ?? DEFAULT_LEAVE_POLICY;
      const crewYearEntries = yearEntries.filter((e) => e.crew_id === c.user_id);
      const crewMonthEntries = entries.filter((e) => e.crew_id === c.user_id);

      const entriesMap: Record<string, string> = {};
      crewMonthEntries.forEach((e) => { entriesMap[e.date] = e.status_code; });

      const counts: Record<string, number> = {};
      crewYearEntries.forEach((e) => { counts[e.status_code] = (counts[e.status_code] || 0) + 1; });

      const carryoverRecord = carryovers.find((cv) => cv.crew_id === c.user_id);
      const carryover = Number(carryoverRecord?.carryover_days ?? 0);

      const bookedRequests = requests
        .filter((r) => r.crew_id === c.user_id)
        .map((r) => ({
          start_date: r.start_date,
          end_date: r.end_date,
          status: r.status,
          leave_type: r.leave_type,
        }));

      const calc = calculateLeave({
        asOf: today,
        employmentStart: c.joining_date ? parseISO(c.joining_date) : null,
        contractStart: c.contract_start_date ? parseISO(c.contract_start_date) : null,
        employmentEnd: c.leaving_date ? parseISO(c.leaving_date) : null,
        contractEnd: c.contract_end_date ? parseISO(c.contract_end_date) : null,
        carryoverDays: carryover,
        entries: crewYearEntries.map((e) => ({ date: e.date, status_code: e.status_code })),
        bookedRequests,
        policy,
        year,
      });

      return {
        userId: c.user_id,
        firstName: c.first_name,
        lastName: c.last_name,
        position: c.position ?? c.rank ?? '',
        department: c.department ?? '',
        rank: c.rank ?? '',
        rotation: c.rotation ?? null,
        joiningDate: c.joining_date ?? null,
        leavingDate: c.leaving_date ?? null,
        vesselId: c.vessel_id ?? null,
        vesselName: c.vessel_name ?? null,
        hodUserId: c.hod_user_id ?? null,
        entries: entriesMap,
        carryover,
        counts,
        balance: calc.remaining,
        // Calculator outputs
        entitlement: calc.entitlement,
        accrued: calc.accrued,
        taken: calc.taken,
        booked: calc.booked,
        available: calc.available,
        remaining: calc.remaining,
        monthly_accrual: calc.monthly_accrual,
        next_leave_start: calc.next_leave_start,
        next_leave_end: calc.next_leave_end,
        notes: calc.notes,
      } as CrewMemberLeave;
    });
  }, [crewSource, entries, yearEntries, carryovers, requests, policies, today, year]);

  return {
    crewLeaveData,
    loading,
    error,
    isFleetLevel,
    entries,
    requests,
    lockedMonths,
    isMonthLocked,
    setEntry,
    bulkFill,
    undo,
    toggleMonthLock,
    canUndo: undoStack.length > 0,
    refresh: loadAll,
  };
}

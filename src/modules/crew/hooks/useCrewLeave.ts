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
import { endOfMonth, format, eachDayOfInterval, parseISO } from 'date-fns';
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
  rank: string | null;
  department: string | null;
  hod_user_id: string | null;
  joining_date: string | null;
  leaving_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  rotation: string | null;
  annual_leave_days: number | null;
  position: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
  is_current: boolean | null;
  /** True when this row was loaded as a fallback from `profiles` rather than
   * a real `crew_assignments` row (used to surface a soft warning). */
  from_profile_fallback?: boolean;
}

/**
 * Capability flags exposed to the UI so it can hide buttons whose backing
 * columns / rows / CHECKs aren't yet present in the live DB.
 */
export interface LeaveSchemaCapabilities {
  /** Profiles has the new `joining_date` etc. */
  rich_profiles: boolean;
  /** crew_leave_requests CHECK accepts hod_reviewed / cancelled. */
  extended_statuses: boolean;
  /** crew_leave_requests has cancelled_at / cancelled_by columns. */
  has_cancel_columns: boolean;
  /** crew_leave_requests has hod_reviewed_at / hod_reviewed_by columns. */
  has_hod_columns: boolean;
}

const FULL_PROFILE_COLS = `
  user_id, first_name, last_name, rank, department, hod_user_id,
  joining_date, leaving_date, contract_start_date, contract_end_date,
  rotation, annual_leave_days
`.replace(/\s+/g, ' ');

const SAFE_PROFILE_COLS = `
  user_id, first_name, last_name, department,
  contract_start_date, contract_end_date, rotation
`.replace(/\s+/g, ' ');

/**
 * Drive the leave planner / calendar / calculator from real data.
 *
 * Tiered crew loading (most → least specific):
 *   1. crew_assignments JOIN profiles with the rich column set
 *   2. crew_assignments JOIN profiles with a safe column set (degraded)
 *   3. profiles only (when no assignments exist for the company / vessel)
 *
 * Each step that fails feeds a `schemaCapabilities` flag so the UI can
 * communicate the degradation, and so action buttons that need newer DB
 * features can be hidden.
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
  const [schemaCapabilities, setSchemaCapabilities] = useState<LeaveSchemaCapabilities>({
    rich_profiles: true,
    extended_statuses: true,
    has_cancel_columns: true,
    has_hod_columns: true,
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<{ crewId: string; date: string; previousCode: string | null }[]>([]);

  const addWarning = useCallback((msg: string) => {
    setWarnings((prev) => (prev.includes(msg) ? prev : [...prev, msg]));
  }, []);

  // ----- Probe schema capabilities -----
  const probeSchema = useCallback(async () => {
    const caps: LeaveSchemaCapabilities = {
      rich_profiles: true,
      extended_statuses: true,
      has_cancel_columns: true,
      has_hod_columns: true,
    };

    // Profile rich-column probe
    const { error: e1 } = await sb
      .from('profiles')
      .select('joining_date, leaving_date, hod_user_id, annual_leave_days')
      .limit(1);
    if (e1) caps.rich_profiles = false;

    // Cancel column probe
    const { error: e2 } = await sb
      .from('crew_leave_requests')
      .select('cancelled_at, cancelled_by, cancel_reason')
      .limit(1);
    if (e2) caps.has_cancel_columns = false;

    // HoD review column probe
    const { error: e3 } = await sb
      .from('crew_leave_requests')
      .select('hod_reviewed_at, hod_reviewed_by, hod_review_notes')
      .limit(1);
    if (e3) caps.has_hod_columns = false;

    // Extended status probe (insert isn't safe; assume aligned with column probes)
    caps.extended_statuses = caps.has_cancel_columns && caps.has_hod_columns;

    setSchemaCapabilities(caps);

    if (!caps.rich_profiles) {
      addWarning(
        'Schema not fully migrated: profile fields like joining date and annual leave days are missing. ' +
          'Calculations fall back to defaults until the migration is applied.'
      );
    }
    if (!caps.extended_statuses) {
      addWarning(
        'Schema not fully migrated: HoD review and Cancel actions are disabled until the leave migration is applied.'
      );
    }
    return caps;
  }, [addWarning]);

  // ----- Crew source: tiered fallback loader -----
  const loadCrewSource = useCallback(
    async (caps: LeaveSchemaCapabilities) => {
      if (!companyId) return;

      const profileSelect = caps.rich_profiles ? FULL_PROFILE_COLS : SAFE_PROFILE_COLS;

      // 1. Try crew_assignments + profile join
      const buildAssignmentQuery = () => {
        let q = sb
          .from('crew_assignments')
          .select(`
            is_current, position, department, vessel_id,
            vessels:vessel_id ( id, name, company_id ),
            profiles:user_id ( ${profileSelect} )
          `)
          .eq('is_current', true);
        if (useVesselFilter && vesselId && !isFleetLevel) {
          q = q.eq('vessel_id', vesselId);
        }
        return q;
      };

      let assignmentRows: any[] = [];
      const { data: aData, error: aErr } = await buildAssignmentQuery();
      if (aErr) {
        console.warn('[leave] crew_assignments query failed, retrying with safe columns', aErr);
        // Retry with safe columns even if rich_profiles claimed true (defensive)
        let retryQ = sb
          .from('crew_assignments')
          .select(`
            is_current, position, department, vessel_id,
            vessels:vessel_id ( id, name, company_id ),
            profiles:user_id ( ${SAFE_PROFILE_COLS} )
          `)
          .eq('is_current', true);
        if (useVesselFilter && vesselId && !isFleetLevel) retryQ = retryQ.eq('vessel_id', vesselId);
        const { data: retry, error: retryErr } = await retryQ;
        if (retryErr) {
          setError(retryErr.message);
          return;
        }
        assignmentRows = retry || [];
        addWarning('Some profile fields could not be loaded — calculations may use defaults.');
      } else {
        assignmentRows = aData || [];
      }

      const fromAssignments: CrewSourceRow[] = assignmentRows
        .filter((r: any) => r.profiles && r.vessels?.company_id === companyId)
        .map((r: any) => ({
          user_id: r.profiles.user_id,
          first_name: r.profiles.first_name,
          last_name: r.profiles.last_name,
          rank: r.profiles.rank ?? r.position ?? null,
          department: r.profiles.department ?? r.department ?? null,
          hod_user_id: r.profiles.hod_user_id ?? null,
          joining_date: r.profiles.joining_date ?? null,
          leaving_date: r.profiles.leaving_date ?? null,
          contract_start_date: r.profiles.contract_start_date ?? null,
          contract_end_date: r.profiles.contract_end_date ?? null,
          rotation: r.profiles.rotation ?? null,
          annual_leave_days:
            typeof r.profiles.annual_leave_days === 'number' ? r.profiles.annual_leave_days : null,
          position: r.position ?? r.profiles.rank ?? null,
          vessel_id: r.vessel_id,
          vessel_name: r.vessels?.name ?? null,
          is_current: r.is_current,
        }));

      let final: CrewSourceRow[] = fromAssignments;

      // 2. Profile-only fallback when assignments are empty
      if (final.length === 0) {
        let pq = sb
          .from('profiles')
          .select(profileSelect + ', company_id')
          .eq('company_id', companyId);
        const { data: pData, error: pErr } = await pq;
        if (pErr) {
          // Try the safe set in case rich query fails despite probe
          const { data: pSafe } = await sb
            .from('profiles')
            .select(SAFE_PROFILE_COLS + ', company_id')
            .eq('company_id', companyId);
          if (pSafe) {
            final = (pSafe as any[]).map((p: any) => buildRowFromProfile(p));
          }
        } else {
          final = (pData as any[]).map((p: any) => buildRowFromProfile(p));
        }

        if (final.length > 0) {
          addWarning(
            'No crew assignments found for this vessel. Showing all crew in the company. ' +
              'Assign crew to vessels via the Crew Roster for vessel-scoped views.'
          );
        }
      }

      // Deduplicate
      const seen = new Set<string>();
      const deduped: CrewSourceRow[] = [];
      for (const row of final) {
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
    },
    [companyId, vesselId, isFleetLevel, useVesselFilter, addWarning]
  );

  // ----- Calendar entries / requests / carryover / locks -----
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

  const loadCarryovers = useCallback(async () => {
    if (!companyId) return;
    const { data } = await sb
      .from('crew_leave_carryover')
      .select('*')
      .eq('company_id', companyId)
      .eq('year', year);
    setCarryovers((data || []) as CrewLeaveCarryover[]);
  }, [companyId, year]);

  const loadLockedMonths = useCallback(async () => {
    if (!companyId) return;
    let q = sb
      .from('crew_leave_locked_months')
      .select('*')
      .eq('company_id', companyId)
      .eq('year', year);
    if (useVesselFilter && vesselId && !isFleetLevel) {
      q = q.or(`vessel_id.eq.${vesselId},vessel_id.is.null`);
    }
    const { data } = await q;
    setLockedMonths((data || []) as CrewLeaveLockedMonth[]);
  }, [companyId, vesselId, isFleetLevel, useVesselFilter, year]);

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
        let p: LeavePolicy = DEFAULT_LEAVE_POLICY;
        try {
          p = await resolveLeavePolicy({
            crewId: c.user_id,
            vesselId: c.vessel_id ?? vesselId,
            companyId: companyId ?? null,
          });
        } catch {
          /* leave_policies table may not exist yet — fall through to default */
        }
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
    setWarnings([]);
    try {
      const caps = await probeSchema();
      await loadCrewSource(caps);
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
  }, [probeSchema, loadCrewSource, loadMonthEntries, loadYearEntries, loadCarryovers, loadLockedMonths, loadRequests]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  const isMonthLocked = useCallback(
    (m: number) => lockedMonths.some((lm) => lm.month === m && lm.year === year),
    [lockedMonths, year]
  );

  // ----- setEntry with audit logging -----
  const setEntry = useCallback(
    async (crewId: string, date: string, statusCode: string | null) => {
      if (!companyId) return;

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
          await sb.from('crew_leave_entries').delete().eq('crew_id', crewId).eq('date', date);
          setEntries((prev) => prev.filter((e) => !(e.crew_id === crewId && e.date === date)));
          setYearEntries((prev) => prev.filter((e) => !(e.crew_id === crewId && e.date === date)));
        } else if (existing) {
          await sb
            .from('crew_leave_entries')
            .update({ status_code: statusCode })
            .eq('crew_id', crewId)
            .eq('date', date);
          setEntries((prev) =>
            prev.map((e) => (e.crew_id === crewId && e.date === date ? { ...e, status_code: statusCode } : e))
          );
          setYearEntries((prev) =>
            prev.map((e) => (e.crew_id === crewId && e.date === date ? { ...e, status_code: statusCode } : e))
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

  // ----- Bulk fill -----
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

      for (const ins of inserts) {
        await sb.from('crew_leave_entries').delete().eq('crew_id', crewId).eq('date', ins.date);
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

  const undo = useCallback(async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((prev) => prev.slice(0, -1));
    await setEntry(last.crewId, last.date, last.previousCode);
    setUndoStack((prev) => prev.slice(0, -1));
  }, [undoStack, setEntry]);

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

      // Calculator gracefully handles all-null dates: returns entitlement = 0
      // when no employmentStart and no contractStart. Surface this as a note.
      const employmentStart = c.joining_date ? parseISO(c.joining_date) : null;
      const contractStart = c.contract_start_date ? parseISO(c.contract_start_date) : null;
      const employmentEnd = c.leaving_date ? parseISO(c.leaving_date) : null;
      const contractEnd = c.contract_end_date ? parseISO(c.contract_end_date) : null;

      const calc = calculateLeave({
        asOf: today,
        employmentStart,
        contractStart,
        employmentEnd,
        contractEnd,
        carryoverDays: carryover,
        entries: crewYearEntries.map((e) => ({ date: e.date, status_code: e.status_code })),
        bookedRequests,
        policy,
        year,
      });

      // If we have NO employment/contract info, expose the full default
      // entitlement rather than 0 so the planner is at least informative.
      const fallbackEntitlement =
        !employmentStart && !contractStart ? policy.annual_entitlement_days : calc.entitlement;
      const fallbackAccrued =
        !employmentStart && !contractStart ? 0 : calc.accrued;
      const calcNotes = [...calc.notes];
      if (!employmentStart && !contractStart) {
        calcNotes.push('No joining or contract start date on profile — entitlement shown is the policy default.');
      }

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
        entitlement: fallbackEntitlement,
        accrued: fallbackAccrued,
        taken: calc.taken,
        booked: calc.booked,
        available: calc.available,
        remaining: calc.remaining,
        monthly_accrual: calc.monthly_accrual,
        next_leave_start: calc.next_leave_start,
        next_leave_end: calc.next_leave_end,
        notes: calcNotes,
      } as CrewMemberLeave;
    });
  }, [crewSource, entries, yearEntries, carryovers, requests, policies, today, year]);

  return {
    crewLeaveData,
    loading,
    error,
    warnings,
    schemaCapabilities,
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

// ----- helpers -----

function buildRowFromProfile(p: any): CrewSourceRow {
  return {
    user_id: p.user_id,
    first_name: p.first_name,
    last_name: p.last_name,
    rank: p.rank ?? null,
    department: p.department ?? null,
    hod_user_id: p.hod_user_id ?? null,
    joining_date: p.joining_date ?? null,
    leaving_date: p.leaving_date ?? null,
    contract_start_date: p.contract_start_date ?? null,
    contract_end_date: p.contract_end_date ?? null,
    rotation: p.rotation ?? null,
    annual_leave_days: typeof p.annual_leave_days === 'number' ? p.annual_leave_days : null,
    position: p.rank ?? null,
    vessel_id: null,
    vessel_name: null,
    is_current: null,
    from_profile_fallback: true,
  };
}

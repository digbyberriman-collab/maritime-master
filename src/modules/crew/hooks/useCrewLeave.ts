import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
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
  endOfYear,
  startOfYear,
} from 'date-fns';
import { toast } from 'sonner';
import { useLeavePolicy } from '@/modules/crew/hooks/useLeavePolicy';
import {
  calculateLeaveBreakdown,
  type CrewProfileLite,
  type LeaveEntryLite,
} from '@/modules/crew/services/leaveCalculator';
import { logLeaveAudit } from '@/modules/crew/services/leaveAudit';

export interface CrewLeaveOptions {
  /** When true, ignore the VesselContext vessel filter and load fleet-wide. */
  fleetWide?: boolean;
  /** Restrict to crew where profile.department equals this value. */
  departmentScope?: string | null;
}

interface RichCrewProfile extends CrewProfileLite {
  user_id: string;
  first_name: string;
  last_name: string;
  rank: string | null;
  department: string | null;
  rotation: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
  status: string | null;
  is_imported: boolean;
  position_label: string;
  join_date: string | null;
}

export function useCrewLeave(year: number, month: number, options: CrewLeaveOptions = {}) {
  const { profile, user } = useAuth();
  const { selectedVesselId, isAllVessels, canAccessAllVessels } = useVessel();

  const companyId = profile?.company_id;
  const { fleetWide, departmentScope } = options;

  // Vessel scope:
  //   - fleetWide flag (caller opt-in) → null (no filter)
  //   - isAllVessels (only granted to fleet-level roles) → null
  //   - canAccessAllVessels && no vessel chosen yet → null (fleet default)
  //   - otherwise restrict to the user's selected vessel
  const effectiveVesselId =
    fleetWide || isAllVessels || (canAccessAllVessels && !selectedVesselId)
      ? null
      : selectedVesselId ?? null;
  const requireVesselFilter = !canAccessAllVessels && !fleetWide && !isAllVessels;

  const { data: policyData } = useLeavePolicy(effectiveVesselId);
  const policy = policyData?.policy;

  const [crewProfiles, setCrewProfiles] = useState<RichCrewProfile[]>([]);
  const [entries, setEntries] = useState<CrewLeaveEntry[]>([]);
  const [carryovers, setCarryovers] = useState<CrewLeaveCarryover[]>([]);
  const [lockedMonths, setLockedMonths] = useState<CrewLeaveLockedMonth[]>([]);
  const [yearEntries, setYearEntries] = useState<CrewLeaveEntry[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoStack, setUndoStack] = useState<{ crewId: string; date: string; previousCode: string | null }[]>([]);

  const actor = useMemo(
    () =>
      user && profile
        ? { user_id: user.id, email: profile.email, role: profile.role }
        : null,
    [user, profile],
  );

  // Real crew profiles + their current vessel (via crew_assignments / imported_vessel_id)
  const loadCrewProfiles = useCallback(async () => {
    if (!companyId) {
      setCrewProfiles([]);
      return;
    }

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select(
        'user_id, id, first_name, last_name, rank, department, rotation, status, is_imported, ' +
          'contract_start_date, contract_end_date, employment_start_date, ' +
          'annual_leave_entitlement, leave_accrual_method, rotation_pattern, ' +
          'imported_vessel_id, position',
      )
      .eq('company_id', companyId);

    if (profileError) {
      console.error('[useCrewLeave] failed to load profiles:', profileError);
      setCrewProfiles([]);
      return;
    }

    const userIds = (profiles ?? []).map((p) => p.user_id).filter((id): id is string => !!id);
    let assignments: any[] = [];
    if (userIds.length > 0) {
      const { data } = await supabase
        .from('crew_assignments')
        .select('id, vessel_id, user_id, position, join_date, leave_date, is_current, vessels:vessel_id (id, name)')
        .in('user_id', userIds)
        .eq('is_current', true);
      assignments = data ?? [];
    }

    const importedVesselIds = (profiles ?? [])
      .filter((p: any) => p.is_imported && p.imported_vessel_id)
      .map((p: any) => p.imported_vessel_id as string);
    let vesselNameMap: Record<string, string> = {};
    if (importedVesselIds.length > 0) {
      const { data: vesselsData } = await supabase
        .from('vessels')
        .select('id, name')
        .in('id', Array.from(new Set(importedVesselIds)));
      vesselNameMap = Object.fromEntries((vesselsData ?? []).map((v) => [v.id, v.name]));
    }

    const enriched: RichCrewProfile[] = (profiles ?? [])
      .filter((p: any) => !!p.user_id) // need user_id for FK on leave entries
      .map((p: any) => {
        const assignment = assignments.find((a) => a.user_id === p.user_id);
        const importedVesselId = p.is_imported ? p.imported_vessel_id ?? null : null;
        const vesselId = assignment?.vessel_id ?? importedVesselId ?? null;
        const vesselName =
          (assignment?.vessels as any)?.name ??
          (importedVesselId ? vesselNameMap[importedVesselId] : null) ??
          null;
        return {
          user_id: p.user_id,
          first_name: p.first_name,
          last_name: p.last_name,
          rank: p.rank,
          department: p.department,
          rotation: p.rotation,
          contract_start_date: p.contract_start_date,
          contract_end_date: p.contract_end_date,
          employment_start_date: p.employment_start_date,
          annual_leave_entitlement: p.annual_leave_entitlement,
          leave_accrual_method: p.leave_accrual_method,
          rotation_pattern: p.rotation_pattern ?? p.rotation,
          status: p.status,
          is_imported: !!p.is_imported,
          vessel_id: vesselId,
          vessel_name: vesselName,
          position_label: assignment?.position ?? p.position ?? p.rank ?? 'Crew',
          join_date: assignment?.join_date ?? null,
        };
      });

    setCrewProfiles(enriched);
  }, [companyId]);

  const loadMonthEntries = useCallback(async () => {
    if (!companyId) return;
    const monthStart = format(new Date(year, month - 1, 1), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(new Date(year, month - 1, 1)), 'yyyy-MM-dd');

    const { data } = await supabase
      .from('crew_leave_entries')
      .select('*')
      .eq('company_id', companyId)
      .gte('date', monthStart)
      .lte('date', monthEnd);
    setEntries((data || []) as CrewLeaveEntry[]);
  }, [companyId, year, month]);

  const loadYearEntries = useCallback(async () => {
    if (!companyId) return;
    const yearStart = format(startOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd');
    const yearEndStr = format(endOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd');

    const { data } = await supabase
      .from('crew_leave_entries')
      .select('*')
      .eq('company_id', companyId)
      .gte('date', yearStart)
      .lte('date', yearEndStr);
    setYearEntries((data || []) as CrewLeaveEntry[]);
  }, [companyId, year]);

  const loadCarryovers = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('crew_leave_carryover')
      .select('*')
      .eq('company_id', companyId)
      .eq('year', year);
    setCarryovers((data || []) as CrewLeaveCarryover[]);
  }, [companyId, year]);

  const loadLockedMonths = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('crew_leave_locked_months')
      .select('*')
      .eq('company_id', companyId)
      .eq('year', year);
    setLockedMonths((data || []) as CrewLeaveLockedMonth[]);
  }, [companyId, year]);

  const loadRequests = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('crew_leave_requests')
      .select('*')
      .eq('company_id', companyId)
      .gte('end_date', format(startOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd'));
    setRequests(data ?? []);
  }, [companyId, year]);

  const loadAdjustments = useCallback(async () => {
    if (!companyId) return;
    const { data } = await (supabase as any)
      .from('crew_leave_balance_adjustments')
      .select('*')
      .eq('company_id', companyId);
    setAdjustments((data ?? []) as any[]);
  }, [companyId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      loadCrewProfiles(),
      loadMonthEntries(),
      loadYearEntries(),
      loadCarryovers(),
      loadLockedMonths(),
      loadRequests(),
      loadAdjustments(),
    ]);
    setLoading(false);
  }, [
    loadCrewProfiles,
    loadMonthEntries,
    loadYearEntries,
    loadCarryovers,
    loadLockedMonths,
    loadRequests,
    loadAdjustments,
  ]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadMonthEntries();
  }, [loadMonthEntries]);

  // Vessel-filtered crew (drives the visible roster)
  const visibleProfiles = useMemo(() => {
    return crewProfiles.filter((p) => {
      // Hide inactive crew unless they have entries this year
      const hasYearActivity = yearEntries.some((e) => e.crew_id === p.user_id);
      if (p.status && p.status !== 'Active' && !hasYearActivity) return false;

      if (effectiveVesselId) {
        return p.vessel_id === effectiveVesselId;
      }
      // Non-fleet users without a selected vessel see no crew (avoid leaking
      // other-vessel crew to a HoD who hasn't picked one yet).
      if (requireVesselFilter) return false;
      return true;
    });
  }, [crewProfiles, yearEntries, effectiveVesselId, requireVesselFilter]);

  const departmentScopedProfiles = useMemo(() => {
    if (!departmentScope) return visibleProfiles;
    return visibleProfiles.filter(
      (p) => (p.department ?? '').toLowerCase() === departmentScope.toLowerCase(),
    );
  }, [visibleProfiles, departmentScope]);

  // Locked-month check. A lock with vessel_id=null applies fleet-wide; a lock
  // with vessel_id set applies only when that vessel is in scope.
  const isMonthLocked = useCallback(
    (m: number) =>
      lockedMonths.some(
        (lm) =>
          lm.month === m &&
          lm.year === year &&
          (lm.vessel_id == null || lm.vessel_id === effectiveVesselId),
      ),
    [lockedMonths, year, effectiveVesselId],
  );

  /* ---------- mutations ---------- */

  const setEntry = useCallback(
    async (crewId: string, date: string, statusCode: string | null) => {
      if (!companyId) return;
      const d = new Date(date);
      if (isMonthLocked(d.getMonth() + 1)) {
        toast.error('This month is locked. No edits allowed.');
        return;
      }

      const profile = crewProfiles.find((p) => p.user_id === crewId);
      const vesselForEntry = profile?.vessel_id ?? effectiveVesselId ?? null;
      const existing = entries.find((e) => e.crew_id === crewId && e.date === date);
      setUndoStack((prev) => [
        ...prev,
        { crewId, date, previousCode: existing?.status_code || null },
      ]);

      if (statusCode === null) {
        await supabase
          .from('crew_leave_entries')
          .delete()
          .eq('crew_id', crewId)
          .eq('date', date);

        setEntries((prev) => prev.filter((e) => !(e.crew_id === crewId && e.date === date)));
        setYearEntries((prev) => prev.filter((e) => !(e.crew_id === crewId && e.date === date)));

        if (actor) {
          logLeaveAudit({
            entityType: 'leave_entry',
            entityId: existing?.id ?? `${crewId}:${date}`,
            action: 'DELETE',
            actor,
            crewId,
            vesselId: vesselForEntry,
            oldValues: { status_code: existing?.status_code, date },
          });
        }
        return;
      }

      const newEntry = {
        crew_id: crewId,
        date,
        status_code: statusCode,
        company_id: companyId,
        vessel_id: vesselForEntry,
      };

      if (existing) {
        const { error } = await supabase
          .from('crew_leave_entries')
          .update({ status_code: statusCode })
          .eq('crew_id', crewId)
          .eq('date', date);
        if (error) {
          toast.error(`Update failed: ${error.message}`);
          return;
        }
        setEntries((prev) =>
          prev.map((e) =>
            e.crew_id === crewId && e.date === date ? { ...e, status_code: statusCode } : e,
          ),
        );
        setYearEntries((prev) =>
          prev.map((e) =>
            e.crew_id === crewId && e.date === date ? { ...e, status_code: statusCode } : e,
          ),
        );
        if (actor) {
          logLeaveAudit({
            entityType: 'leave_entry',
            entityId: existing.id,
            action: 'UPDATE',
            actor,
            crewId,
            vesselId: vesselForEntry,
            oldValues: { status_code: existing.status_code, date },
            newValues: { status_code: statusCode, date },
          });
        }
      } else {
        const { data, error } = await supabase
          .from('crew_leave_entries')
          .insert(newEntry)
          .select()
          .single();
        if (error) {
          toast.error(`Insert failed: ${error.message}`);
          return;
        }
        if (data) {
          const typed = data as CrewLeaveEntry;
          setEntries((prev) => [...prev, typed]);
          setYearEntries((prev) => [...prev, typed]);
          if (actor) {
            logLeaveAudit({
              entityType: 'leave_entry',
              entityId: typed.id,
              action: 'CREATE',
              actor,
              crewId,
              vesselId: vesselForEntry,
              newValues: { status_code: statusCode, date },
            });
          }
        }
      }
    },
    [companyId, effectiveVesselId, crewProfiles, entries, isMonthLocked, actor],
  );

  const bulkFill = useCallback(
    async (crewId: string, startDate: string, endDate: string, statusCode: string) => {
      if (!companyId) return;
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = eachDayOfInterval({ start, end });

      const lockedDays = days.filter((d) => isMonthLocked(d.getMonth() + 1));
      if (lockedDays.length > 0) {
        toast.warning(`${lockedDays.length} days in locked months were skipped.`);
      }

      const validDays = days.filter((d) => !isMonthLocked(d.getMonth() + 1));
      if (validDays.length === 0) return;

      const profile = crewProfiles.find((p) => p.user_id === crewId);
      const vesselForEntry = profile?.vessel_id ?? effectiveVesselId ?? null;

      const inserts = validDays.map((d) => ({
        crew_id: crewId,
        date: format(d, 'yyyy-MM-dd'),
        status_code: statusCode,
        company_id: companyId,
        vessel_id: vesselForEntry,
      }));

      // Delete first, then insert (no upsert for compound (crew_id, date))
      const dateList = inserts.map((i) => i.date);
      await supabase
        .from('crew_leave_entries')
        .delete()
        .eq('crew_id', crewId)
        .in('date', dateList);

      const { error } = await supabase.from('crew_leave_entries').insert(inserts);
      if (error) {
        toast.error(`Bulk fill failed: ${error.message}`);
        return;
      }

      await Promise.all([loadMonthEntries(), loadYearEntries()]);

      if (actor) {
        logLeaveAudit({
          entityType: 'leave_entry',
          entityId: `${crewId}:${startDate}→${endDate}`,
          action: 'BULK_FILL',
          actor,
          crewId,
          vesselId: vesselForEntry,
          newValues: {
            status_code: statusCode,
            start_date: startDate,
            end_date: endDate,
            day_count: inserts.length,
          },
        });
      }
      toast.success(`Filled ${validDays.length} days with ${statusCode}`);
    },
    [companyId, effectiveVesselId, crewProfiles, isMonthLocked, loadMonthEntries, loadYearEntries, actor],
  );

  const undo = useCallback(async () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const remaining = prev.slice(0, -1);
      // Apply the inverse without re-pushing onto the undo stack
      (async () => {
        if (!companyId) return;
        if (last.previousCode === null) {
          await supabase
            .from('crew_leave_entries')
            .delete()
            .eq('crew_id', last.crewId)
            .eq('date', last.date);
          setEntries((curr) => curr.filter((e) => !(e.crew_id === last.crewId && e.date === last.date)));
          setYearEntries((curr) => curr.filter((e) => !(e.crew_id === last.crewId && e.date === last.date)));
        } else {
          // upsert previous code
          const { data: existing } = await supabase
            .from('crew_leave_entries')
            .select('id')
            .eq('crew_id', last.crewId)
            .eq('date', last.date)
            .maybeSingle();
          if (existing) {
            await supabase
              .from('crew_leave_entries')
              .update({ status_code: last.previousCode })
              .eq('id', existing.id);
          } else {
            const profile = crewProfiles.find((p) => p.user_id === last.crewId);
            const vesselForEntry = profile?.vessel_id ?? effectiveVesselId ?? null;
            await supabase.from('crew_leave_entries').insert({
              crew_id: last.crewId,
              date: last.date,
              status_code: last.previousCode,
              company_id: companyId,
              vessel_id: vesselForEntry,
            });
          }
          await loadMonthEntries();
          await loadYearEntries();
        }
      })();
      return remaining;
    });
  }, [companyId, crewProfiles, effectiveVesselId, loadMonthEntries, loadYearEntries]);

  const toggleMonthLock = useCallback(
    async (m: number) => {
      if (!companyId) return;

      const existing = lockedMonths.find((lm) => lm.month === m && lm.year === year);
      if (existing) {
        await supabase.from('crew_leave_locked_months').delete().eq('id', existing.id);
        setLockedMonths((prev) => prev.filter((lm) => lm.id !== existing.id));
        toast.success(`${new Date(year, m - 1).toLocaleString('default', { month: 'long' })} unlocked`);
        if (actor) {
          logLeaveAudit({
            entityType: 'leave_calendar_lock',
            entityId: existing.id,
            action: 'UNLOCK',
            actor,
            vesselId: existing.vessel_id ?? null,
            oldValues: { year, month: m },
          });
        }
      } else {
        const { data } = await supabase
          .from('crew_leave_locked_months')
          .insert({
            year,
            month: m,
            company_id: companyId,
            vessel_id: effectiveVesselId ?? null,
            locked_by: profile?.user_id || null,
          })
          .select()
          .single();
        if (data) {
          setLockedMonths((prev) => [...prev, data as CrewLeaveLockedMonth]);
          toast.success(`${new Date(year, m - 1).toLocaleString('default', { month: 'long' })} locked`);
          if (actor) {
            logLeaveAudit({
              entityType: 'leave_calendar_lock',
              entityId: (data as any).id,
              action: 'LOCK',
              actor,
              vesselId: effectiveVesselId ?? null,
              newValues: { year, month: m },
            });
          }
        }
      }
    },
    [companyId, effectiveVesselId, year, lockedMonths, profile?.user_id, actor],
  );

  /* ---------- assembled crew leave data ---------- */

  const crewLeaveData = useMemo<
    (CrewMemberLeave & {
      vesselId: string | null;
      vesselName: string | null;
      rotation: string | null;
      contractStart: string | null;
      contractEnd: string | null;
      employmentStart: string | null;
      annualEntitlement: number;
      accrued: number;
      taken: number;
      booked: number;
      pending: number;
      adjustments: number;
      remaining: number;
      monthlyAccrual: number;
      accrualNotes: string[];
      nextLeaveStart: string | null;
      nextLeaveEnd: string | null;
      isImported: boolean;
    })[]
  >(() => {
    if (!policy) return [];
    const asOf = new Date();

    return departmentScopedProfiles.map((p) => {
      const yearForCrew: LeaveEntryLite[] = yearEntries
        .filter((e) => e.crew_id === p.user_id)
        .map((e) => ({ date: e.date, status_code: e.status_code }));
      const monthForCrew = entries.filter((e) => e.crew_id === p.user_id);
      const entriesMap: Record<string, string> = {};
      monthForCrew.forEach((e) => {
        entriesMap[e.date] = e.status_code;
      });
      const counts: Record<string, number> = {};
      yearForCrew.forEach((e) => {
        counts[e.status_code] = (counts[e.status_code] || 0) + 1;
      });
      const carryRow = carryovers.find((c) => c.crew_id === p.user_id);
      const carryover = Number(carryRow?.carryover_days ?? 0);
      const adj = adjustments.filter((a: any) => a.crew_id === p.user_id);
      const reqs = requests
        .filter((r: any) => r.crew_id === p.user_id)
        .map((r: any) => ({
          start_date: r.start_date,
          end_date: r.end_date,
          status: r.status,
          leave_type: r.leave_type,
        }));

      const breakdown = calculateLeaveBreakdown({
        profile: p,
        policy,
        entries: yearForCrew,
        requests: reqs,
        carryover,
        adjustments: adj.map((a: any) => ({
          adjustment_days: Number(a.adjustment_days),
          effective_date: a.effective_date,
        })),
        asOf,
        fallbackJoinDate: p.join_date,
      });

      // Find next leave block
      let nextLeaveStart: string | null = null;
      let nextLeaveEnd: string | null = null;
      const todayStr = format(asOf, 'yyyy-MM-dd');
      const futureLEntries = yearForCrew
        .filter((e) => e.status_code === 'L' && e.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (futureLEntries.length > 0) {
        nextLeaveStart = futureLEntries[0].date;
        nextLeaveEnd = nextLeaveStart;
        for (let i = 1; i < futureLEntries.length; i++) {
          const prev = new Date(futureLEntries[i - 1].date);
          const curr = new Date(futureLEntries[i].date);
          if ((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24) === 1) {
            nextLeaveEnd = futureLEntries[i].date;
          } else {
            break;
          }
        }
      } else {
        const futureReqs = reqs
          .filter((r) => (r.status === 'approved' || r.status === 'pending') && r.start_date >= todayStr)
          .sort((a, b) => a.start_date.localeCompare(b.start_date));
        if (futureReqs.length > 0) {
          nextLeaveStart = futureReqs[0].start_date;
          nextLeaveEnd = futureReqs[0].end_date;
        }
      }

      return {
        userId: p.user_id,
        firstName: p.first_name,
        lastName: p.last_name,
        position: p.position_label,
        department: p.department || 'Unassigned',
        entries: entriesMap,
        carryover,
        counts,
        balance: breakdown.remaining,
        vesselId: p.vessel_id,
        vesselName: p.vessel_name,
        rotation: p.rotation_pattern ?? p.rotation,
        contractStart: p.contract_start_date,
        contractEnd: p.contract_end_date,
        employmentStart: p.employment_start_date,
        annualEntitlement: breakdown.annualEntitlement,
        accrued: breakdown.accrued,
        taken: breakdown.taken,
        booked: breakdown.booked,
        pending: breakdown.pending,
        adjustments: breakdown.adjustments,
        remaining: breakdown.remaining,
        monthlyAccrual: breakdown.monthlyAccrualDays,
        accrualNotes: breakdown.notes,
        nextLeaveStart,
        nextLeaveEnd,
        isImported: p.is_imported,
      };
    });
  }, [departmentScopedProfiles, yearEntries, entries, carryovers, requests, adjustments, policy]);

  return {
    crewLeaveData,
    loading,
    entries,
    lockedMonths,
    isMonthLocked,
    setEntry,
    bulkFill,
    undo,
    toggleMonthLock,
    canUndo: undoStack.length > 0,
    refresh: loadAll,
    effectiveVesselId,
    policy,
  };
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { CREW_SEED_DATA, type CrewMemberLeave, type CrewLeaveEntry, type CrewLeaveCarryover, type CrewLeaveLockedMonth } from '@/modules/crew/leaveConstants';
import { startOfMonth, endOfMonth, format, getDaysInMonth, eachDayOfInterval, startOfYear, endOfYear } from 'date-fns';
import { toast } from 'sonner';

export function useCrewLeave(year: number, month: number) {
  const { profile } = useAuth();
  const { selectedVessel } = useVessel();
  const companyId = profile?.company_id;
  const vesselId = selectedVessel?.id;

  const [crewProfiles, setCrewProfiles] = useState<any[]>([]);
  const [entries, setEntries] = useState<CrewLeaveEntry[]>([]);
  const [carryovers, setCarryovers] = useState<CrewLeaveCarryover[]>([]);
  const [lockedMonths, setLockedMonths] = useState<CrewLeaveLockedMonth[]>([]);
  const [yearEntries, setYearEntries] = useState<CrewLeaveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoStack, setUndoStack] = useState<{ crewId: string; date: string; previousCode: string | null }[]>([]);

  // Load crew profiles
  const loadCrewProfiles = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, rank, department')
      .eq('company_id', companyId)
      .order('last_name');
    setCrewProfiles(data || []);
  }, [companyId]);

  // Load entries for the visible month
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

  // Load all entries for the year (for summary counts)
  const loadYearEntries = useCallback(async () => {
    if (!companyId) return;
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    
    const { data } = await supabase
      .from('crew_leave_entries')
      .select('*')
      .eq('company_id', companyId)
      .gte('date', yearStart)
      .lte('date', yearEnd);
    setYearEntries((data || []) as CrewLeaveEntry[]);
  }, [companyId, year]);

  // Load carryovers
  const loadCarryovers = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('crew_leave_carryover')
      .select('*')
      .eq('company_id', companyId)
      .eq('year', year);
    setCarryovers((data || []) as CrewLeaveCarryover[]);
  }, [companyId, year]);

  // Load locked months
  const loadLockedMonths = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('crew_leave_locked_months')
      .select('*')
      .eq('company_id', companyId)
      .eq('year', year);
    setLockedMonths((data || []) as CrewLeaveLockedMonth[]);
  }, [companyId, year]);

  // Load all data
  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadCrewProfiles(), loadMonthEntries(), loadYearEntries(), loadCarryovers(), loadLockedMonths()]);
    setLoading(false);
  }, [loadCrewProfiles, loadMonthEntries, loadYearEntries, loadCarryovers, loadLockedMonths]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Recompute when month changes
  useEffect(() => { loadMonthEntries(); }, [loadMonthEntries]);

  // Check if a month is locked
  const isMonthLocked = useCallback((m: number) => {
    return lockedMonths.some(lm => lm.month === m && lm.year === year);
  }, [lockedMonths, year]);

  // Set a single cell entry (upsert)
  const setEntry = useCallback(async (crewId: string, date: string, statusCode: string | null) => {
    if (!companyId) return;

    // Check if month is locked
    const d = new Date(date);
    if (isMonthLocked(d.getMonth() + 1)) {
      toast.error('This month is locked. No edits allowed.');
      return;
    }

    // Find existing entry for undo
    const existing = entries.find(e => e.crew_id === crewId && e.date === date);
    setUndoStack(prev => [...prev, { crewId, date, previousCode: existing?.status_code || null }]);

    if (statusCode === null) {
      // Delete entry
      await supabase
        .from('crew_leave_entries')
        .delete()
        .eq('crew_id', crewId)
        .eq('date', date);
      
      setEntries(prev => prev.filter(e => !(e.crew_id === crewId && e.date === date)));
      setYearEntries(prev => prev.filter(e => !(e.crew_id === crewId && e.date === date)));
    } else {
      // Upsert
      const newEntry = { crew_id: crewId, date, status_code: statusCode, company_id: companyId, vessel_id: vesselId || null };
      
      if (existing) {
        await supabase
          .from('crew_leave_entries')
          .update({ status_code: statusCode })
          .eq('crew_id', crewId)
          .eq('date', date);
        
        setEntries(prev => prev.map(e => e.crew_id === crewId && e.date === date ? { ...e, status_code: statusCode } : e));
        setYearEntries(prev => prev.map(e => e.crew_id === crewId && e.date === date ? { ...e, status_code: statusCode } : e));
      } else {
        const { data } = await supabase
          .from('crew_leave_entries')
          .insert(newEntry)
          .select()
          .single();
        
        if (data) {
          const typed = data as CrewLeaveEntry;
          setEntries(prev => [...prev, typed]);
          setYearEntries(prev => [...prev, typed]);
        }
      }
    }
  }, [companyId, vesselId, entries, isMonthLocked]);

  // Bulk fill: fill a range of dates for a crew member
  const bulkFill = useCallback(async (crewId: string, startDate: string, endDate: string, statusCode: string) => {
    if (!companyId) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = eachDayOfInterval({ start, end });
    
    // Check for locked months in the range
    const lockedDays = days.filter(d => isMonthLocked(d.getMonth() + 1));
    if (lockedDays.length > 0) {
      toast.warning(`${lockedDays.length} days in locked months were skipped.`);
    }

    const validDays = days.filter(d => !isMonthLocked(d.getMonth() + 1));
    if (validDays.length === 0) return;

    const inserts = validDays.map(d => ({
      crew_id: crewId,
      date: format(d, 'yyyy-MM-dd'),
      status_code: statusCode,
      company_id: companyId,
      vessel_id: vesselId || null,
    }));

    // Delete existing entries in range, then insert
    for (const ins of inserts) {
      await supabase
        .from('crew_leave_entries')
        .delete()
        .eq('crew_id', crewId)
        .eq('date', ins.date);
    }

    const { data } = await supabase
      .from('crew_leave_entries')
      .insert(inserts)
      .select();

    if (data) {
      // Reload month and year entries
      await Promise.all([loadMonthEntries(), loadYearEntries()]);
    }
    
    toast.success(`Filled ${validDays.length} days with ${statusCode}`);
  }, [companyId, vesselId, isMonthLocked, loadMonthEntries, loadYearEntries]);

  // Undo last edit
  const undo = useCallback(async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;

    setUndoStack(prev => prev.slice(0, -1));
    await setEntry(last.crewId, last.date, last.previousCode);
    // Remove the undo entry we just added from the setEntry call
    setUndoStack(prev => prev.slice(0, -1));
  }, [undoStack, setEntry]);

  // Toggle month lock
  const toggleMonthLock = useCallback(async (m: number) => {
    if (!companyId) return;

    const existing = lockedMonths.find(lm => lm.month === m && lm.year === year);
    if (existing) {
      await supabase.from('crew_leave_locked_months').delete().eq('id', existing.id);
      setLockedMonths(prev => prev.filter(lm => lm.id !== existing.id));
      toast.success(`${new Date(year, m - 1).toLocaleString('default', { month: 'long' })} unlocked`);
    } else {
      const { data } = await supabase
        .from('crew_leave_locked_months')
        .insert({
          year,
          month: m,
          company_id: companyId,
          vessel_id: vesselId || null,
          locked_by: profile?.user_id || null,
        })
        .select()
        .single();
      if (data) {
        setLockedMonths(prev => [...prev, data as CrewLeaveLockedMonth]);
        toast.success(`${new Date(year, m - 1).toLocaleString('default', { month: 'long' })} locked`);
      }
    }
  }, [companyId, vesselId, year, lockedMonths, profile?.user_id]);

  // Build crew member leave data merged with seed data
  const crewLeaveData = useMemo<CrewMemberLeave[]>(() => {
    // Use seed data as the source for the 72 crew, match with profiles if possible
    return CREW_SEED_DATA.map(seed => {
      // Try to match with existing profile
      const matchedProfile = crewProfiles.find(p => 
        p.last_name?.toLowerCase().trim() === seed.lastName.toLowerCase().trim() &&
        p.first_name?.toLowerCase().trim() === seed.firstName.toLowerCase().trim()
      );

      const userId = matchedProfile?.user_id || `seed-${seed.lastName}-${seed.firstName}`.replace(/\s/g, '-').toLowerCase();

      // Get entries for this crew member for the year
      const crewYearEntries = yearEntries.filter(e => e.crew_id === userId);
      
      // Build entries map for the month
      const crewMonthEntries = entries.filter(e => e.crew_id === userId);
      const entriesMap: Record<string, string> = {};
      crewMonthEntries.forEach(e => { entriesMap[e.date] = e.status_code; });

      // Count each status code for the year
      const counts: Record<string, number> = {};
      crewYearEntries.forEach(e => {
        counts[e.status_code] = (counts[e.status_code] || 0) + 1;
      });

      // Get carryover
      const carryoverRecord = carryovers.find(c => c.crew_id === userId);
      const carryover = carryoverRecord?.carryover_days ?? seed.carryover;

      // Balance = F + Q - L + carryover
      const balance = (counts['F'] || 0) + (counts['Q'] || 0) - (counts['L'] || 0) + carryover;

      return {
        userId,
        firstName: seed.firstName,
        lastName: seed.lastName,
        position: seed.position,
        department: seed.department,
        entries: entriesMap,
        carryover,
        counts,
        balance,
      };
    });
  }, [crewProfiles, entries, yearEntries, carryovers]);

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
  };
}

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Save,
} from 'lucide-react';
import { addMonths, format, subMonths } from 'date-fns';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/shared/hooks/use-toast';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { supabase } from '@/integrations/supabase/client';

import { useMonthlyWorkRest } from '../hooks/useMonthlyWorkRest';
import { CompliancePanel } from '../components/CompliancePanel';
import { MonthCalendar } from '../components/MonthCalendar';
import { NonConformityList } from '../components/NonConformityList';
import { SignOffPanel } from '../components/SignOffPanel';
import { AuditLogPanel } from '../components/AuditLogPanel';
import {
  exportMonthlyPDF,
  exportMonthlyCSV,
  downloadPDF,
  downloadCSV,
} from '../reports/exports';
import { useActiveRoles } from '@/modules/auth/hooks/useUserRoles';

interface CrewProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  rank?: string | null;
  department?: string | null;
  hod_user_id?: string | null;
}

interface CrewOption {
  user_id: string;
  first_name: string;
  last_name: string;
  rank?: string | null;
  department?: string | null;
}

const sb = supabase as any;

/**
 * Crew monthly Work/Rest entry & review page. Drives both:
 *  - "my own" view (crew member entering their hours)
 *  - "another crew member's" view (HoD/Captain reviewing)
 *
 * The same component is reused by both flows: the difference is purely
 * permission-based and detected at render time.
 */
const MyWorkRestMonth: React.FC = () => {
  const { user, profile, userRole } = useAuth();
  const { selectedVessel } = useVessel();
  const { toast } = useToast();
  const navigate = useNavigate();
  const params = useParams<{ crewId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const targetCrewId = params.crewId || user?.id || '';
  const isOwner = !params.crewId || params.crewId === user?.id;

  const [crewProfile, setCrewProfile] = useState<CrewProfile | null>(null);
  const [crewList, setCrewList] = useState<CrewOption[]>([]);

  const yearParam = Number(searchParams.get('year')) || new Date().getFullYear();
  const monthParam = Number(searchParams.get('month')) || new Date().getMonth() + 1;

  const setMonth = (y: number, m: number) => {
    setSearchParams({ year: String(y), month: String(m) });
  };

  // Load crew profile (rank, department, etc.)
  useEffect(() => {
    if (!targetCrewId) return;
    sb.from('profiles')
      .select('user_id, first_name, last_name, rank, department, hod_user_id')
      .eq('user_id', targetCrewId)
      .maybeSingle()
      .then(({ data }: any) => setCrewProfile(data));
  }, [targetCrewId]);

  // Determine vessel: if reviewing someone else, use the active assignment.
  const [vesselId, setVesselId] = useState<string | null>(selectedVessel?.id ?? null);
  useEffect(() => {
    if (selectedVessel?.id && isOwner) {
      setVesselId(selectedVessel.id);
      return;
    }
    if (!targetCrewId) return;
    sb.from('crew_assignments')
      .select('vessel_id, is_current')
      .eq('user_id', targetCrewId)
      .eq('is_current', true)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.vessel_id) setVesselId(data.vessel_id);
      });
  }, [targetCrewId, selectedVessel?.id, isOwner]);

  // Roles for permissions
  const { roles } = useActiveRoles();
  const actorRoles: string[] = useMemo(() => {
    const set = new Set<string>();
    (roles || []).forEach((r: string) => set.add(r));
    if (userRole) set.add(userRole);
    return Array.from(set);
  }, [roles, userRole]);

  const canSelectOtherCrew = useMemo(
    () =>
      actorRoles.some((r) =>
        ['superadmin', 'dpa', 'captain', 'master', 'hod', 'purser', 'fleet_master'].includes(
          (r || '').toLowerCase()
        )
      ),
    [actorRoles]
  );

  // Load selectable crew (current vessel's crew assignments)
  useEffect(() => {
    if (!canSelectOtherCrew || !vesselId) {
      setCrewList([]);
      return;
    }
    sb.from('crew_assignments')
      .select('user_id, profiles:profiles!crew_assignments_user_id_fkey(user_id, first_name, last_name, rank, department)')
      .eq('vessel_id', vesselId)
      .eq('is_current', true)
      .then(({ data }: any) => {
        const list: CrewOption[] = (data || [])
          .map((row: any) => row.profiles)
          .filter((p: any) => p && p.user_id)
          .sort((a: CrewOption, b: CrewOption) =>
            `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
          );
        // Ensure current user is in the list
        if (user?.id && !list.find((p) => p.user_id === user.id) && profile) {
          list.unshift({
            user_id: user.id,
            first_name: (profile as any).first_name ?? 'Me',
            last_name: (profile as any).last_name ?? '',
            rank: (profile as any).rank ?? null,
            department: (profile as any).department ?? null,
          });
        }
        setCrewList(list);
      });
  }, [canSelectOtherCrew, vesselId, user?.id, profile]);

  const handleCrewChange = (newCrewId: string) => {
    const params = new URLSearchParams();
    params.set('year', String(yearParam));
    params.set('month', String(monthParam));
    if (newCrewId === user?.id) {
      navigate(`/crew/work-rest?${params.toString()}`);
    } else {
      navigate(`/crew/work-rest/${newCrewId}?${params.toString()}`);
    }
  };

  const wr = useMonthlyWorkRest({
    crewId: targetCrewId,
    vesselId: vesselId || '',
    year: yearParam,
    month: monthParam,
    actorId: user?.id || '',
    actorRole: userRole ?? null,
  });

  const handlePrev = () => {
    const d = subMonths(new Date(yearParam, monthParam - 1, 1), 1);
    setMonth(d.getFullYear(), d.getMonth() + 1);
  };
  const handleNext = () => {
    const d = addMonths(new Date(yearParam, monthParam - 1, 1), 1);
    setMonth(d.getFullYear(), d.getMonth() + 1);
  };

  const handleSave = async () => {
    try {
      await wr.save();
      toast({ title: 'Saved' });
    } catch (e) {
      toast({
        title: 'Save failed',
        description: (e as Error).message,
        variant: 'destructive',
      });
    }
  };

  const exportPDF = () => {
    if (!crewProfile || !selectedVessel) return;
    const doc = exportMonthlyPDF({
      crew: crewProfile,
      vessel: { name: selectedVessel.name, imo_number: (selectedVessel as any).imo_number, flag: (selectedVessel as any).flag },
      year: yearParam,
      month: monthParam,
      records: wr.records,
      compliance: wr.compliance,
      ruleSet: wr.ruleSet,
      signatures: wr.signatures,
    });
    downloadPDF(doc, `wr-${crewProfile.last_name}-${yearParam}-${String(monthParam).padStart(2,'0')}.pdf`);
  };

  const exportCSV = () => {
    if (!crewProfile || !selectedVessel) return;
    const csv = exportMonthlyCSV({
      crew: crewProfile,
      vessel: { name: selectedVessel.name },
      year: yearParam,
      month: monthParam,
      records: wr.records,
      compliance: wr.compliance,
      ruleSet: wr.ruleSet,
      signatures: wr.signatures,
    });
    downloadCSV(csv, `wr-${crewProfile.last_name}-${yearParam}-${String(monthParam).padStart(2,'0')}.csv`);
  };

  const canEdit =
    !wr.isLocked &&
    (isOwner ||
      actorRoles.some((r) =>
        ['superadmin', 'dpa', 'captain', 'purser', 'hod'].includes(r)
      ));

  const canReviewNCs =
    actorRoles.some((r) =>
      ['superadmin', 'dpa', 'captain', 'hod', 'purser'].includes(r)
    ) || isOwner;

  if (!user || !targetCrewId) {
    return (
      <DashboardLayout>
        <div className="p-6">No user.</div>
      </DashboardLayout>
    );
  }

  if (!vesselId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No vessel selected. Pick a vessel from the top bar to start logging hours.
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Hours of Work & Rest</h1>
            <p className="text-sm text-muted-foreground">
              {crewProfile
                ? `${crewProfile.first_name} ${crewProfile.last_name}${crewProfile.rank ? ' · ' + crewProfile.rank : ''}${crewProfile.department ? ' · ' + crewProfile.department : ''}`
                : 'Loading crew…'}
              {wr.submission && (
                <Badge variant="outline" className="ml-2 uppercase">
                  {wr.submission.status.replace('_', ' ')}
                </Badge>
              )}
              {wr.isLocked && (
                <Badge variant="outline" className="ml-1 bg-muted">
                  Locked
                </Badge>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canSelectOtherCrew && crewList.length > 0 && (
              <Select value={targetCrewId} onValueChange={handleCrewChange}>
                <SelectTrigger className="h-9 w-[220px]">
                  <SelectValue placeholder="Select crew member" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {crewList.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.last_name}, {c.first_name}
                      {c.rank ? ` · ${c.rank}` : ''}
                      {c.user_id === user?.id ? ' (me)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium min-w-[10ch] text-center">
              {format(new Date(yearParam, monthParam - 1, 1), 'MMM yyyy')}
            </span>
            <Button variant="outline" size="sm" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSave}
              disabled={wr.saving || !canEdit}
              size="sm"
            >
              {wr.saving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF}>
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </div>

        {wr.loading ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-10">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading hours…
            </CardContent>
          </Card>
        ) : (
          <>
            <CompliancePanel compliance={wr.compliance} ruleSet={wr.ruleSet} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <MonthCalendar
                  year={yearParam}
                  month={monthParam}
                  records={wr.records}
                  compliance={wr.compliance}
                  disabled={!canEdit}
                  onChangeDay={(date, blocks, notes) =>
                    wr.setDayBlocks(date, blocks, notes)
                  }
                />
              </div>
              <div className="space-y-4">
                {wr.submission && (
                  <SignOffPanel
                    submission={wr.submission}
                    signatures={wr.signatures}
                    ncOpenCount={wr.nonConformities.filter((n) => n.status === 'open').length}
                    isCompliant={wr.compliance.is_compliant}
                    actorId={user.id}
                    actorRoles={actorRoles as any}
                    isOwner={isOwner}
                    onChange={() => wr.refresh()}
                  />
                )}
                <NonConformityList
                  ncs={wr.nonConformities}
                  onRefresh={() => wr.refresh()}
                  canReview={canReviewNCs}
                  actorId={user.id}
                  actorRole={userRole ?? null}
                />
                {wr.submission && <AuditLogPanel submissionId={wr.submission.id} />}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MyWorkRestMonth;

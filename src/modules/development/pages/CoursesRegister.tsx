import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, X, GraduationCap } from 'lucide-react';
import { format, isAfter, isBefore, parseISO } from 'date-fns';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Tone } from '@/components/ui/tones';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { CATEGORY_CONFIG, APPLICATION_STATUS_CONFIG, type DevCategory, type ApplicationStatus } from '@/modules/development/constants';
import ApplicationDetailModal from '@/modules/development/components/ApplicationDetailModal';
import { DataTable, showingSummary, type DataTableColumn, type DataTableFilter } from '@/shared/components/data';
import { StatusPill } from '@/shared/components/status';

type Phase = 'upcoming' | 'current' | 'completed' | 'unscheduled';

const PHASE_CONFIG: Record<Phase, { label: string; tone: Tone }> = {
  upcoming: { label: 'Upcoming', tone: 'info' },
  current: { label: 'Current', tone: 'signal' },
  completed: { label: 'Completed', tone: 'ok' },
  unscheduled: { label: 'Unscheduled', tone: 'neutral' },
};

const PHASES = Object.keys(PHASE_CONFIG) as Phase[];

async function fetchCoursesRegister(companyId: string) {
  const { data, error } = await supabase
    .from('development_applications')
    .select(`
      *,
      crew_member:profiles!development_applications_crew_member_id_fkey(first_name, last_name, email, department),
      vessel:vessels!development_applications_vessel_id_fkey(name)
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

type ApplicationRow = Awaited<ReturnType<typeof fetchCoursesRegister>>[number];
type RegisterRow = ApplicationRow & { _phase: Phase };

function derivePhase(row: Pick<ApplicationRow, 'status' | 'course_start_date' | 'course_end_date'>): Phase {
  if (row.status === 'completed') return 'completed';
  const start = row.course_start_date ? parseISO(row.course_start_date) : null;
  const end = row.course_end_date ? parseISO(row.course_end_date) : start;
  const now = new Date();
  if (!start) return 'unscheduled';
  if (isAfter(start, now)) return 'upcoming';
  if (end && isBefore(end, now)) return 'completed';
  return 'current';
}

const crewName = (r: ApplicationRow) =>
  r.crew_member ? `${r.crew_member.first_name || ''} ${r.crew_member.last_name || ''}`.trim() : '';

const formatDate = (value: string | null) => (value ? format(parseISO(value), 'dd MMM yyyy') : null);

const NOUN = { one: 'course', other: 'courses' };

const PHASE_FILTERS: DataTableFilter<RegisterRow>[] = PHASES.map((phase) => ({
  id: phase,
  label: PHASE_CONFIG[phase].label,
  predicate: (r) => r._phase === phase,
}));

const COLUMNS: DataTableColumn<RegisterRow>[] = [
  {
    id: 'application',
    header: 'App #',
    value: (r) => r.application_number,
    kind: 'reference',
    sortable: false,
    className: 'whitespace-nowrap',
  },
  {
    id: 'crew',
    header: 'Crew',
    value: (r) => crewName(r).toLowerCase(),
    emptyReason: 'No crew member linked',
    className: 'whitespace-nowrap',
    cell: (r) =>
      r.crew_member ? (
        <>
          {crewName(r)}
          {r.crew_member.department ? <div className="text-xs text-muted-foreground">{r.crew_member.department}</div> : null}
        </>
      ) : null,
  },
  {
    id: 'vessel',
    header: 'Vessel',
    value: (r) => r.vessel?.name,
    sortable: false,
    emptyReason: 'No vessel linked',
    className: 'whitespace-nowrap text-sm',
  },
  {
    id: 'course',
    header: 'Course',
    value: (r) => (r.course_name || '').toLowerCase(),
    className: 'max-w-[260px] font-medium',
    cell: (r) => (
      <div className="truncate" title={r.course_name}>
        {r.course_name}
      </div>
    ),
  },
  {
    id: 'provider',
    header: 'Provider',
    value: (r) => r.course_provider,
    sortable: false,
    emptyReason: 'No provider given',
    className: 'whitespace-nowrap text-sm',
  },
  {
    id: 'category',
    header: 'Category',
    sortable: false,
    searchable: false,
    cell: (r) => {
      const cat = CATEGORY_CONFIG[r.category as DevCategory];
      return cat ? (
        <Badge variant="outline" className={`${cat.bgClass} ${cat.textClass} border-0 text-xs`}>
          {cat.label}
        </Badge>
      ) : null;
    },
  },
  {
    id: 'phase',
    header: 'Phase',
    value: (r) => r._phase,
    searchable: false,
    cell: (r) => <StatusPill tone={PHASE_CONFIG[r._phase].tone} label={PHASE_CONFIG[r._phase].label} />,
  },
  {
    id: 'status',
    header: 'Status',
    value: (r) => r.status,
    searchable: false,
    cell: (r) => (
      <StatusPill
        domain="training_application"
        status={r.status}
        label={APPLICATION_STATUS_CONFIG[r.status as ApplicationStatus]?.label}
      />
    ),
  },
  {
    id: 'start',
    header: 'Start',
    value: (r) => r.course_start_date,
    kind: 'date',
    searchable: false,
    emptyReason: 'Not scheduled',
    cell: (r) => formatDate(r.course_start_date),
  },
  {
    id: 'end',
    header: 'End',
    value: (r) => r.course_end_date,
    kind: 'date',
    searchable: false,
    emptyReason: 'Not scheduled',
    cell: (r) => formatDate(r.course_end_date),
  },
  {
    id: 'cost',
    header: 'Cost (USD)',
    value: (r) => r.estimated_total_usd,
    kind: 'number',
    searchable: false,
    emptyReason: 'No estimate',
    className: 'whitespace-nowrap',
    cell: (r) => (r.estimated_total_usd != null ? `$${Number(r.estimated_total_usd).toLocaleString()}` : null),
  },
];

function exportCsv(rows: readonly RegisterRow[]) {
  const headers = ['Application #','Crew','Department','Vessel','Course','Provider','Category','Status','Phase','Start','End','Estimated Cost (USD)','Created'];
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach((r) => {
    lines.push([
      r.application_number,
      crewName(r),
      r.crew_member?.department || '',
      r.vessel?.name || '',
      r.course_name,
      r.course_provider || '',
      CATEGORY_CONFIG[r.category as DevCategory]?.label || r.category,
      APPLICATION_STATUS_CONFIG[r.status as ApplicationStatus]?.label || r.status,
      PHASE_CONFIG[r._phase]?.label || r._phase,
      r.course_start_date || '',
      r.course_end_date || '',
      r.estimated_total_usd ?? '',
      r.created_at ? format(parseISO(r.created_at), 'yyyy-MM-dd') : '',
    ].map(escape).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `courses-register-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CoursesRegister() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const { data: rows = [], isLoading, error, refetch } = useQuery({
    queryKey: ['courses-register', companyId],
    enabled: !!companyId,
    queryFn: () => fetchCoursesRegister(companyId!),
  });

  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [vessel, setVessel] = useState<string>('all');
  const [department, setDepartment] = useState<string>('all');
  const [selectedApp, setSelectedApp] = useState<RegisterRow | null>(null);

  const enriched = useMemo<RegisterRow[]>(
    () => rows.map((r) => ({ ...r, _phase: derivePhase(r) })),
    [rows]
  );

  const vessels = useMemo(() => {
    const s = new Set<string>();
    enriched.forEach((r) => r.vessel?.name && s.add(r.vessel.name));
    return Array.from(s).sort();
  }, [enriched]);

  const departments = useMemo(() => {
    const s = new Set<string>();
    enriched.forEach((r) => r.crew_member?.department && s.add(r.crew_member.department));
    return Array.from(s).sort();
  }, [enriched]);

  // Page-level filters; the phase chips, search and sort live in the table.
  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (category !== 'all' && r.category !== category) return false;
      if (status !== 'all' && r.status !== status) return false;
      if (vessel !== 'all' && r.vessel?.name !== vessel) return false;
      if (department !== 'all' && r.crew_member?.department !== department) return false;
      return true;
    });
  }, [enriched, category, status, vessel, department]);

  const pageFiltersActive = [category, status, vessel, department].some((v) => v !== 'all');

  const clearFilters = () => {
    setSearch(''); setPhase(null); setCategory('all'); setStatus('all'); setVessel('all'); setDepartment('all');
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="h-6 w-6" /> Courses Register
            </h1>
            <p className="text-muted-foreground text-sm">
              All completed, current and upcoming courses across the fleet
            </p>
          </div>
        </div>

        <DataTable<RegisterRow>
          label="Courses register"
          noun={NOUN}
          data={filtered}
          columns={COLUMNS}
          getRowId={(r) => r.id}
          rowLabel={(r) => `${r.application_number} ${r.course_name}`}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          empty={{
            title: 'No course applications yet',
            body: 'Applications appear here once crew apply for a course.',
            icon: GraduationCap,
          }}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search course, crew, provider, #..."
          searchText={(r) => [r.course_name, r.application_number, r.course_provider, crewName(r)].filter(Boolean).join(' ')}
          filters={PHASE_FILTERS}
          allLabel="All phases"
          activeFilter={phase}
          onActiveFilterChange={setPhase}
          defaultSort={{ columnId: 'start', direction: 'desc' }}
          hasExternalFilters={pageFiltersActive}
          onClearFilters={clearFilters}
          summary={({ shown }) => showingSummary(shown, rows.length, NOUN)}
          onRowClick={setSelectedApp}
          rowActions={(r) => (
            <Button variant="ghost" size="sm" onClick={() => setSelectedApp(r)} aria-label={`View application ${r.application_number}`}>
              <Eye className="h-3.5 w-3.5" />
            </Button>
          )}
          toolbar={
            <>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full sm:w-40" aria-label="Category"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(Object.keys(CATEGORY_CONFIG) as DevCategory[]).map(k => (
                    <SelectItem key={k} value={k}>{CATEGORY_CONFIG[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full sm:w-40" aria-label="Status"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {(Object.keys(APPLICATION_STATUS_CONFIG) as ApplicationStatus[]).map(k => (
                    <SelectItem key={k} value={k}>{APPLICATION_STATUS_CONFIG[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={vessel} onValueChange={setVessel}>
                <SelectTrigger className="w-full sm:w-40" aria-label="Vessel"><SelectValue placeholder="Vessel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vessels</SelectItem>
                  {vessels.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="w-full sm:w-40" aria-label="Department"><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 self-start sm:self-auto">
                <X className="h-3 w-3 mr-1" /> Clear filters
              </Button>
            </>
          }
          toolbarEnd={({ rows: shown }) => (
            <Button variant="outline" size="sm" onClick={() => exportCsv(shown)} disabled={!shown.length}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          )}
        />

        <div className="text-xs text-muted-foreground">
          Looking for the course library?{' '}
          <Link to="/development/catalogue" className="underline">Open the Course Catalogue</Link>.
        </div>
      </div>

      <ApplicationDetailModal
        open={!!selectedApp}
        onOpenChange={(open) => !open && setSelectedApp(null)}
        application={selectedApp}
      />
    </DashboardLayout>
  );
}

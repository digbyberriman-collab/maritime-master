import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, Search, X, ArrowUpDown, GraduationCap } from 'lucide-react';
import { format, isAfter, isBefore, parseISO } from 'date-fns';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { CATEGORY_CONFIG, APPLICATION_STATUS_CONFIG, type DevCategory, type ApplicationStatus } from '@/modules/development/constants';
import ApplicationDetailModal from '@/modules/development/components/ApplicationDetailModal';

type Phase = 'upcoming' | 'current' | 'completed' | 'unscheduled';

const PHASE_CONFIG: Record<Phase, { label: string; className: string }> = {
  upcoming: { label: 'Upcoming', className: 'bg-info/10 text-info border-info/30' },
  current: { label: 'Current', className: 'bg-amber/10 text-amber border-amber/30' },
  completed: { label: 'Completed', className: 'bg-success/10 text-success border-success/30' },
  unscheduled: { label: 'Unscheduled', className: 'bg-muted text-muted-foreground border-border' },
};

function derivePhase(row: any): Phase {
  if (row.status === 'completed') return 'completed';
  const start = row.course_start_date ? parseISO(row.course_start_date) : null;
  const end = row.course_end_date ? parseISO(row.course_end_date) : start;
  const now = new Date();
  if (!start) return 'unscheduled';
  if (isAfter(start, now)) return 'upcoming';
  if (end && isBefore(end, now)) return 'completed';
  return 'current';
}

type SortKey = 'crew' | 'course' | 'start' | 'end' | 'status' | 'phase' | 'cost' | 'created';

export default function CoursesRegister() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['courses-register', companyId],
    enabled: !!companyId,
    queryFn: async () => {
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
      return data || [];
    },
  });

  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [vessel, setVessel] = useState<string>('all');
  const [department, setDepartment] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('start');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedApp, setSelectedApp] = useState<any>(null);

  const enriched = useMemo(
    () => rows.map((r: any) => ({ ...r, _phase: derivePhase(r) })),
    [rows]
  );

  const vessels = useMemo(() => {
    const s = new Set<string>();
    enriched.forEach((r: any) => r.vessel?.name && s.add(r.vessel.name));
    return Array.from(s).sort();
  }, [enriched]);

  const departments = useMemo(() => {
    const s = new Set<string>();
    enriched.forEach((r: any) => r.crew_member?.department && s.add(r.crew_member.department));
    return Array.from(s).sort();
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((r: any) => {
      if (phase !== 'all' && r._phase !== phase) return false;
      if (category !== 'all' && r.category !== category) return false;
      if (status !== 'all' && r.status !== status) return false;
      if (vessel !== 'all' && r.vessel?.name !== vessel) return false;
      if (department !== 'all' && r.crew_member?.department !== department) return false;
      if (!q) return true;
      const crewName = `${r.crew_member?.first_name || ''} ${r.crew_member?.last_name || ''}`.toLowerCase();
      return (
        r.course_name?.toLowerCase().includes(q) ||
        r.application_number?.toLowerCase().includes(q) ||
        r.course_provider?.toLowerCase().includes(q) ||
        crewName.includes(q)
      );
    });
  }, [enriched, search, phase, category, status, vessel, department]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a: any, b: any) => {
      const get = (r: any): any => {
        switch (sortKey) {
          case 'crew': return `${r.crew_member?.first_name || ''} ${r.crew_member?.last_name || ''}`.toLowerCase();
          case 'course': return (r.course_name || '').toLowerCase();
          case 'start': return r.course_start_date || '';
          case 'end': return r.course_end_date || '';
          case 'status': return r.status || '';
          case 'phase': return r._phase || '';
          case 'cost': return r.estimated_total_usd ?? -1;
          case 'created': return r.created_at || '';
        }
      };
      const av = get(a); const bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const exportCsv = () => {
    const headers = ['Application #','Crew','Department','Vessel','Course','Provider','Category','Status','Phase','Start','End','Estimated Cost (USD)','Created'];
    const escape = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    sorted.forEach((r: any) => {
      lines.push([
        r.application_number,
        `${r.crew_member?.first_name || ''} ${r.crew_member?.last_name || ''}`.trim(),
        r.crew_member?.department || '',
        r.vessel?.name || '',
        r.course_name,
        r.course_provider || '',
        CATEGORY_CONFIG[r.category as DevCategory]?.label || r.category,
        APPLICATION_STATUS_CONFIG[r.status as ApplicationStatus]?.label || r.status,
        PHASE_CONFIG[r._phase as Phase]?.label || r._phase,
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
  };

  const clearFilters = () => {
    setSearch(''); setPhase('all'); setCategory('all'); setStatus('all'); setVessel('all'); setDepartment('all');
  };

  const SortBtn = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:text-foreground transition-colors">
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? 'text-foreground' : 'text-muted-foreground/50'}`} />
    </button>
  );

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
          <Button variant="outline" onClick={exportCsv} disabled={!sorted.length}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search course, crew, provider, #..."
                  className="pl-8"
                />
              </div>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger><SelectValue placeholder="Phase" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All phases</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="current">Current</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="unscheduled">Unscheduled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(Object.keys(CATEGORY_CONFIG) as DevCategory[]).map(k => (
                    <SelectItem key={k} value={k}>{CATEGORY_CONFIG[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {(Object.keys(APPLICATION_STATUS_CONFIG) as ApplicationStatus[]).map(k => (
                    <SelectItem key={k} value={k}>{APPLICATION_STATUS_CONFIG[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={vessel} onValueChange={setVessel}>
                <SelectTrigger><SelectValue placeholder="Vessel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vessels</SelectItem>
                  {vessels.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{sorted.length} of {rows.length} course{rows.length !== 1 ? 's' : ''}</span>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7">
                <X className="h-3 w-3 mr-1" /> Clear filters
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center min-h-[200px]">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No courses match your filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">App #</TableHead>
                      <TableHead><SortBtn k="crew">Crew</SortBtn></TableHead>
                      <TableHead>Vessel</TableHead>
                      <TableHead><SortBtn k="course">Course</SortBtn></TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead><SortBtn k="phase">Phase</SortBtn></TableHead>
                      <TableHead><SortBtn k="status">Status</SortBtn></TableHead>
                      <TableHead><SortBtn k="start">Start</SortBtn></TableHead>
                      <TableHead><SortBtn k="end">End</SortBtn></TableHead>
                      <TableHead className="text-right"><SortBtn k="cost">Cost (USD)</SortBtn></TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((r: any) => {
                      const cat = CATEGORY_CONFIG[r.category as DevCategory];
                      const st = APPLICATION_STATUS_CONFIG[r.status as ApplicationStatus];
                      const ph = PHASE_CONFIG[r._phase as Phase];
                      return (
                        <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedApp(r)}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{r.application_number}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {r.crew_member ? `${r.crew_member.first_name || ''} ${r.crew_member.last_name || ''}`.trim() : '—'}
                            {r.crew_member?.department && (
                              <div className="text-xs text-muted-foreground">{r.crew_member.department}</div>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{r.vessel?.name || '—'}</TableCell>
                          <TableCell className="font-medium max-w-[260px]">
                            <div className="truncate" title={r.course_name}>{r.course_name}</div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{r.course_provider || '—'}</TableCell>
                          <TableCell>
                            {cat && (
                              <Badge variant="outline" className={`${cat.bgClass} ${cat.textClass} border-0 text-xs`}>
                                {cat.label}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {ph && <Badge variant="outline" className={`text-xs ${ph.className}`}>{ph.label}</Badge>}
                          </TableCell>
                          <TableCell>
                            {st && <Badge variant="outline" className={`text-xs ${st.color}`}>{st.label}</Badge>}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {r.course_start_date ? format(parseISO(r.course_start_date), 'dd MMM yyyy') : '—'}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {r.course_end_date ? format(parseISO(r.course_end_date), 'dd MMM yyyy') : '—'}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {r.estimated_total_usd != null ? `$${Number(r.estimated_total_usd).toLocaleString()}` : '—'}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedApp(r); }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

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
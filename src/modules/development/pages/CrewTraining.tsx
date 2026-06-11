import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, GraduationCap, ChevronDown, ChevronRight, History, ShieldX, Calendar } from 'lucide-react';
import { format, isAfter, isBefore, parseISO, startOfMonth } from 'date-fns';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import {
  CATEGORY_CONFIG,
  APPLICATION_STATUS_CONFIG,
  type DevCategory,
  type ApplicationStatus,
} from '@/modules/development/constants';
import ApplicationDetailModal from '@/modules/development/components/ApplicationDetailModal';

type Phase = 'upcoming' | 'current' | 'completed' | 'unscheduled';

const PHASE_CONFIG: Record<Phase, { label: string; className: string }> = {
  upcoming: { label: 'Upcoming', className: 'bg-info/10 text-info border-info/30' },
  current: { label: 'In Progress', className: 'bg-amber/10 text-amber border-amber/30' },
  completed: { label: 'Completed', className: 'bg-success/10 text-success border-success/30' },
  unscheduled: { label: 'Unscheduled', className: 'bg-muted text-muted-foreground border-border' },
};

const ALLOWED_ROLES = [
  'DPA',
  'Captain',
  'Master',
  'Fleet Manager',
  'Fleet Master',
  'HOD',
  'Head of Department',
  'Purser',
  'Shore Management',
  'superadmin',
];

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

function monthKey(row: any): string {
  const d = row.course_start_date ? parseISO(row.course_start_date) : null;
  if (!d) return 'unscheduled';
  return format(startOfMonth(d), 'yyyy-MM');
}

function monthLabel(key: string): string {
  if (key === 'unscheduled') return 'Unscheduled';
  const [y, m] = key.split('-').map(Number);
  return format(new Date(y, m - 1, 1), 'MMMM yyyy');
}

function crewName(p: any): string {
  if (!p) return 'Unknown';
  return `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Unknown';
}

export default function CrewTraining() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const { hasRole, isInitialized, isLoading: permsLoading } = usePermissionsStore();

  const hasAccess = ALLOWED_ROLES.some((r) => hasRole(r));

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['crew-training-all', companyId],
    enabled: !!companyId && hasAccess,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('development_applications')
        .select(`
          *,
          crew_member:profiles!development_applications_crew_member_id_fkey(user_id, first_name, last_name, email, department),
          vessel:vessels!development_applications_vessel_id_fkey(name)
        `)
        .eq('company_id', companyId)
        .order('course_start_date', { ascending: false, nullsFirst: false });
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
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const enriched = useMemo(
    () => rows.map((r: any) => ({ ...r, _phase: derivePhase(r), _month: monthKey(r) })),
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
      return (
        r.course_name?.toLowerCase().includes(q) ||
        r.application_number?.toLowerCase().includes(q) ||
        r.course_provider?.toLowerCase().includes(q) ||
        crewName(r.crew_member).toLowerCase().includes(q)
      );
    });
  }, [enriched, search, phase, category, status, vessel, department]);

  // Group by month. "unscheduled" goes last; future months first (desc by key), then past months descending too.
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    filtered.forEach((r: any) => {
      const k = r._month;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    const keys = Array.from(map.keys());
    const dated = keys.filter((k) => k !== 'unscheduled').sort((a, b) => (a < b ? 1 : -1));
    const ordered = [...dated];
    if (map.has('unscheduled')) ordered.push('unscheduled');
    return ordered.map((k) => ({ key: k, label: monthLabel(k), items: map.get(k)! }));
  }, [filtered]);

  const historyApps = useMemo(() => {
    if (!historyFor) return [];
    return enriched
      .filter((r: any) => r.crew_member?.user_id === historyFor)
      .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
  }, [enriched, historyFor]);

  const historyCrew = useMemo(() => {
    if (!historyFor) return null;
    return enriched.find((r: any) => r.crew_member?.user_id === historyFor)?.crew_member;
  }, [enriched, historyFor]);

  const clearFilters = () => {
    setSearch(''); setPhase('all'); setCategory('all'); setStatus('all'); setVessel('all'); setDepartment('all');
  };

  // Loading / access states
  if (!isInitialized || permsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!hasAccess) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldX className="h-12 w-12 text-destructive mb-3" />
            <h2 className="text-lg font-semibold mb-1">Access Restricted</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              The Crew Training view is available to DPAs, Captains, HODs, Pursers and Shore Management.
              Contact your administrator if you need access.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="h-6 w-6" /> Crew Training
            </h1>
            <p className="text-muted-foreground text-sm">
              Monthly view of all crew training across the fleet
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/development/courses-register">
              <Calendar className="h-4 w-4 mr-2" /> Open Register
            </Link>
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
                  placeholder="Search crew, course, provider..."
                  className="pl-8"
                />
              </div>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger><SelectValue placeholder="Phase" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All phases</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="current">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="unscheduled">Unscheduled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(Object.keys(CATEGORY_CONFIG) as DevCategory[]).map((k) => (
                    <SelectItem key={k} value={k}>{CATEGORY_CONFIG[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {(Object.keys(APPLICATION_STATUS_CONFIG) as ApplicationStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>{APPLICATION_STATUS_CONFIG[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={vessel} onValueChange={setVessel}>
                <SelectTrigger><SelectValue placeholder="Vessel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vessels</SelectItem>
                  {vessels.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {filtered.length} of {rows.length} application{rows.length !== 1 ? 's' : ''} · {grouped.length} month{grouped.length !== 1 ? 's' : ''}
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7">
                <X className="h-3 w-3 mr-1" /> Clear filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : grouped.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              No training records match your filters.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {grouped.map((g) => {
              const isCollapsed = !!collapsed[g.key];
              return (
                <Card key={g.key}>
                  <button
                    type="button"
                    onClick={() => setCollapsed((s) => ({ ...s, [g.key]: !s[g.key] }))}
                    className="w-full flex items-center justify-between px-4 py-3 border-b hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <h3 className="font-semibold">{g.label}</h3>
                      <Badge variant="outline" className="text-xs">{g.items.length}</Badge>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <CardContent className="p-0 divide-y">
                      {g.items.map((r: any) => {
                        const cat = CATEGORY_CONFIG[r.category as DevCategory];
                        const st = APPLICATION_STATUS_CONFIG[r.status as ApplicationStatus];
                        const ph = PHASE_CONFIG[r._phase as Phase];
                        const crewId = r.crew_member?.user_id;
                        return (
                          <div key={r.id} className="p-3 sm:p-4 hover:bg-muted/20 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => crewId && setHistoryFor(crewId)}
                                    className="font-medium text-sm hover:underline text-left"
                                  >
                                    {crewName(r.crew_member)}
                                  </button>
                                  {r.crew_member?.department && (
                                    <span className="text-xs text-muted-foreground">· {r.crew_member.department}</span>
                                  )}
                                  {r.vessel?.name && (
                                    <span className="text-xs text-muted-foreground">· {r.vessel.name}</span>
                                  )}
                                </div>
                                <div className="mt-1 font-medium truncate" title={r.course_name}>
                                  {r.course_name}
                                </div>
                                <div className="mt-1 flex items-center gap-2 flex-wrap">
                                  {cat && (
                                    <Badge variant="outline" className={`${cat.bgClass} ${cat.textClass} border-0 text-xs`}>
                                      {cat.label}
                                    </Badge>
                                  )}
                                  {ph && <Badge variant="outline" className={`text-xs ${ph.className}`}>{ph.label}</Badge>}
                                  {st && <Badge variant="outline" className={`text-xs ${st.color}`}>{st.label}</Badge>}
                                  <span className="text-xs text-muted-foreground font-mono">{r.application_number}</span>
                                </div>
                              </div>
                              <div className="flex flex-col items-start sm:items-end gap-1 text-xs text-muted-foreground whitespace-nowrap">
                                <span>
                                  {r.course_start_date ? format(parseISO(r.course_start_date), 'dd MMM') : '—'}
                                  {r.course_end_date ? ` → ${format(parseISO(r.course_end_date), 'dd MMM yyyy')}` : ''}
                                </span>
                                {r.estimated_total_usd != null && (
                                  <span className="font-medium text-foreground">
                                    ${Number(r.estimated_total_usd).toLocaleString()}
                                  </span>
                                )}
                                <div className="flex gap-1 mt-1">
                                  {crewId && (
                                    <Button variant="ghost" size="sm" onClick={() => setHistoryFor(crewId)}>
                                      <History className="h-3.5 w-3.5 mr-1" /> History
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="sm" onClick={() => setSelectedApp(r)}>
                                    View
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* History side panel (inline modal-card via fixed overlay) */}
      {historyFor && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex justify-end"
          onClick={() => setHistoryFor(null)}
        >
          <div
            className="w-full max-w-md bg-card border-l h-full overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-card z-10">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <History className="h-4 w-4" /> Training History
                </h2>
                <p className="text-xs text-muted-foreground">
                  {crewName(historyCrew)}{historyCrew?.department ? ` · ${historyCrew.department}` : ''}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setHistoryFor(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-3 space-y-2">
              {historyApps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No training history</p>
              ) : historyApps.map((r: any) => {
                const cat = CATEGORY_CONFIG[r.category as DevCategory];
                const st = APPLICATION_STATUS_CONFIG[r.status as ApplicationStatus];
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setSelectedApp(r); setHistoryFor(null); }}
                    className="w-full text-left p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm">{r.course_name}</div>
                      {r.estimated_total_usd != null && (
                        <span className="text-xs font-medium whitespace-nowrap">
                          ${Number(r.estimated_total_usd).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {cat && (
                        <Badge variant="outline" className={`${cat.bgClass} ${cat.textClass} border-0 text-xs`}>
                          {cat.label}
                        </Badge>
                      )}
                      {st && <Badge variant="outline" className={`text-xs ${st.color}`}>{st.label}</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.course_start_date ? format(parseISO(r.course_start_date), 'dd MMM yyyy') : 'Unscheduled'}
                      {r.vessel?.name ? ` · ${r.vessel.name}` : ''}
                      <span className="font-mono ml-2">{r.application_number}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <ApplicationDetailModal
        open={!!selectedApp}
        onOpenChange={(open) => !open && setSelectedApp(null)}
        application={selectedApp}
      />
    </DashboardLayout>
  );
}
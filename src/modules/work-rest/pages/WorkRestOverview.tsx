import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  Download,
  ChevronLeft,
  ChevronRight,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { listVesselMonthMatrix, type VesselMonthCrewRow } from '../services/workRestService';
import { cn } from '@/lib/utils';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DEPT_ORDER = ['DECK', 'BRIDGE', 'ENGINEERING', 'INTERIOR', 'OTHER'];

const WorkRestOverview: React.FC = () => {
  const { selectedVessel } = useVessel();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = new Date();
  const year = Number(searchParams.get('year')) || today.getFullYear();
  const month = Number(searchParams.get('month')) || today.getMonth() + 1;

  const [rows, setRows] = useState<VesselMonthCrewRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedVessel?.id) return;
    setLoading(true);
    listVesselMonthMatrix({ vesselId: selectedVessel.id, year, month })
      .then(setRows)
      .finally(() => setLoading(false));
  }, [selectedVessel?.id, year, month]);

  const lastDay = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const days = useMemo(() => Array.from({ length: lastDay }, (_, i) => i + 1), [lastDay]);

  const grouped = useMemo(() => {
    const map = new Map<string, VesselMonthCrewRow[]>();
    for (const r of rows) {
      const k = r.department || 'OTHER';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    const ordered: [string, VesselMonthCrewRow[]][] = [];
    for (const d of DEPT_ORDER) if (map.has(d)) ordered.push([d, map.get(d)!]);
    for (const [k, v] of map) if (!DEPT_ORDER.includes(k)) ordered.push([k, v]);
    return ordered;
  }, [rows]);

  const stats = useMemo(() => {
    const total = rows.length;
    const compliant = rows.filter((r) => r.status === 'compliant').length;
    const review = rows.filter((r) => r.status === 'review' || r.status === 'no_data').length;
    const nonCompliant = rows.filter((r) => r.status === 'non_compliant').length;
    return { total, compliant, review, nonCompliant };
  }, [rows]);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set(k, v);
    else next.delete(k);
    setSearchParams(next);
  };

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    const next = new URLSearchParams(searchParams);
    next.set('year', String(y));
    next.set('month', String(m));
    setSearchParams(next);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Hours of Rest"
          description={`${selectedVessel?.name ?? 'No vessel selected'} — Monthly compliance report`}
          actions={
            <>
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-1.5" /> Summary PDF
              </Button>
              <Button variant="outline" size="sm">
                <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Summary Excel
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1.5" /> Export All Crew (PDF)
              </Button>
            </>
          }
        />

        {/* Month nav */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={String(month)} onValueChange={(v) => setParam('month', v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((n, i) => (
                <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setParam('year', v)}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm text-muted-foreground">
            {MONTH_NAMES[month - 1]} {year}
          </span>
        </div>

        <StatGrid>
          <StatCard label="TOTAL CREW" value={stats.total} icon={<Users className="h-4 w-4 text-muted-foreground" />} />
          <StatCard
            label="COMPLIANT"
            value={stats.compliant}
            hint={stats.total ? `${Math.round((stats.compliant / stats.total) * 100)}% of crew` : undefined}
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            tone="success"
          />
          <StatCard label="REQUIRES REVIEW" value={stats.review} icon={<AlertTriangle className="h-4 w-4 text-warning" />} tone="warning" />
          <StatCard label="NON-COMPLIANT" value={stats.nonCompliant} icon={<XCircle className="h-4 w-4 text-destructive" />} tone="danger" />
        </StatGrid>

        <p className="text-xs text-muted-foreground">
          Click any crew member to view their individual monthly timesheet
        </p>

        {/* Matrix */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-6 flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No crew assigned to this vessel.
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/40 border-b">
                    <th className="text-left px-3 py-2 sticky left-0 bg-muted/40 z-10 min-w-[180px]">Crew Member</th>
                    <th className="text-left px-2 py-2 min-w-[100px]">Compliance</th>
                    {days.map((d) => (
                      <th key={d} className="px-1 py-2 text-center font-medium text-muted-foreground min-w-[28px]">{d}</th>
                    ))}
                    <th className="text-right px-2 py-2 min-w-[64px]">Avg Rest</th>
                    <th className="text-right px-2 py-2 min-w-[60px]">Logged</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([dept, deptRows]) => (
                    <React.Fragment key={dept}>
                      <tr className="bg-muted/20 border-b">
                        <td colSpan={days.length + 4} className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground">
                          {dept}
                        </td>
                      </tr>
                      {deptRows.map((r) => (
                        <tr key={r.crew_id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2 sticky left-0 bg-card z-10">
                            <Link to={`/crew/work-rest/${r.crew_id}?year=${year}&month=${month}`} className="block">
                              <div className="font-medium text-foreground hover:text-primary">{r.crew_name}</div>
                              <div className="text-[10px] text-muted-foreground">{r.rank}</div>
                            </Link>
                          </td>
                          <td className="px-2 py-2">
                            <StatusBadge status={r.status} />
                          </td>
                          {days.map((d) => {
                            const hours = r.rest_by_day[d];
                            const compliant = r.compliant_by_day[d];
                            return (
                              <td key={d} className="p-0.5 text-center">
                                <DayCell hours={hours} compliant={compliant} />
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-right tabular-nums font-medium">
                            {r.avg_rest != null ? `${r.avg_rest.toFixed(1)}h` : '—'}
                          </td>
                          <td className={cn('px-2 py-2 text-right tabular-nums font-medium',
                            r.logged_pct >= 80 ? 'text-success' : r.logged_pct >= 40 ? 'text-warning' : 'text-muted-foreground'
                          )}>
                            {r.logged_pct}%
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

const StatusBadge: React.FC<{ status: VesselMonthCrewRow['status'] }> = ({ status }) => {
  if (status === 'compliant') return <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15">Compliant</Badge>;
  if (status === 'non_compliant') return <Badge className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/15">Non-compliant</Badge>;
  if (status === 'review') return <Badge className="bg-warning/15 text-warning border-warning/30 hover:bg-warning/15">Review</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">No data</Badge>;
};

const DayCell: React.FC<{ hours: number | null; compliant: boolean | null }> = ({ hours, compliant }) => {
  if (hours == null) {
    return <span className="block text-muted-foreground/50 text-[11px]">—</span>;
  }
  const formatted = hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1);
  if (compliant === false) {
    return (
      <span className="inline-flex items-center justify-center min-w-[26px] h-6 rounded bg-destructive text-destructive-foreground text-[11px] font-semibold tabular-nums">
        {formatted}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center min-w-[26px] h-6 text-foreground text-[11px] tabular-nums">
      {formatted}
    </span>
  );
};

export default WorkRestOverview;

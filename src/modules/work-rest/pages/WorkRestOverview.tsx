import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Filter,
  Loader2,
  Download,
  ExternalLink,
} from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { listVesselSubmissions } from '../services/workRestService';
import { downloadCSV, exportDepartmentCSV } from '../reports/exports';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface Row {
  submission_id: string | null;
  crew_id: string;
  crew_name: string;
  rank: string;
  department: string;
  total_work: number;
  total_rest: number;
  open_ncs: number;
  status: string;
  is_compliant: boolean;
  crew_signed: boolean;
  hod_signed: boolean;
}

const WorkRestOverview: React.FC = () => {
  const { selectedVessel } = useVessel();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = new Date();
  const year = Number(searchParams.get('year')) || today.getFullYear();
  const month = Number(searchParams.get('month')) || today.getMonth() + 1;
  const dept = searchParams.get('department') || '';
  const statusFilter = searchParams.get('status') || '';
  const search = searchParams.get('q') || '';

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedVessel?.id) return;
    setLoading(true);
    listVesselSubmissions({
      vesselId: selectedVessel.id,
      year,
      month,
      department: dept || null,
    })
      .then((data) => {
        const mapped: Row[] = data.map((d: any) => ({
          submission_id: d.id,
          crew_id: d.crew_id,
          crew_name: `${d.profiles?.first_name ?? ''} ${d.profiles?.last_name ?? ''}`.trim(),
          rank: d.profiles?.rank ?? '',
          department: d.profiles?.department ?? '',
          total_work: Number(d.total_work_hours ?? 0),
          total_rest: Number(d.total_rest_hours ?? 0),
          open_ncs: Number(d.open_non_conformities ?? 0),
          status: d.status,
          is_compliant: !!d.is_compliant,
          crew_signed: !!d.crew_signed_at,
          hod_signed: !!d.hod_signed_at,
        }));
        setRows(mapped);
      })
      .finally(() => setLoading(false));
  }, [selectedVessel?.id, year, month, dept]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (search && !r.crew_name.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [rows, statusFilter, search]);

  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department).filter(Boolean))),
    [rows]
  );

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set(k, v);
    else next.delete(k);
    setSearchParams(next);
  };

  const exportCSV = () => {
    const csv = exportDepartmentCSV(filtered);
    downloadCSV(csv, `wr-overview-${selectedVessel?.name ?? 'vessel'}-${year}-${String(month).padStart(2,'0')}.csv`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Hours of Work & Rest — Overview</h1>
            <p className="text-sm text-muted-foreground">
              {selectedVessel?.name ?? 'No vessel selected'} · {MONTH_NAMES[month - 1]} {year}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Year</label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setParam('year', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Month</label>
              <Select value={String(month)} onValueChange={(v) => setParam('month', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((n, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Department</label>
              <Select value={dept || 'all'} onValueChange={(v) => setParam('department', v === 'all' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={statusFilter || 'all'} onValueChange={(v) => setParam('status', v === 'all' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {['draft','submitted','crew_signed','hod_reviewed','hod_signed','captain_reviewed','locked','reopened'].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace('_',' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Search crew</label>
              <Input
                value={search}
                onChange={(e) => setParam('q', e.target.value)}
                placeholder="Name…"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-6 flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No submissions for this period yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr>
                    <th className="text-left p-2">Crew</th>
                    <th className="text-left p-2">Rank</th>
                    <th className="text-left p-2">Dept</th>
                    <th className="text-right p-2">Work (h)</th>
                    <th className="text-right p-2">Rest (h)</th>
                    <th className="text-center p-2">Crew sig</th>
                    <th className="text-center p-2">HoD sig</th>
                    <th className="text-right p-2">Open NCs</th>
                    <th className="text-left p-2">Status</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.crew_id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-medium">{r.crew_name}</td>
                      <td className="p-2 text-muted-foreground">{r.rank}</td>
                      <td className="p-2 text-muted-foreground">{r.department}</td>
                      <td className="p-2 text-right tabular-nums">{r.total_work.toFixed(1)}</td>
                      <td className="p-2 text-right tabular-nums">{r.total_rest.toFixed(1)}</td>
                      <td className="p-2 text-center">
                        {r.crew_signed ? '✓' : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2 text-center">
                        {r.hod_signed ? '✓' : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2 text-right">
                        {r.open_ncs > 0 ? (
                          <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                            {r.open_ncs}
                          </Badge>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="p-2">
                        <ComplianceBadge row={r} />
                      </td>
                      <td className="p-2 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            to={`/crew/work-rest/${r.crew_id}?year=${year}&month=${month}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Legend className="bg-success/15 text-success">Compliant</Legend>
          <Legend className="bg-warning/15 text-warning">Warnings</Legend>
          <Legend className="bg-destructive/15 text-destructive">Non-compliant</Legend>
          <Legend className="bg-muted">Incomplete</Legend>
        </div>
      </div>
    </DashboardLayout>
  );
};

const ComplianceBadge: React.FC<{ row: Row }> = ({ row }) => {
  if (row.status === 'draft') return <Badge variant="outline">Incomplete</Badge>;
  if (row.open_ncs > 0)
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/40">
        Non-compliant · {row.status.replace('_', ' ')}
      </Badge>
    );
  if (row.is_compliant)
    return (
      <Badge className="bg-success/15 text-success border-success/40">
        Compliant · {row.status.replace('_', ' ')}
      </Badge>
    );
  return (
    <Badge className="bg-warning/15 text-warning border-warning/40">
      {row.status.replace('_', ' ')}
    </Badge>
  );
};

const Legend: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => (
  <span className={`px-2 py-0.5 rounded ${className ?? ''}`}>{children}</span>
);

export default WorkRestOverview;

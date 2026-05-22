import React, { useMemo, useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, AlertCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

type Status = 'completed' | 'scheduled' | 'overdue' | 'na';

interface DrillRow {
  name: string;
  frequency: string;
  months: Status[]; // length 12
}

interface DrillGroup {
  category: string;
  rows: DrillRow[];
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const GROUPS: DrillGroup[] = [
  {
    category: 'SOLAS (Mandatory)',
    rows: [
      { name: 'Abandon Ship', frequency: 'Monthly', months: ['completed','completed','completed','completed','completed','scheduled','scheduled','na','na','na','na','na'] },
      { name: 'Fire Drill', frequency: 'Monthly', months: ['completed','completed','completed','overdue','scheduled','scheduled','na','na','na','na','na','na'] },
      { name: 'Man Overboard', frequency: 'Monthly', months: ['completed','completed','completed','completed','completed','scheduled','na','na','na','na','na','na'] },
      { name: 'Steering Failure', frequency: 'Quarterly', months: ['completed','na','na','completed','na','scheduled','na','na','na','na','na','na'] },
      { name: 'Enclosed Space Entry & Rescue', frequency: '2-Monthly', months: ['completed','na','completed','na','scheduled','na','na','na','na','na','na','na'] },
    ],
  },
  {
    category: 'Operational',
    rows: [
      { name: 'Oil Spill Response', frequency: 'Quarterly', months: ['completed','na','na','scheduled','na','na','na','na','na','na','na','na'] },
      { name: 'Black-out / Loss of Power', frequency: 'Quarterly', months: ['completed','na','na','overdue','na','na','na','na','na','na','na','na'] },
      { name: 'Helicopter Operations', frequency: 'Annual', months: ['na','na','completed','na','na','na','na','na','na','na','na','na'] },
      { name: 'Tender Launch & Recovery', frequency: 'Monthly', months: ['completed','completed','completed','completed','completed','scheduled','na','na','na','na','na','na'] },
    ],
  },
  {
    category: 'Security & Medical',
    rows: [
      { name: 'Security (ISPS) Drill', frequency: 'Quarterly', months: ['completed','na','na','scheduled','na','na','na','na','na','na','na','na'] },
      { name: 'Piracy / Anti-Boarding', frequency: 'Bi-annual', months: ['na','completed','na','na','na','scheduled','na','na','na','na','na','na'] },
      { name: 'Medical Emergency', frequency: 'Quarterly', months: ['completed','na','na','completed','na','scheduled','na','na','na','na','na','na'] },
    ],
  },
];

const STATUS_STYLES: Record<Status, string> = {
  completed: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
  scheduled: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  overdue: 'bg-destructive/20 text-destructive border-destructive/40',
  na: 'bg-muted text-muted-foreground border-border',
};

const DrillsAnnualGrid: React.FC = () => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [selected, setSelected] = useState<{ drill: string; month: string; status: Status } | null>(null);

  const stats = useMemo(() => {
    const all = GROUPS.flatMap(g => g.rows.flatMap(r => r.months));
    return {
      total: all.filter(s => s !== 'na').length,
      completed: all.filter(s => s === 'completed').length,
      scheduled: all.filter(s => s === 'scheduled').length,
      overdue: all.filter(s => s === 'overdue').length,
    };
  }, []);

  const compliance = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Drills — Annual Calendar"
          description="SOLAS, operational and security drills by month"
          actions={
            <>
              <Button variant="outline" size="icon" onClick={() => setYear(y => y - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="px-4 py-2 rounded-md bg-card border border-border font-semibold min-w-[80px] text-center">{year}</div>
              <Button variant="outline" size="icon" onClick={() => setYear(y => y + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          }
        />

        <StatGrid>
          <StatCard label="Annual Compliance" value={`${compliance}%`} icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} />
          <StatCard label="Completed" value={stats.completed} icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} />
          <StatCard label="Scheduled" value={stats.scheduled} icon={<Circle className="w-4 h-4 text-sky-500" />} />
          <StatCard label="Overdue" value={stats.overdue} icon={<AlertCircle className="w-4 h-4 text-destructive" />} tone={stats.overdue ? 'danger' : 'default'} />
        </StatGrid>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Annual Drill Matrix</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium w-[260px] border-b border-border">Drill Type</th>
                    <th className="text-left p-3 font-medium w-[110px] border-b border-border">Frequency</th>
                    {MONTHS.map(m => (
                      <th key={m} className="text-center p-2 font-medium w-[68px] border-b border-border">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map(group => (
                    <React.Fragment key={group.category}>
                      <tr className="bg-muted/20">
                        <td colSpan={14} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.category}
                        </td>
                      </tr>
                      {group.rows.map(row => (
                        <tr key={row.name} className="border-b border-border hover:bg-muted/20">
                          <td className="p-3 font-medium">{row.name}</td>
                          <td className="p-3 text-muted-foreground text-xs">{row.frequency}</td>
                          {row.months.map((s, i) => (
                            <td key={i} className="p-1 text-center">
                              <button
                                onClick={() => setSelected({ drill: row.name, month: MONTHS[i], status: s })}
                                className={cn(
                                  'inline-flex items-center justify-center w-9 h-9 rounded-md border text-xs font-semibold transition hover:scale-110',
                                  STATUS_STYLES[s]
                                )}
                                aria-label={`${row.name} ${MONTHS[i]} ${s}`}
                              >
                                {s === 'completed' && '✓'}
                                {s === 'scheduled' && '◷'}
                                {s === 'overdue' && '!'}
                                {s === 'na' && '—'}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <Legend color="bg-emerald-500/20 border-emerald-500/40" label="Completed" />
          <Legend color="bg-sky-500/15 border-sky-500/30" label="Scheduled" />
          <Legend color="bg-destructive/20 border-destructive/40" label="Overdue" />
          <Legend color="bg-muted border-border" label="Not Required" />
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {selected?.drill} — {selected?.month} {year}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn('capitalize', selected && STATUS_STYLES[selected.status])}>
                {selected?.status === 'na' ? 'Not Required' : selected?.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Drill Date</Label>
                <Input type="date" />
              </div>
              <div>
                <Label>Conducted By</Label>
                <Input placeholder="Master / Officer name" />
              </div>
              <div>
                <Label>Duration (minutes)</Label>
                <Input type="number" placeholder="45" />
              </div>
              <div>
                <Label>Participants</Label>
                <Input type="number" placeholder="12" />
              </div>
            </div>
            <div>
              <Label>Outcome</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="Select outcome" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="satisfactory">Satisfactory</SelectItem>
                  <SelectItem value="needs-improvement">Needs Improvement</SelectItem>
                  <SelectItem value="unsatisfactory">Unsatisfactory — Re-run required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observations & Lessons Learned</Label>
              <Textarea rows={3} placeholder="Note any issues, equipment failures, or training gaps..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button onClick={() => setSelected(null)}>Mark Completed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div className="flex items-center gap-1.5">
    <span className={cn('w-4 h-4 rounded border', color)} />
    <span>{label}</span>
  </div>
);

export default DrillsAnnualGrid;
import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatMinor } from '@/modules/hris/lib/format';
import type { PayGradeRow } from '@/modules/hris/lib/compensation';

interface PayGradesTableProps {
  grades: PayGradeRow[];
  isLoading?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  busy?: boolean;
  onCreate: () => void;
  onEdit: (grade: PayGradeRow) => void;
  onToggleActive: (grade: PayGradeRow, isActive: boolean) => void;
  onDelete: (grade: PayGradeRow) => void;
}

/** All pay grades with an inline active toggle. */
export const PayGradesTable: React.FC<PayGradesTableProps> = ({ grades, isLoading, canEdit, canDelete, busy, onCreate, onEdit, onToggleActive, onDelete }) => {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [showInactive, setShowInactive] = useState(true);

  const departments = useMemo(() => Array.from(new Set(grades.map((g) => g.department ?? 'Any'))).sort(), [grades]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return grades.filter((g) => {
      if (!showInactive && !g.is_active) return false;
      if (department !== 'all' && (g.department ?? 'Any') !== department) return false;
      if (q && ![g.code, g.name, g.department, g.rank].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [grades, search, department, showInactive]);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Pay grades</CardTitle>
            <CardDescription>Standard bands by department and rank. New packages can apply a grade's defaults.</CardDescription>
          </div>
          {canEdit && (
            <Button onClick={onCreate} disabled={busy}>
              <Plus className="mr-2 h-4 w-4" /> New pay grade
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2 pt-2 md:flex-row md:items-center">
          <div className="relative md:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search code, name, rank…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Show inactive
          </label>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
        ) : rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">{grades.length === 0 ? 'No pay grades yet.' : 'No pay grades match these filters.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead className="text-right">Level / step</TableHead>
                  <TableHead className="text-right">Monthly base</TableHead>
                  <TableHead className="text-right">Daily rate</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Active</TableHead>
                  {canEdit && <TableHead className="w-[1%]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((g) => (
                  <TableRow key={g.id} className={g.is_active ? undefined : 'opacity-60'}>
                    <TableCell className="font-mono font-medium">{g.code}</TableCell>
                    <TableCell>{g.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{g.department ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{g.rank ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{g.grade_level} / {g.step}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatMinor(g.monthly_base_minor, g.currency)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {g.daily_rate_minor === null ? '—' : formatMinor(g.daily_rate_minor, g.currency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{g.gratuity_points}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(g.effective_from)}{g.effective_to ? ` → ${formatDate(g.effective_to)}` : ''}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={g.is_active}
                        disabled={!canEdit || busy}
                        onCheckedChange={(v) => onToggleActive(g, v)}
                        aria-label={`${g.code} active`}
                      />
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit" onClick={() => onEdit(g)} disabled={busy}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {canDelete && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Delete" onClick={() => onDelete(g)} disabled={busy}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PayGradesTable;

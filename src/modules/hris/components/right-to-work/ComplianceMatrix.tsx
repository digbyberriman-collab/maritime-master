import React, { useState } from 'react';
import { BellRing, ChevronRight, Download, Loader2, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import {
  COMPLIANCE_LABELS,
  COMPLIANCE_ORDER,
  MATRIX_COLUMNS,
  MATRIX_COLUMN_LABELS,
  matrixToCsv,
  type MatrixColumn,
  type MatrixFilters,
  type MatrixRow,
} from '@/modules/hris/lib/rightToWork';
import { CellChip, StatusChip } from './StatusChip';

interface ComplianceMatrixProps {
  rows: MatrixRow[];
  departments: string[];
  isLoading: boolean;
  filters: MatrixFilters;
  onFiltersChange: (next: MatrixFilters) => void;
  onSelectCrew: (profileId: string) => void;
  canRefreshAlerts: boolean;
  refreshingAlerts?: boolean;
  onRefreshAlerts: () => void;
}

const downloadCsv = (rows: MatrixRow[]) => {
  const blob = new Blob([matrixToCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `right-to-work-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Crew × document matrix with tone chips, filters, CSV export and alert refresh. */
export const ComplianceMatrix: React.FC<ComplianceMatrixProps> = ({ rows, departments, isLoading, filters, onFiltersChange, onSelectCrew, canRefreshAlerts, refreshingAlerts, onRefreshAlerts }) => {
  const { vessels } = useCompanyVessels();
  const [columnsOpen, setColumnsOpen] = useState(false);
  const patch = (next: Partial<MatrixFilters>) => onFiltersChange({ ...filters, ...next });
  const toggleColumn = (c: MatrixColumn, on: boolean) => {
    const next = on ? [...filters.columns, c] : filters.columns.filter((x) => x !== c);
    patch({ columns: next.length ? next : [c] });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={filters.search} onChange={(e) => patch({ search: e.target.value })} placeholder="Search crew, vessel, nationality…" className="pl-8" />
        </div>
        <Select value={filters.vesselId} onValueChange={(v) => patch({ vesselId: v })}>
          <SelectTrigger className="lg:w-[160px]"><SelectValue placeholder="Vessel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vessels</SelectItem>
            {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.department} onValueChange={(v) => patch({ department: v })}>
          <SelectTrigger className="lg:w-[160px]"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => patch({ status: v as MatrixFilters['status'] })}>
          <SelectTrigger className="lg:w-[190px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {COMPLIANCE_ORDER.map((s) => <SelectItem key={s} value={s}>{COMPLIANCE_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.withinDays === null ? 'all' : String(filters.withinDays)} onValueChange={(v) => patch({ withinDays: v === 'all' ? null : Number(v) })}>
          <SelectTrigger className="lg:w-[170px]"><SelectValue placeholder="Due within" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any due date</SelectItem>
            <SelectItem value="0">Expired only</SelectItem>
            <SelectItem value="30">Due within 30 days</SelectItem>
            <SelectItem value="90">Due within 90 days</SelectItem>
            <SelectItem value="180">Due within 180 days</SelectItem>
          </SelectContent>
        </Select>
        <DropdownMenu open={columnsOpen} onOpenChange={setColumnsOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="lg:w-[150px]">Columns ({filters.columns.length})</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Counts towards status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {MATRIX_COLUMNS.map((c) => (
              <DropdownMenuCheckboxItem key={c} checked={filters.columns.includes(c)} onCheckedChange={(v) => toggleColumn(c, Boolean(v))} onSelect={(e) => e.preventDefault()}>
                {MATRIX_COLUMN_LABELS[c]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{isLoading ? 'Loading…' : `${rows.length} crew · sorted worst first`}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => downloadCsv(rows)} disabled={isLoading || rows.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          {canRefreshAlerts && (
            <Button size="sm" variant="outline" className="gap-1" onClick={onRefreshAlerts} disabled={refreshingAlerts}>
              {refreshingAlerts ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Refresh alerts
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Crew</TableHead>
              <TableHead>Vessel</TableHead>
              <TableHead>Overall</TableHead>
              {MATRIX_COLUMNS.map((c) => (
                <TableHead key={c} className="text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <Checkbox checked={filters.columns.includes(c)} onCheckedChange={(v) => toggleColumn(c, Boolean(v))} aria-label={`Include ${MATRIX_COLUMN_LABELS[c]} in status`} className="h-3.5 w-3.5" />
                    {MATRIX_COLUMN_LABELS[c]}
                  </span>
                </TableHead>
              ))}
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 9 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  <ShieldCheck className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  No crew match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.profileId} className="cursor-pointer" onClick={() => onSelectCrew(r.profileId)}>
                  <TableCell>
                    <div className="font-medium text-foreground">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{[r.rank, r.nationality].filter(Boolean).join(' · ') || '—'}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.vesselName ?? '—'}</TableCell>
                  <TableCell><StatusChip status={r.overall} /></TableCell>
                  {MATRIX_COLUMNS.map((c) => (
                    <TableCell key={c} className="text-center"><CellChip cell={r.cells[c]} /></TableCell>
                  ))}
                  <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ComplianceMatrix;

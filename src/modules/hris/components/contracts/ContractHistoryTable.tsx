import React from 'react';
import { Download, History, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatMinor, humanise } from '@/modules/hris/lib/format';
import type { CrewContract } from '@/modules/hris/hooks/useCrewContracts';
import { ContractStatusBadge } from './ContractStatusBadge';

interface ContractHistoryTableProps {
  contracts: CrewContract[];
  showWage: boolean;
  canEdit: boolean;
  canAdmin: boolean;
  onEdit: (contract: CrewContract) => void;
  onDelete: (contract: CrewContract) => void;
  onDownload: (contract: CrewContract) => void;
}

/** Previous, draft and superseded contracts for the selected crew member. */
export const ContractHistoryTable: React.FC<ContractHistoryTableProps> = ({
  contracts,
  showWage,
  canEdit,
  canAdmin,
  onEdit,
  onDelete,
  onDownload,
}) => (
  <Card className="bg-card">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <History className="h-4 w-4 text-muted-foreground" /> Contract history
      </CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      {contracts.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">No previous contracts on record.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Vessel</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                {showWage && <TableHead className="text-right">Wage</TableHead>}
                <TableHead>Outcome</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><ContractStatusBadge contract={c} /></TableCell>
                  <TableCell className="whitespace-nowrap">{humanise(c.contract_type)}</TableCell>
                  <TableCell className="max-w-[160px] truncate">
                    <span className="block truncate">{c.contract_number ?? '—'}</span>
                    {(c.position ?? c.rank) && <span className="block truncate text-xs text-muted-foreground">{c.position ?? c.rank}</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{c.vessel_name ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(c.start_date)}</TableCell>
                  <TableCell className="whitespace-nowrap">{c.end_date ? formatDate(c.end_date) : 'Open'}</TableCell>
                  {showWage && (
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {c.base_wage_minor === null ? '—' : formatMinor(c.base_wage_minor, c.wage_currency)}
                    </TableCell>
                  )}
                  <TableCell className="max-w-[220px]">
                    {c.status === 'terminated' ? (
                      <span className="block truncate text-sm" title={c.termination_reason ?? undefined}>
                        Terminated {formatDate(c.terminated_at)}
                        {c.termination_reason ? ` · ${c.termination_reason}` : ''}
                      </span>
                    ) : c.status === 'superseded' ? (
                      <span className="text-sm text-muted-foreground">Replaced by a newer contract</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {c.document_path && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Download document" onClick={() => onDownload(c)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Edit contract" onClick={() => onEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canAdmin && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Delete contract" onClick={() => onDelete(c)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent>
  </Card>
);

export default ContractHistoryTable;

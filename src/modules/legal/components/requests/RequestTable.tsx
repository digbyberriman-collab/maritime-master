import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonChip } from '@/modules/legal/components/PersonChip';
import { PriorityBadge, RiskBadge, SlaBadge, StatusBadge } from '@/modules/legal/components/badges';
import { requestTypeLabel } from '@/modules/legal/lib/constants';
import { requestAgeDays, type LegalRequestRow } from '@/modules/legal/lib/requests';
import { LEGAL_PATHS } from '@/modules/legal/paths';

interface RequestTableProps {
  rows: LegalRequestRow[];
  isLoading?: boolean;
  showAssignee: boolean;
  emptyTitle?: string;
  emptyText?: string;
}

export const RequestTable: React.FC<RequestTableProps> = ({ rows, isLoading, showAssignee, emptyTitle = 'No requests', emptyText = 'Nothing matches the current filters.' }) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
        <Inbox className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="font-medium text-foreground">{emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[260px]">Request</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Department</TableHead>
            <TableHead className="text-right">Age</TableHead>
            <TableHead>SLA</TableHead>
            {showAssignee && <TableHead>Assignee</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.id}
              className="cursor-pointer"
              onClick={() => navigate(LEGAL_PATHS.request(r.id))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(LEGAL_PATHS.request(r.id));
              }}
              tabIndex={0}
              aria-label={`${r.reference_number ?? ''} ${r.title}`}
            >
              <TableCell>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{r.reference_number}</span>
                  <span>·</span>
                  <span>{requestTypeLabel(r.request_type)}</span>
                </div>
                <p className="font-medium text-foreground">{r.title}</p>
                {r.counterparty && <p className="text-xs text-muted-foreground">with {r.counterparty}</p>}
              </TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell>
                <PriorityBadge priority={r.priority} />
              </TableCell>
              <TableCell>
                <RiskBadge risk={r.risk_level} short />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.requester_department ?? '—'}</TableCell>
              <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{requestAgeDays(r.created_at)} d</TableCell>
              <TableCell>
                <SlaBadge row={r} />
              </TableCell>
              {showAssignee && (
                <TableCell>
                  <PersonChip userId={r.assigned_to} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default RequestTable;

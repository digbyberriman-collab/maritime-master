import React from 'react';
import { ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PersonChip } from '@/modules/legal/components/PersonChip';
import { SubmissionStatusBadge } from '@/modules/legal/components/badges';
import type { LegalSubmissionRow } from '@/modules/legal/hooks/useFormSubmissions';
import { submissionReference } from '@/modules/legal/lib/forms';

interface SubmissionsTableProps {
  rows: LegalSubmissionRow[];
  templateName: (templateId: string) => string;
  isLoading?: boolean;
  onOpen: (row: LegalSubmissionRow) => void;
  emptyText?: string;
}

export const SubmissionsTable: React.FC<SubmissionsTableProps> = ({ rows, templateName, isLoading, onOpen, emptyText = 'No submissions yet.' }) => {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
        <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[220px]">Form</TableHead>
            <TableHead>Submitted by</TableHead>
            <TableHead>Filed for</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow
              key={s.id}
              className="cursor-pointer"
              onClick={() => onOpen(s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpen(s);
              }}
              tabIndex={0}
            >
              <TableCell>
                <p className="font-medium text-foreground">{templateName(s.template_id)}</p>
                <p className="font-mono text-xs text-muted-foreground">{submissionReference(s.id)}</p>
              </TableCell>
              <TableCell>
                <PersonChip userId={s.submitted_by} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{s.submitted_for_name ?? '—'}</TableCell>
              <TableCell>
                <SubmissionStatusBadge status={s.status} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{format(new Date(s.created_at), 'd MMM yyyy, HH:mm')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default SubmissionsTable;

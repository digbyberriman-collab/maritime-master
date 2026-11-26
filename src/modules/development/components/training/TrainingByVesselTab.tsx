/**
 * Fleet › Training › By vessel (gap/02 TR2; X5-07B). One row per vessel
 * the reader reaches: applications awaiting approval, approved and not yet
 * completed, completed, and the estimated cost of the approved and
 * completed ones per currency (never converted). Each count opens the
 * applications register filtered to that vessel and stage. Applications on
 * vessels outside the reader's list (their own, on a former vessel) are
 * one "Other vessels" row. Below 768 px the table folds into cards.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Ship } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/shared/components/data';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import { EmptyState, PageError, PageLoading } from '@/shared/components/states';
import { cn } from '@/lib/utils';
import { fleetTrainingPath } from '../../paths';
import { vesselBreakdown, type RegisterVessel, type StatusGroup, type VesselTrainingRow } from './fleetTrainingModel';
import { COARSE, CurrencyLines, Notice } from './TrainingParts';
import type { ReadState, RegisterData } from './useFleetTrainingData';

export interface TrainingByVesselTabProps {
  register: ReadState<RegisterData>;
  vessels: readonly RegisterVessel[];
}

const SPEND_NOTE = 'Spend is the estimated cost of approved and completed applications, in the currency each amount was entered in. Currencies are never converted.';

function CountLink({ row, group, count }: { row: VesselTrainingRow; group: StatusGroup; count: number }) {
  if (count === 0 || !row.code) return <span className={cn('tabular-nums', count === 0 && 'text-muted-foreground')}>{count.toLocaleString('en-GB')}</span>;
  const href = fleetTrainingPath('applications', new URLSearchParams({ vessel: row.code.toLowerCase(), status: group }));
  return (
    <Link to={href} className={cn('focus-ring inline-flex items-center rounded-sm tabular-nums text-foreground underline-offset-4 hover:underline', COARSE)}>
      {count.toLocaleString('en-GB')}
    </Link>
  );
}

const COLUMNS: DataTableColumn<VesselTrainingRow>[] = [
  {
    id: 'vessel',
    header: 'Vessel',
    value: (r) => r.name,
    sticky: true,
    cell: (r) => (
      <span className="font-medium text-foreground">
        {r.name}
        {r.code ? <span className="ml-2 type-mono text-xs text-muted-foreground">{r.code}</span> : null}
      </span>
    ),
  },
  { id: 'awaiting', header: 'Awaiting approval', kind: 'number', value: (r) => r.awaiting, cell: (r) => <CountLink row={r} group="awaiting" count={r.awaiting} /> },
  { id: 'approved', header: 'Approved', kind: 'number', value: (r) => r.approved, cell: (r) => <CountLink row={r} group="approved" count={r.approved} /> },
  { id: 'completed', header: 'Completed', kind: 'number', value: (r) => r.completed, cell: (r) => <CountLink row={r} group="completed" count={r.completed} /> },
  {
    id: 'spend',
    header: 'Spend (estimated)',
    align: 'right',
    sortable: false,
    searchable: false,
    cell: (r) => <CurrencyLines totals={r.spend} className="items-end" />,
  },
];

export function TrainingByVesselTab({ register, vessels }: TrainingByVesselTabProps) {
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  if (register.status === 'loading') return <PageLoading variant="list" rows={6} label="Loading training by vessel" />;
  if (register.status === 'error') {
    return <PageError error={register.error} title="The training applications could not be loaded" onRetry={register.retry} treatMissingAsOff={false} />;
  }
  const rows = vesselBreakdown(register.rows, vessels);
  if (rows.length === 0) {
    return <EmptyState icon={Ship} title="No vessels to show" body="Training by vessel lists the vessels you can open. None are in your list yet." headingLevel={2} bordered />;
  }

  return (
    <div className="space-y-3">
      {wide ? (
        <DataTable
          label="Training by vessel"
          noun={{ one: 'vessel', other: 'vessels' }}
          data={rows}
          columns={COLUMNS}
          getRowId={(r) => r.vesselId ?? 'other'}
          searchable={false}
          defaultSort={null}
          maxHeight="none"
        />
      ) : (
        <ul className="space-y-3" aria-label="Training by vessel">
          {rows.map((r) => (
            <li key={r.vesselId ?? 'other'}>
              <Card className="space-y-3 p-4">
                <p className="font-medium text-foreground">
                  {r.name}
                  {r.code ? <span className="ml-2 type-mono text-xs text-muted-foreground">{r.code}</span> : null}
                </p>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  {(
                    [
                      ['Awaiting', 'awaiting', r.awaiting],
                      ['Approved', 'approved', r.approved],
                      ['Completed', 'completed', r.completed],
                    ] as const
                  ).map(([label, group, count]) => (
                    <div key={group}>
                      <dt className="type-caption text-muted-foreground">{label}</dt>
                      <dd>
                        <CountLink row={r} group={group} count={count} />
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="type-caption text-muted-foreground">Spend (estimated)</span>
                  <CurrencyLines totals={r.spend} className="items-end" />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Notice testId="training-spend-note">{SPEND_NOTE}</Notice>
    </div>
  );
}

/**
 * The training applications register, shared by Fleet › Training ›
 * Applications (gap/02 TR3) and the vessel's Crew Training (gap/04 C62):
 * its columns (the vessel column on the fleet page only) and the export
 * columns (CSV / Excel through the export engine, personal data, PR-13).
 * The cards it folds into below 768 px are ./RegisterCards.tsx.
 *
 * Cost is the estimate in the currency each part was entered in, never
 * converted; the status pill comes from the training_application
 * vocabulary, with who the application waits for under it.
 */
import React from 'react';
import type { DataTableColumn } from '@/shared/components/data';
import { StatusPill } from '@/shared/components/status';
import type { ExportColumn } from '@/lib/export';
import { applicationStatusLabel, type DevCategory } from '../../constants';
import { nextActor, type FinalApprovalMode } from '../../lib/applicationMachine';
import {
  amountsByCurrency,
  crewName,
  formatCourseDates,
  formatCurrencyTotals,
  formatDay,
  isClawbackActive,
  type FleetApplicationRow,
} from './fleetTrainingModel';
import { COARSE, CurrencyLines } from './TrainingParts';

export interface RegisterContext {
  /** The vessel column (fleet page); the vessel page leaves it out. */
  showVessel: boolean;
  vesselName: (vesselId: string) => string | null;
  categoryLabels: Readonly<Record<DevCategory, string>>;
  mode: FinalApprovalMode;
  today: string;
}

/** The account's word for a stored category (the stored key when it is not one of the four). */
export const categoryLabel = (ctx: RegisterContext, category: string) => ctx.categoryLabels[category as DevCategory] ?? category;

/** The status cell: the pill, who it waits for, and an active clawback's end. */
function statusCell(row: FleetApplicationRow, ctx: RegisterContext): React.ReactNode {
  const next = nextActor(row, ctx.mode);
  const clawback = isClawbackActive(row, ctx.today);
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <StatusPill domain="training_application" status={row.status} size="sm" />
      {next.kind !== 'none' ? <span className="type-caption text-muted-foreground">{next.label}</span> : null}
      {clawback && row.clawback_end_date ? (
        <span className="type-caption text-muted-foreground">Clawback until {formatDay(row.clawback_end_date)}</span>
      ) : null}
    </div>
  );
}

export function registerColumns(ctx: RegisterContext): DataTableColumn<FleetApplicationRow>[] {
  const columns: DataTableColumn<FleetApplicationRow>[] = [
    {
      id: 'crew',
      header: 'Crew member',
      sticky: true,
      value: (r) => crewName(r.crew_member).toLowerCase(),
      minWidth: 180,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground">{crewName(r.crew_member)}</p>
          {r.crew_member?.department ? <p className="type-caption text-muted-foreground">{r.crew_member.department}</p> : null}
        </div>
      ),
    },
    // The reference sits next to the person so it is never the column that scrolls out of view at narrow
    // desktop widths; lower-priority columns (Vessel, Estimated cost) are the ones that clip.
    { id: 'number', header: 'Number', kind: 'reference', value: (r) => r.application_number, sortable: false, className: 'whitespace-nowrap' },
  ];
  if (ctx.showVessel) {
    columns.push({ id: 'vessel', header: 'Vessel', value: (r) => ctx.vesselName(r.vessel_id), emptyReason: 'A vessel outside your list', className: 'whitespace-nowrap' });
  }
  columns.push(
    {
      id: 'course',
      header: 'Course',
      value: (r) => r.course_name.toLowerCase(),
      minWidth: 220,
      cell: (r) => (
        <div className="min-w-0 max-w-[18rem]">
          <p className="truncate text-foreground" title={r.course_name}>
            {r.course_name}
          </p>
          <p className="type-caption truncate text-muted-foreground">
            {[categoryLabel(ctx, r.category), r.course_provider].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    {
      id: 'dates',
      header: 'Dates',
      kind: 'date',
      value: (r) => r.course_start_date,
      sortDescFirst: true,
      emptyReason: 'Not scheduled yet',
      cell: (r) => formatCourseDates(r.course_start_date, r.course_end_date),
    },
    {
      id: 'cost',
      header: 'Estimated cost',
      align: 'right',
      sortable: false,
      searchable: false,
      cell: (r) => <CurrencyLines totals={amountsByCurrency(r)} className="items-end" />,
    },
    {
      id: 'status',
      header: 'Status',
      value: (r) => applicationStatusLabel(r.status),
      minWidth: 180,
      cell: (r) => statusCell(r, ctx),
    },
  );
  return columns;
}

/** The columns of the CSV / Excel file: the rows as shown, every amount in its own currency. */
export function registerExportColumns(ctx: RegisterContext): ExportColumn<FleetApplicationRow>[] {
  const columns: ExportColumn<FleetApplicationRow>[] = [
    { key: 'application_number', header: 'Number', value: (r) => r.application_number },
    { key: 'crew_member', header: 'Crew member', value: (r) => crewName(r.crew_member) },
    { key: 'department', header: 'Department', value: (r) => r.crew_member?.department ?? null },
  ];
  if (ctx.showVessel) columns.push({ key: 'vessel', header: 'Vessel', value: (r) => ctx.vesselName(r.vessel_id) });
  columns.push(
    { key: 'course', header: 'Course', value: (r) => r.course_name, width: 32 },
    { key: 'provider', header: 'Provider', value: (r) => r.course_provider },
    { key: 'category', header: 'Category', value: (r) => categoryLabel(ctx, r.category) },
    { key: 'start', header: 'Start', kind: 'date', value: (r) => r.course_start_date },
    { key: 'end', header: 'End', kind: 'date', value: (r) => r.course_end_date },
    { key: 'status', header: 'Status', value: (r) => applicationStatusLabel(r.status) },
    { key: 'waiting_for', header: 'Waiting for', value: (r) => nextActor(r, ctx.mode).label },
    { key: 'estimated_cost', header: 'Estimated cost (as entered)', value: (r) => formatCurrencyTotals(amountsByCurrency(r)), width: 24 },
    { key: 'clawback_until', header: 'Clawback until', kind: 'date', value: (r) => (isClawbackActive(r, ctx.today) ? r.clawback_end_date : null) },
  );
  return columns;
}

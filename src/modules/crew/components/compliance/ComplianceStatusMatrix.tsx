import React from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { MatrixGrid, type MatrixColumn, type MatrixRowColumn } from '@/shared/components/data';
import {
  STATUS_VIEW_LABEL,
  columnGroupId,
  daysFrom,
  personPosition,
  relativeDays,
  requirementCellWords,
  requirementColumnGroups,
  ratioText,
  statusFor,
  viewTab,
  type RequirementColumn,
  type StatusView,
} from '@/modules/crew/lib/complianceModel';
import { dayText } from '@/modules/crew/lib/verification';
import type { ComplianceTab } from '@/modules/crew/lib/compliance';
import { ComplianceStatusPill, RequirementCell, TabRatioCell } from './ComplianceCells';
import { explain, type ComplianceRowModel } from './statusRows';

const NOUN = { one: 'crew member', other: 'crew members' };

/** The overview's columns (gap/04 C35): Met, the four tabs (Documents with its next expiry), Status, Next expiry. */
const OVERVIEW_COLUMNS: readonly MatrixColumn[] = [
  { id: 'met', label: 'Met', title: 'Requirements met', width: 96 },
  { id: 'documents', label: 'Documents', title: 'Documents met, and the next to expire', width: 132 },
  { id: 'stcw', label: 'STCW', title: 'STCW requirements met', width: 112 },
  { id: 'qualifications', label: 'Qualifications', title: 'Qualification requirements met', width: 124 },
  { id: 'familiarisation', label: 'Familiarisation', title: 'Familiarisations completed', width: 124 },
  { id: 'status', label: 'Status', title: 'Compliance status', width: 144 },
  { id: 'next_expiry', label: 'Next expiry', title: 'The next requirement to expire', width: 140 },
];

const PLACEMENT_NOTE: Readonly<Record<ComplianceRowModel['person']['placementKind'], string | null>> = {
  assignment: null,
  planned: 'Joining',
  pending_placement: 'Pending login',
};

/** The crew column: the name (a link to the person's documents when the reader may open profiles), the position and a joining note. */
export const PersonHeader: React.FC<{ model: ComplianceRowModel; profileHref: ((profileId: string) => string) | null }> = ({ model, profileHref }) => {
  const { person } = model;
  const position = personPosition(person);
  const note = PLACEMENT_NOTE[person.placementKind];
  return (
    <div className="flex min-w-0 flex-col items-start" data-person={person.profileId}>
      {profileHref ? (
        <Link
          to={profileHref(person.profileId)}
          className="focus-ring max-w-[14rem] truncate rounded-sm font-medium text-foreground underline-offset-4 hover:underline [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:leading-[2.75rem]"
        >
          {person.displayName}
        </Link>
      ) : (
        <span className="max-w-[14rem] truncate font-medium text-foreground">{person.displayName}</span>
      )}
      <span className="max-w-[14rem] truncate type-caption font-normal text-muted-foreground">
        {[position ?? 'No position recorded', note].filter(Boolean).join(' · ')}
      </span>
    </div>
  );
};

/** The overall next expiry: the date and how far off it is. */
const NextExpiryCell: React.FC<{ day: string | null; today: string; context: string }> = ({ day, today, context }) => {
  if (!day) {
    return (
      <span className="type-caption text-muted-foreground" aria-label={`${context}: no expiry ahead`}>
        —
      </span>
    );
  }
  const rel = relativeDays(daysFrom(today, day));
  return (
    <span className="flex flex-col items-center leading-tight" aria-label={`${context}: ${dayText(day)}${rel ? `, ${rel}` : ''}`}>
      <span className="type-body-sm tabular-nums text-foreground">{dayText(day)}</span>
      {rel ? <span className="type-caption text-muted-foreground">{rel}</span> : null}
    </span>
  );
};

export interface ComplianceStatusMatrixProps {
  /** The table's accessible name ("Crew compliance, Deck"). */
  label: string;
  models: readonly ComplianceRowModel[];
  view: StatusView;
  /** The requirement columns of a tab view or the gaps view (ignored by the overview). */
  columns: readonly RequirementColumn[];
  profileHref: ((profileId: string) => string) | null;
  today: string;
  /** Rows scroll inside the card past this height (the flat list); a department group grows with its rows. */
  maxHeight?: number | string;
}

/**
 * The status matrix of one group of crew (gap/04 C35): crew down the side
 * (sticky), the overview's summary columns or the requirements of a view
 * across. Every cell is an icon and a word with the sentence behind it in a
 * tooltip. The grid scrolls inside its card; the page never scrolls
 * sideways.
 */
export const ComplianceStatusMatrix: React.FC<ComplianceStatusMatrixProps> = ({ label, models, view, columns, profileHref, today, maxHeight = '70vh' }) => {
  const tab = viewTab(view);
  const rowsByProfile = React.useMemo(() => new Map(models.map((m) => [m.person.profileId, m.rows])), [models]);

  const matrixColumns = React.useMemo<MatrixColumn[]>(() => {
    if (view === 'overview') return [...OVERVIEW_COLUMNS];
    // The title names the requirement only: it is the cells' accessible context ("Bosun, Demo, Passport"); the group header says the tab.
    return columns.map((c) => ({ id: c.rowId, label: c.label, title: c.label, group: columnGroupId(c, view), width: 112 }));
  }, [view, columns]);
  const groups = React.useMemo(() => (view === 'overview' ? undefined : requirementColumnGroups(columns, view)), [view, columns]);

  const rowColumns = React.useMemo<ReadonlyArray<MatrixRowColumn<ComplianceRowModel>>>(() => {
    if (view === 'overview') return [];
    const ratioOf = (m: ComplianceRowModel) => (tab ? m.tabs[tab] : { met: m.person.met, required: m.person.required });
    return [
      {
        id: 'ratio',
        header: tab ? STATUS_VIEW_LABEL[tab] : 'Met',
        headerLabel: tab ? `${STATUS_VIEW_LABEL[tab]} met` : 'Requirements met',
        value: (m) => {
          const r = ratioOf(m);
          return r.required === 0 ? null : r.met / r.required;
        },
        cell: (m) => {
          const r = ratioOf(m);
          return <span className="type-body-sm tabular-nums text-foreground">{ratioText(r.met, r.required)}</span>;
        },
        minWidth: 72,
      },
    ];
  }, [view, tab]);

  return (
    <MatrixGrid<ComplianceRowModel, null>
      label={label}
      noun={NOUN}
      rows={models}
      getRowId={(m) => m.person.profileId}
      rowLabel={(m) => m.person.displayName}
      renderRowHeader={(m) => <PersonHeader model={m} profileHref={profileHref} />}
      rowHeader="Crew"
      rowColumns={rowColumns}
      columns={matrixColumns}
      groups={groups}
      getValue={() => null}
      renderCell={({ label: context }, m, column) => {
        if (view === 'overview') {
          const { person } = m;
          switch (column.id) {
            case 'met':
              return (
                <span className="type-body-sm font-medium tabular-nums text-foreground" aria-label={`${context}: ${person.met} of ${person.required}`}>
                  {ratioText(person.met, person.required)}
                </span>
              );
            case 'status':
              return <ComplianceStatusPill status={person.status} required={person.required} />;
            case 'next_expiry':
              return <NextExpiryCell day={person.nextExpiry} today={today} context={context} />;
            default:
              return <TabRatioCell cell={m.tabs[column.id as ComplianceTab]} context={context} showNext={column.id === 'documents'} />;
          }
        }
        const s = statusFor(rowsByProfile, m.person.profileId, column.id);
        return <RequirementCell words={requirementCellWords(s, explain)} context={context} />;
      }}
      searchable={false}
      showDensityToggle={false}
      empty={{ title: 'No crew members to show', icon: Users }}
      maxHeight={maxHeight}
    />
  );
};

export default ComplianceStatusMatrix;

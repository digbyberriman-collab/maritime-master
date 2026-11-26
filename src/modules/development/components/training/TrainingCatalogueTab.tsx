/**
 * Fleet › Training › Catalogue (gap/02 TR7, TR8; X5-07B; D-X5-05). The one
 * training catalogue, with its rules.
 *
 * - The courses (active by default, archived on the chip), with category,
 *   department group, how long the qualification is valid, when renewal
 *   opens, who it applies to, whether it is mandatory and the
 *   qualification it grants. A proposed course says it came from a crew
 *   proposal.
 * - Training admins (`fleet.operations.fleet_training.admin`) add and edit
 *   courses (CourseEditorDialog, through `development_course_save`) and
 *   archive or restore them (`development_course_archive`).
 * - Crew proposals (TR8): the custom courses crew applied for that are not
 *   in the catalogue; "Add to catalogue" (admins) turns one into a
 *   proposed course (`development_course_promote`).
 * - D-01: while the 040600 rule columns are missing, the rule cells read
 *   "Not set up yet" and every catalogue action is disabled with that
 *   reason (the definers ship in the same file); the live course columns
 *   still show. Any other failure is PageError with Retry.
 */
import React, { useMemo, useState } from 'react';
import { BookOpen, MoreHorizontal, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CountChips, DataTable, type DataTableColumn } from '@/shared/components/data';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import { EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { cn } from '@/lib/utils';
import type { DevCategory } from '../../constants';
import { courseProposals, crewName, formatDay, plural, type FleetApplicationRow, type RegisterVessel } from './fleetTrainingModel';
import { COARSE, COARSE_ICON, NOT_SET_UP_YET, Notice } from './TrainingParts';
import { CourseEditorDialog } from './CourseEditorDialog';
import { useArchiveCourse, usePromoteProposal, type CatalogueCourse, type CatalogueData, type ReadState, type RegisterData } from './useFleetTrainingData';

export interface TrainingCatalogueTabProps {
  companyId: string | null;
  catalogue: ReadState<CatalogueData>;
  register: ReadState<RegisterData>;
  vessels: readonly RegisterVessel[];
  categoryLabels: Readonly<Record<DevCategory, string>>;
  /** fleet.operations.fleet_training.admin. */
  canAdmin: boolean;
}

type Chip = 'active' | 'archived';

const months = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'month' : 'months'}`;

function validity(c: CatalogueCourse): string {
  if (!c.rules) return NOT_SET_UP_YET;
  return c.rules.valid_for_months ? months(c.rules.valid_for_months) : 'No expiry';
}

function renewal(c: CatalogueCourse): string | null {
  if (!c.rules) return NOT_SET_UP_YET;
  return c.rules.renew_from_months != null ? `${months(c.rules.renew_from_months)} before` : null;
}

function appliesTo(c: CatalogueCourse): string {
  if (!c.rules) return NOT_SET_UP_YET;
  const parts = [...c.rules.applies_to_departments, ...c.rules.applies_to_positions];
  return parts.length ? parts.join(', ') : 'Everyone';
}

export function TrainingCatalogueTab({ companyId, catalogue, register, vessels, categoryLabels, canAdmin }: TrainingCatalogueTabProps) {
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  const [chip, setChip] = useState<Chip>('active');
  const [editing, setEditing] = useState<{ course: CatalogueCourse | null } | null>(null);
  const archive = useArchiveCourse(companyId);
  const promote = usePromoteProposal(companyId);

  const rulesSetUp = catalogue.status === 'ready' && catalogue.rulesSetUp;
  const actionReason = !rulesSetUp ? NOT_SET_UP_YET : null;
  const vesselName = useMemo(() => new Map(vessels.map((v) => [v.id, v.name] as const)), [vessels]);

  const columns = useMemo<DataTableColumn<CatalogueCourse>[]>(
    () => [
      {
        id: 'name',
        header: 'Course',
        sticky: true,
        minWidth: 220,
        value: (c) => c.name.toLowerCase(),
        cell: (c) => (
          <div className="min-w-0 max-w-[20rem]">
            <p className="truncate font-medium text-foreground" title={c.name}>
              {c.name}
            </p>
            <p className="type-caption truncate text-muted-foreground">
              {[c.department === 'All' ? 'All departments' : c.department, c.rules?.pathway].filter(Boolean).join(' · ')}
            </p>
            {c.rules?.origin === 'proposed' ? <StatusPill tone="info" label="From a crew proposal" icon={null} size="sm" className="mt-1" /> : null}
          </div>
        ),
      },
      { id: 'category', header: 'Category', value: (c) => categoryLabels[c.category as DevCategory] ?? c.category, className: 'whitespace-nowrap' },
      { id: 'valid', header: 'Valid for', value: (c) => c.rules?.valid_for_months ?? null, kind: 'number', cell: (c) => validity(c), className: 'whitespace-nowrap' },
      { id: 'renew', header: 'Renewal opens', sortable: false, cell: (c) => renewal(c), emptyReason: 'No renewal window', className: 'whitespace-nowrap' },
      { id: 'applies', header: 'Applies to', sortable: false, minWidth: 160, cell: (c) => <span className="text-sm">{appliesTo(c)}</span> },
      {
        id: 'mandatory',
        header: 'Mandatory',
        sortable: false,
        cell: (c) => (c.rules ? (c.rules.is_mandatory ? 'Yes' : 'No') : NOT_SET_UP_YET),
      },
      {
        id: 'qualification',
        header: 'Grants qualification',
        sortable: false,
        minWidth: 160,
        emptyReason: 'No qualification named',
        cell: (c) => (c.rules ? c.rules.qualification_label : NOT_SET_UP_YET),
      },
    ],
    [categoryLabels],
  );

  if (catalogue.status === 'loading') return <PageLoading variant="list" rows={8} label="Loading the course catalogue" />;
  if (catalogue.status === 'error') {
    return <PageError error={catalogue.error} title="The course catalogue could not be loaded" onRetry={catalogue.retry} treatMissingAsOff={false} />;
  }

  const active = catalogue.courses.filter((c) => c.status !== 'archived');
  const archived = catalogue.courses.filter((c) => c.status === 'archived');
  const shown = chip === 'active' ? active : archived;
  const proposals = register.status === 'ready' ? courseProposals(register.rows) : [];

  const rowMenu = (c: CatalogueCourse) =>
    canAdmin ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', COARSE_ICON)} aria-label={`Actions for ${c.name}`} data-row-action>
            <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={Boolean(actionReason)} onSelect={() => setEditing({ course: c })}>
            Edit{actionReason ? ` (${actionReason})` : ''}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={Boolean(actionReason) || archive.isPending}
            onSelect={() => archive.mutate({ courseId: c.id, archived: c.status !== 'archived' })}
          >
            {c.status === 'archived' ? 'Restore to the catalogue' : 'Archive'}
            {actionReason ? ` (${actionReason})` : ''}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <div className="space-y-6">
      <section aria-labelledby="catalogue-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="catalogue-heading" className="type-h3">
              Courses
            </h2>
            <p className="type-caption text-muted-foreground">What crew can apply for, and the rules a completion follows.</p>
          </div>
          {canAdmin ? (
            <Button
              type="button"
              size="sm"
              className={COARSE}
              onClick={() => setEditing({ course: null })}
              disabled={Boolean(actionReason)}
              title={actionReason ?? undefined}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              New course
              {actionReason ? <span className="sr-only">: {actionReason}</span> : null}
            </Button>
          ) : null}
        </div>
        {!rulesSetUp ? (
          <Notice testId="catalogue-rules-not-set-up">
            Course rules are not set up yet: validity, renewal, who a course applies to and the qualification it grants read “{NOT_SET_UP_YET}”, and the
            catalogue cannot be changed here until they are.
          </Notice>
        ) : null}
        <CountChips
          label="Show courses"
          chips={[
            { id: 'active', label: 'In the catalogue', count: active.length },
            { id: 'archived', label: 'Archived', count: archived.length },
          ]}
          activeId={chip}
          onChange={(id) => setChip(id === 'archived' ? 'archived' : 'active')}
        />
        {shown.length === 0 ? (
          <PageEmpty
            icon={BookOpen}
            title={chip === 'active' ? 'No courses in the catalogue yet' : 'No archived courses'}
            body={chip === 'active' ? 'Add the courses crew may apply for, with how long each qualification lasts.' : 'Archived courses leave the crew catalogue; their applications keep them.'}
            headingLevel={3}
            bordered
          />
        ) : wide ? (
          <DataTable
            label="Courses"
            noun={{ one: 'course', other: 'courses' }}
            data={shown}
            columns={columns}
            getRowId={(c) => c.id}
            rowActions={canAdmin ? rowMenu : undefined}
            searchPlaceholder="Search courses"
            defaultSort={{ columnId: 'name', direction: 'asc' }}
            maxHeight="none"
          />
        ) : (
          <ul className="space-y-3" aria-label="Courses">
            {shown.map((c) => (
              <li key={c.id}>
                <Card className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{c.name}</p>
                      <p className="type-caption text-muted-foreground">
                        {[categoryLabels[c.category as DevCategory] ?? c.category, c.department === 'All' ? 'All departments' : c.department].join(' · ')}
                      </p>
                    </div>
                    {rowMenu(c)}
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="type-caption text-muted-foreground">Valid for</dt>
                      <dd>{validity(c)}</dd>
                    </div>
                    <div>
                      <dt className="type-caption text-muted-foreground">Renewal opens</dt>
                      <dd>{renewal(c) ?? '–'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="type-caption text-muted-foreground">Applies to</dt>
                      <dd>{appliesTo(c)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="type-caption text-muted-foreground">Grants qualification</dt>
                      <dd>{c.rules ? c.rules.qualification_label || '–' : NOT_SET_UP_YET}</dd>
                    </div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="proposals-heading" className="space-y-3">
        <div>
          <h2 id="proposals-heading" className="type-h3">
            Crew proposals
          </h2>
          <p className="type-caption text-muted-foreground">Courses crew applied for that are not in the catalogue yet.</p>
        </div>
        {register.status === 'loading' ? (
          <PageLoading variant="list" rows={3} label="Loading the crew proposals" />
        ) : register.status === 'error' ? (
          <PageError variant="inline" error={register.error} title="The crew proposals could not be loaded" onRetry={register.retry} treatMissingAsOff={false} />
        ) : proposals.length === 0 ? (
          <EmptyState title="No proposals waiting" body="When crew apply for a course that is not in the catalogue, it shows here." headingLevel={3} bordered compact />
        ) : (
          <Card>
            <ul aria-labelledby="proposals-heading" className="divide-y divide-border">
              {proposals.map((p: FleetApplicationRow) => (
                <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{p.course_name}</p>
                    <p className="type-caption text-muted-foreground">
                      {[
                        categoryLabels[p.category as DevCategory] ?? p.category,
                        `Proposed by ${crewName(p.crew_member)}`,
                        vesselName.get(p.vessel_id),
                        formatDay(p.submitted_at),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill domain="training_application" status={p.status} size="sm" />
                    {canAdmin ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={COARSE}
                        disabled={Boolean(actionReason) || promote.isPending}
                        title={actionReason ?? undefined}
                        onClick={() => promote.mutate({ applicationId: p.id })}
                      >
                        Add to catalogue
                        {actionReason ? <span className="sr-only">: {actionReason}</span> : null}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {proposals.length > 0 ? <p className="type-caption text-muted-foreground">{plural(proposals.length, 'proposal')}</p> : null}
      </section>

      {editing ? (
        <CourseEditorDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          companyId={companyId}
          course={editing.course}
          categoryLabels={categoryLabels}
        />
      ) : null}
    </div>
  );
}

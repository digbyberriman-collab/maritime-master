/**
 * Fleet › Training › Applications (gap/02 TR3; X5-07B). The one fleet
 * register of training applications (submitted, not voided), replacing the
 * old courses register and pipeline.
 *
 * - Filters, all in the URL so a link reproduces the view: `?vessel=<code>`,
 *   `?category=<key>`, `?status=<group>` (awaiting, approved, completed,
 *   returned, rejected, cancelled), `?clawback=active`, `?q=`. A vessel
 *   code that names none of the reader's vessels says so and keeps nothing.
 * - Export: CSV or Excel of the rows as shown, through the export engine
 *   (logged first; personal data, so refused while the export log is not
 *   set up, D-X5-12). Needs `fleet.operations.fleet_training.export`.
 * - A row (a card below 768 px) opens the application; `?application=<id>`
 *   opens it from a link.
 */
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DataTable, SearchField } from '@/shared/components/data';
import { ExportMenu } from '@/shared/components/data/ExportMenu';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import { PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { runExport } from '@/lib/export';
import { cn } from '@/lib/utils';
import type { DevCategory } from '../../constants';
import type { FinalApprovalMode } from '../../lib/applicationMachine';
import { DEV_CATEGORIES } from '../../lib/settingsSchema';
import {
  EMPTY_REGISTER_FILTERS,
  STATUS_GROUPS,
  STATUS_GROUP_LABELS,
  applyRegisterFilters,
  byStartDateDesc,
  hasRegisterFilters,
  parseRegisterFilters,
  plural,
  registerFiltersToParams,
  type FleetApplicationRow,
  type RegisterFilters,
  type RegisterVessel,
} from './fleetTrainingModel';
import { registerColumns, registerExportColumns, type RegisterContext } from './registerColumns';
import { RegisterCards } from './RegisterCards';
import { COARSE, Notice } from './TrainingParts';
import type { ReadState, RegisterData } from './useFleetTrainingData';

export interface TrainingApplicationsTabProps {
  register: ReadState<RegisterData>;
  vessels: readonly RegisterVessel[];
  categoryLabels: Readonly<Record<DevCategory, string>>;
  mode: FinalApprovalMode;
  today: string;
  canExport: boolean;
  onOpen: (row: FleetApplicationRow) => void;
}

const ALL = '__all__';
const FIELD = cn('h-9 w-full sm:w-48', COARSE);

export function TrainingApplicationsTab({ register, vessels, categoryLabels, mode, today, canExport, onOpen }: TrainingApplicationsTabProps) {
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  const [params, setParams] = useSearchParams();
  const filters = parseRegisterFilters(params);
  const setFilters = (next: Partial<RegisterFilters>) =>
    setParams((current) => registerFiltersToParams({ ...parseRegisterFilters(current), ...next }, current), { replace: true });
  const clearFilters = () => setParams((current) => registerFiltersToParams(EMPTY_REGISTER_FILTERS, current), { replace: true });

  const vesselName = useMemo(() => {
    const names = new Map(vessels.map((v) => [v.id, v.name] as const));
    return (id: string) => names.get(id) ?? null;
  }, [vessels]);
  const ctx = useMemo<RegisterContext>(() => ({ showVessel: true, vesselName, categoryLabels, mode, today }), [vesselName, categoryLabels, mode, today]);
  const columns = useMemo(() => registerColumns(ctx), [ctx]);
  const unknownVessel = filters.vessel && !vessels.some((v) => v.code?.toUpperCase() === filters.vessel) ? filters.vessel : null;

  if (register.status === 'loading') return <PageLoading variant="list" rows={8} label="Loading the training applications" />;
  if (register.status === 'error') {
    return <PageError error={register.error} title="The training applications could not be loaded" onRetry={register.retry} treatMissingAsOff={false} />;
  }

  const rows = applyRegisterFilters(register.rows, filters, vessels, today);
  const filtered = hasRegisterFilters(filters);

  const exportMenu = (
    <ExportMenu
      formats={['csv', 'xlsx']}
      disabledReason={!canExport ? 'Exporting needs training export access' : rows.length === 0 ? 'Nothing to export with these filters' : null}
      onExport={(format) =>
        runExport({
          format,
          kind: 'Training applications',
          sourceKey: 'development.fleet_training_applications',
          personalData: true,
          columns: registerExportColumns(ctx),
          rows,
          params: {
            vessel: filters.vessel,
            category: filters.category,
            status: filters.status,
            clawback_active: filters.clawbackActive,
            searched: Boolean(filters.q.trim()),
          },
        })
      }
    />
  );

  const toolbar = (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filter the applications">
      <div className="space-y-1">
        <Label htmlFor="training-filter-vessel" className="type-caption text-muted-foreground">
          Vessel
        </Label>
        <Select value={filters.vessel ?? ALL} onValueChange={(v) => setFilters({ vessel: v === ALL ? null : v })}>
          <SelectTrigger id="training-filter-vessel" className={FIELD}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All vessels</SelectItem>
            {vessels
              .filter((v) => v.code)
              .map((v) => (
                <SelectItem key={v.id} value={(v.code as string).toUpperCase()}>
                  {v.name}
                </SelectItem>
              ))}
            {unknownVessel ? <SelectItem value={unknownVessel}>{unknownVessel} (not in your list)</SelectItem> : null}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="training-filter-category" className="type-caption text-muted-foreground">
          Category
        </Label>
        <Select value={filters.category ?? ALL} onValueChange={(v) => setFilters({ category: v === ALL ? null : (v as DevCategory) })}>
          <SelectTrigger id="training-filter-category" className={FIELD}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {DEV_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {categoryLabels[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="training-filter-status" className="type-caption text-muted-foreground">
          Status
        </Label>
        <Select value={filters.status ?? ALL} onValueChange={(v) => setFilters({ status: v === ALL ? null : (v as RegisterFilters['status']) })}>
          <SelectTrigger id="training-filter-status" className={FIELD}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {STATUS_GROUPS.map((g) => (
              <SelectItem key={g} value={g}>
                {STATUS_GROUP_LABELS[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={cn('flex h-9 items-center gap-2', COARSE)}>
        <Switch id="training-filter-clawback" checked={filters.clawbackActive} onCheckedChange={(on) => setFilters({ clawbackActive: on })} />
        <Label htmlFor="training-filter-clawback" className="text-sm">
          Clawback active
        </Label>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {unknownVessel ? (
        <Notice testId="training-unknown-vessel">No vessel with the code {unknownVessel} is in your list, so no application matches it.</Notice>
      ) : null}
      {register.rows.length === 0 ? (
        <PageEmpty
          icon={ClipboardList}
          title="No training applications yet"
          body="Applications appear here once crew submit them. Drafts stay with the crew member until they are submitted."
          headingLevel={2}
          bordered
        />
      ) : wide ? (
        <DataTable
          label="Training applications"
          noun={{ one: 'application', other: 'applications' }}
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          rowLabel={(r) => `${r.course_name}, ${r.application_number}`}
          onRowClick={onOpen}
          search={filters.q}
          onSearchChange={(q) => setFilters({ q })}
          searchPlaceholder="Search course, crew or number"
          toolbar={toolbar}
          toolbarEnd={() => exportMenu}
          hasExternalFilters={filtered}
          onClearFilters={clearFilters}
          defaultSort={{ columnId: 'dates', direction: 'desc' }}
          maxHeight="70vh"
        />
      ) : (
        <div className="space-y-3">
          <SearchField value={filters.q} onChange={(q) => setFilters({ q })} placeholder="Search course, crew or number" className="sm:w-full" />
          {toolbar}
          <div className="flex items-center justify-between gap-2">
            <span className="type-caption text-muted-foreground">
              {plural(rows.length, 'application')} of {register.rows.length.toLocaleString('en-GB')}
            </span>
            {exportMenu}
          </div>
          {rows.length === 0 ? (
            <PageEmpty filtered onClearFilters={clearFilters} title="No applications match these filters" headingLevel={2} bordered />
          ) : (
            <RegisterCards rows={byStartDateDesc(rows)} ctx={ctx} onOpen={onOpen} label="Training applications" />
          )}
        </div>
      )}
    </div>
  );
}

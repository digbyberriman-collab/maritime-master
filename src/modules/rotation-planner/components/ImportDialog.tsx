/**
 * The rotation planner's XLSX import (legacy lane planner; X1-13, D-181,
 * D-X1-17). Three steps in one dialog:
 *
 * 1. Choose the vessel and the workbook (React Hook Form + zod), then read
 *    it in the browser (lib/xlsxImporter).
 * 2. Review what was found: rotation blocks, vessel locations, travel
 *    records, crew records and the reader's notes.
 * 3. Import, then show what happened, section by section, from the
 *    database's own answers: every insert is checked against the rows it
 *    returned, the crew rows are staged through crew_import_stage (the
 *    browser's only write to crew_import) with one outcome per row, and the
 *    staged crew are added to the crew list by sync_crew_import_to_profiles.
 *    Nothing is reported as saved that the database did not save.
 *
 * D-01: while crew_import_stage is missing, the crew section reads
 * "Staging becomes available once the crew update is applied." and the
 * rest of the import still runs. Any other failure of a section is shown
 * with its message; the import log row (frp_import_batches) records
 * complete, partial or failed.
 */
import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, FileSpreadsheet, Info, Loader2, Upload } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import type { Json, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { StatusPill } from '@/shared/components/status';
import { errorMessage, notify } from '@/shared/lib/notify';
import { parsePlannerWorkbook, type ImportPreview } from '../lib/xlsxImporter';
import type { CrewLite, VesselLite } from '../hooks/useVesselsAndCrew';
import type { PlannerLane } from '../types';
import {
  SECTION_LABEL,
  SECTION_TONE,
  batchStatus,
  crewSections,
  crewStagingRows,
  importSourceSchema,
  insertSection,
  matchCrewUser,
  plural,
  stageReasonText,
  summariseStage,
  useCrewImportStage,
  type CrewImportResult,
  type ImportReport,
  type ImportSourceValues,
  type SectionReport,
} from '../hooks/useCrewImportStage';

const COARSE = '[@media(pointer:coarse)]:h-11';

interface Props {
  open: boolean;
  onClose: () => void;
  vessels: VesselLite[];
  crew: CrewLite[];
  lanes: PlannerLane[];
  onComplete: () => void;
}

// ---------------------------------------------------------------- the dialog

type Phase = 'choose' | 'review' | 'importing' | 'done';

const ImportDialog: React.FC<Props> = ({ open, onClose, vessels, crew, lanes, onComplete }) => {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const stage = useCrewImportStage();
  const [phase, setPhase] = useState<Phase>('choose');
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [source, setSource] = useState<{ vesselId: string; vesselName: string; fileName: string } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const form = useForm<ImportSourceValues>({
    resolver: zodResolver(importSourceSchema),
    defaultValues: { vesselId: '', file: undefined },
  });

  const reset = () => {
    setPhase('choose');
    setPreview(null);
    setSource(null);
    setReport(null);
    setFatal(null);
    form.reset({ vesselId: '', file: undefined });
  };

  const close = () => {
    if (phase === 'importing') return;
    reset();
    onClose();
  };

  const read = form.handleSubmit(async (values) => {
    const vesselName = vessels.find((v) => v.id === values.vesselId)?.name ?? '';
    setReading(true);
    try {
      const parsed = await parsePlannerWorkbook(values.file, vesselName);
      setPreview(parsed);
      setSource({ vesselId: values.vesselId, vesselName, fileName: values.file.name });
      setPhase('review');
    } catch (e) {
      form.setError('file', { message: `The file could not be read: ${errorMessage(e)}` });
    } finally {
      setReading(false);
    }
  });

  const runImport = async () => {
    if (!preview || !source) return;
    if (!user || !companyId) {
      setFatal('Your profile is not linked to a company, so nothing can be imported.');
      return;
    }
    setPhase('importing');
    setFatal(null);
    const { vesselId, vesselName, fileName } = source;
    const sections: SectionReport[] = [];

    const batch = await supabase
      .from('frp_import_batches')
      .insert({ company_id: companyId, filename: fileName, imported_by: user.id, status: 'processing' })
      .select('id')
      .single();
    if (batch.error || !batch.data) {
      setFatal(`The import could not start: ${errorMessage(batch.error, 'the import log was not created.')}`);
      setPhase('review');
      return;
    }
    const batchId = batch.data.id;

    // Lanes the file names that the vessel does not have yet.
    const laneIdByLabel = new Map<string, string>();
    for (const ln of lanes.filter((l) => l.vessel_id === vesselId)) laneIdByLabel.set(ln.lane_label.toLowerCase(), ln.id);
    const newLaneLabels = Array.from(new Set(preview.rotations.map((r) => r.laneLabel).filter(Boolean))).filter((label) => !laneIdByLabel.has(label.toLowerCase()));
    const lanePayload: TablesInsert<'frp_planner_lanes'>[] = newLaneLabels.map((label, i) => {
      const r = preview.rotations.find((x) => x.laneLabel === label);
      return { company_id: companyId, vessel_id: vesselId, lane_label: label, department: r?.department ?? null, position_title: r?.positionTitle ?? null, lane_order: laneIdByLabel.size + i };
    });
    if (lanePayload.length) {
      const lanesResult = await supabase.from('frp_planner_lanes').insert(lanePayload).select('id, lane_label');
      for (const row of lanesResult.data ?? []) laneIdByLabel.set(row.lane_label.toLowerCase(), row.id);
      sections.push(insertSection('lanes', 'New lanes', lanePayload.length, lanesResult));
    }

    const rotations: TablesInsert<'frp_rotation_assignments'>[] = preview.rotations.map((r) => ({
      company_id: companyId,
      vessel_id: vesselId,
      lane_id: laneIdByLabel.get(r.laneLabel.toLowerCase()) ?? null,
      crew_user_id: matchCrewUser(crew, r.crewName),
      crew_name_raw: r.crewName,
      start_date: r.start,
      end_date: r.end,
      label: r.crewName,
      rotation_type: r.rotationType,
      status: 'draft',
      source_import_id: batchId,
      created_by: user.id,
      updated_by: user.id,
    }));
    sections.push(insertSection('rotations', 'Rotation blocks', rotations.length,
      rotations.length ? await supabase.from('frp_rotation_assignments').insert(rotations).select('id') : null));

    const locations: TablesInsert<'frp_vessel_locations'>[] = preview.locations.map((l) => ({
      company_id: companyId,
      vessel_id: vesselId,
      start_date: l.start,
      end_date: l.end,
      location_name: l.location,
      location_status: l.status,
      source_import_id: batchId,
      created_by: user.id,
      updated_by: user.id,
    }));
    sections.push(insertSection('locations', 'Vessel locations', locations.length,
      locations.length ? await supabase.from('frp_vessel_locations').insert(locations).select('id') : null));

    const travel: TablesInsert<'frp_travel_movements'>[] = preview.travel.map((t) => ({
      company_id: companyId,
      vessel_id: vesselId,
      crew_user_id: matchCrewUser(crew, t.crewName),
      crew_name_raw: t.crewName,
      direction: t.direction,
      flight_datetime: t.flightDate ? new Date(t.flightDate).toISOString() : null,
      flight_number: t.flightNumber ?? null,
      changeover_date: t.changeoverDate ?? null,
      accommodation: t.accommodation ?? null,
      route: t.route ?? null,
      flight_supplier: t.supplier ?? null,
      transfer_details: t.transfer ?? null,
      source_import_id: batchId,
      created_by: user.id,
      updated_by: user.id,
    }));
    sections.push(insertSection('travel', 'Travel records', travel.length,
      travel.length ? await supabase.from('frp_travel_movements').insert(travel).select('id') : null));

    // Crew Data: staged for the company (crew_import_stage), then added to the crew list.
    let crewResult: CrewImportResult | null = null;
    let crewError: unknown = null;
    if (preview.crew.length) {
      try {
        crewResult = await stage.mutateAsync({ companyId, rows: crewStagingRows(vesselId, vesselName, preview.crew) });
      } catch (e) {
        crewError = e;
      }
    }
    sections.push(...crewSections(crewResult, crewError, preview.crew.length));
    const refusedCrew = (crewResult?.stage.outcomes ?? [])
      .filter((o) => o.outcome === 'refused')
      .map((o) => ({ ...o, name: preview.crew[o.rowIndex]?.fullName ?? `Row ${o.rowIndex + 1}` }));

    const status = batchStatus(sections);
    const summary: Json = {
      sections: sections.map((s) => ({ key: s.key, status: s.status, detail: s.detail })),
      crew_staged: crewResult ? summariseStage(crewResult.stage.outcomes).staged : 0,
      crew_refused: refusedCrew.length,
      warnings: preview.warnings,
    };
    const logged = await supabase.from('frp_import_batches').update({ status, summary }).eq('id', batchId).select('id');
    const logNote = logged.error || (logged.data?.length ?? 0) !== 1
      ? `The import log could not be updated: ${errorMessage(logged.error, 'no row was changed.')}`
      : null;

    setReport({ sections, refusedCrew, logNote });
    setPhase('done');
    onComplete();
    if (status === 'complete') notify.success('Import complete');
    else if (status === 'partial') notify.warning('Import partly complete', { description: 'Some sections were not saved. The dialog lists what happened.' });
    else notify.error('Nothing was saved. The dialog lists why.', { title: 'Import failed' });
  };

  const vesselLabel = source?.vesselName || 'the vessel';
  const crewPreview = useMemo(() => (preview?.crew ?? []).slice(0, 6).map((c) => c.fullName), [preview]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-import-dialog={phase}>
        <DialogHeader>
          <DialogTitle>Import a rotation planner</DialogTitle>
          <DialogDescription>
            {phase === 'choose' && 'Choose the vessel and the planner workbook (.xlsx). Nothing is saved until you import.'}
            {phase === 'review' && `Check what the file holds before it is imported to ${vesselLabel}.`}
            {phase === 'importing' && `Importing to ${vesselLabel}…`}
            {phase === 'done' && `What was imported to ${vesselLabel}.`}
          </DialogDescription>
        </DialogHeader>

        {phase === 'choose' && (
          <Form {...form}>
            <form onSubmit={read} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="vesselId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vessel</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={COARSE}>
                          <SelectValue placeholder="Choose a vessel" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {vessels.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="file"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Planner workbook</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept=".xlsx,.xls"
                        className={COARSE}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        onChange={(e) => field.onChange(e.target.files?.[0] ?? undefined)}
                      />
                    </FormControl>
                    <FormDescription>The Timeline, monthly travel and Crew Data sheets are read. 20 MB at most.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" className={COARSE} onClick={close}>Cancel</Button>
                <Button type="submit" className={COARSE} disabled={reading}>
                  {reading ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Upload aria-hidden="true" />}
                  Read file
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}

        {(phase === 'review' || phase === 'importing') && preview && source && (
          <div className="space-y-4">
            <div className="flex min-w-0 items-center gap-2 type-body-sm text-muted-foreground">
              <FileSpreadsheet aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate" title={source.fileName}>{source.fileName}</span>
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-import-counts>
              {([
                ['Rotation blocks', preview.rotations.length],
                ['Vessel locations', preview.locations.length],
                ['Travel records', preview.travel.length],
                ['Crew records', preview.crew.length],
              ] as const).map(([label, n]) => (
                <div key={label} className="rounded-md border border-border bg-muted/40 p-3">
                  <dt className="type-caption text-muted-foreground">{label}</dt>
                  <dd className="type-title tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
            {preview.crew.length > 0 && (
              <Alert role="note">
                <Info aria-hidden="true" className="size-4" />
                <AlertDescription>
                  The {plural(preview.crew.length, 'crew record')} are staged for your company only, then added to the crew list.
                  {crewPreview.length > 0 && (
                    <span className="mt-1 block text-muted-foreground">
                      {crewPreview.join(', ')}
                      {preview.crew.length > crewPreview.length ? ` and ${preview.crew.length - crewPreview.length} more` : ''}.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {preview.warnings.length > 0 && (
              <section aria-label="Notes from the file" className="space-y-1">
                <h3 className="type-subtitle">Notes from the file</h3>
                <ul className="space-y-1 type-body-sm text-muted-foreground">
                  {preview.warnings.map((w) => (
                    <li key={w} className="flex gap-2">
                      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {fatal && (
              <p className="type-body-sm text-critical" role="alert" data-import-fatal>{fatal}</p>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className={COARSE} disabled={phase === 'importing'} onClick={() => { setPhase('choose'); setFatal(null); }}>
                Back
              </Button>
              <Button type="button" className={COARSE} disabled={phase === 'importing'} onClick={() => void runImport()}>
                {phase === 'importing' ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {phase === 'importing' ? 'Importing…' : 'Import'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === 'done' && report && (
          <div className="space-y-4">
            <ul className="divide-y divide-border rounded-md border border-border" aria-label="Import result">
              {report.sections.map((s) => (
                <li key={s.key} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:gap-3" data-import-section={s.key} data-status={s.status}>
                  <div className="flex min-w-0 items-center gap-2 sm:w-44 sm:shrink-0">
                    <span className="type-body-sm font-medium">{s.label}</span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                    <StatusPill tone={SECTION_TONE[s.status]} className="self-start">{SECTION_LABEL[s.status]}</StatusPill>
                    <span className="min-w-0 type-body-sm text-muted-foreground [overflow-wrap:anywhere]">{s.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
            {report.refusedCrew.length > 0 && (
              <section aria-label="Crew records not staged" className="space-y-2">
                <h3 className="type-subtitle">Crew records not staged ({report.refusedCrew.length})</h3>
                <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border" data-import-refused>
                  {report.refusedCrew.map((o) => (
                    <li key={o.rowIndex} className="flex flex-col gap-0.5 p-3">
                      <span className="type-body-sm font-medium [overflow-wrap:anywhere]">{o.name}</span>
                      <span className="type-caption text-muted-foreground">{stageReasonText(o)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {report.logNote && <p className="type-caption text-muted-foreground">{report.logNote}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className={COARSE} onClick={reset}>Import another file</Button>
              <Button type="button" className={COARSE} onClick={close}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportDialog;

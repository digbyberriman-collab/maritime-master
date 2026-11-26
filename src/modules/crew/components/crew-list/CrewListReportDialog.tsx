import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Info, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { notify } from '@/shared/lib/notify';
import { PageError } from '@/shared/components/states';
import { useVesselCrewList, type CrewListVessel } from '@/modules/crew/hooks/useVesselCrewList';
import {
  asAtInRange,
  positionLabel,
  splitForReport,
  type CrewListRow,
} from '@/modules/crew/lib/crewListModel';
import { downloadOfficialCrewList, type CrewListPerson, type CrewListVessel as PdfVessel } from '@/modules/crew/lib/crewListPdf';

/** C11: the occasional-worker section waits for visits (X5 V1/V2, X1 wave 2). */
export const OCCASIONAL_WORKERS_NOTE = 'Occasional workers are not on this list yet: they are added once visits are recorded in STORM.';
export const BASIC_REPORT_NOTE = 'Crew lists for another day need the crew update. This list is for today.';

/** The identity columns FAL 5 needs, read only for the people on the list. */
const IDENTITY_COLUMNS =
  'id, rank, job_title, nationality, date_of_birth, place_of_birth, passport_number, passport_country, passport_expiry, seamans_book_number, embarkation_port, contract_start_date, personnel_type' as const;

interface CrewListReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessel: CrewListVessel & PdfVessel & { code: string | null };
  today: string;
  /** The basic D-01 list: no as-at day; the rows of today are given. */
  basicRows: readonly CrewListRow[] | null;
  /** Only these people (the selection), when set. */
  onlyProfileIds?: readonly string[] | null;
}

/**
 * The crew list report (gap/04 C11; T-306): the official crew list (IMO
 * FAL Form 5) for the vessel as at a day, today or up to two years ahead
 * (or back). The list is the server's crew_vessel_list for that day: on
 * board and ashore are listed; on leave, pending and on transfer are
 * counted apart. Identity fields come from the profiles of those people
 * only. The export is logged before the PDF is made (personal data, EX4)
 * and named per EX1. Occasional workers are left out, with a note, until
 * visits exist.
 */
export const CrewListReportDialog: React.FC<CrewListReportDialogProps> = ({ open, onOpenChange, vessel, today, basicRows, onlyProfileIds }) => {
  const basic = basicRows !== null;
  const [asAt, setAsAt] = useState(today);
  const [port, setPort] = useState('');
  const [lastPort, setLastPort] = useState('');
  const [includeContractors, setIncludeContractors] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (open) setAsAt(today);
  }, [open, today]);

  const validDay = asAtInRange(asAt, today);
  const list = useVesselCrewList(vessel, asAt, { enabled: open && !basic && validDay });

  const rows = useMemo<readonly CrewListRow[] | null>(() => {
    const source = basic ? basicRows : list.status === 'ready' ? list.rows : null;
    if (!source) return null;
    if (!onlyProfileIds || onlyProfileIds.length === 0) return source;
    const keep = new Set(onlyProfileIds);
    return source.filter((r) => keep.has(r.profileId));
  }, [basic, basicRows, list, onlyProfileIds]);

  const split = useMemo(() => (rows ? splitForReport(rows) : null), [rows]);
  const master = split?.aboard.find((r) => r.isMasterOffice) ?? null;
  const masterName = master ? `${master.firstName} ${master.lastName}`.trim() : '';

  const handleDownload = async () => {
    if (!split) return;
    setWorking(true);
    try {
      const ids = split.aboard.map((r) => r.profileId);
      const identity = new Map<string, Partial<CrewListPerson> & { id: string }>();
      if (ids.length > 0) {
        const { data, error } = await supabase.from('profiles').select(IDENTITY_COLUMNS).in('id', ids);
        if (error) {
          notify.error(error, { title: 'The crew list was not made' });
          return;
        }
        for (const p of data ?? []) identity.set(p.id, p);
      }
      const people: CrewListPerson[] = split.aboard
        .map((r) => {
          const id = identity.get(r.profileId);
          return {
            first_name: r.firstName,
            last_name: r.lastName,
            rank: positionLabel(r) ?? id?.rank ?? null,
            job_title: id?.job_title ?? null,
            nationality: id?.nationality ?? r.nationality,
            date_of_birth: id?.date_of_birth ?? null,
            place_of_birth: id?.place_of_birth ?? null,
            passport_number: id?.passport_number ?? null,
            passport_country: id?.passport_country ?? null,
            passport_expiry: id?.passport_expiry ?? null,
            seamans_book_number: id?.seamans_book_number ?? null,
            embarkation_port: id?.embarkation_port ?? null,
            contract_start_date: id?.contract_start_date ?? null,
            personnel_type: id?.personnel_type ?? 'crew',
            current_assignment: { join_date: r.joinDate },
          };
        })
        .filter((p) => p.personnel_type !== 'shoreside')
        .filter((p) => includeContractors || p.personnel_type !== 'contractor');
      const result = await downloadOfficialCrewList(people, {
        vessel,
        vesselId: vessel.id,
        vesselCode: vessel.code,
        portOfArrival: port,
        dateOfArrival: asAt,
        asAtDate: asAt,
        lastPortOfCall: lastPort,
        masterName,
        includeContractors,
        footnote: OCCASIONAL_WORKERS_NOTE,
      });
      if (result.status === 'refused') {
        notify.error(result.message, { title: 'The crew list was not made' });
        return;
      }
      notify.success('Crew list downloaded', { description: result.fileName });
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  const loading = !basic && validDay && (list.status === 'loading' || list.status === 'idle');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText aria-hidden="true" className="h-5 w-5" /> Crew list report
          </DialogTitle>
          <DialogDescription>
            The official crew list (IMO FAL Form 5) for {vessel.name}, as at the day you choose.
            {onlyProfileIds && onlyProfileIds.length > 0 ? ` Only the ${onlyProfileIds.length} selected people are included.` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="crew-report-as-at">As at</Label>
              <Input
                id="crew-report-as-at"
                type="date"
                value={asAt}
                disabled={basic}
                onChange={(event) => setAsAt(event.target.value)}
                aria-invalid={!validDay || undefined}
                aria-describedby={!validDay ? 'crew-report-as-at-problem' : basic ? 'crew-report-basic' : undefined}
              />
              {!validDay ? (
                <p id="crew-report-as-at-problem" className="type-caption text-destructive" role="alert">
                  Choose a date within two years of today.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="crew-report-port">Port of arrival / departure</Label>
              <Input id="crew-report-port" value={port} onChange={(event) => setPort(event.target.value)} placeholder="e.g. Palma de Mallorca" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="crew-report-last-port">Last port of call</Label>
              <Input id="crew-report-last-port" value={lastPort} onChange={(event) => setLastPort(event.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <Label htmlFor="crew-report-contractors" className="text-sm font-medium">Include contractors on board</Label>
              <p className="type-caption text-muted-foreground">Listed and marked as contractors.</p>
            </div>
            <Switch id="crew-report-contractors" checked={includeContractors} onCheckedChange={setIncludeContractors} />
          </div>

          {basic ? (
            <p id="crew-report-basic" className="type-body-sm text-muted-foreground">
              {BASIC_REPORT_NOTE}
            </p>
          ) : null}

          {list.status === 'error' && !basic ? (
            <PageError error={list.error} onRetry={list.retry} variant="inline" title="The list for this day could not load" />
          ) : null}

          <div className="type-body-sm text-foreground" aria-live="polite" data-report-summary="">
            {loading ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Checking who is on board…
              </span>
            ) : split ? (
              <>
                <p>
                  {split.aboard.length} {split.aboard.length === 1 ? 'person' : 'people'} will be listed
                  {masterName ? `, Master: ${masterName}` : ''}.
                </p>
                {split.onLeave + split.pending + split.onTransfer > 0 ? (
                  <p className="text-muted-foreground">
                    Not listed: {[
                      split.onLeave ? `${split.onLeave} on leave` : null,
                      split.pending ? `${split.pending} pending` : null,
                      split.onTransfer ? `${split.onTransfer} on transfer` : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertDescription>{OCCASIONAL_WORKERS_NOTE}</AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleDownload()} disabled={!split || working || !validDay}>
            {working ? <Loader2 aria-hidden="true" className="animate-spin" /> : <FileText aria-hidden="true" />}
            {working ? 'Making the PDF…' : 'Download PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CrewListReportDialog;

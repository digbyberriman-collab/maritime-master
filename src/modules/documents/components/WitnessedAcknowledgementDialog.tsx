/**
 * Record a witnessed acknowledgement on a shared device (gap/02 W1 "Record
 * a witnessed acknowledgement", FD6; X5 spec X5-05B; DECISIONS D-X5-04):
 * the Master, or the head of department of the person, watches a crew
 * member read a fleet document on this device and records that they
 * acknowledged it. Mostly for crew without an app login; also for someone
 * whose login is suspended, or who is still to acknowledge.
 *
 * Two steps:
 * 1. Pick: the document (those with someone the caller may witness) and
 *    the person (on the crew, still to acknowledge or unable to for a
 *    login reason, in the caller's department as head of department, never
 *    the caller). Someone outside the signer list is not offered: the
 *    Master changes who can sign instead.
 * 2. Confirm on this device: hand it over, open the document, and tick
 *    that the person read and understood this version with the caller as
 *    witness. Only then is `fleet_document_acknowledge_witnessed` called;
 *    its returned row (this version, vessel and person, method witnessed,
 *    a witness named) is checked before it says so. A refusal stays in the
 *    dialog as a sentence naming the person.
 */
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ExternalLink, ShieldCheck, Smartphone } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/shared/components/status';
import { errorMessage, notify } from '@/shared/lib/notify';
import { ACK_BLOCKED_LABELS, ackDueShort } from '../lib/ackState';
import { mayWitnessRow, personName, type CrewCapacity } from '../lib/ackAdmin';
import { witnessSchema, type WitnessFormValues } from '../lib/acknowledgementSchema';
import { openFleetDocumentFile, useWitnessFleetDocument } from '../hooks/useFleetDocumentAcks';
import type { FleetDocumentAckStatusRow } from '../types/db.pending';

const COARSE = '[@media(pointer:coarse)]:min-h-11';

/** A document the vessel holds, as the dialog needs it. */
export interface WitnessDocument {
  documentId: string;
  versionId: string;
  title: string;
  versionLabel: string;
  /** The published file (records bucket), to open on the shared device. */
  storagePath: string | null;
}

export interface WitnessedAcknowledgementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  vesselId: string;
  vesselName: string;
  documents: readonly WitnessDocument[];
  /** The vessel's person rows the caller reads. */
  rows: readonly FleetDocumentAckStatusRow[];
  capacity: CrewCapacity;
  callerProfileId: string | null;
  /** Preselect a document and person (from a person's row). */
  initial?: { documentId: string; profileId: string } | null;
}

export function WitnessedAcknowledgementDialog(props: WitnessedAcknowledgementDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:w-full" aria-describedby="witness-description">
        {open ? <WitnessForm key={`${props.initial?.documentId ?? ''}:${props.initial?.profileId ?? ''}`} {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function WitnessForm({ onOpenChange, companyId, vesselId, vesselName, documents, rows, capacity, callerProfileId, initial }: WitnessedAcknowledgementDialogProps) {
  const id = React.useId();
  const [opening, setOpening] = React.useState(false);
  const witness = useWitnessFleetDocument(companyId);

  // Who the caller may witness, per document (current version, this vessel).
  const eligible = React.useMemo(() => {
    const byDoc = new Map<string, FleetDocumentAckStatusRow[]>();
    for (const doc of documents) {
      const list = rows.filter((r) => r.document_id === doc.documentId && r.version_id === doc.versionId && r.vessel_id === vesselId && mayWitnessRow(capacity, r, callerProfileId));
      if (list.length) byDoc.set(doc.documentId, list.sort((a, b) => personName(a).localeCompare(personName(b), 'en-GB', { sensitivity: 'base' })));
    }
    return byDoc;
  }, [documents, rows, vesselId, capacity, callerProfileId]);
  const docsWithPeople = documents.filter((d) => eligible.has(d.documentId));

  // A preselected person opens straight on the confirmation; one the caller cannot witness opens on the pickers.
  const initialValid = initial && eligible.get(initial.documentId)?.some((r) => r.profile_id === initial.profileId) ? initial : null;
  const [step, setStep] = React.useState<'pick' | 'confirm'>(initialValid ? 'confirm' : 'pick');
  const form = useForm<WitnessFormValues>({
    resolver: zodResolver(witnessSchema),
    defaultValues: {
      documentId: initialValid?.documentId ?? (docsWithPeople.length === 1 ? docsWithPeople[0].documentId : ''),
      profileId: initialValid?.profileId ?? '',
      confirmed: false,
    },
  });
  const documentId = form.watch('documentId');
  const profileId = form.watch('profileId');
  const doc = documents.find((d) => d.documentId === documentId) ?? null;
  const candidates = (documentId && eligible.get(documentId)) || [];
  const person = candidates.find((r) => r.profile_id === profileId) ?? null;
  const name = person ? personName(person) : 'the crew member';
  const busy = witness.isPending;

  const next = async () => {
    const ok = await form.trigger(['documentId', 'profileId']);
    if (ok && person) setStep('confirm');
  };

  const openFile = async () => {
    if (!doc?.storagePath) return;
    setOpening(true);
    try {
      await openFleetDocumentFile(doc.storagePath);
    } catch (error) {
      notify.error(error, { title: 'The document could not be opened' });
    } finally {
      setOpening(false);
    }
  };

  const submit = form.handleSubmit(async () => {
    if (!doc || !person) return;
    try {
      await witness.mutateAsync({
        versionId: doc.versionId,
        vesselId,
        profileId: person.profile_id,
        personName: name,
        title: doc.title,
        versionLabel: doc.versionLabel,
      });
      onOpenChange(false);
    } catch {
      // Shown below, in words.
    }
  });

  const fieldError = (field: keyof WitnessFormValues) => form.formState.errors[field]?.message ?? null;

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Record a witnessed acknowledgement</DialogTitle>
        <DialogDescription id="witness-description">
          {step === 'pick'
            ? `For crew on ${vesselName} who acknowledge on this device with you watching, mostly people without an app login. The record names you as the witness.`
            : `Hand this device to ${name}. Open the document together, let them read it, then confirm below.`}
        </DialogDescription>
      </DialogHeader>

      {step === 'pick' ? (
        docsWithPeople.length === 0 ? (
          <Alert variant="info">
            <AlertDescription>
              Nobody you look after on this vessel is waiting to acknowledge a document. People outside the signer list need a change to who can sign first.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-document`}>Document</Label>
              <Controller
                control={form.control}
                name="documentId"
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={(v) => {
                      field.onChange(v);
                      form.setValue('profileId', '');
                      form.setValue('confirmed', false);
                    }}
                  >
                    <SelectTrigger id={`${id}-document`} className={COARSE} aria-invalid={fieldError('documentId') ? true : undefined}>
                      <SelectValue placeholder="Choose a document" />
                    </SelectTrigger>
                    <SelectContent>
                      {docsWithPeople.map((d) => (
                        <SelectItem key={d.documentId} value={d.documentId}>
                          {`${d.title} · ${d.versionLabel}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {fieldError('documentId') ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldError('documentId')}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-person`}>Crew member</Label>
              <Controller
                control={form.control}
                name="profileId"
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={(v) => {
                      field.onChange(v);
                      form.setValue('confirmed', false);
                    }}
                    disabled={!documentId}
                  >
                    <SelectTrigger id={`${id}-person`} className={COARSE} aria-invalid={fieldError('profileId') ? true : undefined}>
                      <SelectValue placeholder={documentId ? 'Choose a person' : 'Choose the document first'} />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((r) => (
                        <SelectItem key={r.profile_id} value={r.profile_id}>
                          {[personName(r), r.position, r.state === 'blocked' && r.blocked_reason ? ACK_BLOCKED_LABELS[r.blocked_reason] : null].filter(Boolean).join(' · ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {fieldError('profileId') ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldError('profileId')}
                </p>
              ) : null}
            </div>
            {person ? <PersonLine row={person} /> : null}
          </div>
        )
      ) : doc && person ? (
        <div className="grid gap-4">
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-3 py-3">
            <Smartphone aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <p className="break-words font-medium text-foreground">{name}</p>
              <p className="type-caption break-words text-muted-foreground">{[person.position, person.department].filter(Boolean).join(' · ') || 'Crew'}</p>
              <p className="break-words text-sm text-foreground">{`${doc.title}, version ${doc.versionLabel}`}</p>
              <PersonLine row={person} />
            </div>
          </div>
          {doc.storagePath ? (
            <Button type="button" variant="outline" className={cn(COARSE, 'w-full sm:w-auto')} onClick={() => void openFile()} disabled={opening} aria-busy={opening}>
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              {opening ? 'Opening…' : 'Open the document'}
            </Button>
          ) : null}
          <Controller
            control={form.control}
            name="confirmed"
            render={({ field }) => (
              <Label
                htmlFor={`${id}-confirm`}
                className={cn('flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-3 text-sm font-normal leading-snug text-foreground', COARSE)}
              >
                <Checkbox
                  id={`${id}-confirm`}
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5"
                  aria-invalid={fieldError('confirmed') ? true : undefined}
                  disabled={busy}
                />
                <span>{`${name} has read and understood version ${doc.versionLabel} of this document, and I watched them acknowledge it on this device.`}</span>
              </Label>
            )}
          />
          {fieldError('confirmed') ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldError('confirmed')}
            </p>
          ) : null}
          <p className="type-caption text-muted-foreground">The acknowledgement is recorded for {name}, with you as the witness and today’s date and time.</p>
        </div>
      ) : null}

      {witness.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Nothing was recorded</AlertTitle>
          <AlertDescription>{errorMessage(witness.error, 'Try again.')}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter className="gap-2">
        {step === 'confirm' ? (
          <Button type="button" variant="ghost" className={cn(COARSE, 'sm:mr-auto')} onClick={() => setStep('pick')} disabled={busy}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back
          </Button>
        ) : null}
        <Button type="button" variant="outline" className={COARSE} onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </Button>
        {step === 'pick' ? (
          <Button type="button" className={COARSE} onClick={() => void next()} disabled={docsWithPeople.length === 0}>
            Next: confirm on this device
          </Button>
        ) : (
          <Button type="submit" className={COARSE} disabled={busy || !doc || !person} aria-busy={busy}>
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            {busy ? 'Recording…' : 'Record acknowledgement'}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}

function PersonLine({ row }: { row: FleetDocumentAckStatusRow }) {
  const due = ackDueShort(row.state, row.due_at, row.acknowledged_at);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <StatusPill domain="document_ack" status={row.state} size="sm" />
      {row.state === 'blocked' && row.blocked_reason ? <span className="text-muted-foreground">{ACK_BLOCKED_LABELS[row.blocked_reason]}</span> : null}
      {due ? <span className={cn('type-caption tabular-nums', row.state === 'overdue' ? 'text-critical' : 'text-muted-foreground')}>{due}</span> : null}
    </p>
  );
}

export default WitnessedAcknowledgementDialog;

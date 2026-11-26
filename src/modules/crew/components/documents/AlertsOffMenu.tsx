import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bell, BellOff, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { notify } from '@/shared/lib/notify';
import { CrewDocumentWriteError, type CrewDocumentView } from '@/modules/crew/hooks/useCrewDocuments';
import { useDocumentReviewActions } from '@/modules/crew/hooks/useDocumentVerification';
import { crewDocumentRefusal } from '@/modules/crew/lib/crewDocumentSchema';
import { dayText, expiryPhrase, muteSchema, type MuteFormValues } from '@/modules/crew/lib/verification';

const COARSE = '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11';

/** The document's real state in words, which alerts off never hides (gap/04 W3). */
function realStateText(doc: CrewDocumentView): string {
  const s = doc.state;
  const parts: string[] = [];
  if (s.state === 'not_uploaded') parts.push('No file attached');
  if (s.bucket === null) parts.push('Expiry date missing');
  else if (s.bucket === 'no_expiry') parts.push('No expiry');
  else if (s.bucket === 'valid') parts.push(doc.expiryDate ? `Valid until ${dayText(doc.expiryDate)}` : 'Valid');
  else {
    const phrase = expiryPhrase(s.daysRemaining);
    parts.push(phrase.charAt(0).toUpperCase() + phrase.slice(1));
  }
  if (s.endorsement === 'overdue') parts.push('endorsement overdue');
  if (s.endorsement === 'due') parts.push('endorsement due');
  return parts.join(', ');
}

/** "Alerts off since 3 Nov 2026: Renewal booked" (who turned them off is in the audit, not repeated on every row). */
function mutedText(doc: CrewDocumentView): string {
  const since = doc.mutedAt ? dayText(doc.mutedAt.slice(0, 10)) : null;
  const head = since ? `Alerts off since ${since}` : 'Alerts off';
  return doc.mutedReason ? `${head}: ${doc.mutedReason}` : head;
}

export interface AlertsOffNoteProps {
  doc: CrewDocumentView;
  className?: string;
}

/** The line under a muted document for every reader: since when and why alerts are off, and the real state. */
export const AlertsOffNote: React.FC<AlertsOffNoteProps> = ({ doc, className }) => {
  if (!doc.alertsMuted) return null;
  return (
    <p className={cn('break-words type-caption text-muted-foreground', className)} data-alerts-off-note="">
      {mutedText(doc)}. Real state: {realStateText(doc)}.
    </p>
  );
};

export interface AlertsOffMenuProps {
  doc: CrewDocumentView;
  profileId: string;
  companyId: string;
}

/**
 * Alerts off for one crew document (gap/04 C28, T-160): for holders of
 * vessel.crew.expiry_alerts.edit on the person's vessel (the caller's
 * rights decide whether this renders). The trigger reads "Alerts off" on a
 * muted document, with a tooltip of its real state, since when and why;
 * the menu turns alerts off (a reason is required, lib/verification.ts
 * muteSchema), changes the reason, or turns them back on. The server must
 * answer with the document in the state asked for; a refusal reads as the
 * server wrote it.
 */
export const AlertsOffMenu: React.FC<AlertsOffMenuProps> = ({ doc, profileId, companyId }) => {
  const { unmute } = useDocumentReviewActions(companyId, profileId);
  const [dialog, setDialog] = React.useState<'mute' | 'reason' | null>(null);
  const muted = doc.alertsMuted;

  const turnOn = async () => {
    try {
      await unmute.mutateAsync(doc.id);
      notify.success(`Alerts are back on for ${doc.name}`);
    } catch (error) {
      notify.error(error instanceof CrewDocumentWriteError ? error.message : crewDocumentRefusal(error).message, { title: 'Alerts were not turned back on' });
    }
  };

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={muted ? `Alerts off for ${doc.name}. Change` : `Alerts for ${doc.name}`}
      aria-busy={unmute.isPending || undefined}
      className={COARSE}
      data-alerts-menu={muted ? 'off' : 'on'}
    >
      {unmute.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : muted ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}
      {muted ? 'Alerts off' : 'Alerts'}
      <ChevronDown aria-hidden="true" className="opacity-60" />
    </Button>
  );

  return (
    <>
      <DropdownMenu>
        {muted ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p>Real state: {realStateText(doc)}</p>
                <p className="text-muted-foreground">{mutedText(doc)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="type-caption font-normal text-muted-foreground">
            {muted ? mutedText(doc) : 'Expiry alerts are on for this document.'}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {muted ? (
            <>
              <DropdownMenuItem onSelect={() => void turnOn()} className={COARSE}>
                <Bell aria-hidden="true" />
                Turn alerts back on
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog('reason')} className={COARSE}>
                Change the reason…
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => setDialog('mute')} className={COARSE}>
              <BellOff aria-hidden="true" />
              Turn alerts off…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog ? (
        <MuteDialog
          doc={doc}
          profileId={profileId}
          companyId={companyId}
          changing={dialog === 'reason'}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      ) : null}
    </>
  );
};

interface MuteDialogProps {
  doc: CrewDocumentView;
  profileId: string;
  companyId: string;
  /** The alerts are off already: only the reason changes. */
  changing: boolean;
  onOpenChange: (open: boolean) => void;
}

const MuteDialog: React.FC<MuteDialogProps> = ({ doc, profileId, companyId, changing, onOpenChange }) => {
  const form = useForm<MuteFormValues>({ resolver: zodResolver(muteSchema), defaultValues: { reason: changing ? doc.mutedReason ?? '' : '' } });
  const { mute } = useDocumentReviewActions(companyId, profileId);
  const saving = mute.isPending;
  const [refusal, setRefusal] = React.useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setRefusal(null);
    try {
      await mute.mutateAsync({ id: doc.id, reason: values.reason });
      notify.success(changing ? 'Reason saved' : `Alerts are off for ${doc.name}`);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof CrewDocumentWriteError) {
        setRefusal(error.message);
        return;
      }
      const { message, field } = crewDocumentRefusal(error);
      if (field === 'reason') form.setError('reason', { message }, { shouldFocus: true });
      else setRefusal(message);
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && saving) return;
        onOpenChange(open);
      }}
    >
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md" data-mute-dialog="">
        <DialogHeader className="text-left">
          <DialogTitle className="type-title break-words">{changing ? 'Why alerts are off' : `Turn alerts off for ${doc.name}`}</DialogTitle>
          <DialogDescription>
            The document keeps showing its real state ({realStateText(doc)}), but sends no expiry notices and leaves the compliance counts until alerts are back on.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} noValidate className="space-y-4" aria-label={changing ? 'Change the reason' : 'Turn alerts off'}>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} disabled={saving} placeholder="For example: renewal booked for 14 Jan" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {refusal ? (
              <p role="alert" className="type-body text-destructive" data-mute-refusal="">
                {refusal}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className={COARSE}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className={COARSE}>
                {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {saving ? 'Saving…' : changing ? 'Save the reason' : 'Turn alerts off'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AlertsOffMenu;

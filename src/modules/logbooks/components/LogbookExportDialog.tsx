import React from 'react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { Download, Printer } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/hooks/use-toast';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import type { LogbookDefinition } from '@/modules/logbooks/lib/logbookDefinitions';
import type { LogbookEntry } from '@/modules/logbooks/hooks/useLogbook';
import { buildLogbookPdf, logbookPdfFileName } from '@/modules/logbooks/lib/logbookPdf';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: LogbookDefinition;
  logbookId: string | null;
  vesselName?: string | null;
  /** Month currently shown in the logbook, used as the default range. */
  month: Date;
}

const toInput = (date: Date) => format(date, 'yyyy-MM-dd');

const LogbookExportDialog: React.FC<Props> = ({
  open, onOpenChange, definition, logbookId, vesselName, month,
}) => {
  const { clientDisplayName, clientLogoUrl, brandColor } = useBrandingContext();
  const [from, setFrom] = React.useState(() => toInput(startOfMonth(month)));
  const [to, setTo] = React.useState(() => toInput(endOfMonth(month)));
  const [includeDetails, setIncludeDetails] = React.useState(true);
  const [signedOnly, setSignedOnly] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setFrom(toInput(startOfMonth(month)));
      setTo(toInput(endOfMonth(month)));
    }
  }, [open, month]);

  const generate = async (action: 'download' | 'print') => {
    if (!logbookId) {
      toast({
        title: 'No logbook available',
        description: 'Select a vessel and record an entry before exporting.',
        variant: 'destructive',
      });
      return;
    }
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T23:59:59`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      toast({ title: 'Check the dates', description: 'The start date must be on or before the end date.', variant: 'destructive' });
      return;
    }

    setBusy(true);
    try {
      let query = supabase
        .from('logbook_entries')
        .select('*')
        .eq('logbook_id', logbookId)
        .gte('entry_at', fromDate.toISOString())
        .lte('entry_at', toDate.toISOString())
        .order('entry_at', { ascending: true });
      if (signedOnly) query = query.eq('status', 'signed');

      const { data, error } = await query;
      if (error) throw error;

      const entries = (data ?? []) as unknown as LogbookEntry[];
      const doc = buildLogbookPdf({
        definition,
        vesselName,
        from: fromDate,
        to: toDate,
        entries,
        includeDetails,
        branding: { clientDisplayName, clientLogoUrl, brandColor },
      });

      if (action === 'print') {
        const url = doc.output('bloburl') as unknown as string;
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        doc.save(logbookPdfFileName(definition, vesselName, fromDate, toDate));
      }

      toast({
        title: entries.length === 0 ? 'Report created (no entries)' : 'Report created',
        description: `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} between ${format(fromDate, 'dd MMM yyyy')} and ${format(toDate, 'dd MMM yyyy')}.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'The report could not be created.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export {definition.label}</DialogTitle>
          <DialogDescription>
            Create a printable PDF of the entries recorded between the dates below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="logbook-export-from">From</Label>
              <Input
                id="logbook-export-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logbook-export-to">To</Label>
              <Input
                id="logbook-export-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="logbook-export-details" className="font-normal">
              Include remarks and detail fields
            </Label>
            <Switch
              id="logbook-export-details"
              checked={includeDetails}
              onCheckedChange={setIncludeDetails}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="logbook-export-signed" className="font-normal">
              Signed entries only
            </Label>
            <Switch
              id="logbook-export-signed"
              checked={signedOnly}
              onCheckedChange={setSignedOnly}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => generate('print')} disabled={busy}>
            <Printer className="mr-1 h-4 w-4" /> Print
          </Button>
          <Button onClick={() => generate('download')} disabled={busy}>
            <Download className="mr-1 h-4 w-4" /> {busy ? 'Preparing...' : 'Download PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LogbookExportDialog;

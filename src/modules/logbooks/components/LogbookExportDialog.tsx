import React from 'react';
import { BookOpen, Download, Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/shared/hooks/use-toast';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import type { LogbookBook } from '../lib/catalog';
import type { EntryView, VolumeRow } from '../lib/types';
import type { TemplateSection } from '../lib/templates';
import { buildLogbookPdf, logbookPdfFileName } from '../lib/logbookPdf';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: LogbookBook;
  volume: VolumeRow;
  section: TemplateSection;
  entries: EntryView[];
  vesselName?: string | null;
  onPrintBook: () => void;
}

const toInput = (date: Date) => date.toISOString().slice(0, 10);

/** Export / print: the full printable book, or a branded PDF of one section over a date range. */
const LogbookExportDialog: React.FC<Props> = ({ open, onOpenChange, book, volume, section, entries, vesselName, onPrintBook }) => {
  const { clientDisplayName, clientLogoUrl, brandColor } = useBrandingContext();
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [includeDetails, setIncludeDetails] = React.useState(true);
  const [signedOnly, setSignedOnly] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const times = entries.map((e) => Date.parse(e.entry_at)).filter(Number.isFinite);
    const first = times.length ? new Date(Math.min(...times)) : new Date(volume.opened_at);
    setFrom(toInput(first));
    setTo(toInput(new Date()));
  }, [open, entries, volume.opened_at]);

  const generate = async (action: 'download' | 'print') => {
    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate = new Date(`${to}T23:59:59Z`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      toast({ title: 'Check the dates', description: 'The start date must be on or before the end date.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const selected = entries
        .filter((e) => e.section_id === section.id)
        .filter((e) => { const t = Date.parse(e.entry_at); return t >= fromDate.getTime() && t <= toDate.getTime(); })
        .filter((e) => !signedOnly || e.status !== 'draft')
        .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));
      const doc = buildLogbookPdf({ book, volume, section, vesselName, from: fromDate, to: toDate, entries: selected, includeDetails, branding: { clientDisplayName, clientLogoUrl, brandColor } });
      if (action === 'print') {
        window.open(doc.output('bloburl') as unknown as string, '_blank', 'noopener,noreferrer');
      } else {
        doc.save(logbookPdfFileName(book, section, vesselName, fromDate, toDate));
      }
      toast({ title: selected.length ? 'Report created' : 'Report created (no lines)', description: `${selected.length} line${selected.length === 1 ? '' : 's'} between ${from} and ${to}.` });
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Export failed', description: error instanceof Error ? error.message : 'The report could not be created.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export {book.title}</DialogTitle>
          <DialogDescription>Print the complete book (cover, index, signed pages and blank sections), or create a branded PDF of the {section.title} section for a date range.</DialogDescription>
        </DialogHeader>
        <Button type="button" variant="outline" className="w-full justify-start" onClick={() => { onOpenChange(false); onPrintBook(); }}>
          <BookOpen className="mr-2 h-4 w-4" /> Print book · {volume.label}
        </Button>
        <div className="space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="logbook-export-from">From</Label><Input id="logbook-export-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="logbook-export-to">To</Label><Input id="logbook-export-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="logbook-export-details" className="font-normal">Include every field and full remarks</Label>
            <Switch id="logbook-export-details" checked={includeDetails} onCheckedChange={setIncludeDetails} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="logbook-export-signed" className="font-normal">Signed lines only</Label>
            <Switch id="logbook-export-signed" checked={signedOnly} onCheckedChange={setSignedOnly} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => generate('print')} disabled={busy}><Printer className="mr-1 h-4 w-4" /> Print PDF</Button>
          <Button onClick={() => generate('download')} disabled={busy}><Download className="mr-1 h-4 w-4" /> {busy ? 'Preparing…' : 'Download PDF'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LogbookExportDialog;

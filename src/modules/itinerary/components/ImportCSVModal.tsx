import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useCreateEntry, useTripTypes, useItineraryVessels } from '@/modules/itinerary/hooks/useItinerary';
import { useToast } from '@/shared/hooks/use-toast';
import type { ItineraryStatus, CreateEntryInput } from '@/modules/itinerary/types';

interface ImportCSVModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  rowNum: number;
  title: string;
  start_date: string;
  end_date: string;
  location: string;
  country: string;
  status: ItineraryStatus;
  trip_type: string;
  vessels: string[];
  notes: string;
  errors: string[];
}

const VALID_STATUSES: ItineraryStatus[] = ['draft', 'tentative', 'confirmed', 'postponed', 'cancelled', 'completed'];

/** Strip common vessel prefixes (M/Y, R/V, S/Y, MY, RV, SY) and compare case-insensitively */
const normalizeVesselName = (name: string) =>
  name.replace(/^(M\/Y|R\/V|S\/Y|MY|RV|SY)\s*/i, '').trim().toLowerCase();

const fuzzyVesselMatch = (dbName: string, csvName: string) =>
  normalizeVesselName(dbName) === normalizeVesselName(csvName);

const ImportCSVModal: React.FC<ImportCSVModalProps> = ({ open, onOpenChange }) => {
  const { toast } = useToast();
  const { data: tripTypes = [] } = useTripTypes();
  const { data: vessels = [] } = useItineraryVessels();
  const createEntry = useCreateEntry();

  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importResults, setImportResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });

  const reset = () => {
    setStep('upload');
    setRows([]);
    setImportResults({ success: 0, failed: 0 });
  };

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const parseDate = (val: string): string | null => {
    if (!val) return null;
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    // Try DD/MM/YYYY
    const dmy = val.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    // Try MM/DD/YYYY
    const mdy = val.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
    return null;
  };

  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let current: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          current.push(field.trim());
          field = '';
        } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
          current.push(field.trim());
          if (current.some(c => c.length > 0)) lines.push(current);
          current = [];
          field = '';
          if (ch === '\r') i++;
        } else {
          field += ch;
        }
      }
    }
    current.push(field.trim());
    if (current.some(c => c.length > 0)) lines.push(current);
    return lines;
  };

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const csvRows = parseCSV(text);
      if (csvRows.length < 2) {
        toast({ title: 'Invalid CSV', description: 'File must have a header row and at least one data row.', variant: 'destructive' });
        return;
      }

      const headers = csvRows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
      const colIdx = (name: string) => headers.indexOf(name);

      const titleIdx = colIdx('title');
      const startIdx = Math.max(colIdx('start_date'), colIdx('start'));
      const endIdx = Math.max(colIdx('end_date'), colIdx('end'));
      const locIdx = colIdx('location');
      const countryIdx = colIdx('country');
      const statusIdx = colIdx('status');
      const typeIdx = Math.max(colIdx('trip_type'), colIdx('type'));
      const vesselsIdx = colIdx('vessels');
      const notesIdx = colIdx('notes');

      if (titleIdx === -1 || startIdx === -1 || endIdx === -1) {
        toast({ title: 'Missing columns', description: 'CSV must have title, start_date, and end_date columns.', variant: 'destructive' });
        return;
      }

      const parsed: ParsedRow[] = csvRows.slice(1).map((cols, i) => {
        const errors: string[] = [];
        const title = cols[titleIdx] || '';
        const rawStart = cols[startIdx] || '';
        const rawEnd = cols[endIdx] || '';
        const location = locIdx >= 0 ? (cols[locIdx] || '') : '';
        const country = countryIdx >= 0 ? (cols[countryIdx] || '') : '';
        const rawStatus = statusIdx >= 0 ? (cols[statusIdx] || '').toLowerCase() : 'draft';
        const rawType = typeIdx >= 0 ? (cols[typeIdx] || '') : '';
        const rawVessels = vesselsIdx >= 0 ? (cols[vesselsIdx] || '') : '';
        const notes = notesIdx >= 0 ? (cols[notesIdx] || '') : '';

        if (!title) errors.push('Missing title');

        const startDate = parseDate(rawStart);
        const endDate = parseDate(rawEnd);
        if (!startDate) errors.push('Invalid start date');
        if (!endDate) errors.push('Invalid end date');
        if (startDate && endDate && startDate > endDate) errors.push('Start date after end date');

        const status: ItineraryStatus = VALID_STATUSES.includes(rawStatus as ItineraryStatus)
          ? (rawStatus as ItineraryStatus)
          : 'draft';
        if (rawStatus && !VALID_STATUSES.includes(rawStatus as ItineraryStatus)) {
          errors.push(`Unknown status "${rawStatus}", defaulting to draft`);
        }

        const vesselNames = rawVessels
          ? rawVessels.split(/[,;]/).map(v => v.trim()).filter(Boolean)
          : [];
        const unmatchedVessels = vesselNames.filter(
          vn => !vessels.some(v => fuzzyVesselMatch(v.name, vn))
        );
        if (unmatchedVessels.length > 0) {
          errors.push(`Unknown vessel(s): ${unmatchedVessels.join(', ')}`);
        }

        return {
          rowNum: i + 2,
          title,
          start_date: startDate || '',
          end_date: endDate || '',
          location,
          country,
          status,
          trip_type: rawType,
          vessels: vesselNames,
          notes,
          errors,
        };
      });

      setRows(parsed);
      setStep('preview');
    };
    reader.readAsText(file);
  }, [vessels, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const validRows = rows.filter(r => r.errors.length === 0 || r.errors.every(e => e.includes('defaulting')));
  const errorRows = rows.filter(r => r.errors.some(e => !e.includes('defaulting')));

  const handleImport = async () => {
    setStep('importing');
    let success = 0;
    let failed = 0;

    for (const row of validRows) {
      try {
        const tripType = tripTypes.find(
          tt => tt.name.toLowerCase() === row.trip_type.toLowerCase()
        );
        const vesselIds = row.vessels
          .map(vn => vessels.find(v => fuzzyVesselMatch(v.name, vn))?.id)
          .filter(Boolean) as string[];

        const input: CreateEntryInput = {
          title: row.title,
          start_date: row.start_date,
          end_date: row.end_date,
          location: row.location,
          country: row.country,
          status: row.status,
          trip_type_id: tripType?.id || null,
          notes: row.notes,
          vessel_ids: vesselIds,
        };

        await createEntry.mutateAsync(input);
        success++;
      } catch {
        failed++;
      }
    }

    setImportResults({ success, failed });
    setStep('done');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {step === 'upload' && 'Import Itinerary from CSV'}
            {step === 'preview' && 'Preview Import'}
            {step === 'importing' && 'Importing...'}
            {step === 'done' && 'Import Complete'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => document.getElementById('csv-file-input')?.click()}
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">Drop CSV file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">
              Required columns: title, start_date, end_date
            </p>
            <p className="text-xs text-muted-foreground">
              Optional: location, country, status, trip_type, vessels, notes
            </p>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {step === 'preview' && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <div className="flex gap-3">
              <Badge variant="secondary" className="gap-1">
                <FileText className="w-3 h-3" />
                {rows.length} rows
              </Badge>
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {validRows.length} valid
              </Badge>
              {errorRows.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errorRows.length} errors
                </Badge>
              )}
            </div>

            <ScrollArea className="flex-1 max-h-[400px] border rounded-md">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">Title</th>
                    <th className="p-2 text-left">Dates</th>
                    <th className="p-2 text-left">Location</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Vessels</th>
                    <th className="p-2 text-left">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const hasBlockingError = row.errors.some(e => !e.includes('defaulting'));
                    return (
                      <tr
                        key={row.rowNum}
                        className={hasBlockingError ? 'bg-destructive/10' : ''}
                      >
                        <td className="p-2 text-muted-foreground">{row.rowNum}</td>
                        <td className="p-2 font-medium">{row.title || '—'}</td>
                        <td className="p-2 whitespace-nowrap">
                          {row.start_date && row.end_date
                            ? `${row.start_date} → ${row.end_date}`
                            : '—'}
                        </td>
                        <td className="p-2">
                          {row.location || row.country
                            ? `${row.location}${row.country ? `, ${row.country}` : ''}`
                            : '—'}
                        </td>
                        <td className="p-2 capitalize">{row.status}</td>
                        <td className="p-2">{row.vessels.join(', ') || '—'}</td>
                        <td className="p-2">
                          {row.errors.length > 0 ? (
                            <span className="text-destructive">{row.errors.join('; ')}</span>
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>

            {errorRows.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Rows with errors will be skipped. Only {validRows.length} valid row(s) will be imported.
              </p>
            )}
          </div>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importing entries...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center py-8 gap-3">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
            <p className="text-sm font-medium text-foreground">
              {importResults.success} entries imported successfully
            </p>
            {importResults.failed > 0 && (
              <p className="text-xs text-destructive">{importResults.failed} entries failed</p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <div className="flex gap-2 w-full justify-end">
              <Button variant="outline" size="sm" onClick={reset}>Back</Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={validRows.length === 0}
              >
                Import {validRows.length} Entries
              </Button>
            </div>
          )}
          {step === 'done' && (
            <Button size="sm" onClick={() => handleClose(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportCSVModal;

import React from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { LogbookDefinition } from '@/modules/logbooks/lib/logbookDefinitions';
import type { LogbookEntry, LogbookEntryInput } from '@/modules/logbooks/hooks/useLogbook';

const WATCH_PERIODS = [
  '00-04', '04-08', '08-12', '12-16', '16-20', '20-24', 'Day work', 'At anchor', 'In port',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: LogbookDefinition;
  entry?: LogbookEntry | null;
  defaultDate?: Date | null;
  saving?: boolean;
  logbookId?: string | null;
  companyId?: string | null;
  vesselId?: string | null;
  canManageAttachments?: boolean;
  onSubmit: (input: LogbookEntryInput) => void;
}

const toLocalInputValue = (iso: string) => {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const LogbookEntryForm: React.FC<Props> = ({
  open, onOpenChange, definition, entry, defaultDate, saving, onSubmit,
}) => {
  const [entryAt, setEntryAt] = React.useState('');
  const [watchPeriod, setWatchPeriod] = React.useState<string>('');
  const [summary, setSummary] = React.useState('');
  const [remarks, setRemarks] = React.useState('');
  const [positionText, setPositionText] = React.useState('');
  const [latitude, setLatitude] = React.useState('');
  const [longitude, setLongitude] = React.useState('');
  const [details, setDetails] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (entry) {
      setEntryAt(toLocalInputValue(entry.entry_at));
      setWatchPeriod(entry.watch_period ?? '');
      setSummary(entry.summary ?? '');
      setRemarks(entry.remarks ?? '');
      setPositionText(entry.position_text ?? '');
      setLatitude(entry.latitude != null ? String(entry.latitude) : '');
      setLongitude(entry.longitude != null ? String(entry.longitude) : '');
      const raw = (entry.data ?? {}) as Record<string, unknown>;
      const mapped: Record<string, string> = {};
      Object.entries(raw).forEach(([key, value]) => {
        mapped[key] = value == null ? '' : String(value);
      });
      setDetails(mapped);
    } else {
      const base = defaultDate ? new Date(defaultDate) : new Date();
      if (defaultDate) {
        const now = new Date();
        base.setHours(now.getHours(), now.getMinutes(), 0, 0);
      }
      setEntryAt(toLocalInputValue(base.toISOString()));
      setWatchPeriod('');
      setSummary('');
      setRemarks('');
      setPositionText('');
      setLatitude('');
      setLongitude('');
      setDetails({});
    }
  }, [open, entry, defaultDate]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!entryAt) {
      setError('Enter the date and time of the entry.');
      return;
    }
    if (!summary.trim()) {
      setError('Add a short summary of the entry.');
      return;
    }
    const cleanedDetails: Record<string, unknown> = {};
    definition.fields.forEach((field) => {
      const value = details[field.key];
      if (value === undefined || value === '') return;
      cleanedDetails[field.key] = field.type === 'number' ? Number(value) : value;
    });

    onSubmit({
      entry_at: new Date(entryAt).toISOString(),
      watch_period: watchPeriod || null,
      summary: summary.trim(),
      remarks: remarks.trim() || null,
      position_text: positionText.trim() || null,
      latitude: latitude === '' ? null : Number(latitude),
      longitude: longitude === '' ? null : Number(longitude),
      data: cleanedDetails,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? 'Edit entry' : 'New entry'} — {definition.label}</DialogTitle>
          <DialogDescription>
            Entries are saved as a draft and can be signed off by a senior officer.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="logbook-entry-at">Date &amp; time</Label>
              <Input
                id="logbook-entry-at"
                type="datetime-local"
                value={entryAt}
                onChange={(event) => setEntryAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logbook-watch">Watch / period</Label>
              <Select value={watchPeriod} onValueChange={setWatchPeriod}>
                <SelectTrigger id="logbook-watch">
                  <SelectValue placeholder="Select watch" />
                </SelectTrigger>
                <SelectContent>
                  {WATCH_PERIODS.map((period) => (
                    <SelectItem key={period} value={period}>{period}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logbook-summary">Summary</Label>
            <Input
              id="logbook-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Short description of the event or record"
            />
          </div>

          {definition.fields.length > 0 && (
            <div className="space-y-3 rounded-md border border-border p-4">
              <p className="text-sm font-semibold text-foreground">{definition.label} details</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {definition.fields.map((field) => {
                  const id = `logbook-field-${field.key}`;
                  const value = details[field.key] ?? '';
                  const setValue = (next: string) =>
                    setDetails((prev) => ({ ...prev, [field.key]: next }));
                  return (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={id}>
                        {field.label}{field.unit ? ` (${field.unit})` : ''}
                      </Label>
                      {field.type === 'select' ? (
                        <Select value={value} onValueChange={setValue}>
                          <SelectTrigger id={id}>
                            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {(field.options ?? []).map((option) => (
                              <SelectItem key={option} value={option}>{option}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : field.type === 'textarea' ? (
                        <Textarea id={id} value={value} onChange={(e) => setValue(e.target.value)} />
                      ) : (
                        <Input
                          id={id}
                          type={field.type === 'number' ? 'number' : field.type === 'time' ? 'time' : 'text'}
                          step={field.type === 'number' ? 'any' : undefined}
                          placeholder={field.placeholder}
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {definition.usesPosition && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="logbook-lat">Latitude</Label>
                <Input
                  id="logbook-lat" type="number" step="any" placeholder="36.1400"
                  value={latitude} onChange={(e) => setLatitude(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="logbook-lon">Longitude</Label>
                <Input
                  id="logbook-lon" type="number" step="any" placeholder="-5.3500"
                  value={longitude} onChange={(e) => setLongitude(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="logbook-position">Position / place</Label>
                <Input
                  id="logbook-position" placeholder="Alongside, Gibraltar"
                  value={positionText} onChange={(e) => setPositionText(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="logbook-remarks">Remarks</Label>
            <Textarea
              id="logbook-remarks"
              rows={4}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Full narrative, actions taken, names involved"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : entry ? 'Save changes' : 'Add entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LogbookEntryForm;

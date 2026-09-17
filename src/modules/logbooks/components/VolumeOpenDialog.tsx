import React from 'react';
import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { LogbookBook } from '../lib/catalog';
import type { FlagProfileId, RegistryRow, RegistrySource, VolumeRow } from '../lib/types';
import { coverFromRegistry } from '../lib/registryRules';
import { fieldProblems } from '../lib/formRules';
import { lineFields } from '../lib/lineLayouts';
import { stamp } from '../lib/format';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: LogbookBook;
  profile: FlagProfileId;
  registry: RegistryRow | null;
  continuationOf: VolumeRow | null;
  hasSensor: boolean;
  autoReadings: boolean;
  onAutoReadingsChange: (value: boolean) => void;
  saving: boolean;
  onSubmit: (input: { label: string; particulars: Record<string, unknown>; registrySource: RegistrySource | null; continuationOf: string | null }) => Promise<void>;
}

/** Administrative dialog: open a new volume (or a continuation) with a reviewed cover. */
const VolumeOpenDialog: React.FC<Props> = ({ open, onOpenChange, book, profile, registry, continuationOf, hasSensor, autoReadings, onAutoReadingsChange, saving, onSubmit }) => {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [autoFill, setAutoFill] = React.useState(false);
  const [autoKeys, setAutoKeys] = React.useState<Record<string, string>>({});
  const [reviewed, setReviewed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const suggested = React.useMemo(() => (registry ? coverFromRegistry(registry, book.id, book.coverFields) : {}), [registry, book]);

  React.useEffect(() => {
    if (!open) return;
    const label = continuationOf ? `${String(continuationOf.particulars.label ?? continuationOf.label)} · continuation` : `${book.title} · ${profile} · ${new Date().getUTCFullYear()}`;
    const fill = !continuationOf && Boolean(registry?.auto_populate_cover);
    const base: Record<string, string> = { label };
    if (continuationOf) {
      Object.entries(continuationOf.particulars).forEach(([k, v]) => { if (k !== 'label' && v !== undefined && v !== null) base[k] = String(v); });
      base.openingPlace = '';
    } else if (fill) {
      Object.entries(suggested).forEach(([k, v]) => { base[k] = String(v); });
    }
    setValues(base);
    setAutoFill(fill);
    setAutoKeys(fill ? Object.fromEntries(Object.entries(suggested).map(([k, v]) => [k, String(v)])) : {});
    setReviewed(false);
    setError(null);
  }, [open, book, profile, registry, continuationOf, suggested]);

  const toggleAutoFill = (enabled: boolean) => {
    setAutoFill(enabled);
    if (enabled) {
      const filled: Record<string, string> = {};
      const next = { ...values };
      Object.entries(suggested).forEach(([k, v]) => {
        if ((next[k] ?? '').trim() === '') { next[k] = String(v); filled[k] = String(v); }
      });
      setValues(next);
      setAutoKeys(filled);
    } else {
      // Disabling clears only unchanged automatic values; manual edits stay.
      const next = { ...values };
      Object.entries(autoKeys).forEach(([k, v]) => { if (next[k] === v) next[k] = ''; });
      setValues(next);
      setAutoKeys({});
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const particulars = lineFields(book.coverFields, values);
    const problems = fieldProblems({ fields: book.coverFields }, particulars, true);
    if (problems.length) { setError(problems[0].message); return; }
    if (!reviewed) { setError('Review the opening registry and particulars first.'); return; }
    let registrySource: RegistrySource | null = null;
    if (autoFill && registry) {
      registrySource = {
        registry_id: registry.id, profile: registry.flag_profile, version: registry.version, saved_at: registry.updated_at,
        fields: registry.fields, book_defaults: registry.book_defaults?.[book.id] ?? {},
        filled_keys: Object.keys(suggested).filter((k) => String(particulars[k]) === String(suggested[k])),
      };
    }
    try {
      await onSubmit({ label: String(particulars.label), particulars, registrySource, continuationOf: continuationOf?.id ?? null });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{continuationOf ? 'Open a continuation' : 'Open a volume'} — {book.title} · {profile}</DialogTitle>
          <DialogDescription>The cover is fixed once opened and pins this template edition ({book.sections.length} sections).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2 rounded-md border border-border p-3 text-sm">
            {continuationOf ? (
              <p>Particulars copied from the preceding volume. Review them and enter the opening place for this continuation.</p>
            ) : registry ? (
              <>
                <label className="flex items-start gap-2">
                  <Checkbox checked={autoFill} onCheckedChange={(v) => toggleAutoFill(v === true)} className="mt-0.5" />
                  <span><strong>Auto-populate from the saved vessel registry</strong><br /><small className="text-muted-foreground">{profile} · revision {registry.version} · saved {stamp(registry.updated_at)}</small></span>
                </label>
                <p className="text-xs text-muted-foreground">{autoFill ? `${Object.keys(autoKeys).length} empty fields filled. Your existing values are retained.` : 'Enter the cover manually or enable automatic population.'} Opening place and volume reference belong to this book.</p>
              </>
            ) : (
              <p>No saved registry for this flag. Complete the cover below, or <Link to="/vessel/logbooks/registry" className="text-primary underline">set up reusable vessel details</Link>.</p>
            )}
            {hasSensor && (
              <label className="flex items-start gap-2">
                <Checkbox checked={autoReadings} onCheckedChange={(v) => onAutoReadingsChange(v === true)} className="mt-0.5" />
                <span><strong>Prepare a draft from the latest {book.id === 'deck' ? 'navigation' : 'machinery'} readings</strong><br /><small className="text-muted-foreground">A draft saves automatically after opening when a fresh sample exists; your signature is still required.</small></span>
              </label>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {book.coverFields.map((field) => {
              const id = `cover-${field.key}`;
              const value = values[field.key] ?? '';
              const set = (v: string) => setValues((prev) => ({ ...prev, [field.key]: v }));
              return (
                <div key={field.key} className={field.type === 'textarea' ? 'space-y-1 sm:col-span-2' : 'space-y-1'}>
                  <Label htmlFor={id}>{field.label}{field.required ? ' *' : ''}</Label>
                  {field.options ? (
                    <select id={id} value={value} onChange={(e) => set(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">Choose…</option>
                      {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <Textarea id={id} value={value} rows={2} maxLength={4000} onChange={(e) => set(e.target.value)} />
                  ) : (
                    <Input id={id} type={field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={value} maxLength={500} onChange={(e) => set(e.target.value)} />
                  )}
                </div>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={reviewed} onCheckedChange={(v) => setReviewed(v === true)} /> I have reviewed the opening registry and particulars.
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}><BookOpen className="mr-1 h-4 w-4" /> {saving ? 'Opening…' : 'Open volume'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default VolumeOpenDialog;

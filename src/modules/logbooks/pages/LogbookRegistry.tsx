import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Ship } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/shared/hooks/use-toast';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useLogbookActor } from '../hooks/useLogbookActor';
import { useLogbookRegistry } from '../hooks/useLogbookRegistry';
import { LOGBOOK_BOOKS, getBook } from '../lib/catalog';
import { profiles, type TemplateField } from '../lib/templates';
import { registryBookKeys, registryFields, registryFromVessel, profileForFlag } from '../lib/registryRules';
import { fieldProblems } from '../lib/formRules';
import { lineFields } from '../lib/lineLayouts';
import type { FlagProfileId } from '../lib/types';
import { stamp } from '../lib/format';

const bookReferenceFields = (bookId: string): TemplateField[] =>
  (getBook(bookId)?.coverFields ?? []).filter((f) => registryBookKeys.includes(f.key)).map((f) => ({ ...f, required: false }));

/** Saved vessel registry: separate CISR / MCA revisions, shared vessel details and book-specific references. */
const LogbookRegistry: React.FC = () => {
  const { toast } = useToast();
  const { selectedVessel } = useVessel();
  const actor = useLogbookActor();
  const registry = useLogbookRegistry(actor.vesselId);
  const [profile, setProfile] = React.useState<FlagProfileId>(profileForFlag(selectedVessel?.flag_state));
  const [bookId, setBookId] = React.useState('official');
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [bookDefaults, setBookDefaults] = React.useState<Record<string, Record<string, string>>>({});
  const [autoPopulate, setAutoPopulate] = React.useState(true);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const saved = registry.forProfile(profile);
  const loadedFor = React.useRef<string>('');

  React.useEffect(() => {
    const key = `${profile}:${saved?.version ?? 0}:${selectedVessel?.id ?? ''}`;
    if (loadedFor.current === key || registry.isLoading) return;
    loadedFor.current = key;
    const source = saved?.fields ?? registryFromVessel(selectedVessel ? { ...selectedVessel, call_sign: null, mmsi: null, home_port: null } : null);
    setFields(Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v == null ? '' : String(v)])));
    setBookDefaults(Object.fromEntries(Object.entries(saved?.book_defaults ?? {}).map(([id, values]) => [id, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v == null ? '' : String(v)]))])));
    setAutoPopulate(saved?.auto_populate_cover ?? true);
    setDirty(false);
    setError(null);
  }, [profile, saved, selectedVessel, registry.isLoading]);

  const writable = actor.isMaster;
  const references = bookReferenceFields(bookId);

  const control = (field: TemplateField, value: string, onChange: (v: string) => void) => {
    const common = { 'aria-label': field.label, disabled: !writable || registry.save.isPending };
    if (field.options) {
      return (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Not entered</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (field.type === 'textarea') return <Textarea {...common} value={value} rows={2} maxLength={4000} onChange={(e) => onChange(e.target.value)} />;
    return <Input {...common} type={field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={value} maxLength={500} onChange={(e) => onChange(e.target.value)} />;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!writable || !actor.companyId || !actor.vesselId) return;
    const cleanFields = lineFields(registryFields, fields);
    const problems = fieldProblems({ fields: registryFields }, cleanFields, true);
    if (problems.length) { setError(problems[0].message); return; }
    const cleanDefaults: Record<string, Record<string, unknown>> = {};
    for (const [id, values] of Object.entries(bookDefaults)) {
      const defs = bookReferenceFields(id);
      const clean = lineFields(defs, values);
      const errs = fieldProblems({ fields: defs }, clean);
      if (errs.length) { setError(`${getBook(id)?.title}: ${errs[0].message}`); return; }
      if (Object.keys(clean).length) cleanDefaults[id] = clean;
    }
    try {
      await registry.save.mutateAsync({ companyId: actor.companyId, vesselId: actor.vesselId, profile, expectedVersion: saved?.version ?? 0, fields: cleanFields, bookDefaults: cleanDefaults, autoPopulateCover: autoPopulate });
      loadedFor.current = '';
      toast({ title: 'Vessel registry saved', description: 'Matching details can fill new book covers.' });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 p-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm"><Link to="/vessel/logbooks"><ArrowLeft className="mr-1 h-4 w-4" /> Back to logbooks</Link></Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            Registration profile
            <select value={profile} onChange={(e) => setProfile(e.target.value as FlagProfileId)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Registry flag profile">
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
          <Ship className="h-8 w-8 text-primary" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Vessel registry</h1>
            <p className="text-sm text-muted-foreground">Enter the vessel details once and reuse them in each book's opening registry. Certificate and tank references stay with their own book. Each opened volume pins the revision it was filled from.</p>
          </div>
          <Badge variant={saved ? 'default' : 'secondary'}>{saved ? `Saved · revision ${saved.version}` : 'Not saved yet'}</Badge>
        </div>
        {!writable && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">The Master maintains these details. Your role can view the registry.</p>}
        {!saved && selectedVessel && writable && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Suggested from the vessel record for {selectedVessel.name}. Review and save before reusing in book covers.</p>}

        <form onSubmit={submit} className="space-y-5">
          <section className="rounded-lg border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-semibold">{profile} · vessel registration</h2>
              <small className="text-xs text-muted-foreground">{registry.save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : saved ? `Saved ${stamp(saved.updated_at)} by ${saved.saved_by_name ?? '—'}` : 'Fill known details; missing values stay blank.'}</small>
            </header>
            <table className="w-full text-sm">
              <tbody>
                {registryFields.map((f) => (
                  <tr key={f.key} className="border-b border-border last:border-0">
                    <th scope="row" className="w-1/3 px-4 py-2 text-left font-medium">{f.label}{f.required ? ' *' : ''}</th>
                    <td className="px-4 py-2">{control(f, fields[f.key] ?? '', (v) => { setFields((p) => ({ ...p, [f.key]: v })); setDirty(true); })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="font-semibold">Book-specific references</h2>
              <select value={bookId} onChange={(e) => setBookId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Registry references for book">
                {LOGBOOK_BOOKS.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            </header>
            <p className="px-4 pt-3 text-xs text-muted-foreground">Used only for {getBook(bookId)?.title} under {profile}. Confirm these references are current when opening a volume.</p>
            <table className="w-full text-sm">
              <tbody>
                {references.map((f) => (
                  <tr key={f.key} className="border-b border-border last:border-0">
                    <th scope="row" className="w-1/3 px-4 py-2 text-left font-medium">{f.label}</th>
                    <td className="px-4 py-2">{control(f, bookDefaults[bookId]?.[f.key] ?? '', (v) => { setBookDefaults((p) => ({ ...p, [bookId]: { ...(p[bookId] ?? {}), [f.key]: v } })); setDirty(true); })}</td>
                  </tr>
                ))}
                {references.length === 0 && <tr><td className="px-4 py-3 text-xs text-muted-foreground">This book has no registry-backed references beyond the shared vessel details.</td></tr>}
              </tbody>
            </table>
          </section>

          <section className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
            <div>
              <p className="font-medium">Auto-populate the registry when opening a logbook</p>
              <p className="text-xs text-muted-foreground">Fill matching cover fields from these saved details. The opening form stays editable for review. Later registry changes apply to future volumes only.</p>
            </div>
            <Switch checked={autoPopulate} disabled={!writable} onCheckedChange={(v) => { setAutoPopulate(v); setDirty(true); }} aria-label="Auto-populate covers from the registry" />
          </section>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {writable && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={registry.save.isPending}>Save vessel registry</Button>
              <Button type="button" variant="outline" disabled={registry.save.isPending} onClick={() => { loadedFor.current = ''; void registry.refetch(); }}>Reload saved details</Button>
              <span className="text-xs text-muted-foreground">AMCS/NMEA draft preferences live inside the deck and engine books.</span>
            </div>
          )}
        </form>
      </div>
    </DashboardLayout>
  );
};

export default LogbookRegistry;

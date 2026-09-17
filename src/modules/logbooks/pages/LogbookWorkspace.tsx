import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/shared/hooks/use-toast';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import BookStrip from '../components/BookStrip';
import BookMasthead from '../components/BookMasthead';
import BookToolbar from '../components/BookToolbar';
import SectionTabs from '../components/SectionTabs';
import RuledSheet from '../components/RuledSheet';
import PageReviewFooter from '../components/PageReviewFooter';
import VolumeOpenDialog from '../components/VolumeOpenDialog';
import VolumeCoverDialog from '../components/VolumeCoverDialog';
import CloseVolumeDialog from '../components/CloseVolumeDialog';
import PrintBook from '../components/PrintBook';
import LogbookExportDialog from '../components/LogbookExportDialog';
import { LOGBOOK_BOOKS, getBook, getBookBySlug, type LogbookBook } from '../lib/catalog';
import { bookColumns, eventTime, lineFields } from '../lib/lineLayouts';
import { freshReading, particularsFromVolume, profileForFlag } from '../lib/registryRules';
import { fetchEntry, type SignKind } from '../lib/logbookApi';
import { stamp } from '../lib/format';
import type { EntryView, FlagProfileId, SampleRow, VolumeRow } from '../lib/types';
import type { TemplateSection } from '../lib/templates';
import { useLogbookActor } from '../hooks/useLogbookActor';
import { useLogbookWorkspace } from '../hooks/useLogbookWorkspace';
import { useBookCounts } from '../hooks/useBookCounts';
import { useLogbookRegistry } from '../hooks/useLogbookRegistry';
import { useLogbookSamples } from '../hooks/useLogbookSamples';
import { useLogbookPreferences } from '../hooks/useLogbookPreferences';
import { useWorkingCopies, type LineBuffer } from '../hooks/useWorkingCopies';

interface OpenBookState { bookId?: string; profile?: FlagProfileId; volumeId?: string; sectionId?: string; }
const OPEN_KEY = 'logbooks:open-book';
const readOpenState = (): OpenBookState => { try { return JSON.parse(sessionStorage.getItem(OPEN_KEY) || '{}'); } catch { return {}; } };
const writeOpenState = (state: OpenBookState) => { try { sessionStorage.setItem(OPEN_KEY, JSON.stringify(state)); } catch { /* ignore */ } };

const LEGACY_SECTION: TemplateSection = { id: 'legacy', title: 'Earlier records', fields: [], referencePages: 'Previous module', signing: 'officer', coverage: 'Original fields and signatures preserved' };

const scrollToLine = (id: string, edit = false) => {
  requestAnimationFrame(() => {
    const row = document.getElementById(`line-${id}`);
    row?.scrollIntoView?.({ behavior: 'instant' as ScrollBehavior, block: 'center' });
    if (edit) row?.querySelector<HTMLElement>('input,select,textarea')?.focus({ preventScroll: true });
  });
};

/**
 * The book workspace. The book itself is the editing surface: a horizontal
 * strip selects one of the 19 books, and the ruled sheet below holds every
 * entry as a numbered line with its signatures beside it.
 */
const LogbookWorkspace: React.FC = () => {
  const { logbookSlug } = useParams<{ logbookSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { selectedVessel } = useVessel();
  const actor = useLogbookActor();
  const prefs = useLogbookPreferences(actor.userId);

  const saved = React.useMemo(readOpenState, []);
  const book = getBookBySlug(logbookSlug) ?? getBook(saved.bookId) ?? LOGBOOK_BOOKS[0];
  const [profile, setProfile] = React.useState<FlagProfileId>(saved.profile ?? profileForFlag(selectedVessel?.flag_state));
  const [volumeId, setVolumeId] = React.useState<string | null>(saved.volumeId ?? null);
  const [sectionId, setSectionId] = React.useState<string>(saved.sectionId ?? '');
  const [pageView, setPageView] = React.useState<string>('all');
  const [proposal, setProposal] = React.useState<string[] | null>(null);
  const [query, setQuery] = React.useState('');
  const [highlighted, setHighlighted] = React.useState<string | null>(null);
  const [busyIds, setBusyIds] = React.useState<Set<string>>(new Set());
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [dialog, setDialog] = React.useState<'open' | 'continue' | 'cover' | 'close' | 'export' | null>(null);
  const [printing, setPrinting] = React.useState(false);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  const ws = useLogbookWorkspace(actor.vesselId, book, profile, volumeId);
  const { counts } = useBookCounts(actor.vesselId);
  const registry = useLogbookRegistry(actor.vesselId);
  const { samples } = useLogbookSamples(actor.vesselId, actor.companyId);
  const copies = useWorkingCopies(actor.userId, (message) => toast({ title: message, variant: 'destructive' }));

  React.useEffect(() => {
    if (!logbookSlug) navigate(`/vessel/logbooks/${book.slug}`, { replace: true });
  }, [logbookSlug, book.slug, navigate]);

  React.useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 5000); return () => clearInterval(t); }, []);

  const volume = ws.volume;
  const sections = React.useMemo<TemplateSection[]>(
    () => [...(volume?.template.sections ?? book.sections), ...(ws.legacyEntries.length ? [LEGACY_SECTION] : [])],
    [volume, book, ws.legacyEntries.length],
  );
  const section = sections.find((s) => s.id === sectionId) ?? sections[0];
  const legacy = section.id === 'legacy';

  React.useEffect(() => { writeOpenState({ bookId: book.id, profile, volumeId: volume?.id, sectionId: section.id }); }, [book.id, profile, volume?.id, section.id]);

  const rows = React.useMemo(
    () => (legacy ? ws.legacyEntries : ws.entries.filter((e) => e.section_id === section.id)).slice().sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0) || a.created_at.localeCompare(b.created_at)),
    [legacy, ws.legacyEntries, ws.entries, section.id],
  );
  const sectionPages = React.useMemo(() => ws.pages.filter((p) => p.section_id === section.id), [ws.pages, section.id]);
  const fixedPage = sectionPages.find((p) => p.id === pageView) ?? null;
  const reviewing = pageView === 'review' && proposal !== null;
  const visible = React.useMemo(() => {
    const ids = reviewing ? proposal! : fixedPage ? fixedPage.entry_ids : null;
    return ids ? ids.map((id) => rows.find((e) => e.id === id)).filter((e): e is EntryView => Boolean(e)) : rows;
  }, [reviewing, proposal, fixedPage, rows]);
  const fixed = Boolean(fixedPage || reviewing);
  const editable = Boolean(volume?.status === 'open' && !legacy && actor.canWrite(book, section));
  const columns = React.useMemo(() => bookColumns(book.id, section), [book.id, section]);

  const own = React.useCallback((e: EntryView) => e.status === 'draft' && e.recorded_by === actor.userId, [actor.userId]);

  const freshBuffer = React.useCallback((e: EntryView): LineBuffer => ({
    id: e.id, existingId: e.id, bookId: book.id, volumeId: e.volume_id ?? '', sectionId: e.section_id ?? '', schema: e.schema_snapshot!,
    version: e.version, fields: Object.fromEntries(Object.entries(e.data).map(([k, v]) => [k, v == null ? '' : String(v)])),
    occurredAt: e.entry_at.slice(0, 16), originalTime: e.entry_at, notes: e.remarks ?? '', sample: e.source_snapshot ?? null,
    overrideReason: e.override_reason ?? '', correctsId: e.amended_from_id, correctionReason: e.amendment_reason ?? '', dirty: false,
  }), [book.id]);

  const buffers = React.useMemo(() => {
    const result: Record<string, LineBuffer> = {};
    if (!editable || fixed) return result;
    for (const e of rows) {
      if (!own(e)) continue;
      const stored = copies.store[e.id];
      result[e.id] = stored && (stored.dirty || stored.version === e.version) ? stored : freshBuffer(e);
    }
    return result;
  }, [rows, own, copies.store, editable, fixed, freshBuffer]);

  const newRows = React.useMemo(
    () => (fixed ? [] : copies.list.filter((b) => !b.existingId && b.bookId === book.id && b.volumeId === (volume?.id ?? '') && b.sectionId === section.id)),
    [copies.list, book.id, volume?.id, section.id, fixed],
  );

  const ownDraft = React.useMemo(() => ws.entries.find((e) => own(e) && !e.superseded_by_id) ?? null, [ws.entries, own]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const selectBook = (next: LogbookBook) => {
    if (next.id === book.id) return;
    setVolumeId(null); setSectionId(''); setPageView('all'); setProposal(null); setHighlighted(null);
    navigate(`/vessel/logbooks/${next.slug}`);
  };
  const selectSection = (id: string) => { setSectionId(id); setPageView('all'); setProposal(null); };
  const selectProfile = (p: FlagProfileId) => { setProfile(p); setVolumeId(null); setSectionId(''); setPageView('all'); setProposal(null); };

  const openEntry = React.useCallback(async (id: string) => {
    const e = ws.entries.find((x) => x.id === id) ?? ws.legacyEntries.find((x) => x.id === id) ?? (await fetchEntry(id));
    if (!e) { toast({ title: 'Record not found', variant: 'destructive' }); return; }
    if (e.flag_profile && e.flag_profile !== profile) setProfile(e.flag_profile);
    if (e.volume_id) setVolumeId(e.volume_id);
    setSectionId(e.section_id ?? 'legacy');
    setPageView(e.page_id ?? 'all');
    setProposal(null);
    setHighlighted(e.id);
    scrollToLine(e.id, own(e));
  }, [ws.entries, ws.legacyEntries, profile, own, toast]);

  // Deep links from the review queue and records pages: /vessel/logbooks/<slug>?entry=<id>
  React.useEffect(() => {
    const id = new URLSearchParams(location.search).get('entry');
    if (!id || ws.isLoading) return;
    (async () => {
      const e = await fetchEntry(id);
      navigate(location.pathname, { replace: true });
      if (!e) { toast({ title: 'Record not found', variant: 'destructive' }); return; }
      if (e.flag_profile) setProfile(e.flag_profile);
      if (e.volume_id) setVolumeId(e.volume_id);
      setSectionId(e.section_id ?? 'legacy');
      setPageView(e.page_id ?? 'all');
      setProposal(null);
      setHighlighted(e.id);
      scrollToLine(e.id, own(e));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, ws.isLoading]);

  // Deep link from Connections: /vessel/logbooks/<slug>?sample=<id> starts a line from that captured sample.
  const sampleParam = new URLSearchParams(location.search).get('sample');
  React.useEffect(() => {
    if (!sampleParam || ws.isLoading || !volume) return;
    const sample = samples.find((s) => s.id === sampleParam);
    navigate(location.pathname, { replace: true });
    if (!sample) { toast({ title: 'Sample not found', variant: 'destructive' }); return; }
    const targetId = book.id === 'deck' ? 'watch' : book.id === 'engine' ? 'round' : section.id;
    addLine(null, sample, { section: sections.find((x) => x.id === targetId) ?? section });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleParam, ws.isLoading, volume?.id, samples.length]);

  // ── Lines ─────────────────────────────────────────────────────────────────
  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyIds((s) => new Set(s).add(id));
    try { await fn(); } finally { setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
  };

  const saveLine = React.useCallback(async (id: string) => {
    const b = copies.get(id) ?? buffers[id];
    if (!b || !ws.logbookRow) return;
    const target = ws.allVolumes.find((v) => v.id === b.volumeId) ?? volume;
    if (!target) return;
    if (!b.occurredAt) { setErrors((e) => ({ ...e, [id]: 'Enter the event time.' })); return; }
    if (b.correctsId && !b.existingId && !b.correctionReason.trim()) { setErrors((e) => ({ ...e, [id]: 'Correction reason is required.' })); return; }
    const revision = JSON.stringify(b);
    setErrors((e) => { const n = { ...e }; delete n[id]; return n; });
    await withBusy(id, async () => {
      try {
        const savedRow = await ws.save.mutateAsync({
          id: b.existingId ?? undefined, expectedVersion: b.version, logbookId: ws.logbookRow!.id, companyId: target.company_id, vesselId: target.vessel_id,
          volumeId: target.id, sectionId: b.sectionId, entryAt: eventTime(b.occurredAt, b.originalTime), data: lineFields(b.schema.fields, b.fields),
          remarks: b.notes.trim() || null, sourceSampleId: b.sample?.id ?? null, overrideReason: b.overrideReason.trim() || null,
          amendedFromId: b.existingId ? undefined : b.correctsId, amendmentReason: b.existingId ? undefined : b.correctionReason.trim() || null,
        });
        const latest = copies.get(id) ?? b;
        if (JSON.stringify(latest) !== revision) {
          // Edits made while saving stay with the saved row.
          copies.rekey(id, { ...latest, id: savedRow.id, existingId: savedRow.id, version: savedRow.version, originalTime: savedRow.entry_at });
        } else {
          copies.remove(id);
        }
        setHighlighted(savedRow.id);
        toast({ title: 'Line saved', description: 'Review and sign here when complete.' });
        scrollToLine(savedRow.id);
      } catch (error) {
        setErrors((e) => ({ ...e, [id]: (error as Error).message }));
        toast({ title: 'Could not save line', description: (error as Error).message, variant: 'destructive' });
      }
    });
  }, [buffers, copies, volume, ws.allVolumes, ws.logbookRow, ws.save, toast]);

  /**
   * Add a new line (or a correction of `existing`, or a draft from `sample`).
   * `options.section` / `options.volume` override the current selection so
   * callers that have just changed section or volume do not depend on a
   * re-render before the row is created.
   */
  const addLine = React.useCallback((existing: EntryView | null, sample: SampleRow | null, options: { automatic?: boolean; section?: TemplateSection; volume?: VolumeRow } = {}): boolean => {
    const v = options.volume ?? volume;
    const s = options.section ?? section;
    if (!v || v.status !== 'open') { toast({ title: 'The Master needs to open a volume before you can add a line.', variant: 'destructive' }); return false; }
    if (!actor.canWrite(book, s) || s.id === 'legacy') { toast({ title: 'Your role cannot write in this section.', variant: 'destructive' }); return false; }
    if (sample && !freshReading([sample], sample.sample_type)) { toast({ title: 'Capture a fresh sample first.', variant: 'destructive' }); return false; }
    if (options.automatic && sample) {
      const prior = ws.entries.find((e) => e.volume_id === v.id && e.section_id === s.id && e.recorded_by === actor.userId && e.source_sample_id === sample.id);
      const working = copies.list.find((b) => b.volumeId === v.id && b.sectionId === s.id && b.sample?.id === sample.id);
      if (prior || working) { setHighlighted((prior ?? working)!.id); scrollToLine((prior ?? working)!.id); return false; }
    }
    const values: Record<string, string> = existing
      ? Object.fromEntries(Object.entries(existing.data).map(([k, val]) => [k, val == null ? '' : String(val)]))
      : Object.fromEntries(Object.entries(particularsFromVolume(v, s)).map(([k, val]) => [k, String(val)]));
    if (sample) for (const f of s.fields) if (f.telemetry && sample.values[f.telemetry] !== undefined) values[f.key] = String(sample.values[f.telemetry]);
    const id = `new-${crypto.randomUUID()}`;
    const originalTime = existing?.entry_at ?? sample?.observed_at ?? new Date().toISOString();
    copies.put({
      id, existingId: null, bookId: book.id, volumeId: v.id, sectionId: s.id, schema: s, version: 0, fields: values,
      occurredAt: originalTime.slice(0, 16), originalTime, notes: existing?.remarks ?? '', sample, overrideReason: '',
      correctsId: existing?.id ?? null, correctionReason: '', dirty: true,
    });
    if (options.volume && options.volume.id !== volume?.id) setVolumeId(options.volume.id);
    if (options.section && options.section.id !== section.id) setSectionId(options.section.id);
    setPageView('all'); setProposal(null); setHighlighted(id);
    scrollToLine(id, true);
    if (options.automatic) setTimeout(() => void saveLine(id), 0);
    return true;
  }, [volume, actor, book, section, ws.entries, copies, toast, saveLine]);

  const onChange = React.useCallback((id: string, patch: (b: LineBuffer) => LineBuffer) => {
    if (copies.store[id]) copies.update(id, patch);
    else if (buffers[id]) copies.put(patch(buffers[id]));
    setErrors((e) => { if (!e[id]) return e; const n = { ...e }; delete n[id]; return n; });
  }, [copies, buffers]);

  const attest = React.useCallback(async (entry: EntryView, kind: SignKind, witness?: { name: string; capacity: string }) => {
    if (own(entry) && copies.store[entry.id]?.dirty) { toast({ title: 'Save your changes before signing.', variant: 'destructive' }); return; }
    await withBusy(entry.id, async () => {
      try {
        await ws.sign.mutateAsync({ id: entry.id, version: entry.version, kind, witness });
        copies.remove(entry.id);
        setHighlighted(entry.id);
        toast({ title: 'Attestation recorded beside the line.' });
      } catch (error) {
        setErrors((e) => ({ ...e, [entry.id]: (error as Error).message }));
        toast({ title: 'Could not sign', description: (error as Error).message, variant: 'destructive' });
      }
    });
  }, [own, copies, ws.sign, toast]);

  const correct = React.useCallback((entry: EntryView) => {
    if (!volume) return;
    if (volume.status === 'closed') {
      const continuation = ws.allVolumes.find((v) => v.continuation_of === volume.id && v.status === 'open');
      if (!continuation) { toast({ title: 'Open a continuation volume before correcting this closed book.', variant: 'destructive' }); return; }
      addLine(entry, null, { volume: continuation });
      return;
    }
    addLine(entry, null);
  }, [volume, ws.allVolumes, addLine, toast]);

  const canCorrectEntry = React.useCallback((e: EntryView) =>
    e.status !== 'draft' && !e.superseded_by_id && !ws.entries.some((x) => x.amended_from_id === e.id) && actor.canWrite(book, section) && !legacy,
  [ws.entries, actor, book, section, legacy]);

  // ── Automatic readings on open ────────────────────────────────────────────
  const fresh = freshReading(samples, book.sensor);
  const readingStatus = fresh
    ? `${fresh.mode === 'simulated' ? 'Simulated sample' : 'Captured sample'} · ${stamp(fresh.observed_at, true)} · review required`
    : 'No fresh sample available · use Connections to capture one';
  const openedFor = React.useRef<string>('');
  React.useEffect(() => {
    const key = `${book.id}:${profile}:${volume?.id ?? ''}:${prefs.autoReadings}`;
    if (openedFor.current === key) return;
    openedFor.current = key;
    if (!prefs.autoReadings || !book.sensor || !volume || volume.status !== 'open' || !actor.canWrite(book, section) || !fresh || ws.isLoading) return;
    const targetId = book.id === 'deck' ? 'watch' : 'round';
    const target = sections.find((x) => x.id === targetId);
    if (!target || !actor.canWrite(book, target)) return;
    addLine(null, fresh, { automatic: true, section: target });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, profile, volume?.id, prefs.autoReadings, section.id, ws.isLoading, fresh?.id, tick]);

  // ── Pages ─────────────────────────────────────────────────────────────────
  const preparePage = () => {
    const ids = rows.filter((e) => e.status !== 'draft' && !e.page_id && !e.superseded_by_id).slice(0, 100).map((e) => e.id);
    setProposal(ids); setPageView('review'); setPageError(null);
  };
  const sealPage = async () => {
    if (!proposal) return;
    try {
      const page = await ws.seal.mutateAsync({ sectionId: section.id, entryIds: proposal });
      setProposal(null); setPageView(page.id);
      toast({ title: 'Page signed', description: 'New records will go on a new page.' });
    } catch (error) { setPageError((error as Error).message); }
  };

  // ── Volumes ───────────────────────────────────────────────────────────────
  const openVolume = async (input: { label: string; particulars: Record<string, unknown>; registrySource: VolumeRow['registry_source']; continuationOf: string | null }) => {
    if (!actor.companyId || !actor.vesselId) throw new Error('Select a vessel first.');
    const created = await ws.open.mutateAsync({ companyId: actor.companyId, vesselId: actor.vesselId, book, profile, ...input });
    setVolumeId(created.id); setSectionId(''); setDialog(null); openedFor.current = '';
    toast({ title: 'Volume opened', description: 'Saved registry details are fixed in its cover.' });
  };
  const closeVolume = async (input: { place: string; reason: string }) => {
    await ws.close.mutateAsync(input);
    setDialog(null);
    toast({ title: 'Volume closed', description: 'Its records remain available.' });
  };

  if (!selectedVessel) {
    return (
      <DashboardLayout>
        <div className="space-y-4 p-1">
          <h1 className="text-2xl font-bold text-foreground">Logbooks</h1>
          <Card><CardContent className="py-6 text-sm text-muted-foreground">Select a vessel from the menu in the lower left to open its logbooks.</CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  if (printing && volume) {
    return <PrintBook book={book} volume={volume} entries={ws.entries} pages={ws.pages} onExit={() => setPrinting(false)} />;
  }

  const canPrepare = Boolean(volume?.status === 'open' && !legacy && rows.some((e) => e.status !== 'draft' && !e.page_id && !e.superseded_by_id));

  return (
    <DashboardLayout collapseSidebar={prefs.expanded}>
      <div className="space-y-4 p-1">
        <div className="flex items-start justify-between gap-2">
          <BookStrip books={LOGBOOK_BOOKS} counts={counts} selectedId={book.id} onSelect={selectBook} query={query} onQueryChange={setQuery} />
          <Button type="button" variant="ghost" size="sm" className="mt-0.5 shrink-0" onClick={() => prefs.setExpanded(!prefs.expanded)} aria-pressed={prefs.expanded}>
            {prefs.expanded ? <><PanelLeftOpen className="mr-1 h-4 w-4" /> Restore sidebar</> : <><PanelLeftClose className="mr-1 h-4 w-4" /> Expand workspace</>}
          </Button>
        </div>

        <BookMasthead
          book={book} volume={volume} profile={profile} vesselName={selectedVessel.name} entries={ws.entries}
          pageCount={ws.pages.length} sectionCount={sections.length} ownDraftId={ownDraft?.id ?? null} onContinueDraft={(id) => void openEntry(id)}
        />

        <BookToolbar
          book={book} profile={profile} onProfileChange={selectProfile} volumes={ws.volumes} volume={volume}
          onVolumeChange={(id) => { setVolumeId(id); setSectionId(''); setPageView('all'); setProposal(null); }}
          registry={registry.forProfile(profile)} isMaster={actor.isMaster} autoReadings={prefs.autoReadings}
          onAutoReadingsChange={(v) => { prefs.setAutoReadings(v); openedFor.current = ''; }} readingStatus={readingStatus}
          onOpenVolume={() => setDialog('open')} onContinueVolume={() => setDialog('continue')} onShowCover={() => setDialog('cover')}
          onCloseVolume={() => setDialog('close')} onPrint={() => setDialog('export')}
        />

        <section className="space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
          <SectionTabs sections={sections} activeId={section.id} onSelect={selectSection} />
          <header className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{legacy ? 'Earlier records' : fixedPage ? `Signed page ${fixedPage.page_number}` : 'Logbook entries'}</div>
              <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
              <p className="text-xs text-muted-foreground">{section.fields.length} fields · All times UTC · * Required to sign{section.signing !== 'officer' ? ` · signing policy: ${section.signing}` : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">
                <span className="sr-only">Page</span>
                <select value={pageView} onChange={(e) => { setPageView(e.target.value); if (e.target.value !== 'review') setProposal(null); }} className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label="Book page">
                  <option value="all">All lines · {rows.length}</option>
                  {sectionPages.map((p) => <option key={p.id} value={p.id}>Signed page {p.page_number} · {p.entry_ids.length} line{p.entry_ids.length === 1 ? '' : 's'}</option>)}
                  {reviewing && <option value="review">Page review · unsigned</option>}
                </select>
              </label>
              {editable && !fixed && <Button type="button" size="sm" onClick={() => addLine(null, null)}><Plus className="mr-1 h-4 w-4" /> Add line</Button>}
            </div>
          </header>
          {section.help && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Instructions for this section</summary><p className="mt-1">{section.help}</p></details>}
          {!volume && !legacy && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Preview the ruled page below. The Master opens a volume before the crew writes in it.</p>}
          {volume && !editable && volume.status === 'open' && !legacy && !actor.canWrite(book, section) && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Your role ({actor.capacity ?? 'no capacity'}) can read this section. Authorship is limited to {section.roles?.join(', ') ?? book.roles.join(', ')}.</p>
          )}
          {reviewing && <p className="rounded-md bg-primary/10 px-3 py-2 text-xs">Review {proposal!.length} line{proposal!.length === 1 ? '' : 's'} together. The Master's page signature will fix this group of records.</p>}

          {ws.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-40 w-full" /></div>
          ) : (
            <RuledSheet
              book={book} section={section} columns={columns} rows={visible} buffers={buffers} newRows={newRows} allEntries={ws.entries}
              highlightedId={highlighted} busyIds={busyIds} errors={errors} editable={editable && !fixed} fixed={fixed}
              capacity={actor.capacity} userId={actor.userId} canManageAttachments={editable || actor.isMaster}
              canCorrectEntry={canCorrectEntry} onWriteOnLine={() => addLine(null, null)}
              onChange={onChange} onSave={(id) => void saveLine(id)} onRevert={(id) => { copies.remove(id); toast({ title: 'Loaded the saved line; unsaved edits reverted.' }); }}
              onDiscard={(id) => copies.remove(id)} onAttest={(e, k, w) => void attest(e, k, w)} onCorrect={correct}
              onOpenEntry={(id) => void openEntry(id)} onViewPage={(id) => { setPageView(id); setProposal(null); }}
            />
          )}

          <PageReviewFooter
            fixedPage={fixedPage} reviewing={reviewing} reviewCount={proposal?.length ?? 0} canPrepare={canPrepare} isMaster={actor.isMaster}
            busy={ws.seal.isPending} error={pageError} coverage={section.coverage}
            onPrepare={preparePage} onSeal={() => void sealPage()} onCancel={() => { setProposal(null); setPageView('all'); }}
          />
        </section>

        <p className="text-[11px] text-muted-foreground">
          Prototype notice: this workspace records reviewed electronic attestations, not advanced electronic signatures. It holds no class, MCA or Cayman approval. Readings are simulated or pasted; no live equipment gateway is connected.
        </p>
      </div>

      <VolumeOpenDialog
        open={dialog === 'open' || dialog === 'continue'} onOpenChange={(o) => !o && setDialog(null)} book={book} profile={profile}
        registry={registry.forProfile(profile)} continuationOf={dialog === 'continue' ? volume : null} hasSensor={Boolean(book.sensor)}
        autoReadings={prefs.autoReadings} onAutoReadingsChange={prefs.setAutoReadings} saving={ws.open.isPending} onSubmit={openVolume}
      />
      <VolumeCoverDialog open={dialog === 'cover'} onOpenChange={(o) => !o && setDialog(null)} volume={volume} />
      {volume && (
        <LogbookExportDialog
          open={dialog === 'export'} onOpenChange={(o) => !o && setDialog(null)} book={book} volume={volume} section={section}
          entries={ws.entries} vesselName={selectedVessel.name} onPrintBook={() => setPrinting(true)}
        />
      )}
      <CloseVolumeDialog open={dialog === 'close'} onOpenChange={(o) => !o && setDialog(null)} volume={volume} saving={ws.close.isPending} onSubmit={closeVolume} />
    </DashboardLayout>
  );
};

export default LogbookWorkspace;

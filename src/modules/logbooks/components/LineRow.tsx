import React from 'react';
import { Plug, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import CellField from './CellField';
import SignatureCell from './SignatureCell';
import LineHistory from './LineHistory';
import type { SheetColumn } from '../lib/lineLayouts';
import { itemCode, lineFields, timeMatches } from '../lib/lineLayouts';
import { completion, fieldRequired } from '../lib/formRules';
import type { EntryView } from '../lib/types';
import type { LineBuffer } from '../hooks/useWorkingCopies';
import type { CrewCapacity } from '../lib/roles';
import type { SignKind } from '../lib/logbookApi';
import { stamp } from '../lib/format';

export interface LineRowProps {
  entry: EntryView | null;
  buffer: LineBuffer | null;
  number: number;
  columns: SheetColumn[];
  highlighted: boolean;
  capacity: CrewCapacity | null;
  userId: string | null;
  busy: boolean;
  error: string | null;
  canCorrect: boolean;
  canManageAttachments: boolean;
  onChange: (id: string, patch: (b: LineBuffer) => LineBuffer) => void;
  onSave: (id: string) => void;
  onRevert: (id: string) => void;
  onDiscard: (id: string) => void;
  /** Delete a saved draft of the current user. */
  onDelete: (id: string) => void;
  onAttest: (entry: EntryView, kind: SignKind, witness?: { name: string; capacity: string }) => void;
  onCorrect: (entry: EntryView) => void;
  onOpenEntry: (id: string) => void;
  onViewPage: (pageId: string) => void;
}

const statusLabel = (entry: EntryView | null) => {
  if (!entry) return 'New line';
  if (entry.superseded_by_id) return 'Superseded';
  if (entry.status === 'draft') return 'Draft';
  if (entry.page_id) return 'Signed page';
  if (entry.status === 'verified') return 'Master reviewed';
  if (entry.status === 'finalized') return 'Finalised';
  return 'Signed';
};

/** One ruled line: the main row of cells plus the under-row with notes, evidence and actions. */
const LineRow: React.FC<LineRowProps> = ({
  entry, buffer, number, columns, highlighted, capacity, userId, busy, error, canCorrect, canManageAttachments,
  onChange, onSave, onRevert, onDiscard, onDelete, onAttest, onCorrect, onOpenEntry, onViewPage,
}) => {
  const id = buffer?.id ?? entry!.id;
  const schema = buffer?.schema ?? entry?.schema_snapshot ?? { fields: [] };
  const values: Record<string, unknown> = buffer ? buffer.fields : (entry?.data ?? {});
  const notesRef = React.useRef<HTMLDetailsElement>(null);
  const rowRef = React.useRef<HTMLTableSectionElement>(null);
  const [missingOpen, setMissingOpen] = React.useState(false);

  const stats = React.useMemo(() => (buffer ? completion(buffer.schema, lineFields(buffer.schema.fields, buffer.fields)) : null), [buffer]);
  const sourceChanged = React.useMemo(() => {
    if (!buffer?.sample) return false;
    const changedField = buffer.schema.fields.some((f) => f.telemetry && String(buffer.fields[f.key] ?? '') !== String(buffer.sample!.values[f.telemetry] ?? ''));
    return changedField || !timeMatches(buffer.occurredAt, buffer.sample.observed_at);
  }, [buffer]);

  React.useEffect(() => {
    if (sourceChanged && notesRef.current) notesRef.current.open = true;
  }, [sourceChanged]);

  const setField = (key: string, value: string) => onChange(id, (b) => ({ ...b, fields: { ...b.fields, [key]: value }, dirty: true }));
  const setExtra = (key: 'notes' | 'overrideReason' | 'correctionReason' | 'occurredAt', value: string) => onChange(id, (b) => ({ ...b, [key]: value, dirty: true }));

  const focusField = (key: string) => {
    const el = rowRef.current?.querySelector<HTMLElement>(`[data-line-field="${key}"], [data-line-extra="${key}"]`);
    if (!el) return;
    const disclosure = el.closest('details');
    if (disclosure) disclosure.open = true;
    el.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
    el.focus({ preventScroll: true });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (buffer && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); onSave(id); }
  };

  const showLabel = (col: SheetColumn) => Boolean(col.fields && (col.fields.length > 1 || col.numbered || col.title !== col.fields[0]?.label));

  const cell = (col: SheetColumn) => {
    if (col.kind === 'date') {
      return buffer ? (
        <label className="block">
          <input
            type="datetime-local"
            data-line-extra="occurredAt"
            aria-label={`Event time UTC · line ${number}`}
            value={buffer.occurredAt}
            required
            onChange={(e) => setExtra('occurredAt', e.target.value)}
            className="w-[11.5rem] rounded border border-input bg-background px-1.5 py-1 text-[13px] focus:border-primary focus-visible:outline-none focus:ring-2 focus:ring-primary"
          />
          <small className="block text-[10px] text-muted-foreground">UTC</small>
        </label>
      ) : (
        <time dateTime={entry!.entry_at} className="whitespace-nowrap text-[13px]">{stamp(entry!.entry_at)}</time>
      );
    }
    if (col.kind === 'signatures') {
      return (
        <SignatureCell
          entry={entry}
          isOwnDraft={Boolean(entry && entry.status === 'draft' && entry.recorded_by === userId)}
          dirty={Boolean(buffer?.dirty)}
          missingCount={stats?.missing.length ?? 0}
          capacity={capacity}
          userId={userId}
          busy={busy}
          onAttest={(kind, witness) => entry && onAttest(entry, kind, witness)}
        />
      );
    }
    if (col.kind === 'entered') return entry ? <span className="whitespace-nowrap text-[13px]">{stamp(entry.created_at)}</span> : <span className="text-xs italic text-muted-foreground">Recorded on save</span>;
    if (col.kind === 'code') {
      const s = buffer?.schema ?? entry?.schema_snapshot;
      return <strong className="font-mono text-base">{s?.operationCode ?? s?.id}</strong>;
    }
    if (!col.fields?.length) return <span className="text-muted-foreground" aria-label="Not applicable to this operation">—</span>;
    return (
      <div className={cn('space-y-1', col.numbered && 'space-y-1.5')}>
        {col.fields.map((field) => buffer ? (
          <CellField
            key={field.key}
            field={field}
            value={buffer.fields[field.key] ?? ''}
            required={fieldRequired(field, buffer.fields)}
            invalid={Boolean(buffer.fields[field.key]) && Boolean(stats?.missing.some((p) => p.key === field.key))}
            lineNumber={number}
            showLabel={showLabel(col)}
            onChange={(v) => setField(field.key, v)}
          />
        ) : (
          <div key={field.key} className="text-[13px]">
            {showLabel(col) && <small className="block text-[11px] leading-tight text-muted-foreground">{field.item ? `${itemCode(field.item)} · ` : ''}{field.label}</small>}
            <span className="whitespace-pre-wrap">{values[field.key] === undefined || values[field.key] === '' ? '—' : String(values[field.key])}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <tbody
      id={`line-${id}`}
      ref={rowRef}
      onKeyDown={onKeyDown}
      className={cn('border-b border-border', highlighted && 'bg-primary/5', entry?.superseded_by_id && 'opacity-70')}
    >
      <tr className={cn(buffer ? 'bg-card' : 'bg-transparent')}>
        <th scope="row" className="sticky left-0 z-10 w-12 border-r border-border bg-card px-2 py-2 text-left align-top">
          <span className="font-mono text-sm">{String(number).padStart(2, '0')}</span>
          <small className="block text-[10px] font-normal leading-tight text-muted-foreground">{statusLabel(entry)}</small>
        </th>
        {columns.map((col) => (
          <td
            key={col.key}
            className={cn(
              'border-r border-border px-2 py-2 align-top',
              col.wide && 'min-w-[16rem]',
              col.kind === 'signatures' && 'min-w-[14rem] lg:sticky lg:right-0 lg:z-10 lg:bg-card lg:shadow-[-1px_0_0_hsl(var(--border))]',
            )}
          >
            {cell(col)}
          </td>
        ))}
      </tr>
      <tr>
        <td className="sticky left-0 z-10 border-r border-border bg-card" />
        <td colSpan={columns.length} className="px-2 pb-3 pt-0">
          <div className="space-y-2 text-xs">
            {(buffer?.correctsId || entry?.amended_from_id) && (
              <p className="text-muted-foreground">
                Correction of{' '}
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => onOpenEntry((buffer?.correctsId ?? entry?.amended_from_id)!)}>original line ↗</button>
                {!buffer && entry?.amendment_reason ? ` · ${entry.amendment_reason}` : ''}
              </p>
            )}
            {entry?.superseded_by_id && (
              <p className="text-muted-foreground">
                Preserved original · <button type="button" className="font-medium text-primary hover:underline" onClick={() => onOpenEntry(entry.superseded_by_id!)}>Open signed correction ↗</button>
              </p>
            )}
            {buffer ? (
              <>
                {buffer.sample && (
                  <p className="inline-flex items-center gap-1 text-muted-foreground">
                    <Plug className="h-3.5 w-3.5" />
                    <strong className="text-foreground">{buffer.sample.mode === 'simulated' ? 'Demo readings' : 'Captured readings'}</strong>
                    {buffer.sample.source} · {stamp(buffer.sample.observed_at, true)}
                  </p>
                )}
                <details ref={notesRef} open={Boolean(buffer.notes || buffer.overrideReason)}>
                  <summary className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /> Notes &amp; source details</summary>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[11px] text-muted-foreground">Remarks / annex references</span>
                      <textarea data-line-extra="notes" value={buffer.notes} maxLength={4000} rows={1} onChange={(e) => setExtra('notes', e.target.value)} aria-label={`Remarks · line ${number}`} className="mt-0.5 w-full rounded border border-input bg-background px-1.5 py-1 text-[13px] focus:border-primary focus-visible:outline-none focus:ring-2 focus:ring-primary" />
                    </label>
                    {buffer.sample && (
                      <label className="block">
                        <span className="text-[11px] text-muted-foreground">Reason for changing a captured reading{sourceChanged ? ' *' : ''}</span>
                        <textarea data-line-extra="overrideReason" value={buffer.overrideReason} maxLength={1000} rows={1} onChange={(e) => setExtra('overrideReason', e.target.value)} aria-label={`Reason for changing a captured reading · line ${number}`} className="mt-0.5 w-full rounded border border-input bg-background px-1.5 py-1 text-[13px] focus:border-primary focus-visible:outline-none focus:ring-2 focus:ring-primary" />
                      </label>
                    )}
                  </div>
                </details>
                {buffer.correctsId && (buffer.existingId ? (
                  <p className="text-muted-foreground">Correction reason: {buffer.correctionReason}</p>
                ) : (
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">Correction reason *</span>
                    <textarea data-line-extra="correctionReason" value={buffer.correctionReason} maxLength={1000} rows={1} required onChange={(e) => setExtra('correctionReason', e.target.value)} aria-label={`Correction reason · line ${number}`} className="mt-0.5 w-full rounded border border-input bg-background px-1.5 py-1 text-[13px] focus:border-primary focus-visible:outline-none focus:ring-2 focus:ring-primary" />
                  </label>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" className="h-7 px-3 text-xs" disabled={!buffer.dirty || busy} onClick={() => onSave(id)}>Save line</Button>
                  {buffer.existingId ? (
                    <>
                      {buffer.dirty && <button type="button" className="text-primary hover:underline" onClick={() => onRevert(id)}>Revert unsaved edits</button>}
                      <button type="button" className="text-destructive hover:underline" disabled={busy} onClick={() => onDelete(id)}>Delete draft line</button>
                    </>
                  ) : (
                    <button type="button" className="text-primary hover:underline" onClick={() => onDiscard(id)}>Remove unsaved line</button>
                  )}
                  <span className="text-muted-foreground">
                    {buffer.dirty ? 'Unsaved · copy kept in this tab' : 'Saved'} · {stats?.filled}/{stats?.total} required fields{stats?.missing.length ? ' · check before signing' : buffer.dirty ? '' : ' · ready to sign'}
                  </span>
                  <small className="text-muted-foreground">Ctrl / ⌘ + Enter to save</small>
                </div>
                {stats && stats.missing.length > 0 && (
                  <details open={missingOpen} onToggle={(e) => setMissingOpen((e.target as HTMLDetailsElement).open)}>
                    <summary className="cursor-pointer text-warning">{stats.missing.length} field{stats.missing.length === 1 ? '' : 's'} to complete</summary>
                    <ul className="mt-1 space-y-0.5">
                      {stats.missing.map((p) => (
                        <li key={p.key}><button type="button" className="text-primary hover:underline" onClick={() => focusField(p.key)}>{p.message} ↗</button></li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : entry?.remarks ? (
              <p><strong>Remarks:</strong> <span className="whitespace-pre-wrap">{entry.remarks}</span></p>
            ) : null}
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              {entry && <LineHistory entry={entry} canManageAttachments={canManageAttachments} />}
              {canCorrect && entry && <button type="button" className="text-primary hover:underline" onClick={() => onCorrect(entry)}>Add correction line</button>}
              {entry?.page_id && <button type="button" className="text-primary hover:underline" onClick={() => onViewPage(entry.page_id!)}>View signed page</button>}
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  );
};

export default LineRow;

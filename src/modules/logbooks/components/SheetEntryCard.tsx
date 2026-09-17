import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import SignatureCell from './SignatureCell';
import LineHistory from './LineHistory';
import LogbookSheetForm from './LogbookSheetForm';
import { sheetSummaryLines, type SheetTemplate } from '../lib/dagonEngineLog';
import type { EntryView } from '../lib/types';
import type { LineBuffer } from '../hooks/useWorkingCopies';
import type { CrewCapacity } from '../lib/roles';
import type { SignKind } from '../lib/logbookApi';
import { stamp } from '../lib/format';

export interface SheetEntryCardProps {
  template: SheetTemplate;
  entry: EntryView | null;
  buffer: LineBuffer | null;
  number: number;
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
  onAttest: (entry: EntryView, kind: SignKind, witness?: { name: string; capacity: string }) => void;
  onCorrect: (entry: EntryView) => void;
  onOpenEntry: (id: string) => void;
  onViewPage: (pageId: string) => void;
}

const statusLabel = (entry: EntryView | null) => {
  if (!entry) return 'New sheet';
  if (entry.superseded_by_id) return 'Superseded';
  if (entry.status === 'draft') return 'Draft';
  if (entry.page_id) return 'Signed page';
  if (entry.status === 'verified') return 'Master reviewed';
  return 'Signed';
};

/** One daily readings sheet: the vessel's grid layout plus the same save, sign, correct and history controls as a ruled line. */
const SheetEntryCard: React.FC<SheetEntryCardProps> = ({
  template, entry, buffer, number, highlighted, capacity, userId, busy, error, canCorrect, canManageAttachments,
  onChange, onSave, onRevert, onDiscard, onAttest, onCorrect, onOpenEntry, onViewPage,
}) => {
  const id = buffer?.id ?? entry!.id;
  const [open, setOpen] = React.useState(Boolean(buffer) || highlighted);
  React.useEffect(() => { if (highlighted || buffer?.dirty) setOpen(true); }, [highlighted, buffer?.dirty]);
  const values: Record<string, string> = buffer ? buffer.fields : Object.fromEntries(Object.entries(entry?.data ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)]));
  const summary = entry ? sheetSummaryLines(template, entry.data) : [];
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (buffer && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); onSave(id); }
  };
  return (
    <article id={`line-${id}`} onKeyDown={onKeyDown} className={cn('rounded-md border border-border bg-card', highlighted && 'ring-1 ring-primary', entry?.superseded_by_id && 'opacity-70')}>
      <header className="flex flex-wrap items-start justify-between gap-3 p-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-start gap-2 text-left" aria-expanded={open}>
          {open ? <ChevronDown className="mt-1 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0" />}
          <span>
            <span className="font-mono text-sm">{String(number).padStart(2, '0')}</span>
            <span className="ml-2 text-sm font-semibold">{template.title}</span>
            <span className="block text-xs text-muted-foreground">
              {statusLabel(entry)} · {buffer ? `${buffer.occurredAt.replace('T', ' ')} UTC` : stamp(entry!.entry_at)}
              {values['header.from'] || values['header.to'] ? ` · ${values['header.from'] ?? ''} → ${values['header.to'] ?? ''}` : ''}
              {values['header.location'] ? ` · ${values['header.location']}` : ''}
            </span>
          </span>
        </button>
        <div className="min-w-[14rem] text-xs">
          <SignatureCell
            entry={entry}
            isOwnDraft={Boolean(entry && entry.status === 'draft' && entry.recorded_by === userId)}
            dirty={Boolean(buffer?.dirty)}
            missingCount={0}
            capacity={capacity}
            userId={userId}
            busy={busy}
            onAttest={(kind, witness) => entry && onAttest(entry, kind, witness)}
          />
        </div>
      </header>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          {buffer && (
            <label className="block text-xs">
              <span className="text-muted-foreground">Sheet date / time · UTC</span>
              <input
                type="datetime-local"
                data-line-extra="occurredAt"
                aria-label={`Sheet time UTC · sheet ${number}`}
                value={buffer.occurredAt}
                required
                onChange={(e) => onChange(id, (b) => ({ ...b, occurredAt: e.target.value, dirty: true }))}
                className="ml-2 rounded border border-input bg-background px-1.5 py-1 text-[13px]"
              />
            </label>
          )}
          <LogbookSheetForm
            template={template}
            values={values}
            readOnly={!buffer}
            onChange={(key, value) => onChange(id, (b) => ({ ...b, fields: { ...b.fields, [key]: value }, dirty: true }))}
          />
          {buffer ? (
            <>
              <label className="block text-xs">
                <span className="text-muted-foreground">Comments / remarks</span>
                <textarea data-line-extra="notes" value={buffer.notes} maxLength={4000} rows={2} onChange={(e) => onChange(id, (b) => ({ ...b, notes: e.target.value, dirty: true }))} aria-label={`Remarks · sheet ${number}`} className="mt-0.5 w-full rounded border border-input bg-background px-1.5 py-1 text-[13px]" />
              </label>
              {buffer.correctsId && !buffer.existingId && (
                <label className="block text-xs">
                  <span className="text-muted-foreground">Correction reason *</span>
                  <textarea data-line-extra="correctionReason" value={buffer.correctionReason} maxLength={1000} rows={1} required onChange={(e) => onChange(id, (b) => ({ ...b, correctionReason: e.target.value, dirty: true }))} className="mt-0.5 w-full rounded border border-input bg-background px-1.5 py-1 text-[13px]" />
                </label>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Button type="button" size="sm" className="h-7 px-3 text-xs" disabled={!buffer.dirty || busy} onClick={() => onSave(id)}>Save sheet</Button>
                {buffer.existingId ? (
                  buffer.dirty && <button type="button" className="text-primary hover:underline" onClick={() => onRevert(id)}>Revert unsaved edits</button>
                ) : (
                  <button type="button" className="text-primary hover:underline" onClick={() => onDiscard(id)}>Remove unsaved sheet</button>
                )}
                <span className="text-muted-foreground">{buffer.dirty ? 'Unsaved · copy kept in this tab' : 'Saved · ready to sign'}</span>
                <small className="text-muted-foreground">Ctrl / ⌘ + Enter to save</small>
              </div>
            </>
          ) : (
            <>
              {entry?.remarks && <p className="text-xs"><strong>Remarks:</strong> <span className="whitespace-pre-wrap">{entry.remarks}</span></p>}
              {summary.length > 0 && (
                <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Readings summary</summary><pre className="mt-1 whitespace-pre-wrap font-sans">{summary.join('\n')}</pre></details>
              )}
            </>
          )}
          {(buffer?.correctsId || entry?.amended_from_id) && (
            <p className="text-xs text-muted-foreground">
              Correction of <button type="button" className="font-medium text-primary hover:underline" onClick={() => onOpenEntry((buffer?.correctsId ?? entry?.amended_from_id)!)}>original sheet ↗</button>
              {!buffer && entry?.amendment_reason ? ` · ${entry.amendment_reason}` : ''}
            </p>
          )}
          {entry?.superseded_by_id && (
            <p className="text-xs text-muted-foreground">Preserved original · <button type="button" className="font-medium text-primary hover:underline" onClick={() => onOpenEntry(entry.superseded_by_id!)}>Open signed correction ↗</button></p>
          )}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {entry && <LineHistory entry={entry} canManageAttachments={canManageAttachments} />}
            {canCorrect && entry && <button type="button" className="text-primary hover:underline" onClick={() => onCorrect(entry)}>Add correction sheet</button>}
            {entry?.page_id && <button type="button" className="text-primary hover:underline" onClick={() => onViewPage(entry.page_id!)}>View signed page</button>}
          </div>
        </div>
      )}
    </article>
  );
};

export default SheetEntryCard;

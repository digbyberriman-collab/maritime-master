import React from 'react';
import { Button } from '@/components/ui/button';
import SheetEntryCard, { type SheetEntryCardProps } from './SheetEntryCard';
import type { SheetTemplate } from '../lib/dagonEngineLog';
import type { EntryView } from '../lib/types';
import type { LineBuffer } from '../hooks/useWorkingCopies';

interface Props extends Omit<SheetEntryCardProps, 'template' | 'entry' | 'buffer' | 'number' | 'highlighted' | 'busy' | 'error' | 'canCorrect'> {
  template: SheetTemplate;
  rows: EntryView[];
  buffers: Record<string, LineBuffer>;
  newRows: LineBuffer[];
  highlightedId: string | null;
  busyIds: Set<string>;
  errors: Record<string, string>;
  editable: boolean;
  fixed: boolean;
  canCorrectEntry: (entry: EntryView) => boolean;
  onWriteOnLine: () => void;
}

/** A section whose entries are whole readings sheets rather than ruled lines. */
const SheetEntries: React.FC<Props> = ({ template, rows, buffers, newRows, highlightedId, busyIds, errors, editable, fixed, canCorrectEntry, onWriteOnLine, ...cardProps }) => {
  const lastLine = rows.reduce((max, entry) => Math.max(max, entry.line_number ?? 0), 0);
  const nextLine = Math.max(lastLine, rows.length) + 1;
  return (
    <div className="space-y-3">
      {rows.map((entry, i) => (
        <SheetEntryCard key={entry.id} template={template} entry={entry} buffer={buffers[entry.id] ?? null} number={entry.line_number ?? i + 1} highlighted={highlightedId === entry.id} busy={busyIds.has(entry.id)} error={errors[entry.id] ?? null} canCorrect={canCorrectEntry(entry)} {...cardProps} />
      ))}
      {newRows.map((buffer, i) => (
        <SheetEntryCard key={buffer.id} template={template} entry={null} buffer={buffer} number={nextLine + i} highlighted={highlightedId === buffer.id} busy={busyIds.has(buffer.id)} error={errors[buffer.id] ?? null} canCorrect={false} {...cardProps} />
      ))}
      {rows.length === 0 && newRows.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No sheets recorded in this volume yet.</p>
      )}
      {editable && !fixed && (
        <Button type="button" variant="outline" size="sm" onClick={onWriteOnLine}>+ New {template.title.toLowerCase()} sheet</Button>
      )}
    </div>
  );
};

export default SheetEntries;

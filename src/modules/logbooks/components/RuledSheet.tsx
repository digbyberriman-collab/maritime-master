import React from 'react';
import { cn } from '@/lib/utils';
import LineRow, { type LineRowProps } from './LineRow';
import type { SheetColumn } from '../lib/lineLayouts';
import { itemCode } from '../lib/lineLayouts';
import type { EntryView } from '../lib/types';
import type { LineBuffer } from '../hooks/useWorkingCopies';
import type { LogbookBook } from '../lib/catalog';
import type { TemplateSection } from '../lib/templates';

interface Props extends Omit<LineRowProps, 'entry' | 'buffer' | 'number' | 'highlighted' | 'busy' | 'error' | 'canCorrect'> {
  book: LogbookBook;
  section: TemplateSection;
  columns: SheetColumn[];
  rows: EntryView[];
  buffers: Record<string, LineBuffer>;
  newRows: LineBuffer[];
  allEntries: EntryView[];
  highlightedId: string | null;
  busyIds: Set<string>;
  errors: Record<string, string>;
  editable: boolean;
  fixed: boolean;
  canCorrectEntry: (entry: EntryView) => boolean;
  onWriteOnLine: () => void;
}

/** The ruled book page: header row, saved lines, unsaved lines and blank ruled lines. */
const RuledSheet: React.FC<Props> = ({
  book, section, columns, rows, buffers, newRows, highlightedId, busyIds, errors, editable, fixed, canCorrectEntry, onWriteOnLine, ...rowProps
}) => {
  const total = rows.length + newRows.length;
  const blanks = fixed ? 0 : total ? 1 : 3;
  const wide = columns.length > 8;
  return (
    <div className="space-y-1">
      <div tabIndex={0} role="region" aria-label={`${section.title} logbook table`} className="overflow-x-auto rounded-md border border-border bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <table className={cn('w-full border-collapse text-sm', wide && 'min-w-[72rem]')}>
          <caption className="sr-only">{book.title} · {section.title}. Enter records directly in the book. All times UTC.</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-12 border-b border-r border-border bg-muted px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Line</th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'border-b border-r border-border px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
                    c.wide && 'min-w-[16rem]',
                    c.kind === 'signatures' && 'lg:sticky lg:right-0 lg:z-10 lg:bg-muted',
                  )}
                >
                  {c.title}{c.fields?.length === 1 && c.fields[0].required ? ' *' : ''}
                </th>
              ))}
            </tr>
          </thead>
          {rows.map((entry, i) => (
            <LineRow
              key={entry.id}
              entry={entry}
              buffer={buffers[entry.id] ?? null}
              number={i + 1}
              columns={columns}
              highlighted={highlightedId === entry.id}
              busy={busyIds.has(entry.id)}
              error={errors[entry.id] ?? null}
              canCorrect={canCorrectEntry(entry)}
              {...rowProps}
            />
          ))}
          {newRows.map((buffer, i) => (
            <LineRow
              key={buffer.id}
              entry={null}
              buffer={buffer}
              number={rows.length + i + 1}
              columns={columns}
              highlighted={highlightedId === buffer.id}
              busy={busyIds.has(buffer.id)}
              error={errors[buffer.id] ?? null}
              canCorrect={false}
              {...rowProps}
            />
          ))}
          {blanks > 0 && (
            <tbody>
              {Array.from({ length: blanks }, (_, i) => (
                <tr key={i} className="h-11 border-b border-dashed border-border">
                  <th scope="row" className="sticky left-0 z-10 border-r border-border bg-card px-2 py-2 text-left font-mono text-sm text-muted-foreground">{String(total + i + 1).padStart(2, '0')}</th>
                  {columns.map((col, index) => (
                    <td key={col.key} className={cn('border-r border-border px-2 py-2 align-top', col.kind === 'signatures' && 'lg:sticky lg:right-0 lg:bg-card')}>
                      {index === 0 && i === 0 && editable ? (
                        <button type="button" onClick={onWriteOnLine} className="text-sm font-medium text-primary hover:underline">+ Write on this line</button>
                      ) : i === 0 && total === 0 && col.fields?.length && (col.fields.length > 1 || col.title !== col.fields[0].label) ? (
                        <div className="space-y-1">
                          {col.fields.map((f) => (
                            <div key={f.key} className="text-[11px] text-muted-foreground">{f.item ? `${itemCode(f.item)} · ` : ''}{f.label}{f.required ? ' *' : ''}</div>
                          ))}
                        </div>
                      ) : <span aria-hidden="true">&nbsp;</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      {wide && <p className="text-xs text-muted-foreground"><span aria-hidden="true">↔</span> Scroll horizontally to view every field</p>}
    </div>
  );
};

export default RuledSheet;

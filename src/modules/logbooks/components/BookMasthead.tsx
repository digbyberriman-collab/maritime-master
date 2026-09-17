import React from 'react';
import { ArrowRight, Ship } from 'lucide-react';
import { cn } from '@/lib/utils';
import { departmentFor, type LogbookBook } from '../lib/catalog';
import type { EntryView, FlagProfileId, VolumeRow } from '../lib/types';
import { plural } from '../lib/format';

interface Props {
  book: LogbookBook;
  volume: VolumeRow | null;
  profile: FlagProfileId;
  vesselName: string;
  entries: EntryView[];
  pageCount: number;
  sectionCount: number;
  ownDraftId: string | null;
  onContinueDraft: (id: string) => void;
}

/** Selected-book header: department, title, vessel, flag profile, volume state and live counts. */
const BookMasthead: React.FC<Props> = ({ book, volume, profile, vesselName, entries, pageCount, sectionCount, ownDraftId, onContinueDraft }) => {
  const Icon = book.icon;
  const current = entries.filter((e) => !e.superseded_by_id);
  const drafts = current.filter((e) => e.status === 'draft').length;
  return (
    <section aria-label="Selected logbook" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="h-4 w-4" /> {departmentFor(book)} <span aria-hidden="true">/</span> {book.code}
        </div>
        <h1 className="mt-1 truncate text-2xl font-bold text-foreground lg:text-3xl">{book.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Ship className="h-4 w-4" /> {(volume?.particulars.shipName as string | undefined) || vesselName}</span>
          <span>{profile} registry</span>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', volume?.status === 'open' ? 'bg-success-muted text-success' : volume ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground')}>
            {volume ? (volume.status === 'open' ? 'Volume open' : 'Volume closed') : 'Template preview'}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-start gap-3 lg:items-end">
        <dl className="flex gap-6">
          {[[current.length, current.length === 1 ? 'Entry' : 'Entries'], [drafts, drafts === 1 ? 'Draft' : 'Drafts'], [pageCount, 'Signed pages']].map(([value, label]) => (
            <div key={String(label)} className="text-center">
              <dt className="sr-only">{label}</dt>
              <dd className="text-2xl font-bold leading-none text-foreground">{value}</dd>
              <dd className="mt-1 text-xs text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>
        {ownDraftId ? (
          <button type="button" onClick={() => onContinueDraft(ownDraftId)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Continue your draft <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">{volume ? `${plural(sectionCount, 'section')} · ${profile} profile` : 'Choose a format and open a volume to begin.'}</span>
        )}
      </div>
    </section>
  );
};

export default BookMasthead;

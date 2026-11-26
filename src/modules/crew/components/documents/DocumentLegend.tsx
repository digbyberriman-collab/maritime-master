import React from 'react';
import { cn } from '@/lib/utils';
import { TONE_FILL, type Tone } from '@/components/ui/tones';
import { DOCUMENT_LEGEND_KEYS, type DocumentLegendKey } from '@/modules/crew/lib/documentState';

/** The legend's words and tones (gap/04 C24). Each entry is the same tone as the pill a row shows for it. */
const DOCUMENT_LEGEND: Readonly<Record<DocumentLegendKey, { label: string; tone: Tone; detail: string }>> = {
  valid: { label: 'Valid', tone: 'ok', detail: 'In date, outside its alert window, or with no expiry' },
  expiring: { label: 'Expiring', tone: 'warn', detail: 'Inside its alert window' },
  expired: { label: 'Expired', tone: 'danger', detail: 'Past its expiry date' },
  missing_date: { label: 'Missing', tone: 'warn', detail: 'No expiry date and not marked No expiry' },
  alerts_off: { label: 'Alerts off', tone: 'neutral', detail: 'Kept out of alerts and counts; the real state still shows on the row' },
  not_uploaded: { label: 'Not uploaded', tone: 'warn', detail: 'Recorded without a file' },
};

export interface DocumentLegendProps {
  /** Counts per entry (countDocumentLegend). Without counts the legend explains the colours only. */
  counts?: Readonly<Record<DocumentLegendKey, number>>;
  className?: string;
}

/**
 * The documents tabs' legend: Valid, Expiring, Expired, Missing, Alerts off
 * and Not uploaded, each with its count when given. Colour plus words, never
 * colour alone; every entry has a title explaining it.
 */
export const DocumentLegend: React.FC<DocumentLegendProps> = ({ counts, className }) => (
  <ul aria-label="Legend" className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)} data-document-legend="">
    {DOCUMENT_LEGEND_KEYS.map((key) => {
      const entry = DOCUMENT_LEGEND[key];
      const count = counts?.[key];
      return (
        <li key={key} className="inline-flex items-center gap-1.5 type-caption text-muted-foreground" title={entry.detail} data-legend-key={key}>
          <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', TONE_FILL[entry.tone])} />
          <span>{entry.label}</span>
          {count !== undefined ? (
            <span className={cn('tabular-nums', count > 0 ? 'font-semibold text-foreground' : undefined)}>{count}</span>
          ) : null}
        </li>
      );
    })}
  </ul>
);

export default DocumentLegend;

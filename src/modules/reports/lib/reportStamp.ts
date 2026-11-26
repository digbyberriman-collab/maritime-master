/**
 * The report freshness stamp (DECISIONS D-88): one per page, from the same
 * read as its Refresh button, in UTC so every reader on board and ashore
 * sees the same time: "Fleet · generated 26 Nov 2026, 14:05 UTC" (en-GB,
 * h23). Pure.
 */

const STAMP_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

/** "26 Nov 2026, 14:05 UTC". */
export function formatUtcStamp(at: number | Date): string {
  return `${STAMP_FORMAT.format(at)} UTC`;
}

/** "Fleet · generated 26 Nov 2026, 14:05 UTC" (the scope is "Fleet", or a vessel's name in a vessel report). */
export function formatGeneratedStamp(scopeLabel: string, at: number | Date): string {
  return `${scopeLabel} · generated ${formatUtcStamp(at)}`;
}

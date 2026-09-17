/** UTC timestamp formatting shared by the sheet, review pages and print output. */
export function stamp(iso: string | null | undefined, seconds = false): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const s = date.toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, seconds ? 19 : 16)} UTC`;
}

/** ISO → value for a datetime-local input (UTC, minute precision). */
export const toLocalInput = (iso: string) => new Date(iso).toISOString().slice(0, 16);

export const shortId = (id: string | null | undefined) => (id ? `${id.slice(0, 8)}…` : '—');

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

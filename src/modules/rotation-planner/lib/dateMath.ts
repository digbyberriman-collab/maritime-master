import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth, endOfMonth, startOfWeek, eachMonthOfInterval } from 'date-fns';
import type { ZoomLevel } from '../types';
import { ZOOM_PX_PER_DAY } from '../constants';

export const toISO = (d: Date) => format(d, 'yyyy-MM-dd');
export const fromISO = (s: string) => parseISO(s);

export function dayOffset(viewStart: Date, date: Date): number {
  return differenceInCalendarDays(date, viewStart);
}

export function dateAtX(viewStart: Date, x: number, zoom: ZoomLevel): Date {
  const days = Math.round(x / ZOOM_PX_PER_DAY[zoom]);
  return addDays(viewStart, days);
}

export function xAtDate(viewStart: Date, date: Date, zoom: ZoomLevel): number {
  return dayOffset(viewStart, date) * ZOOM_PX_PER_DAY[zoom];
}

export function rangeWidth(start: Date, end: Date, zoom: ZoomLevel): number {
  return (differenceInCalendarDays(end, start) + 1) * ZOOM_PX_PER_DAY[zoom];
}

export function buildMonthSegments(viewStart: Date, viewEnd: Date) {
  const months = eachMonthOfInterval({ start: viewStart, end: viewEnd });
  return months.map((m) => {
    const s = startOfMonth(m) < viewStart ? viewStart : startOfMonth(m);
    const e = endOfMonth(m) > viewEnd ? viewEnd : endOfMonth(m);
    return { date: m, start: s, end: e, label: format(m, 'MMM yyyy') };
  });
}

export function snapToZoom(date: Date, zoom: ZoomLevel): Date {
  if (zoom === 'day' || zoom === 'week' || zoom === 'fortnight') return date;
  return startOfWeek(date, { weekStartsOn: 1 });
}

export { addDays, format, differenceInCalendarDays };
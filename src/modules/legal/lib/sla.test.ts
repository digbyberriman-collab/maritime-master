import { describe, expect, it } from 'vitest';
import { addBusinessDays, computeSlaDeadline, formatDuration, isBusinessDay, slaState } from './sla';

// Wednesday 16 September 2026, 10:00 local time.
const WED = new Date(2026, 8, 16, 10, 0, 0);

describe('business days', () => {
  it('knows weekends', () => {
    expect(isBusinessDay(new Date(2026, 8, 19))).toBe(false); // Saturday
    expect(isBusinessDay(new Date(2026, 8, 20))).toBe(false); // Sunday
    expect(isBusinessDay(new Date(2026, 8, 21))).toBe(true); // Monday
  });

  it('skips the weekend when adding days', () => {
    // Wed + 2 business days = Fri; + 3 = Mon; + 5 = next Wed.
    expect(addBusinessDays(WED, 2).getDate()).toBe(18);
    expect(addBusinessDays(WED, 3).getDate()).toBe(21);
    expect(addBusinessDays(WED, 5).getDate()).toBe(23);
    expect(addBusinessDays(WED, 10).getDate()).toBe(30);
  });

  it('keeps the time of day', () => {
    expect(addBusinessDays(WED, 5).getHours()).toBe(10);
  });

  it('starting on a Saturday counts Monday as the first business day', () => {
    const sat = new Date(2026, 8, 19, 9, 0, 0);
    expect(addBusinessDays(sat, 1).getDate()).toBe(21);
  });
});

describe('computeSlaDeadline', () => {
  it('maps priorities to the agreed SLA', () => {
    expect(computeSlaDeadline('urgent', WED).getTime()).toBe(WED.getTime() + 24 * 3600 * 1000);
    expect(computeSlaDeadline('high', WED).getDate()).toBe(18);
    expect(computeSlaDeadline('medium', WED).getDate()).toBe(23);
    expect(computeSlaDeadline('low', WED).getDate()).toBe(30);
    expect(computeSlaDeadline('unknown', WED).getDate()).toBe(23);
  });
});

describe('slaState', () => {
  const now = new Date(2026, 8, 16, 12, 0, 0);
  const iso = (d: Date) => d.toISOString();

  it('handles missing and cancelled', () => {
    expect(slaState({ sla_deadline: null, status: 'submitted', resolved_at: null }, now).kind).toBe('none');
    expect(slaState({ sla_deadline: iso(now), status: 'cancelled', resolved_at: null }, now).kind).toBe('cancelled');
  });

  it('flags on track, due soon and breached for open requests', () => {
    const in3d = new Date(now.getTime() + 72 * 3600 * 1000);
    const in5h = new Date(now.getTime() + 5 * 3600 * 1000);
    const ago2h = new Date(now.getTime() - 2 * 3600 * 1000);
    expect(slaState({ sla_deadline: iso(in3d), status: 'in_progress', resolved_at: null }, now)).toMatchObject({ kind: 'on_track', tone: 'success' });
    expect(slaState({ sla_deadline: iso(in5h), status: 'in_progress', resolved_at: null }, now)).toMatchObject({ kind: 'due_soon', label: 'Due in 5 h' });
    expect(slaState({ sla_deadline: iso(ago2h), status: 'submitted', resolved_at: null }, now)).toMatchObject({ kind: 'breached', label: 'Overdue by 2 h' });
  });

  it('judges completed requests against resolved_at', () => {
    const deadline = new Date(now.getTime() + 24 * 3600 * 1000);
    expect(slaState({ sla_deadline: iso(deadline), status: 'completed', resolved_at: iso(now) }, now).kind).toBe('met');
    const late = new Date(deadline.getTime() + 50 * 3600 * 1000);
    expect(slaState({ sla_deadline: iso(deadline), status: 'completed', resolved_at: iso(late) }, now)).toMatchObject({ kind: 'missed', label: 'SLA missed by 2 d 2 h' });
  });
});

describe('formatDuration', () => {
  it('formats minutes, hours and days', () => {
    expect(formatDuration(0.5)).toBe('30 min');
    expect(formatDuration(-3.9)).toBe('3 h');
    expect(formatDuration(47)).toBe('47 h');
    expect(formatDuration(48)).toBe('2 d');
    expect(formatDuration(75)).toBe('3 d 3 h');
  });
});

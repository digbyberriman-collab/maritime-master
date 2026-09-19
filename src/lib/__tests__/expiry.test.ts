import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calculateCertificateStatus, daysUntilExpiry } from '../certificateConstants';
import {
  calculateTrainingStatus,
  daysUntilExpiry as trainingDaysUntilExpiry,
} from '../trainingConstants';
import { calculateComplianceStatus } from '../drillConstants';

// Every calculation below reads the wall clock, so the clock is pinned for the
// whole file. Noon avoids any boundary sensitivity around midnight.
const NOW = new Date('2026-06-15T12:00:00.000Z');

/** A date the given number of days from the pinned "now". */
function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

function isoDaysFromNow(days: number): string {
  return daysFromNow(days).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('calculateCertificateStatus', () => {
  it('reports a certificate well in the future as valid', () => {
    expect(calculateCertificateStatus(isoDaysFromNow(365))).toBe('Valid');
  });

  it('reports a certificate inside the alert window as expiring soon', () => {
    expect(calculateCertificateStatus(isoDaysFromNow(30))).toBe('Expiring_Soon');
  });

  it('reports a past certificate as expired', () => {
    expect(calculateCertificateStatus(isoDaysFromNow(-1))).toBe('Expired');
  });

  it('treats the last day of the alert window as expiring soon', () => {
    expect(calculateCertificateStatus(isoDaysFromNow(90))).toBe('Expiring_Soon');
  });

  it('treats the day after the alert window as valid', () => {
    expect(calculateCertificateStatus(isoDaysFromNow(91))).toBe('Valid');
  });

  it('honours a custom alert window', () => {
    // 30 days out is "soon" under a 60-day policy but fine under a 14-day one.
    expect(calculateCertificateStatus(isoDaysFromNow(30), 60)).toBe('Expiring_Soon');
    expect(calculateCertificateStatus(isoDaysFromNow(30), 14)).toBe('Valid');
  });

  it('never reports an expired certificate as merely expiring, whatever the window', () => {
    expect(calculateCertificateStatus(isoDaysFromNow(-10), 365)).toBe('Expired');
  });
});

describe('daysUntilExpiry (certificates)', () => {
  it('counts forward to a future expiry', () => {
    expect(daysUntilExpiry(isoDaysFromNow(10))).toBe(10);
  });

  it('goes negative once the date has passed', () => {
    expect(daysUntilExpiry(isoDaysFromNow(-5))).toBe(-5);
  });

  it('is zero at the exact moment of expiry', () => {
    expect(daysUntilExpiry(NOW.toISOString())).toBe(0);
  });
});

describe('calculateTrainingStatus', () => {
  it('treats training with no expiry as permanently valid', () => {
    expect(calculateTrainingStatus(null)).toBe('Valid');
  });

  it('reports distant training as valid', () => {
    expect(calculateTrainingStatus(daysFromNow(200))).toBe('Valid');
  });

  it('reports training inside ninety days as expiring soon', () => {
    expect(calculateTrainingStatus(daysFromNow(45))).toBe('Expiring_Soon');
  });

  it('reports lapsed training as expired', () => {
    expect(calculateTrainingStatus(daysFromNow(-1))).toBe('Expired');
  });

  it('places the ninety-day boundary inside the warning band', () => {
    expect(calculateTrainingStatus(daysFromNow(90))).toBe('Expiring_Soon');
    expect(calculateTrainingStatus(daysFromNow(91))).toBe('Valid');
  });
});

describe('daysUntilExpiry (training)', () => {
  it('returns null when there is no expiry to measure', () => {
    expect(trainingDaysUntilExpiry(null)).toBeNull();
  });

  it('counts forward and backward like the certificate helper', () => {
    expect(trainingDaysUntilExpiry(daysFromNow(7))).toBe(7);
    expect(trainingDaysUntilExpiry(daysFromNow(-7))).toBe(-7);
  });
});

describe('calculateComplianceStatus (drills)', () => {
  it('treats a drill that has never been run as overdue', () => {
    const result = calculateComplianceStatus(null, 30);

    expect(result.status).toBe('overdue');
    expect(result.daysUntilDue).toBeLessThan(0);
  });

  it('is on schedule when the next drill is comfortably ahead', () => {
    const result = calculateComplianceStatus(daysFromNow(-1), 30);

    expect(result.status).toBe('on_schedule');
    expect(result.daysUntilDue).toBe(29);
  });

  it('warns when the next drill falls inside a week', () => {
    const result = calculateComplianceStatus(daysFromNow(-25), 30);

    expect(result.status).toBe('due_soon');
    expect(result.daysUntilDue).toBe(5);
  });

  it('treats exactly seven days out as due soon', () => {
    expect(calculateComplianceStatus(daysFromNow(-23), 30).status).toBe('due_soon');
  });

  it('treats eight days out as on schedule', () => {
    expect(calculateComplianceStatus(daysFromNow(-22), 30).status).toBe('on_schedule');
  });

  it('flags a missed drill as overdue with a negative countdown', () => {
    const result = calculateComplianceStatus(daysFromNow(-40), 30);

    expect(result.status).toBe('overdue');
    expect(result.daysUntilDue).toBe(-10);
  });

  it('derives the next due date from the last drill plus the interval', () => {
    const lastDrill = daysFromNow(-10);
    const result = calculateComplianceStatus(lastDrill, 30);

    const expected = new Date(lastDrill);
    expected.setDate(expected.getDate() + 30);
    expect(result.nextDueDate.toDateString()).toBe(expected.toDateString());
  });

  it('does not mutate the date it was given', () => {
    const lastDrill = daysFromNow(-10);
    const before = lastDrill.getTime();

    calculateComplianceStatus(lastDrill, 30);

    expect(lastDrill.getTime()).toBe(before);
  });

  it('handles a monthly cadence across a month boundary', () => {
    // 2026-05-31 + 30 days lands in June, not an invalid 2026-06-31.
    const result = calculateComplianceStatus(new Date('2026-05-31T12:00:00.000Z'), 30);

    expect(result.nextDueDate.getMonth()).toBe(5); // June, zero-indexed
    expect(Number.isNaN(result.nextDueDate.getTime())).toBe(false);
  });
});

/**
 * StatusPill, WhoseMoveChip and ExpiryPill (BUILD-PLAN A6; gap/10 §A.8).
 * Render checks: label always present, tone from the registry, warning icon
 * on danger / warn / orange, ages and expiry detail computed from dates.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ExpiryPill,
  StatusPill,
  WhoseMoveChip,
  expiryDetail,
  formatWaiting,
  resolveExpiry,
  waitingDays,
} from '@/shared/components/status';

const pill = (text: string | RegExp) => screen.getByText(text).closest('[data-tone]') as HTMLElement;

describe('StatusPill', () => {
  it('takes tone and label from the registry', () => {
    render(<StatusPill domain="incident" status="Under Investigation" />);
    const el = pill('Under investigation');
    expect(el).toHaveAttribute('data-tone', 'signal');
    expect(el).toHaveAttribute('data-status', 'under_investigation');
    expect(el.className).toContain('bg-signal-muted');
    expect(el.className).toContain('rounded-full');
  });

  it('explicit tone and children win', () => {
    render(
      <StatusPill domain="incident" status="Open" tone="purple">
        Awaiting company sign-off
      </StatusPill>,
    );
    expect(pill('Awaiting company sign-off')).toHaveAttribute('data-tone', 'purple');
  });

  it('unknown status renders neutral with the raw value as label', () => {
    render(<StatusPill domain="permit" status="ON_HOLD" />);
    expect(pill('On hold')).toHaveAttribute('data-tone', 'neutral');
  });

  it('always has a label, even with nothing to go on', () => {
    render(<StatusPill />);
    expect(pill('—')).toHaveAttribute('data-tone', 'neutral');
  });

  it('danger, warn and orange carry an icon; others a dot', () => {
    const { container } = render(
      <>
        <StatusPill tone="danger">Expired</StatusPill>
        <StatusPill tone="warn">Due soon</StatusPill>
        <StatusPill tone="orange">≤ 30 d</StatusPill>
        <StatusPill tone="ok">Valid</StatusPill>
        <StatusPill tone="danger" icon={null}>
          Breach
        </StatusPill>
      </>,
    );
    const pills = container.querySelectorAll('[data-tone]');
    expect(pills[0].querySelector('svg')).not.toBeNull();
    expect(pills[1].querySelector('svg')).not.toBeNull();
    expect(pills[2].querySelector('svg')).not.toBeNull();
    expect(pills[3].querySelector('svg')).toBeNull();
    expect(pills[4].querySelector('svg')).toBeNull();
    for (const p of pills) {
      for (const decoration of p.querySelectorAll('svg, span[aria-hidden="true"]')) {
        expect(decoration).toHaveAttribute('aria-hidden', 'true');
      }
    }
  });

  it('sizes: 20 px by default (24 px comfortable), 24 px for md', () => {
    render(
      <>
        <StatusPill tone="ok">A</StatusPill>
        <StatusPill tone="ok" size="md">
          B
        </StatusPill>
      </>,
    );
    expect(pill('A').className).toContain('h-5');
    expect(pill('A').className).toContain('[[data-density=comfortable]_&]:h-6');
    expect(pill('B').className).toContain('h-6');
  });

  it('forwards props and refs', () => {
    let node: HTMLSpanElement | null = null;
    render(
      <StatusPill ref={(n) => (node = n)} tone="info" title="Waiting on crew" className="ml-2">
        Open
      </StatusPill>,
    );
    expect(node).toBe(pill('Open'));
    expect(pill('Open')).toHaveAttribute('title', 'Waiting on crew');
    expect(pill('Open').className).toContain('ml-2');
  });
});

describe('WhoseMoveChip', () => {
  it.each([
    ['vessel', 'Waiting on vessel', 'info'],
    ['company', 'Waiting on company', 'purple'],
    ['none', 'Closed', 'neutral'],
  ] as const)('%s', (move, label, tone) => {
    render(<WhoseMoveChip move={move} />);
    const el = pill(label);
    expect(el).toHaveAttribute('data-tone', tone);
    expect(el).toHaveAttribute('data-move', move);
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('shows how long it has waited', () => {
    render(<WhoseMoveChip move="company" since="2026-11-10" now="2026-11-22" />);
    const el = pill(/Waiting on company/);
    expect(el).toHaveTextContent('Waiting on company · , for 12 days');
    expect(screen.getByText('12 days')).toBeInTheDocument();
  });

  it('no age once closed, and "Voided" for a void record', () => {
    render(<WhoseMoveChip move="none" status="void" since="2026-01-01" now="2026-11-22" />);
    expect(pill('Voided')).not.toHaveTextContent('days');
  });

  it('bad dates drop the age instead of throwing', () => {
    render(<WhoseMoveChip move="vessel" since="not a date" />);
    expect(pill('Waiting on vessel')).toHaveTextContent(/^Waiting on vessel$/);
  });

  it('age helpers', () => {
    expect(waitingDays('2026-11-21', '2026-11-22')).toBe(1);
    expect(waitingDays('2026-11-23', '2026-11-22')).toBe(0);
    expect(waitingDays(null)).toBeNull();
    expect(waitingDays('garbage')).toBeNull();
    expect([0, 1, 12].map(formatWaiting)).toEqual(['today', '1 day', '12 days']);
  });

  it('counts local calendar days for a timestamptz `since` (any time zone)', () => {
    const localDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
    const cases: Array<[string, Date]> = [
      ['2026-03-15T22:30:00+00:00', new Date('2026-03-15T23:00:00Z')],
      ['2026-03-16T02:00:00+00:00', new Date('2026-03-16T16:00:00Z')],
      ['2026-03-15T11:00:00Z', new Date('2026-03-15T11:30:00Z')],
      ['2026-11-10T08:00:00+00:00', new Date('2026-11-22T08:00:00Z')],
    ];
    for (const [since, now] of cases) {
      const expected = Math.max(0, localDay(now) - localDay(new Date(since)));
      expect(waitingDays(since, now)).toBe(expected);
    }
  });

  it('a move 30 minutes ago is "today" and one before local midnight is "1 day"', () => {
    const now = new Date(2026, 2, 15, 12, 0);
    expect(waitingDays(new Date(2026, 2, 15, 11, 30).toISOString(), now)).toBe(0);
    expect(waitingDays(new Date(2026, 2, 14, 23, 30).toISOString(), new Date(2026, 2, 15, 0, 30))).toBe(1);
  });
});

describe('ExpiryPill', () => {
  const today = '2026-11-22';

  it.each([
    ['2026-10-01', 'expired', 'danger', 'Expired', '52d overdue'],
    ['2026-11-22', 'expiring_soon', 'orange', '≤ 30 d', 'today'],
    ['2026-12-10', 'expiring_soon', 'orange', '≤ 30 d', 'in 18d'],
    ['2027-01-31', 'expiring', 'warn', 'Due ≤ window', 'in 70d'],
    ['2027-03-03', 'valid', 'ok', 'Valid', 'to 03 Mar 2027'],
  ] as const)('expires %s → %s', (expiresOn, bucket, tone, label, detail) => {
    render(<ExpiryPill expiresOn={expiresOn} today={today} />);
    const el = pill(label);
    expect(el).toHaveAttribute('data-bucket', bucket);
    expect(el).toHaveAttribute('data-tone', tone);
    expect(el).toHaveTextContent(detail);
  });

  it('uses the type window (passports 270 days)', () => {
    render(<ExpiryPill expiresOn="2027-06-01" windowDays={270} today={today} />);
    expect(pill('Due ≤ window')).toHaveAttribute('data-bucket', 'expiring');
  });

  it('a server bucket wins; a local day count that contradicts it is dropped', () => {
    render(<ExpiryPill bucket="expired" expiresOn="2026-11-30" today={today} />);
    const el = pill('Expired');
    expect(el).toHaveAttribute('data-tone', 'danger');
    expect(el).toHaveTextContent(/^Expired$/);
    expect(el).not.toHaveTextContent('in 8d');
  });

  it('a server bucket keeps the local days when they agree', () => {
    render(<ExpiryPill bucket="expiring_soon" expiresOn="2026-11-30" today={today} />);
    expect(pill('≤ 30 d')).toHaveTextContent('in 8d');
  });

  it('server days win over the local count', () => {
    render(<ExpiryPill bucket="expired" daysRemaining={-1} expiresOn="2026-11-30" today={today} />);
    expect(pill('Expired')).toHaveTextContent('1d overdue');
  });

  it('server days without a server bucket give the bucket too', () => {
    render(<ExpiryPill daysRemaining={-1} expiresOn="2026-11-30" today={today} />);
    const el = pill('Expired');
    expect(el).toHaveAttribute('data-bucket', 'expired');
    expect(el).toHaveTextContent('1d overdue');
  });

  it('a server "Valid" still shows the date when the local bucket differs', () => {
    render(<ExpiryPill bucket="valid" expiresOn="2027-01-31" today={today} />);
    expect(pill('Valid')).toHaveTextContent('to 31 Jan 2027');
  });

  it('server bucket and local day never contradict near midnight (any time zone)', () => {
    // Server (UTC) says "≤ 30 d" on the expiry day; a browser east of UTC is already a day later.
    const soon = resolveExpiry({ bucket: 'expiring_soon', expiresOn: '2026-03-15', today: new Date('2026-03-15T19:00:00Z') });
    expect(soon.bucket).toBe('expiring_soon');
    expect(['today', null]).toContain(expiryDetail(soon));
    // Server says "Expired" the day after; a browser west of UTC is still on the expiry day.
    const gone = resolveExpiry({ bucket: 'expired', expiresOn: '2026-03-15', today: new Date('2026-03-16T01:00:00Z') });
    expect(gone.bucket).toBe('expired');
    expect(['1d overdue', null]).toContain(expiryDetail(gone));
  });

  it('bucket only, and detail off', () => {
    render(<ExpiryPill bucket="valid" showDetail={false} />);
    expect(pill('Valid')).toHaveTextContent(/^Valid$/);
  });

  it('no date or noExpiry → No expiry', () => {
    render(
      <>
        <ExpiryPill expiresOn={null} />
        <ExpiryPill noExpiry expiresOn="2027-01-01" today={today} />
      </>,
    );
    expect(screen.getAllByText('No expiry')).toHaveLength(2);
  });

  it('bad input renders a neutral "Expiry unknown" instead of throwing', () => {
    render(
      <>
        <ExpiryPill expiresOn="31/12/2026" today={today} />
        <ExpiryPill expiresOn="2026-12-31" windowDays={-5} today={today} />
        <ExpiryPill />
      </>,
    );
    const unknown = screen.getAllByText('Expiry unknown');
    expect(unknown).toHaveLength(3);
    for (const u of unknown) expect(u.closest('[data-tone]')).toHaveAttribute('data-tone', 'neutral');
  });

  it('helpers', () => {
    const r = resolveExpiry({ expiresOn: '2026-10-01', today });
    expect(r).toEqual({ bucket: 'expired', daysRemaining: -52, expiresOn: '2026-10-01' });
    expect(expiryDetail(r)).toBe('52d overdue');
    expect(expiryDetail({ bucket: 'no_expiry', daysRemaining: null, expiresOn: null })).toBeNull();
  });
});

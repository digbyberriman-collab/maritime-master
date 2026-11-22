/**
 * KpiTile (BUILD-PLAN A7; gap/10 DS13, §A.9): never an empty grey tile.
 * Loading, zero, not-enabled, error and no-access each say what is going on;
 * values use tabular figures (`type-kpi`).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FileWarning } from 'lucide-react';
import { KpiGrid, KpiTile } from '@/shared/components/data';

const withRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const tileOf = (container: HTMLElement) => container.querySelector('[data-state]') as HTMLElement;
const valueOf = (container: HTMLElement) => container.querySelector('[data-kpi-value]') as HTMLElement;

describe('ready', () => {
  it('shows label, formatted value with tabular figures, unit and breakdown', () => {
    const { container } = render(
      <KpiTile label="Document alerts" icon={FileWarning} value={1234} unit="items" sub="7 certificates · 3 crew documents" />,
    );
    expect(screen.getByText('Document alerts')).toHaveClass('type-eyebrow');
    expect(valueOf(container)).toHaveTextContent('1,234');
    expect(valueOf(container)).toHaveClass('type-kpi');
    expect(screen.getByText('items')).toBeInTheDocument();
    expect(screen.getByText('7 certificates · 3 crew documents')).toBeInTheDocument();
    expect(tileOf(container)).toHaveAttribute('data-state', 'ready');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('the whole tile links to the filtered list', () => {
    withRouter(<KpiTile label="Expired" value={5} href="/fleet/documents?bucket=expired" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/fleet/documents?bucket=expired');
    expect(link).toHaveAccessibleName(/Expired\s*5/);
    expect(link.className).toContain('focus-ring');
  });

  it('an alert tone adds the left bar and colours the value', () => {
    const { container } = render(<KpiTile label="Overdue jobs" value={3} tone="danger" />);
    const tile = tileOf(container);
    expect(tile).toHaveAttribute('data-tone', 'danger');
    expect(tile.className).toContain('border-l-[3px]');
    expect(tile.className).toContain('border-l-critical');
    expect(valueOf(container)).toHaveClass('text-critical');
  });

  it('a missing value reads as a dash, not a blank', () => {
    const { container } = render(<KpiTile label="Crew on board" value={null} />);
    expect(valueOf(container)).toHaveTextContent('—');
  });
});

describe('text values', () => {
  it('a name or word uses the smaller display type on one truncated line, with the full text as title', () => {
    render(<KpiTile label="Master" value="A very long name for a person in command" textValue state="ready" sub="In command" />);
    const value = document.querySelector('[data-kpi-value]') as HTMLElement;
    expect(value.className).toContain('type-display');
    expect(value.className).toContain('truncate');
    expect(value.className).not.toContain('type-kpi');
    expect(value).toHaveAttribute('title', 'A very long name for a person in command');
  });

  it('numbers keep the KPI numerals', () => {
    render(<KpiTile label="Crew" value={12} />);
    expect((document.querySelector('[data-kpi-value]') as HTMLElement).className).toContain('type-kpi');
  });
});

describe('states', () => {
  it('zero: "0" and All clear', () => {
    const { container } = render(<KpiTile label="Breaches" value={0} tone="danger" />);
    expect(tileOf(container)).toHaveAttribute('data-state', 'zero');
    expect(valueOf(container)).toHaveTextContent('0');
    expect(screen.getByText('All clear')).toHaveClass('text-success');
    expect(tileOf(container).className).not.toContain('border-l-critical');
  });

  it('loading: skeletons, busy, labelled, never a link', () => {
    const { container } = withRouter(<KpiTile label="Open permits" state="loading" href="/x" value={9} />);
    const tile = tileOf(container);
    expect(tile).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading Open permits')).toHaveClass('sr-only');
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(2);
    expect(valueOf(container)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('not-enabled: dash, reason and an enable link for admins', () => {
    const { container } = withRouter(
      <KpiTile
        label="Hours of rest"
        state="not-enabled"
        notEnabledReason="Hours of Rest is off on 3 vessels"
        enableHref="/fleet/admin/vessel-settings"
        href="/ignored"
      />,
    );
    expect(valueOf(container)).toHaveTextContent('—');
    expect(screen.getByText(/Hours of Rest is off on 3 vessels/)).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('Switch on');
    expect(links[0]).toHaveAttribute('href', '/fleet/admin/vessel-settings');
  });

  it('error: dash, message and retry', () => {
    const onRetry = vi.fn();
    const { container } = withRouter(<KpiTile label="Training" state="error" onRetry={onRetry} href="/x" />);
    expect(valueOf(container)).toHaveTextContent('—');
    expect(screen.getByText('Could not load')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('no-access: the tile is hidden', () => {
    const { container } = render(<KpiTile label="Payroll" value={12} state="no-access" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('delta chip', () => {
  it.each([
    [-2, 'down', 'ok', '−2 vs last month', 'better'],
    [3, 'down', 'danger', '+3 vs last month', 'worse'],
    [4, 'up', 'ok', '+4 vs last month', 'better'],
    [0, 'down', 'neutral', '0 vs last month', 'no change'],
  ] as const)('change %s, good when %s → %s', (change, goodWhen, tone, text, verdict) => {
    const { container } = render(
      <KpiTile label="Expired" value={7} delta={{ change, goodWhen, label: 'vs last month' }} />,
    );
    const chip = container.querySelector('[data-delta]') as HTMLElement;
    expect(chip).toHaveTextContent(text);
    expect(chip).toHaveTextContent(verdict);
    const surface = { ok: 'bg-success-muted', danger: 'bg-critical-muted', neutral: 'bg-muted' }[tone];
    expect(chip.className).toContain(surface);
  });

  it('custom formatting', () => {
    const { container } = render(
      <KpiTile label="Compliance" value="94" unit="%" delta={{ change: 1.5, goodWhen: 'up', format: (n) => `${n.toFixed(1)} pts` }} />,
    );
    expect(container.querySelector('[data-delta]')).toHaveTextContent('+1.5 pts');
  });
});

describe('KpiGrid', () => {
  it('is 2 / 3 / 6 across', () => {
    const { container } = render(
      <KpiGrid>
        <KpiTile label="A" value={1} />
      </KpiGrid>,
    );
    expect((container.firstChild as HTMLElement).className).toContain('grid-cols-2');
    expect((container.firstChild as HTMLElement).className).toContain('lg:grid-cols-3');
    expect((container.firstChild as HTMLElement).className).toContain('min-[1440px]:grid-cols-6');
  });
});

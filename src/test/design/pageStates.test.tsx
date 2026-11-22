/**
 * Shared page states (BUILD-PLAN A7; gap/00 D7; gap/10 DS16, §A.12).
 * Render smoke tests plus the roles and headings assistive tech relies on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Anchor } from 'lucide-react';
import {
  AccessDenied,
  EMPTY_STATE_DEFAULTS,
  EMPTY_STATE_KINDS,
  EmptyState,
  ModuleOff,
  PageEmpty,
  PageError,
  PageLoading,
  SLOW_LOADING_MESSAGE,
  VesselArchived,
} from '@/shared/components/states';
import * as HealthStates from '@/modules/health/components/HealthStates';

const withRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('EmptyState', () => {
  it.each(EMPTY_STATE_KINDS)('%s renders its default copy with a level-2 heading', (kind) => {
    const { container } = render(<EmptyState kind={kind} />);
    const defaults = EMPTY_STATE_DEFAULTS[kind];
    expect(screen.getByRole('heading', { level: 2, name: defaults.title })).toBeInTheDocument();
    expect(screen.getByText(defaults.body)).toBeInTheDocument();
    expect(container.querySelector('[data-kind]')).toHaveAttribute('data-kind', kind);
    for (const svg of container.querySelectorAll('svg')) expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('errors are alerts, filter results are polite status, the rest are plain', () => {
    const { rerender } = render(<EmptyState kind="error" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<EmptyState kind="filtered" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    for (const kind of ['first-use', 'not-enabled', 'no-access'] as const) {
      rerender(<EmptyState kind={kind} />);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
    }
  });

  it('takes a title, body, action, heading level and icon', () => {
    render(
      <EmptyState
        title="No permits yet"
        body="Open a permit before hot work starts."
        action={<button type="button">Open new permit</button>}
        secondary="Templates are in Settings."
        headingLevel={3}
        icon={Anchor}
        bordered
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'No permits yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open new permit' })).toBeInTheDocument();
    expect(screen.getByText('Templates are in Settings.')).toBeInTheDocument();
  });

  it('body={null} hides the body line', () => {
    render(<EmptyState kind="first-use" body={null} />);
    expect(screen.queryByText(EMPTY_STATE_DEFAULTS['first-use'].body)).toBeNull();
  });
});

describe('PageLoading', () => {
  afterEach(() => vi.useRealTimers());

  it('is a busy status region with a label and hidden skeletons', () => {
    const { container } = render(<PageLoading label="Loading permits" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(within(status).getByText('Loading permits')).toHaveClass('sr-only');
    expect(container.querySelector('[aria-hidden="true"] .animate-pulse')).not.toBeNull();
  });

  it('says it is still loading after 3 s, not before', () => {
    vi.useFakeTimers();
    render(<PageLoading />);
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByText(SLOW_LOADING_MESSAGE)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(SLOW_LOADING_MESSAGE)).toBeInTheDocument();
  });

  it('slowAfterMs={null} never shows the note', () => {
    vi.useFakeTimers();
    render(<PageLoading slowAfterMs={null} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByText(SLOW_LOADING_MESSAGE)).toBeNull();
  });

  it.each([
    ['list', 3, 4],
    ['tiles', undefined, 18],
    ['cards', 2, 2],
    ['detail', undefined, 3],
  ] as const)('%s skeleton', (variant, rows, bars) => {
    const { container } = render(<PageLoading variant={variant} rows={rows} slowAfterMs={null} />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(bars);
  });
});

describe('PageError', () => {
  it('shows the message, retry and reference', () => {
    const onRetry = vi.fn();
    render(<PageError error={new Error('Network is slow today')} onRetry={onRetry} reference="ERR-7F2" />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'This page could not load' })).toBeInTheDocument();
    expect(within(alert).getByText('Network is slow today')).toBeInTheDocument();
    expect(within(alert).getByText('Reference ERR-7F2')).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('turns a database error into a sentence and uses its code as the reference', () => {
    render(<PageError error={{ code: '42501', message: 'new row violates row-level security policy for table "x"' }} />);
    expect(screen.getByText("You don't have permission to do that.")).toBeInTheDocument();
    expect(screen.getByText('Reference 42501')).toBeInTheDocument();
    expect(screen.queryByText(/row-level security/)).toBeNull();
  });

  it('a missing table reads as not available yet, not as an error (D-01)', () => {
    render(<PageError error={{ code: '42P01', message: 'relation "safety_permits" does not exist' }} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Not available yet' })).toBeInTheDocument();
  });

  it('treatMissingAsOff={false} shows the error', () => {
    render(<PageError error={{ code: 'PGRST205', message: 'Could not find the table' }} treatMissingAsOff={false} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('inline variant is an alert with the given title', () => {
    render(<PageError variant="inline" title="Could not load the roster" error="Timed out" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load the roster');
    expect(alert).toHaveTextContent('Timed out');
  });

  it('survives anything thrown', () => {
    for (const error of [undefined, null, 42, {}, Symbol('x')]) {
      const { unmount } = render(<PageError error={error} />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      unmount();
    }
  });
});

describe('PageEmpty', () => {
  it('first use by default', () => {
    render(<PageEmpty title="No permits yet" />);
    expect(screen.getByRole('heading', { name: 'No permits yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('filtered offers Clear filters and announces politely', () => {
    const onClear = vi.fn();
    render(<PageEmpty filtered onClearFilters={onClear} />);
    expect(screen.getByRole('status')).toHaveTextContent(EMPTY_STATE_DEFAULTS.filtered.title);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe('AccessDenied', () => {
  it('is the page heading with a way out', () => {
    withRouter(<AccessDenied />);
    expect(screen.getByRole('heading', { level: 1, name: "You don't have access to this page" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the start page' })).toHaveAttribute('href', '/');
  });

  it('keeps the ModuleRoute props (title, detail) and takes an action', () => {
    withRouter(
      <AccessDenied
        title="Clinical access required"
        detail="This page holds medical records."
        action={<button type="button">Request access</button>}
        backTo={null}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Clinical access required' })).toBeInTheDocument();
    expect(screen.getByText('This page holds medical records.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request access' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('ModuleOff', () => {
  it('admins get the way to switch it on', () => {
    withRouter(<ModuleOff moduleName="Charter" vesselName="Draak" canEnable settingsHref="/v/dra/settings/modules" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Charter is switched off for Draak' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Vessel Settings' })).toHaveAttribute('href', '/v/dra/settings/modules');
  });

  it('everyone else is told who can', () => {
    withRouter(<ModuleOff moduleName="Hours of Rest" whoCanEnable="the Master or an account admin" settingsHref="/x" />);
    expect(screen.getByRole('heading', { name: 'Hours of Rest is switched off' })).toBeInTheDocument();
    expect(screen.getByText(/Ask the Master or an account admin to switch it on/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('VesselArchived', () => {
  it('page variant', () => {
    render(<VesselArchived vesselName="Hydra" archivedOn="2026-03-03" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Hydra is archived' })).toBeInTheDocument();
    expect(screen.getByText(/archived on 03 Mar 2026 and is read-only/)).toBeInTheDocument();
  });

  it('banner variant is a status line above a read-only page', () => {
    render(<VesselArchived variant="banner" vesselName="Hydra" archivedOn="2026-03-03T10:00:00Z" action={<a href="/fleet">Back to fleet</a>} />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Hydra was archived on 03 Mar 2026. Records are read-only.');
    expect(within(banner).getByRole('link', { name: 'Back to fleet' })).toBeInTheDocument();
  });

  it('ignores a date it cannot read', () => {
    render(<VesselArchived archivedOn="soon" />);
    expect(screen.getByRole('heading', { name: 'This vessel is archived' })).toBeInTheDocument();
    expect(screen.queryByText(/ on /)).toBeNull();
  });
});

describe('HealthStates composes the shared states', () => {
  it('keeps every export', () => {
    for (const name of ['HealthLoading', 'HealthError', 'HealthEmpty', 'ClinicalNotice', 'PickPersonPrompt', 'NoSubjectRecord']) {
      expect(HealthStates, name).toHaveProperty(name);
    }
  });

  it('HealthLoading is the shared loading region', () => {
    render(<HealthStates.HealthLoading rows={2} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('HealthError keeps its default title and shows the message', () => {
    render(<HealthStates.HealthError error={new Error('boom')} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load this page');
    expect(alert).toHaveTextContent('boom');
  });

  it('HealthEmpty keeps its props', () => {
    render(
      <HealthStates.HealthEmpty
        icon={Anchor}
        title="No vaccinations recorded"
        description="Add the first one from the crew record."
        action={<button type="button">Add vaccination</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No vaccinations recorded' })).toBeInTheDocument();
    expect(screen.getByText('Add the first one from the crew record.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add vaccination' })).toBeInTheDocument();
  });

  it('PickPersonPrompt still renders through HealthEmpty', () => {
    render(<HealthStates.PickPersonPrompt what="vaccinations" icon={Anchor} />);
    expect(screen.getByRole('heading', { name: 'Choose someone to see their vaccinations' })).toBeInTheDocument();
  });
});

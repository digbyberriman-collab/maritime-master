/**
 * The Red Room panel's Snooze and Assign task dialogs are optional UI chunks
 * (src/app/optionalChunks.ts; D-100): they load on first open through the
 * shared loader, and a chunk that cannot load shows the dialog's own boundary
 * ("The dialog could not load", both causes, Close / Try again / Reload),
 * never a route crash and never a reload on its own. Try again imports the
 * chunk again with a fresh lazy component; Reload is the user's way through
 * the bounded guard (`requestChunkRecovery`). A hover or focus preload that
 * fails is silent and forgotten, so the next open imports again.
 *
 * Each test imports the panel afresh (vi.resetModules) and registers the
 * dialog chunks again (vi.doMock), so the module-level loaders start empty.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { RedRoomItem } from '@/modules/red-room/types';

const h = vi.hoisted(() => ({
  recover: vi.fn(),
  snoozeImports: 0,
  snoozeFailures: 0,
  assignImports: 0,
  assignFailures: 0,
  items: [] as unknown[],
}));

vi.mock('@/app/staleChunkRecovery', () => ({ requestChunkRecovery: h.recover }));

// The dialog chunks: the first `*Failures` imports fail as a missing hashed
// file does after a deploy. Registered per test with vi.doMock (below), so a
// module that loaded in one test is not cached for the next.
const snoozeChunk = async () => {
  h.snoozeImports += 1;
  if (h.snoozeFailures > 0) {
    h.snoozeFailures -= 1;
    throw new TypeError('Failed to fetch dynamically imported module: /assets/SnoozeDialog-x.js');
  }
  const { createElement } = await import('react');
  const SnoozeDialog = ({ open }: { open: boolean }) => (open ? createElement('div', { 'data-testid': 'snooze-dialog' }, 'Snooze Alert') : null);
  return { default: SnoozeDialog, SnoozeDialog };
};
const assignChunk = async () => {
  h.assignImports += 1;
  if (h.assignFailures > 0) {
    h.assignFailures -= 1;
    throw new TypeError('Failed to fetch dynamically imported module: /assets/AssignTaskDialog-x.js');
  }
  const { createElement } = await import('react');
  const AssignTaskDialog = ({ open }: { open: boolean }) => (open ? createElement('div', { 'data-testid': 'assign-dialog' }, 'Assign Task') : null);
  return { default: AssignTaskDialog, AssignTaskDialog };
};

vi.mock('@/modules/red-room/store/redRoomStore', () => ({
  useRedRoomStore: () => ({
    items: h.items,
    isLoading: false,
    canAssignTasks: true,
    loadRedRoomItems: () => undefined,
    checkPermissions: () => undefined,
    acknowledgeItem: async () => ({ success: true }),
    getViewUrl: () => '/alerts',
  }),
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'co-1' } }) }));
vi.mock('@/shared/hooks/use-toast', () => ({ useToast: () => ({ toast: () => undefined }) }));

const item: RedRoomItem = {
  id: 'rr-1',
  title: 'Fire drill overdue',
  severity: 'red',
  status: 'open',
  source_module: 'safety',
  vessel_id: 'v-dra',
  vessel_name: 'M/Y DRAAK',
  is_direct_assignment: false,
  snooze_count: 0,
  created_at: '2026-11-20T08:00:00.000Z',
  is_overdue: false,
  is_snoozed: false,
  source_type: 'urgent',
};

beforeEach(() => {
  vi.resetModules();
  vi.doMock('@/modules/red-room/components/SnoozeDialog', snoozeChunk);
  vi.doMock('@/modules/red-room/components/AssignTaskDialog', assignChunk);
  h.recover.mockReset();
  h.snoozeImports = 0;
  h.snoozeFailures = 0;
  h.assignImports = 0;
  h.assignFailures = 0;
  h.items = [item];
  // React logs every error a boundary catches; these failures are the point.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

/** Let the imports settle and React render what follows. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
  });

async function renderPanel() {
  const { RedRoomPanel } = await import('@/modules/red-room/components/RedRoomPanel');
  render(
    <MemoryRouter>
      <TooltipProvider>
        <RedRoomPanel />
      </TooltipProvider>
    </MemoryRouter>,
  );
  await settle();
}

const loadError = () => screen.findByTestId('red-room-dialog-load-error');

async function openFailing(button: 'Snooze' | 'Assign task') {
  fireEvent.click(screen.getByRole('button', { name: button }));
  await settle();
  return loadError();
}

describe('Red Room dialogs: "The dialog could not load"', () => {
  it('a Snooze chunk that cannot load shows its own boundary with both causes, Close, Try again and Reload', async () => {
    h.snoozeFailures = 1;
    await renderPanel();
    const boundary = await openFailing('Snooze');
    expect(within(boundary).getByRole('heading', { name: 'The dialog could not load' })).toBeInTheDocument();
    expect(boundary).toHaveTextContent('STORM may have been updated, or the connection dropped.');
    const reload = within(boundary).getByRole('button', { name: 'Reload' });
    const footer = reload.parentElement as HTMLElement;
    expect(within(footer).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Close', 'Try again', 'Reload']);
    // 44 px on touch (D-35); the icons are decoration.
    for (const name of ['Close', 'Try again', 'Reload']) {
      expect(within(footer).getByRole('button', { name }).className).toContain('[@media(pointer:coarse)]:h-11');
    }
    for (const svg of footer.querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true');
    // The panel underneath is still there, and nothing reloaded on its own.
    expect(screen.getByText('Fire drill overdue')).toBeInTheDocument();
    expect(screen.queryByTestId('snooze-dialog')).toBeNull();
    await settle();
    expect(h.recover).not.toHaveBeenCalled();
  });

  it('Try again imports the chunk again and renders the dialog', async () => {
    h.snoozeFailures = 1;
    await renderPanel();
    const boundary = await openFailing('Snooze');
    const before = h.snoozeImports;
    fireEvent.click(within(boundary).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(h.snoozeImports).toBe(before + 1);
    expect(await screen.findByTestId('snooze-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('red-room-dialog-load-error')).toBeNull();
    expect(h.recover).not.toHaveBeenCalled();
  });

  it('a failed Try again shows the boundary again and still never reloads', async () => {
    h.snoozeFailures = 2;
    await renderPanel();
    const boundary = await openFailing('Snooze');
    fireEvent.click(within(boundary).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(h.snoozeImports).toBe(2);
    expect(within(await loadError()).getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(h.recover).not.toHaveBeenCalled();
  });

  it('Reload asks the bounded guard exactly once', async () => {
    h.snoozeFailures = 1;
    await renderPanel();
    const boundary = await openFailing('Snooze');
    fireEvent.click(within(boundary).getByRole('button', { name: 'Reload' }));
    expect(h.recover).toHaveBeenCalledTimes(1);
  });

  it('Close closes the failure state; the panel stays', async () => {
    h.snoozeFailures = 1;
    await renderPanel();
    const boundary = await openFailing('Snooze');
    const footer = within(boundary).getByRole('button', { name: 'Reload' }).parentElement as HTMLElement;
    fireEvent.click(within(footer).getByRole('button', { name: 'Close' }));
    await settle();
    expect(screen.queryByTestId('red-room-dialog-load-error')).toBeNull();
    expect(screen.getByText('Fire drill overdue')).toBeInTheDocument();
    expect(h.recover).not.toHaveBeenCalled();
  });

  it('the Assign task chunk has its own boundary, and Try again renders it', async () => {
    h.assignFailures = 1;
    await renderPanel();
    const boundary = await openFailing('Assign task');
    expect(within(boundary).getByRole('heading', { name: 'The dialog could not load' })).toBeInTheDocument();
    fireEvent.click(within(boundary).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(h.assignImports).toBe(2);
    expect(await screen.findByTestId('assign-dialog')).toBeInTheDocument();
    // The Snooze chunk was never needed.
    expect(h.snoozeImports).toBe(0);
    expect(h.recover).not.toHaveBeenCalled();
  });

  it('a hover or focus preload that fails is silent, and the next open imports again', async () => {
    h.snoozeFailures = 2;
    await renderPanel();
    const snooze = screen.getByRole('button', { name: 'Snooze' });
    fireEvent.pointerEnter(snooze);
    await settle();
    fireEvent.focus(snooze);
    await settle();
    expect(h.snoozeImports).toBe(2);
    expect(screen.queryByTestId('red-room-dialog-load-error')).toBeNull();
    expect(h.recover).not.toHaveBeenCalled();
    fireEvent.click(snooze);
    await settle();
    expect(h.snoozeImports).toBe(3);
    expect(await screen.findByTestId('snooze-dialog')).toBeInTheDocument();
  });

  it('a chunk that loads opens the dialog on first click, with one import', async () => {
    await renderPanel();
    expect(h.snoozeImports).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Snooze' }));
    await settle();
    expect(await screen.findByTestId('snooze-dialog')).toBeInTheDocument();
    expect(h.snoozeImports).toBe(1);
  });
});

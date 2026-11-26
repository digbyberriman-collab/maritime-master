/**
 * "To acknowledge" (src/modules/documents/components/PendingFleetDocumentsCard.tsx;
 * gap/02 FD9, W1; D-01; X5-05A), over `fleet_document_my_pending`:
 *
 * - gate `vessel.safety.fleet_documents.view_own`: nothing read and nothing
 *   shown while it loads or when denied;
 * - the vessel home (`variant="home"`): a skeleton while it reads, the
 *   caller's outstanding documents of that vessel (overdue first as the
 *   server sends them) with their state and due date, each linking to the
 *   document on the vessel's page (`?doc=`), "View all n" past the limit,
 *   "Nothing to acknowledge", "Acknowledgements are not set up yet" while the
 *   RPC is missing, an error with Retry;
 * - the fleet dashboard tile (`variant="fleet"`): every vessel (NULL), the
 *   vessel's name on each row, nothing at all when there is nothing to
 *   acknowledge or while not set up, an error with Retry on a failed read;
 * - links stay inside the row's own vessel scope; 44 px targets on coarse
 *   pointers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FleetDocumentMyPendingRow } from '@/modules/documents/types/db.pending';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  answer: null as Answer | (() => Promise<Answer>) | null,
  calls: [] as Array<{ fn: string; args: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn((fn: string, args: unknown) => {
      state.calls.push({ fn, args });
      const answer = state.answer;
      if (typeof answer === 'function') return answer();
      return Promise.resolve(answer ?? { data: null, error: { code: 'XX000', message: 'no answer' } });
    }),
  },
}));
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => state.decide(key),
  useCan: (key: string) => state.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/modules/auth/contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/auth/contexts/AuthContext')>()),
  useAuth: () => ({ profile: { company_id: 'co-1' }, user: { id: 'u-1' } }),
}));

import { PendingFleetDocumentsCard } from '@/modules/documents/components/PendingFleetDocumentsCard';

const pending = (overrides: Partial<FleetDocumentMyPendingRow> = {}): FleetDocumentMyPendingRow => ({
  document_id: 'd-sms',
  version_id: 'ver-3',
  vessel_id: 'v-dra',
  vessel_name: 'M/Y DRAAK',
  vessel_code: 'DRA',
  title: 'Safety management manual',
  section: 'Safety management',
  type_name: 'Manual',
  version_label: 'Rev 3',
  due_at: '2026-12-04T10:00:00Z',
  state: 'pending',
  ...overrides,
});

function renderCard(props: React.ComponentProps<typeof PendingFleetDocumentsCard>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PendingFleetDocumentsCard {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.answer = { data: [], error: null };
  state.calls = [];
});
afterEach(() => cleanup());

describe('the gate', () => {
  it('reads nothing and shows nothing while the capability loads or when it is denied', () => {
    state.decide = () => ({ allowed: false, status: 'loading', reason: '' });
    const { container, unmount } = renderCard({ variant: 'home', vesselId: 'v-dra', vesselCode: 'DRA' });
    expect(container).toBeEmptyDOMElement();
    unmount();
    state.decide = () => ({ allowed: false, status: 'denied', reason: '' });
    const second = renderCard({ variant: 'home', vesselId: 'v-dra', vesselCode: 'DRA' });
    expect(second.container).toBeEmptyDOMElement();
    expect(state.calls).toHaveLength(0);
  });
});

describe('on the vessel home', () => {
  it('reads this vessel only and shows a skeleton meanwhile', () => {
    state.answer = () => new Promise(() => undefined);
    renderCard({ variant: 'home', vesselId: 'v-dra', vesselCode: 'DRA' });
    expect(screen.getByRole('heading', { name: 'To acknowledge' })).toBeInTheDocument();
    expect(screen.getByText('Loading your documents to acknowledge')).toBeInTheDocument();
    expect(state.calls).toEqual([{ fn: 'fleet_document_my_pending', args: { p_vessel_id: 'v-dra' } }]);
  });

  it('lists the outstanding documents with state, due date and a link to the document on the vessel page', async () => {
    state.answer = {
      data: [pending({ document_id: 'd-drug', title: 'Drug and alcohol policy', state: 'overdue', due_at: '2026-11-10T10:00:00Z', version_label: 'v1' }), pending()],
      error: null,
    };
    renderCard({ variant: 'home', vesselId: 'v-dra', vesselCode: 'DRA' });
    const rows = await screen.findAllByTestId('pending-fleet-document');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Overdue')).toBeInTheDocument();
    expect(within(rows[0]).getByText('since 10 Nov 2026')).toBeInTheDocument();
    expect(within(rows[1]).getByText('by 04 Dec 2026')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Safety management · Rev 3')).toBeInTheDocument();
    const link = within(rows[1]).getByRole('link', { name: 'Safety management manual' });
    expect(link).toHaveAttribute('href', '/v/dra/safety/fleet-documents?doc=d-sms');
    expect(link.className).toContain('[@media(pointer:coarse)]:min-h-11');
    expect(screen.getByRole('heading', { name: /To acknowledge/ })).toHaveTextContent('2 · 1 overdue');
    expect(screen.getByRole('link', { name: 'Fleet documents' })).toHaveAttribute('href', '/v/dra/safety/fleet-documents');
    expect(screen.queryByText('M/Y DRAAK', { exact: false })).toBeNull();
  });

  it('past the limit it offers "View all n"', async () => {
    state.answer = { data: Array.from({ length: 7 }, (_, i) => pending({ document_id: `d-${i}`, title: `Document ${i}` })), error: null };
    renderCard({ variant: 'home', vesselId: 'v-dra', vesselCode: 'DRA' });
    expect(await screen.findAllByTestId('pending-fleet-document')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'View all 7' })).toHaveAttribute('href', '/v/dra/safety/fleet-documents');
  });

  it('nothing outstanding says so', async () => {
    renderCard({ variant: 'home', vesselId: 'v-dra', vesselCode: 'DRA' });
    expect(await screen.findByText(/Nothing to acknowledge/)).toBeInTheDocument();
  });

  it('a missing RPC is "Acknowledgements are not set up yet" (D-01), never rows', async () => {
    state.answer = { data: null, error: { code: '42883', message: 'function public.fleet_document_my_pending(uuid) does not exist' } };
    renderCard({ variant: 'home', vesselId: 'v-dra', vesselCode: 'DRA' });
    expect(await screen.findByText('Acknowledgements are not set up yet')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-fleet-document')).toBeNull();
  });

  it('a failed read is an error with Retry that reads again', async () => {
    state.answer = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    renderCard({ variant: 'home', vesselId: 'v-dra', vesselCode: 'DRA' });
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    expect(screen.getByText('Your documents to acknowledge could not load')).toBeInTheDocument();
    state.answer = { data: [pending()], error: null };
    fireEvent.click(retry);
    expect(await screen.findByTestId('pending-fleet-document')).toBeInTheDocument();
  });

  it('an answer it cannot read is an error, not a guess', async () => {
    state.answer = { data: [pending({ state: 'acknowledged' as never })], error: null };
    renderCard({ variant: 'home', vesselId: 'v-dra', vesselCode: 'DRA' });
    expect(await screen.findByText(/in a form this page does not know/)).toBeInTheDocument();
  });
});

describe('on the fleet dashboard', () => {
  it('asks across every vessel whose crew the caller is on, and names each row\'s vessel', async () => {
    state.answer = {
      data: [pending(), pending({ document_id: 'd-h', vessel_id: 'v-hyd', vessel_name: 'HYDRA', vessel_code: 'HYD', title: 'Hydra procedure' })],
      error: null,
    };
    renderCard({ variant: 'fleet', vesselId: null });
    const rows = await screen.findAllByTestId('pending-fleet-document');
    expect(state.calls).toEqual([{ fn: 'fleet_document_my_pending', args: { p_vessel_id: null } }]);
    expect(within(rows[0]).getByText('M/Y DRAAK · Safety management · Rev 3')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('link', { name: 'Hydra procedure' })).toHaveAttribute('href', '/v/hyd/safety/fleet-documents?doc=d-h');
    // Two vessels: no single "View all" page.
    expect(screen.queryByRole('link', { name: /View all|Fleet documents/ })).toBeNull();
  });

  it('shows nothing when there is nothing to acknowledge, or while it is not set up', async () => {
    const { container, unmount } = renderCard({ variant: 'fleet', vesselId: null });
    await vi.waitFor(() => expect(state.calls).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
    unmount();
    state.answer = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    const second = renderCard({ variant: 'fleet', vesselId: null });
    await vi.waitFor(() => expect(state.calls).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(second.container).toBeEmptyDOMElement();
  });

  it('a failed read still says so, with Retry', async () => {
    state.answer = { data: null, error: { code: '57014', message: 'timeout' } };
    renderCard({ variant: 'fleet', vesselId: null });
    expect(await screen.findByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
  });
});

/**
 * Vessel › Safety › Fleet documents (src/modules/documents/pages/VesselFleetDocumentsPage.tsx,
 * hooks/useFleetDocumentAcks.ts; gap/02 FD9, W1; D-01, D-04, D-X5-04, D-X5-17; X5-05A):
 *
 * - gate `vessel.safety.fleet_documents.view_own`: nothing is read while it
 *   loads (skeleton) and a denied caller gets AccessDenied;
 * - D-01: the RPC missing is "Acknowledgements are not set up yet"; any
 *   other error is PageError with Retry; a state the client does not know
 *   is an error, never a guess; out of reach has its own sentence;
 * - the list: grouped by section in the server's order, type, version and
 *   effective date, the caller's own state with its due date; a document
 *   without acknowledgement says so; someone not on the crew is told why;
 *   the "To acknowledge" chip;
 * - `?doc=` opens the document panel; "Open document" asks for a signed URL
 *   of the records bucket and opens it; the one-tap "I have read and
 *   understood this version" (44 px on coarse pointers) sends the version
 *   and the vessel, checks the returned row before it says so, and maps
 *   refusals (already acknowledged, blocked with its reason, not set up);
 *   a returned row for another version is not a success.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FleetDocumentVesselDocumentRow } from '@/modules/documents/types/db.pending';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string; details?: string | null } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  answers: {} as Record<string, Answer | (() => Promise<Answer>)>,
  calls: [] as Array<{ fn: string; args: unknown }>,
  signed: { data: { signedUrl: 'https://files.example.test/signed' }, error: null } as { data: { signedUrl: string } | null; error: { message: string } | null },
  signedPaths: [] as Array<{ bucket: string; path: string; ttl: number }>,
  notify: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn((fn: string, args: unknown) => {
      state.calls.push({ fn, args });
      const answer = state.answers[fn];
      if (typeof answer === 'function') return answer();
      return Promise.resolve(answer ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } });
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string, ttl: number) => {
          state.signedPaths.push({ bucket, path, ttl });
          return Promise.resolve(state.signed);
        },
      }),
    },
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
vi.mock('@/app/router/scopes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/router/scopes')>()),
  useVesselScope: () => ({ vessel: { id: 'v-dra', name: 'M/Y DRAAK', company_id: 'co-1' }, code: 'dra' }),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/notify')>()),
  notify: state.notify,
}));

import VesselFleetDocumentsPage from '@/modules/documents/pages/VesselFleetDocumentsPage';

const doc = (overrides: Partial<FleetDocumentVesselDocumentRow> = {}): FleetDocumentVesselDocumentRow => ({
  document_id: 'd-sms',
  section_id: 's-safety',
  section_name: 'Safety management',
  section_order: 1,
  type_id: 't-manual',
  type_name: 'Manual',
  type_order: 1,
  title: 'Safety management manual',
  description: 'The company safety management system.',
  ack_required: true,
  ack_due_days: 14,
  version_id: 'ver-3',
  version_no: 3,
  version_label: 'Rev 3',
  version_kind: 'major',
  effective_date: '2026-11-20',
  published_at: '2026-11-20T10:00:00Z',
  change_summary: 'New muster arrangements.',
  file_name: 'sms-rev3.pdf',
  mime_type: 'application/pdf',
  size_bytes: 2048,
  storage_path: 'co-1/fleet/documents/fleet_document/d-sms/f1-sms-rev3.pdf',
  caller_on_crew: true,
  state: 'pending',
  due_at: '2026-12-04T10:00:00Z',
  blocked_reason: null,
  acknowledged_at: null,
  method: null,
  ...overrides,
});

const ROWS = [
  doc(),
  doc({ document_id: 'd-drug', type_id: 't-policy', type_name: 'Policy', title: 'Drug and alcohol policy', version_id: 'ver-1', version_label: 'v1', state: 'overdue', due_at: '2026-11-10T10:00:00Z' }),
  doc({ document_id: 'd-garbage', section_id: 's-env', section_name: 'Environment', section_order: 2, type_name: 'Plan', title: 'Garbage management plan', ack_required: false, state: null, due_at: null, version_label: 'v2' }),
  doc({ document_id: 'd-muster', title: 'Muster list', version_label: 'v4', state: 'acknowledged', acknowledged_at: '2026-11-03T08:00:00Z', method: 'witnessed', due_at: null }),
];

function renderPage(path = '/v/dra/safety/fleet-documents') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <VesselFleetDocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.answers = { fleet_document_vessel_documents: { data: ROWS, error: null } };
  state.calls = [];
  state.signedPaths = [];
  state.signed = { data: { signedUrl: 'https://files.example.test/signed' }, error: null };
  for (const fn of Object.values(state.notify)) fn.mockReset();
});
afterEach(() => cleanup());

describe('the gate', () => {
  it('reads nothing while the capability loads (skeleton), then nothing when denied (AccessDenied)', async () => {
    state.decide = () => ({ allowed: false, status: 'loading', reason: '' });
    const { unmount } = renderPage();
    expect(screen.getByRole('status')).toHaveTextContent(/Loading fleet documents/i);
    expect(state.calls).toHaveLength(0);
    unmount();
    state.decide = () => ({ allowed: false, status: 'denied', reason: 'no-capability' });
    renderPage();
    expect(await screen.findByText(/need a signed-in account on this vessel/i)).toBeInTheDocument();
    expect(state.calls).toHaveLength(0);
  });

  it('asks the server for this vessel only', async () => {
    renderPage();
    await screen.findByText('Safety management manual');
    expect(state.calls).toEqual([{ fn: 'fleet_document_vessel_documents', args: { p_vessel_id: 'v-dra' } }]);
  });
});

describe('D-01 and errors', () => {
  it('a missing RPC is "Acknowledgements are not set up yet", never rows', async () => {
    state.answers.fleet_document_vessel_documents = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_document_vessel_documents' } };
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Acknowledgements are not set up yet' })).toBeInTheDocument();
    expect(screen.queryByTestId('vessel-fleet-document-row')).toBeNull();
  });

  it('any other error is PageError with a Retry that reads again', async () => {
    state.answers.fleet_document_vessel_documents = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    renderPage();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    expect(screen.getByText('Fleet documents could not load')).toBeInTheDocument();
    state.answers.fleet_document_vessel_documents = { data: ROWS, error: null };
    fireEvent.click(retry);
    expect(await screen.findByText('Safety management manual')).toBeInTheDocument();
  });

  it('a vessel out of reach says so, once (not retried)', async () => {
    state.answers.fleet_document_vessel_documents = { data: null, error: { code: '42501', message: 'vessel_out_of_reach' } };
    renderPage();
    expect(await screen.findByText(/no longer have access to this vessel/i)).toBeInTheDocument();
    expect(state.calls).toHaveLength(1);
  });

  it('a state the page does not know is an error, never a guess', async () => {
    state.answers.fleet_document_vessel_documents = { data: [doc({ state: 'maybe' as never })], error: null };
    renderPage();
    expect(await screen.findByText(/in a form this page does not know/i)).toBeInTheDocument();
    expect(screen.queryByText('Safety management manual')).toBeNull();
  });
});

describe('the list', () => {
  it('groups by section in the server order, with type, version, date and the caller\'s own state', async () => {
    renderPage();
    await screen.findByText('Safety management manual');
    const sections = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(sections).toEqual(['Safety management3 documents', 'Environment1 document']);
    const rows = screen.getAllByTestId('vessel-fleet-document-row');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Manual · Rev 3 · Effective 20 Nov 2026');
    expect(within(rows[0]).getByText('To acknowledge')).toBeInTheDocument();
    expect(within(rows[0]).getByText('by 04 Dec 2026')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Overdue')).toBeInTheDocument();
    expect(within(rows[1]).getByText('since 10 Nov 2026')).toBeInTheDocument();
    expect(within(rows[2]).getByText('on 03 Nov 2026')).toBeInTheDocument();
    // The outstanding rows carry the call to action; the others are opened from their title.
    expect(within(rows[0]).getByRole('button', { name: 'Read and acknowledge Safety management manual' })).toBeInTheDocument();
    expect(within(rows[2]).getByRole('button', { name: 'View Muster list' }).parentElement?.className).toContain('hidden sm:flex');
    expect(within(rows[3]).getByText('No acknowledgement needed')).toBeInTheDocument();
    expect(screen.getByTestId('vessel-fleet-documents-summary')).toHaveTextContent('2 documents to acknowledge, 1 overdue.');
    expect(screen.getAllByText(/^Updated /)).toHaveLength(1);
  });

  it('"To acknowledge" shows only the outstanding ones; with none left it says so', async () => {
    renderPage();
    await screen.findByText('Safety management manual');
    fireEvent.click(screen.getByRole('button', { name: /To acknowledge/ }));
    expect(screen.getAllByTestId('vessel-fleet-document-row')).toHaveLength(2);
    cleanup();
    state.answers.fleet_document_vessel_documents = { data: [ROWS[2], ROWS[3]], error: null };
    renderPage();
    await screen.findByText('Muster list');
    expect(screen.getByTestId('vessel-fleet-documents-summary')).toHaveTextContent('You are up to date');
    fireEvent.click(screen.getByRole('button', { name: /To acknowledge/ }));
    expect(screen.getByText('Nothing to acknowledge')).toBeInTheDocument();
  });

  it('someone not on the vessel\'s crew reads the list and is told nothing needs them', async () => {
    state.answers.fleet_document_vessel_documents = { data: ROWS.map((r) => ({ ...r, caller_on_crew: false, state: null, due_at: null })), error: null };
    renderPage();
    expect(await screen.findByTestId('vessel-fleet-documents-not-crew')).toHaveTextContent('not on this vessel’s crew list');
    expect(screen.queryByRole('button', { name: /To acknowledge/ })).toBeNull();
    expect(screen.queryByText('To acknowledge')).toBeNull();
  });

  it('nothing published yet is a first-use empty state', async () => {
    state.answers.fleet_document_vessel_documents = { data: [], error: null };
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Nothing published to this vessel yet' })).toBeInTheDocument();
  });
});

describe('the document panel', () => {
  it('?doc= opens the document: details, what changed, and the acknowledgement button (44 px on coarse pointers)', async () => {
    renderPage('/v/dra/safety/fleet-documents?doc=d-sms');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Safety management manual')).toBeInTheDocument();
    expect(within(dialog).getByText('Safety management › Manual')).toBeInTheDocument();
    expect(within(dialog).getByText('New muster arrangements.')).toBeInTheDocument();
    expect(within(dialog).getByText(/sms-rev3\.pdf/)).toBeInTheDocument();
    const button = within(dialog).getByRole('button', { name: 'I have read and understood this version' });
    expect(button.className).toContain('[@media(pointer:coarse)]:min-h-11');
    expect(within(dialog).getByRole('button', { name: 'Close the document' }).className).toContain('[@media(pointer:coarse)]:min-h-11');
  });

  it('a document no longer published says so', async () => {
    renderPage('/v/dra/safety/fleet-documents?doc=d-gone');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Document not found')).toBeInTheDocument();
  });

  it('Open document asks for a short signed URL of the records bucket and opens it in a new tab', async () => {
    const tab = { opener: {} as unknown, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    renderPage('/v/dra/safety/fleet-documents?doc=d-sms');
    fireEvent.click(await screen.findByRole('button', { name: 'Open document' }));
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith('https://files.example.test/signed'));
    expect(state.signedPaths).toEqual([{ bucket: 'records', path: 'co-1/fleet/documents/fleet_document/d-sms/f1-sms-rev3.pdf', ttl: 300 }]);
    expect(tab.opener).toBeNull();
    open.mockRestore();
  });

  it('a file that cannot be opened closes the tab and says so', async () => {
    const tab = { opener: {} as unknown, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    state.signed = { data: null, error: { message: 'Object not found' } };
    renderPage('/v/dra/safety/fleet-documents?doc=d-sms');
    fireEvent.click(await screen.findByRole('button', { name: 'Open document' }));
    await waitFor(() => expect(state.notify.error).toHaveBeenCalled());
    expect(tab.close).toHaveBeenCalled();
    expect(state.notify.error.mock.calls[0][1]).toMatchObject({ title: 'The document could not be opened' });
    open.mockRestore();
  });
});

describe('acknowledging', () => {
  const ackRow = { id: 'a-1', company_id: 'co-1', document_id: 'd-sms', version_id: 'ver-3', vessel_id: 'v-dra', profile_id: 'p-1', user_id: 'u-1', method: 'self' };

  it('sends this version and this vessel, checks the row, says so and reads again', async () => {
    state.answers.fleet_document_acknowledge = { data: ackRow, error: null };
    renderPage('/v/dra/safety/fleet-documents?doc=d-sms');
    fireEvent.click(await screen.findByRole('button', { name: 'I have read and understood this version' }));
    await waitFor(() => expect(state.notify.success).toHaveBeenCalledWith('Acknowledged', { description: 'Safety management manual, version Rev 3.' }));
    expect(state.calls).toContainEqual({ fn: 'fleet_document_acknowledge', args: { p_version_id: 'ver-3', p_vessel_id: 'v-dra' } });
    await waitFor(() => expect(state.calls.filter((c) => c.fn === 'fleet_document_vessel_documents').length).toBeGreaterThan(1));
  });

  it('a returned row for another version (or signed by someone else) is not a success', async () => {
    state.answers.fleet_document_acknowledge = { data: { ...ackRow, version_id: 'ver-2' }, error: null };
    renderPage('/v/dra/safety/fleet-documents?doc=d-sms');
    fireEvent.click(await screen.findByRole('button', { name: 'I have read and understood this version' }));
    await waitFor(() => expect(state.notify.error).toHaveBeenCalled());
    expect(state.notify.success).not.toHaveBeenCalled();
    expect((state.notify.error.mock.calls[0][0] as Error).message).toMatch(/was not recorded/);
  });

  it('already acknowledged is said plainly (not an error), and the list reads again', async () => {
    state.answers.fleet_document_acknowledge = { data: null, error: { code: '22023', message: 'already_acknowledged' } };
    renderPage('/v/dra/safety/fleet-documents?doc=d-sms');
    fireEvent.click(await screen.findByRole('button', { name: 'I have read and understood this version' }));
    await waitFor(() => expect(state.notify.info).toHaveBeenCalledWith('You have already acknowledged this version.'));
    expect(state.notify.success).not.toHaveBeenCalled();
    expect(state.notify.error).not.toHaveBeenCalled();
  });

  it('blocked names the reason from the server', async () => {
    state.answers.fleet_document_acknowledge = { data: null, error: { code: '22023', message: 'blocked', details: 'not_in_signer_set' } };
    renderPage('/v/dra/safety/fleet-documents?doc=d-sms');
    fireEvent.click(await screen.findByRole('button', { name: 'I have read and understood this version' }));
    await waitFor(() => expect(state.notify.error).toHaveBeenCalled());
    expect((state.notify.error.mock.calls[0][0] as Error).message).toMatch(/not on the list of people who sign for this vessel/);
  });

  it('the RPC missing says nothing was recorded', async () => {
    state.answers.fleet_document_acknowledge = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    renderPage('/v/dra/safety/fleet-documents?doc=d-sms');
    fireEvent.click(await screen.findByRole('button', { name: 'I have read and understood this version' }));
    await waitFor(() => expect(state.notify.error).toHaveBeenCalled());
    expect((state.notify.error.mock.calls[0][0] as Error).message).toBe('Acknowledgements are not set up yet, so nothing was recorded.');
  });

  it('a blocked caller sees why, with no button; an acknowledged one sees when and how', async () => {
    state.answers.fleet_document_vessel_documents = {
      data: [doc({ state: 'blocked', blocked_reason: 'not_in_signer_set' }), ROWS[3]],
      error: null,
    };
    renderPage('/v/dra/safety/fleet-documents?doc=d-sms');
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('note')).toHaveTextContent('not on the list of people who sign');
    expect(within(dialog).queryByRole('button', { name: 'I have read and understood this version' })).toBeNull();
    cleanup();
    renderPage('/v/dra/safety/fleet-documents?doc=d-muster');
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('You acknowledged this version on 03 Nov 2026.')).toBeInTheDocument();
    expect(within(dialog).getByText('Recorded on a shared device, with a witness.')).toBeInTheDocument();
  });
});

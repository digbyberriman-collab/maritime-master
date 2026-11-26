/**
 * The version history of a fleet document (src/modules/documents/
 * components/VersionHistoryDrawer.tsx, hooks/useFleetDocumentHistory.ts;
 * gap/02 FD4, W1; X5 spec X5-04B; D-01):
 *
 * - nothing is read while it is closed; open, it reads the document, its
 *   versions, its targets, then the actors' names in one select;
 * - versions newest first: label, number, state, what major / minor meant
 *   for acknowledgements, the effective date, the file, who published it
 *   and when, when it was superseded; a draft says it is not published;
 * - a withdrawn document says when, by whom and why;
 * - a name that cannot be read says "Name not available";
 * - D-01 / error / gone states; editors get the next step for the state,
 *   readers none.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Answer>,
  reads: [] as string[],
  filters: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    state.reads.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order']) chain[m] = () => chain;
    for (const m of ['eq', 'in']) {
      chain[m] = (column: string, value: unknown) => {
        state.filters.push(`${table}.${m}.${column}=${JSON.stringify(value)}`);
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.tables[table] ?? { data: [], error: null }).then(resolve, reject);
    return chain;
  };
  return { supabase: { from, rpc: vi.fn() } };
});

import { VersionHistoryDrawer, type VersionHistoryDrawerProps } from '@/modules/documents/components/VersionHistoryDrawer';
import { actorIds, displayName } from '@/modules/documents/hooks/useFleetDocumentHistory';
import type { LibraryRow } from '@/modules/documents/lib/fleetDocumentLibrary';

const CO = 'co-1';
const MANAGER = 'a0000000-0000-4000-8000-000000000001';
const EDITOR = 'a0000000-0000-4000-8000-000000000002';

const row = (extra: Partial<LibraryRow> = {}): LibraryRow => ({
  id: 'd-sms',
  title: 'Safety Management Manual',
  description: null,
  status: 'published',
  typeId: 't-manual',
  typeName: 'Safety manual',
  sectionId: 's-safety',
  sectionName: 'Safety management',
  current: { id: 'ver-2', versionNo: 2, label: 'Rev 2', kind: 'minor', effectiveDate: '2026-11-02', fileName: 'Rev 2.pdf' },
  draft: null,
  targetMode: 'selected',
  targetVesselIds: ['v-dra', 'v-hyd'],
  vesselsLabel: '2 of 3',
  vesselCount: 2,
  ackRequired: true,
  withdrawnReason: null,
  updatedAt: '2026-11-20T10:00:00Z',
  ...extra,
});

const document = (extra: Record<string, unknown> = {}) => ({
  id: 'd-sms',
  company_id: CO,
  type_id: 't-manual',
  title: 'Safety Management Manual',
  description: null,
  status: 'published',
  target_mode: 'selected',
  current_version_id: 'ver-2',
  published_at: '2026-11-02T09:00:00Z',
  published_by: MANAGER,
  withdrawn_at: null,
  withdrawn_by: null,
  withdrawn_reason: null,
  created_at: '2026-01-01T09:00:00Z',
  created_by: MANAGER,
  updated_at: '2026-11-20T10:00:00Z',
  ...extra,
});

const version = (id: string, no: number, label: string, stateName: string, extra: Record<string, unknown> = {}) => ({
  id,
  document_id: 'd-sms',
  version_no: no,
  version_label: label,
  version_kind: 'major',
  effective_date: '2026-01-10',
  state: stateName,
  file_object_id: `file-${id}`,
  file_name: `${label}.pdf`,
  mime_type: 'application/pdf',
  size_bytes: 820 * 1024,
  change_summary: null,
  published_at: stateName === 'draft' ? null : '2026-01-10T09:00:00Z',
  published_by: stateName === 'draft' ? null : MANAGER,
  superseded_at: stateName === 'superseded' ? '2026-11-02T09:00:00Z' : null,
  created_at: '2026-01-09T09:00:00Z',
  created_by: EDITOR,
  updated_at: '2026-01-10T09:00:00Z',
  ...extra,
});

function ready(extra: Partial<Record<string, Answer>> = {}) {
  state.tables = {
    fleet_documents: { data: [document()], error: null },
    fleet_document_versions: {
      data: [
        version('ver-1', 1, 'Rev 1', 'superseded'),
        version('ver-3', 3, 'Rev 3', 'draft', { effective_date: '2026-12-01', change_summary: 'New annex on tender launch' }),
        version('ver-2', 2, 'Rev 2', 'published', { version_kind: 'minor', effective_date: '2026-11-02', published_at: '2026-11-02T09:00:00Z' }),
      ],
      error: null,
    },
    fleet_document_vessel_targets: { data: [{ vessel_id: 'v-hyd' }, { vessel_id: 'v-dra' }], error: null },
    profiles: { data: [{ user_id: MANAGER, first_name: 'Demo', last_name: 'Fleet Manager', preferred_name: null }], error: null },
    ...extra,
  };
}

const VESSELS = [
  { id: 'v-dra', name: 'DRAAK', code: 'DRA', counted: true },
  { id: 'v-hyd', name: 'HYDRA', code: 'HYD', counted: true },
];

function renderDrawer(props: Partial<VersionHistoryDrawerProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const handlers = { onOpenChange: vi.fn(), onPublish: vi.fn(), onWithdraw: vi.fn() };
  const utils = render(
    <QueryClientProvider client={client}>
      <VersionHistoryDrawer open companyId={CO} document={row()} vessels={VESSELS} canEdit {...handlers} {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, ...handlers };
}

const versions = async () => within(await screen.findByRole('list', { name: 'Versions' })).getAllByRole('listitem');

afterEach(() => {
  cleanup();
  state.tables = {};
  state.reads = [];
  state.filters = [];
});

describe('the history read', () => {
  it('reads nothing while closed', () => {
    ready();
    renderDrawer({ open: false });
    expect(state.reads).toEqual([]);
  });

  it('reads the document, its versions and targets for the company, then every actor’s name at once', async () => {
    ready();
    renderDrawer();
    await versions();
    expect([...state.reads].sort()).toEqual(['fleet_document_versions', 'fleet_document_vessel_targets', 'fleet_documents', 'profiles']);
    expect(state.filters).toContain('fleet_document_versions.eq.company_id="co-1"');
    expect(state.filters).toContain('fleet_document_versions.eq.document_id="d-sms"');
    expect(state.filters).toContain(`profiles.in.user_id=${JSON.stringify([MANAGER, EDITOR].sort())}`);
  });

  it('names people by preferred or first name, and lists each actor once', () => {
    expect(displayName({ user_id: 'u', first_name: 'Alex', last_name: 'Mate', preferred_name: 'Al' })).toBe('Al Mate');
    expect(displayName({ user_id: 'u', first_name: ' ', last_name: null, preferred_name: null })).toBeNull();
    expect(actorIds(document({ withdrawn_by: EDITOR }) as never, [version('v', 1, 'v1', 'published') as never])).toEqual([MANAGER, EDITOR].sort());
  });
});

describe('the version history', () => {
  it('lists the versions newest first with state, kind, date, file, who and when', async () => {
    ready();
    renderDrawer();
    const items = await versions();
    expect(items.map((i) => i.querySelector('.font-mono')?.textContent)).toEqual(['Rev 3', 'Rev 2', 'Rev 1']);
    const [draft, current, old] = items;
    const pill = (item: HTMLElement) => item.querySelector('[data-status]')?.getAttribute('data-status');
    expect(items.map(pill)).toEqual(['draft', 'published', 'superseded']);
    expect(within(draft).getByText('Draft')).toBeInTheDocument();
    expect(draft).toHaveTextContent('not published yet');
    expect(draft).toHaveTextContent('Name not available');
    expect(draft).toHaveTextContent('New annex on tender launch');
    expect(draft).toHaveTextContent('01 Dec 2026');
    expect(current).toHaveTextContent('Minor: earlier acknowledgements carry over');
    expect(current).toHaveTextContent('by Demo Fleet Manager');
    expect(current).toHaveTextContent('Rev 2.pdf · 820 KB');
    expect(old).toHaveTextContent('Major');
    expect(old).not.toHaveTextContent('acknowledges it again');
    expect(old).toHaveTextContent(/Superseded\s*02 Nov 2026/);
    expect(screen.getByText('DRAAK, HYDRA')).toBeInTheDocument();
  });

  it('a withdrawn document says when, by whom and why', async () => {
    ready({
      fleet_documents: {
        data: [document({ status: 'withdrawn', withdrawn_at: '2026-11-21T08:00:00Z', withdrawn_by: MANAGER, withdrawn_reason: 'Replaced by the new manual' })],
        error: null,
      },
    });
    renderDrawer({ document: row({ status: 'withdrawn', withdrawnReason: 'Replaced by the new manual' }) });
    const withdrawn = await screen.findByRole('region', { name: 'Withdrawn' });
    expect(withdrawn).toHaveTextContent(/Withdrawn 21 Nov 2026, \d{2}:\d{2} by Demo Fleet Manager/);
    expect(withdrawn).toHaveTextContent('Replaced by the new manual');
    // A withdrawn document is final: no next step, even for an editor.
    expect(screen.queryByRole('button', { name: /new version|Withdraw|Finish/ })).toBeNull();
  });

  it('says when names cannot be read at all, never inventing one', async () => {
    ready({ profiles: { data: null, error: { code: '42501', message: 'permission denied for table profiles' } } });
    renderDrawer();
    const items = await versions();
    expect(items[1]).toHaveTextContent('Name not available');
    expect(screen.getByText(/could not be read, so they show as not available/)).toBeInTheDocument();
  });
});

describe('states', () => {
  it('missing tables say not set up yet (D-01)', async () => {
    ready({ fleet_document_versions: { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.fleet_document_versions' in the schema cache" } } });
    renderDrawer();
    expect(await screen.findByRole('heading', { name: 'Fleet documents are not set up yet' })).toBeInTheDocument();
  });

  it('an error is shown with Retry', async () => {
    ready({ fleet_documents: { data: null, error: { code: '500', message: 'upstream timeout' } } });
    renderDrawer();
    expect(await screen.findByText('The version history could not load')).toBeInTheDocument();
    ready();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('list', { name: 'Versions' })).toBeInTheDocument();
  });

  it('a document that is gone says so', async () => {
    ready({ fleet_documents: { data: [], error: null } });
    renderDrawer();
    expect(await screen.findByRole('heading', { name: 'This document is no longer in the library' })).toBeInTheDocument();
  });
});

describe('next steps', () => {
  it('editors of a published document upload a new version or withdraw it', async () => {
    ready();
    const { onPublish, onWithdraw } = renderDrawer();
    await versions();
    fireEvent.click(screen.getByRole('button', { name: /Upload a new version/ }));
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ id: 'd-sms' }));
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(onWithdraw).toHaveBeenCalledWith(expect.objectContaining({ id: 'd-sms' }));
  });

  it('a draft version is finished, a draft document finished; readers get no actions', async () => {
    ready();
    renderDrawer({ document: row({ draft: { id: 'ver-3', versionNo: 3, label: 'Rev 3', kind: 'major', effectiveDate: '2026-12-01', fileName: 'Rev 3.pdf' } }) });
    await versions();
    expect(screen.getByRole('button', { name: /Finish Rev 3/ })).toBeInTheDocument();
    cleanup();
    ready();
    renderDrawer({ document: row({ status: 'draft', current: null }) });
    await versions();
    expect(screen.getByRole('button', { name: /Finish publishing/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
    cleanup();
    ready();
    renderDrawer({ canEdit: false });
    await versions();
    expect(screen.queryByRole('button', { name: /Upload a new version|Withdraw/ })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close the version history' })).toBeInTheDocument());
  });
});

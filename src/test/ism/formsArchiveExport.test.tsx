/**
 * The form archive (src/modules/ism/forms/pages/FormsArchive.tsx; gap/08
 * EX1, EX4, EX7; PR-13):
 *
 * - no fake success: the list export goes through the export engine, which
 *   logs first; while the export log is missing the personal-data export
 *   is refused in words and nothing is downloaded or reported as done; with
 *   the log it is logged as personal data with ids-only filters and the
 *   rows on screen, and only then reported;
 * - the per-row PDF (a record PDF, EX2, not built yet) is disabled with
 *   its reason and does nothing when pressed;
 * - a failed read is an error with Retry, never an empty archive; the
 *   export is disabled with a reason while the list loads or is empty.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Answer = { data: unknown; error: { code?: string; message: string } | null };

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Answer>,
  rpcAnswers: {} as Record<string, Answer>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
  download: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: h.success, error: h.error, info: vi.fn(), warning: vi.fn(), dismiss: vi.fn(), promise: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => {
  h.rpc = vi.fn((fn: string) => Promise.resolve(h.rpcAnswers[fn] ?? { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` } }));
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'order']) builder[m] = () => builder;
    builder.then = (resolve: (a: Answer) => unknown) => resolve(h.tables[table] ?? { data: [], error: null });
    return builder;
  };
  return { supabase: { rpc: h.rpc, from } };
});
vi.mock('@/lib/export/download', () => ({ downloadBlob: h.download }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import FormsArchive from '@/modules/ism/forms/pages/FormsArchive';

const SUBMISSIONS = [
  {
    id: 'sub-1',
    submission_number: 'SAF_FIRE_ROUNDS-20261120-0001',
    template_id: 't-1',
    status: 'SIGNED',
    submitted_at: '2026-11-20T08:30:00Z',
    template: { template_name: 'Fire patrol rounds' },
    vessel: { name: 'DRAAK' },
    submitter: { first_name: 'Demo', last_name: 'Bosun' },
    signatures: [{ id: 'sig-1', status: 'SIGNED' }, { id: 'sig-2', status: 'SIGNED' }],
  },
  {
    id: 'sub-2',
    submission_number: 'TECH_ER_DAILY-20261121-0004',
    template_id: 't-3',
    status: 'ARCHIVED',
    submitted_at: '2026-11-21T07:00:00Z',
    template: null,
    vessel: null,
    submitter: null,
    signatures: [],
  },
];

beforeAll(() => {
  if (!window.PointerEvent) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});

afterEach(() => {
  cleanup();
  h.tables = {};
  h.rpcAnswers = {};
  h.rpc.mockClear();
  h.download.mockReset();
  h.success.mockReset();
  h.error.mockReset();
});

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FormsArchive />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

/** jsdom's Blob has no text(); FileReader reads it. */
const readText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

const openExport = async () => {
  fireEvent.pointerDown(await screen.findByRole('button', { name: /Export list/ }), { button: 0, ctrlKey: false });
  return screen.findByRole('menu');
};

describe('the list export (no fake success)', () => {
  it('is refused in words while the export log is missing: no file, no success', async () => {
    h.tables.form_submissions = { data: SUBMISSIONS, error: null };
    renderPage();
    await screen.findByText('Fire patrol rounds');
    const menu = await openExport();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'CSV' }));
    await waitFor(() =>
      expect(h.error).toHaveBeenCalledWith('Export not made', { description: 'Exports that contain personal data are unavailable until the export log is set up' }),
    );
    expect(h.success).not.toHaveBeenCalled();
    expect(h.download).not.toHaveBeenCalled();
    expect(h.rpc).toHaveBeenCalledWith('log_client_export', expect.objectContaining({ p_source_key: 'ism.forms_archive', p_contains_personal_data: true }));
  });

  it('with the log, logs the rows on screen as personal data (ids-only filters), downloads, then reports', async () => {
    h.tables.form_submissions = { data: SUBMISSIONS, error: null };
    h.rpcAnswers.log_client_export = { data: { id: 'job-1' }, error: null };
    renderPage();
    await screen.findByText('Fire patrol rounds');
    const menu = await openExport();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'CSV' }));
    await waitFor(() => expect(h.download).toHaveBeenCalledTimes(1));
    expect(h.rpc).toHaveBeenCalledWith('log_client_export', {
      p_kind: 'csv',
      p_source_key: 'ism.forms_archive',
      p_params: { template_id: null, range: 'all', searched: false },
      p_contains_personal_data: true,
      p_row_count: 2,
      p_vessel_id: undefined,
    });
    const [blob, fileName] = h.download.mock.calls[0] as [Blob, string];
    expect(fileName).toMatch(/^FLEET_SignedForms_.*\.csv$/);
    const csv = await readText(blob);
    expect(csv).toContain('Number,Form,Vessel,Submitted by,Submitted,Status,Signatures');
    expect(csv).toContain('Fire patrol rounds');
    expect(csv).toContain('Demo Bosun');
    await waitFor(() => expect(h.success).toHaveBeenCalledWith('Export downloaded', { description: fileName }));
    expect(h.error).not.toHaveBeenCalled();
  });

  it('exports only the rows the search leaves, and logs that a search was used (not its text)', async () => {
    h.tables.form_submissions = { data: SUBMISSIONS, error: null };
    h.rpcAnswers.log_client_export = { data: { id: 'job-2' }, error: null };
    renderPage();
    await screen.findByText('Fire patrol rounds');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search the archive' }), { target: { value: 'bosun' } });
    await waitFor(() => expect(screen.queryByText('TECH_ER_DAILY-20261121-0004')).toBeNull());
    const menu = await openExport();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'CSV' }));
    await waitFor(() => expect(h.download).toHaveBeenCalledTimes(1));
    expect(h.rpc).toHaveBeenCalledWith('log_client_export', expect.objectContaining({ p_row_count: 1, p_params: { template_id: null, range: 'all', searched: true } }));
  });

  it('is disabled with a reason when there is nothing to export', async () => {
    h.tables.form_submissions = { data: [], error: null };
    renderPage();
    await screen.findByText('No signed forms yet');
    const trigger = screen.getByRole('button', { name: /Export list/ });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).toHaveAccessibleDescription('Nothing to export');
  });
});

describe('the per-row PDF', () => {
  it('is disabled with its reason and does nothing', async () => {
    h.tables.form_submissions = { data: SUBMISSIONS, error: null };
    renderPage();
    await screen.findByText('Fire patrol rounds');
    const buttons = screen.getAllByRole('button', { name: 'PDF' });
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b).toHaveAttribute('aria-disabled', 'true');
      expect(b).toHaveAccessibleDescription('A PDF of one signed form is not available yet. Open the form to view it, or export the list.');
    }
    fireEvent.click(buttons[0]);
    expect(h.success).not.toHaveBeenCalled();
    expect(h.download).not.toHaveBeenCalled();
  });

  it('shows the rows with what is known, never an invented name', async () => {
    h.tables.form_submissions = { data: SUBMISSIONS, error: null };
    renderPage();
    expect(await screen.findByText('Template not available')).toBeInTheDocument();
    expect(screen.getByText('2 signatures')).toBeInTheDocument();
    expect(screen.getByText('0 signatures')).toBeInTheDocument();
  });
});

describe('states', () => {
  it('a failed read is an error with Retry, not an empty archive', async () => {
    h.tables.form_submissions = { data: null, error: { code: '08006', message: 'connection lost' } };
    renderPage();
    expect(await screen.findByText('The archive could not be loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry|Try again/ })).toBeInTheDocument();
    expect(screen.queryByText('No signed forms yet')).toBeNull();
    expect(screen.getByRole('button', { name: /Export list/ })).toHaveAccessibleDescription('The list could not be loaded');
  });
});

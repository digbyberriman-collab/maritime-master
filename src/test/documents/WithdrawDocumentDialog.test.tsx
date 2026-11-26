/**
 * Withdrawing a fleet document, and deleting a draft (src/modules/
 * documents/components/WithdrawDocumentDialog.tsx; gap/02 W1; X5 spec
 * X5-04B):
 *
 * - the reason is required, 1 to 500 characters, trimmed, and checked
 *   before any request;
 * - fleet_document_withdraw gets the document and the trimmed reason; the
 *   success toast comes only after the returned row was checked (withdrawn,
 *   with that reason);
 * - a refusal is the server's sentence, in the dialog; the dialog stays;
 * - the lifecycle table says when it does not apply (a draft is deleted
 *   instead); a draft is deleted after a confirmation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown> }[],
  rpc: {} as Record<string, (args: Record<string, unknown>) => Answer>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: (name: string, args: Record<string, unknown>) => {
      state.calls.push({ name, args });
      return Promise.resolve(state.rpc[name]?.(args) ?? { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } });
    },
  },
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, success: vi.fn(), error: vi.fn() } };
});

import { DeleteDraftDialog, WithdrawDocumentDialog } from '@/modules/documents/components/WithdrawDocumentDialog';
import { notify } from '@/shared/lib/notify';

const CO = 'co-1';
const DOC = { id: 'd-sms', title: 'Safety Management Manual', status: 'published' as const, vesselsLabel: 'All 6' };
const row = (extra: Record<string, unknown> = {}) => ({ id: 'd-sms', company_id: CO, status: 'withdrawn', withdrawn_reason: null, ...extra });

function renderWithdraw(document = DOC) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onOpenChange = vi.fn();
  const onWithdrawn = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <WithdrawDocumentDialog open onOpenChange={onOpenChange} companyId={CO} document={document} onWithdrawn={onWithdrawn} />
    </QueryClientProvider>,
  );
  return { onOpenChange, onWithdrawn };
}

const reason = () => screen.getByLabelText('Reason');
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Withdraw document' }));

afterEach(() => {
  cleanup();
  state.calls = [];
  state.rpc = {};
  vi.mocked(notify.success).mockClear();
});

describe('withdrawing a published document', () => {
  it('needs a reason of 1 to 500 characters before any request', async () => {
    renderWithdraw();
    expect(screen.getByRole('heading', { name: 'Withdraw Safety Management Manual' })).toBeInTheDocument();
    expect(screen.getByText(/Crew stop seeing it on the vessels it reaches \(All 6\)/)).toBeInTheDocument();
    submit();
    expect(await screen.findByText('Enter the reason for withdrawing it')).toBeInTheDocument();
    fireEvent.change(reason(), { target: { value: 'x'.repeat(501) } });
    submit();
    expect(await screen.findByText('Keep it to 500 characters or fewer')).toBeInTheDocument();
    expect(screen.getByText(/501 \/ 500/)).toBeInTheDocument();
    expect(state.calls).toEqual([]);
  });

  it('withdraws with the trimmed reason and toasts only after the returned row was checked', async () => {
    state.rpc.fleet_document_withdraw = (a) => ({ data: row({ withdrawn_reason: a.p_reason }), error: null });
    const { onOpenChange, onWithdrawn } = renderWithdraw();
    fireEvent.change(reason(), { target: { value: '  Replaced by the new manual  ' } });
    submit();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(state.calls).toEqual([{ name: 'fleet_document_withdraw', args: { p_document_id: 'd-sms', p_reason: 'Replaced by the new manual' } }]);
    expect(notify.success).toHaveBeenCalledWith('Safety Management Manual withdrawn', {
      description: 'Crew no longer see it on any vessel. Its versions stay in the library history.',
    });
    expect(onWithdrawn).toHaveBeenCalledWith(expect.objectContaining({ status: 'withdrawn' }));
  });

  it('a refusal is the server’s sentence in the dialog, with no success', async () => {
    state.rpc.fleet_document_withdraw = () => ({ data: null, error: { code: '22023', message: 'already_withdrawn' } });
    const { onOpenChange } = renderWithdraw();
    fireEvent.change(reason(), { target: { value: 'Out of date' } });
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The document was not withdrawn');
    expect(alert).toHaveTextContent('This document has already been withdrawn.');
    expect(notify.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('no fake success: a row that is not withdrawn, or another reason, is not a save', async () => {
    state.rpc.fleet_document_withdraw = () => ({ data: row({ status: 'published', withdrawn_reason: 'Out of date' }), error: null });
    renderWithdraw();
    fireEvent.change(reason(), { target: { value: 'Out of date' } });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('The change was not saved. Refresh to see the current library, then try again.');
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('a missing RPC says the library is not set up yet (D-01)', async () => {
    renderWithdraw();
    fireEvent.change(reason(), { target: { value: 'Out of date' } });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Fleet documents are not set up yet, so nothing was saved.');
  });

  it('a draft is not withdrawn: the dialog says to delete it instead', () => {
    renderWithdraw({ ...DOC, status: 'draft' as never });
    expect(screen.getByRole('alert')).toHaveTextContent('Only a published document can be withdrawn. Delete the draft instead.');
    expect(screen.getByRole('button', { name: 'Withdraw document' })).toBeDisabled();
    expect(screen.queryByLabelText('Reason')).toBeNull();
  });
});

describe('deleting a draft', () => {
  function renderDelete(status: 'draft' | 'published' = 'draft') {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const onOpenChange = vi.fn();
    const onDeleted = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <DeleteDraftDialog open onOpenChange={onOpenChange} companyId={CO} document={{ id: 'd-moor', title: 'Mooring procedure', status }} onDeleted={onDeleted} />
      </QueryClientProvider>,
    );
    return { onOpenChange, onDeleted };
  }

  it('deletes after the confirmation, and toasts only after the row was checked', async () => {
    state.rpc.fleet_document_delete_draft = (a) => ({ data: { id: a.p_document_id, company_id: CO, status: 'draft' }, error: null });
    const { onOpenChange, onDeleted } = renderDelete();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete the draft Mooring procedure?');
    expect(dialog).toHaveTextContent('It was never published, so no crew have seen it.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(state.calls).toEqual([{ name: 'fleet_document_delete_draft', args: { p_document_id: 'd-moor' } }]);
    expect(notify.success).toHaveBeenCalledWith('Draft deleted: Mooring procedure');
    expect(onDeleted).toHaveBeenCalled();
  });

  it('a refusal stays in the dialog; a published document is never deleted', async () => {
    state.rpc.fleet_document_delete_draft = () => ({ data: null, error: { code: '22023', message: 'document_published' } });
    const { onOpenChange } = renderDelete();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete draft' }));
    expect(await screen.findByText('A published document cannot be deleted. Withdraw it instead.')).toBeInTheDocument();
    expect(notify.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    cleanup();
    renderDelete('published');
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete draft' })).toBeDisabled();
  });
});
